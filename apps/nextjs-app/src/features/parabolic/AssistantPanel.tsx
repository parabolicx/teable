import { useTheme } from '@teable/next-themes';
import { Button, cn, useUiDirection } from '@teable/ui-lib';
import { Maximize2, Minus, X } from 'lucide-react';
import { useRouter } from 'next/router';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSISTANT_DEFAULT_WIDTH,
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  assistantMessage,
  assistantPanelWidth,
  assistantRecordContext,
  assistantRouteContext,
  assistantThemeTokens,
  nextAssistantRecord,
  sameAssistantTable,
} from './assistant-bridge';
import type { IAssistantContext, IAssistantRecordContext } from './assistant-bridge';

interface IAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

const widthStorageKey = '4dx.chat.sidebar.width.v1';

/** Mount once in AppLayout's authorized shell, outside the table/view route subtree. */
export function AssistantPanel({ open, onClose }: IAssistantPanelProps) {
  const router = useRouter();
  const isRtl = useUiDirection() === 'rtl';
  const { resolvedTheme } = useTheme();
  const panelRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement>();
  const [loaded, setLoaded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [width, setWidth] = useState(ASSISTANT_DEFAULT_WIDTH);
  const [record, setRecord] = useState<IAssistantRecordContext>();
  const draggingRef = useRef<{ x: number; width: number; maximum: number }>();
  const route = useMemo(
    () =>
      assistantRouteContext(
        router.isReady
          ? {
              baseId: router.query.baseId,
              slug: router.query.slug,
            }
          : {}
      ),
    [router.isReady, router.query.baseId, router.query.slug]
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const context = useMemo(
    () => ({
      ...route,
      ...(record?.open && sameAssistantTable(route, record)
        ? { recordIds: [record.recordId] }
        : {}),
    }),
    [route, record]
  );
  const contextRef = useRef<IAssistantContext>(context);
  contextRef.current = context;
  const revisionRef = useRef({ key: '', revision: -1 });
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const publish = useCallback((message: object) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const sendContext = useCallback(() => {
    const next = contextRef.current;
    const key = JSON.stringify(next);
    if (key !== revisionRef.current.key) {
      revisionRef.current = { key, revision: revisionRef.current.revision + 1 };
    }
    publish({ type: '4dx-chat-context', context: next, revision: revisionRef.current.revision });
  }, [publish]);

  const sendTheme = useCallback(() => {
    const element = panelRef.current;
    if (!element) return;
    publish({
      type: '4dx-chat-theme',
      theme: themeRef.current === 'dark' ? 'dark' : 'light',
      tokens: assistantThemeTokens(getComputedStyle(element), CSS.supports.bind(CSS)),
    });
  }, [publish]);

  const closePanel = useCallback(() => {
    const active = document.activeElement;
    if (active && panelRef.current?.contains(active) && returnFocusRef.current?.isConnected) {
      returnFocusRef.current.focus();
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(widthStorageKey));
      if (Number.isFinite(stored) && stored > 0) setWidth(assistantPanelWidth(stored));
    } catch {
      // Preferences are optional when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoaded(true);
    setMinimized(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement && !panelRef.current?.contains(active)) {
      returnFocusRef.current = active;
    }
  }, [open]);

  useEffect(() => {
    const receiveRecord = (event: Event) => {
      const incoming = assistantRecordContext((event as CustomEvent).detail);
      if (incoming) {
        setRecord((current) => nextAssistantRecord(current, incoming, routeRef.current));
      }
    };
    const receiveMessage = (event: MessageEvent) => {
      const message = assistantMessage(
        event,
        iframeRef.current?.contentWindow,
        window.location.origin
      );
      if (message?.type === '4dx-chat-ready') {
        sendContext();
        sendTheme();
      } else if (message?.type === '4dx-chat-close') {
        closePanel();
      } else if (message?.type === '4dx-chat-action-complete') {
        // Native record subscriptions update Teable without resetting selection or navigation.
        window.dispatchEvent(
          new CustomEvent('fourdx:chat-records-changed', { detail: { tableId: message.tableId } })
        );
      }
    };
    window.addEventListener('fourdx:record-context', receiveRecord);
    window.addEventListener('message', receiveMessage);
    return () => {
      window.removeEventListener('fourdx:record-context', receiveRecord);
      window.removeEventListener('message', receiveMessage);
    };
  }, [closePanel, sendContext, sendTheme]);

  useEffect(() => {
    setRecord((current) =>
      current && sameAssistantTable(routeRef.current, current) ? current : undefined
    );
    // The primary record editor replies, including on initial hydration.
    window.dispatchEvent(new Event('fourdx:request-record-context'));
  }, [route.baseId, route.tableId]);

  useEffect(() => {
    sendContext();
  }, [context, sendContext]);

  useEffect(() => {
    // next-themes applies the native class in the same commit; read its final computed values.
    const id = requestAnimationFrame(sendTheme);
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme, open, sendTheme]);

  useEffect(() => {
    if (minimized && open) restoreRef.current?.focus();
  }, [minimized, open]);

  const saveWidth = useCallback((value: number) => {
    setWidth(value);
    try {
      localStorage.setItem(widthStorageKey, String(value));
    } catch {
      // The window still resizes without saved preferences.
    }
  }, []);

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const available = (panelRef.current?.parentElement?.clientWidth ?? ASSISTANT_MAX_WIDTH) - 24;
    draggingRef.current = {
      x: event.clientX,
      width: panelRef.current?.getBoundingClientRect().width ?? width,
      maximum: available,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const resize = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = draggingRef.current;
    if (drag) {
      const delta = isRtl ? event.clientX - drag.x : drag.x - event.clientX;
      setWidth(assistantPanelWidth(drag.width + delta, drag.maximum));
    }
  };

  const finishResize = () => {
    if (!draggingRef.current) return;
    draggingRef.current = undefined;
    saveWidth(width);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const available = (panelRef.current?.parentElement?.clientWidth ?? ASSISTANT_MAX_WIDTH) - 24;
    const next =
      event.key === 'Home'
        ? ASSISTANT_MIN_WIDTH
        : event.key === 'End'
          ? ASSISTANT_MAX_WIDTH
          : width + (event.key === 'ArrowRight' ? 20 : -20);
    saveWidth(assistantPanelWidth(next, available));
  };

  return (
    <aside
      id="fourdx-assistant-panel"
      ref={panelRef}
      aria-label="Parabolic Assistant"
      hidden={!open}
      className={cn(
        'absolute bottom-3 end-3 z-30 flex-col rounded-lg border bg-background text-foreground shadow-xl',
        open ? 'flex' : 'hidden',
        !minimized && 'top-3'
      )}
      style={{ width: `min(${width}px, calc(100% - 1.5rem))` }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <span className="truncate text-sm font-medium">Parabolic Assistant</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            ref={restoreRef}
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={minimized ? 'Restore assistant' : 'Minimize assistant'}
            onClick={() => setMinimized((value) => !value)}
          >
            {minimized ? <Maximize2 className="size-3.5" /> : <Minus className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Close assistant"
            onClick={closePanel}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-hidden rounded-b-lg', minimized && 'hidden')}>
        {loaded && (
          <iframe
            ref={iframeRef}
            title="Parabolic Assistant conversation"
            src="/chat/?embedded=1"
            className="size-full border-0 bg-background"
            allow="camera 'none'; microphone 'self'; geolocation 'none'"
            referrerPolicy="same-origin"
            onLoad={() => {
              sendContext();
              sendTheme();
            }}
          />
        )}
      </div>
      {!minimized && (
        <button
          type="button"
          role="slider"
          tabIndex={0}
          aria-label="Resize assistant window"
          aria-orientation="horizontal"
          aria-valuemin={ASSISTANT_MIN_WIDTH}
          aria-valuemax={ASSISTANT_MAX_WIDTH}
          aria-valuenow={width}
          aria-valuetext={`${width} pixels`}
          className="absolute -start-1 bottom-0 top-10 w-2 cursor-col-resize rounded-s-lg outline-none hover:bg-primary/20 focus-visible:bg-primary/20"
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
          onKeyDown={resizeWithKeyboard}
        />
      )}
    </aside>
  );
}
