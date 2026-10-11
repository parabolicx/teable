import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceGpu } from './useWorkspaceGpu';

const sample = {
  sampledAt: '2026-10-11T12:00:00.000Z',
  gpus: [{ name: 'GPU', memoryUsedMiB: 2048, memoryTotalMiB: 12288, utilizationPercent: 31 }],
  consumers: [],
  warnings: [],
};
const response = (status: number, data: unknown = sample) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

describe('visible native workspace GPU polling', () => {
  let hidden = false;
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(sample.sampledAt));
    hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('preserves the last reading on failures without displaying transport diagnostics', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200))
      .mockRejectedValueOnce(new Error('private process arguments'));
    const { result } = renderHook(() => useWorkspaceGpu());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.sample?.gpus[0].memoryUsedMiB).toBe(2048);
    expect(result.current.stale).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.sample?.gpus[0].utilizationPercent).toBe(31);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBe('GPU data could not be refreshed.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/4dx/api/gpu',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })
    );
  });

  it('stops polling while hidden and refreshes when visible', async () => {
    fetchMock.mockResolvedValue(response(200));
    renderHook(() => useWorkspaceGpu());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not overlap a pending request and aborts it when unmounted', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { unmount } = renderHook(() => useWorkspaceGpu());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('clears previous readings and stops polling on %i', async (status) => {
    fetchMock.mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(status));
    const { result } = renderHook(() => useWorkspaceGpu());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.sample).toBeUndefined();
    expect(result.current.error).toBe('Authorization required for GPU readings.');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
