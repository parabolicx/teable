import { useEffect, useState } from 'react';
import type { IWorkspaceGpuSample } from './workspaceGpu';
import { isWorkspaceGpuStale, parseWorkspaceGpuSample } from './workspaceGpu';

class WorkspaceGpuAuthorizationError extends Error {}

const readWorkspaceGpu = async (signal: AbortSignal) => {
  const response = await fetch('/4dx/api/gpu', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403)
    throw new WorkspaceGpuAuthorizationError();
  if (!response.ok) throw new Error('GPU data could not be refreshed.');
  return parseWorkspaceGpuSample(await response.json());
};

export const useWorkspaceGpu = () => {
  const [sample, setSample] = useState<IWorkspaceGpuSample>();
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    let busy = false;
    let denied = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const clearTimer = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const visible = () => active && !document.hidden;
    const canPoll = () => visible() && !busy && !denied;
    const reportError = (error: unknown, signal: AbortSignal) => {
      if (!visible() || signal.reason === 'hidden') return;
      if (error instanceof WorkspaceGpuAuthorizationError) {
        denied = true;
        setSample(undefined);
        setError('Authorization required for GPU readings.');
      } else {
        // Transport exceptions and response bodies may contain private data.
        setError(
          signal.aborted ? 'The GPU reading timed out.' : 'GPU data could not be refreshed.'
        );
      }
    };
    const poll = async () => {
      if (!canPoll()) return;
      busy = true;
      const request = new AbortController();
      controller = request;
      const deadline = setTimeout(() => request.abort(), 10000);
      try {
        const reading = await readWorkspaceGpu(request.signal);
        if (!visible() || request.signal.aborted) return;
        setSample(reading);
        setError('');
      } catch (error) {
        reportError(error, request.signal);
      } finally {
        clearTimeout(deadline);
        controller = undefined;
        busy = false;
        if (active) {
          setNow(Date.now());
          clearTimer();
          if (canPoll()) timer = setTimeout(poll, 5000);
        }
      }
    };
    const onVisibilityChange = () => {
      clearTimer();
      if (document.hidden) controller?.abort('hidden');
      else {
        denied = false;
        setNow(Date.now());
        void poll();
      }
    };
    void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      clearTimer();
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return { sample, error, stale: isWorkspaceGpuStale(sample, error, now) };
};
