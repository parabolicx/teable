import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { AssistantPanel } from './AssistantPanel';
import styles from './ParabolicShell.module.css';
import { WorkspaceHeader } from './WorkspaceHeader';
import type { IWorkspaceLink } from './workspaceNavigation';
import { workspaceRelativeLink } from './workspaceNavigation';

const openStorageKey = '4dx.chat.sidebar.open.v1';

/** Local services still authenticate using the browser's existing Teable session. */
export function ParabolicShell({ children }: PropsWithChildren) {
  const [links, setLinks] = useState<IWorkspaceLink[] | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const authorized = links !== null;

  useEffect(() => {
    try {
      const open =
        new URL(location.href).searchParams.get('4dx-chat') === 'open' ||
        localStorage.getItem(openStorageKey) === 'true';
      setAssistantOpen(open);
      setAssistantMounted(open);
    } catch {
      /* The native popup also works without saved preferences. */
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (disposed || pending || document.visibilityState === 'hidden') return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch('/4dx/api/navigation', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) {
          setLinks(null);
          setAssistantOpen(false);
          setAssistantMounted(false);
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (disposed || !Array.isArray(data?.links) || data.links.length > 32) return;
        const next: IWorkspaceLink[] = [];
        for (const value of data.links) {
          if (
            typeof value?.name !== 'string' ||
            value.name.length > 80 ||
            typeof value?.href !== 'string'
          )
            continue;
          const href = workspaceRelativeLink(value.href, location.origin);
          if (href) next.push({ name: value.name, href });
        }
        setLinks(next);
      } catch {
        /* A telemetry outage must leave the native table usable. */
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    const onVisibility = () => void refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--fourdx-topbar-height',
      authorized ? '48px' : '0px'
    );
    window.dispatchEvent(new Event('resize'));
    return () => {
      document.documentElement.style.removeProperty('--fourdx-topbar-height');
    };
  }, [authorized]);

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    try {
      localStorage.setItem(openStorageKey, 'false');
    } catch {
      /* Optional preference. */
    }
  }, []);
  const toggleAssistant = useCallback(() => {
    setAssistantMounted(true);
    setAssistantOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(openStorageKey, String(next));
      } catch {
        /* Optional preference. */
      }
      return next;
    });
  }, []);

  // Keep this same shell element through authorization changes and table routes.
  return (
    <div className={styles.shell} data-parabolic-native="v1">
      {links && (
        <WorkspaceHeader
          links={links}
          assistantOpen={assistantOpen}
          onToggleAssistant={toggleAssistant}
        />
      )}
      <div className={styles.content}>
        {children}
        {links && assistantMounted && (
          <AssistantPanel open={assistantOpen} onClose={closeAssistant} />
        )}
      </div>
    </div>
  );
}
