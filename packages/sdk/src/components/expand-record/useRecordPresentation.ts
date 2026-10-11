import { useCallback, useEffect, useState } from 'react';

export type RecordPresentation = 'modal' | 'drawer';
export const recordPresentationStorageKey = '4dx.record-detail.presentation.v1';
const presentationChangeEvent = '4dx:record-presentation-change';
let rememberedPresentation: RecordPresentation = 'modal';

// The source-owned flag excludes linked, shared and nested editors. Route
// identity is an additional boundary; a URL record query is never authoritative
// because gallery, kanban and calendar select records in component state.
export function isPrimaryRecordRoute(pathname: string, baseId?: string, tableId?: string) {
  if (!baseId || !tableId) return false;
  const prefix = `/base/${baseId}/table/${tableId}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function readPresentation(): RecordPresentation {
  try {
    rememberedPresentation =
      window.localStorage.getItem(recordPresentationStorageKey) === 'drawer' ? 'drawer' : 'modal';
  } catch {
    // Continue to support switching for this page when storage is unavailable.
  }
  return rememberedPresentation;
}

export function useRecordPresentation(options: {
  primaryRecord?: boolean;
  baseId?: string;
  tableId?: string;
  recordId: string;
  visible?: boolean;
}) {
  const { primaryRecord, baseId, tableId, recordId, visible } = options;
  const [presentation, setPresentation] = useState<RecordPresentation>('modal');
  const [wide, setWide] = useState(false);
  const [primary, setPrimary] = useState(false);
  const activePrimary =
    primary &&
    Boolean(primaryRecord) &&
    typeof window !== 'undefined' &&
    isPrimaryRecordRoute(new URL(window.location.href).pathname, baseId, tableId);

  useEffect(() => {
    const updateViewport = () => {
      setWide(window.innerWidth >= 760);
      setPrimary(
        process.env.NEXT_PUBLIC_PARABOLIC_ENABLED === 'true' &&
          Boolean(primaryRecord) &&
          isPrimaryRecordRoute(new URL(window.location.href).pathname, baseId, tableId)
      );
    };
    const updateStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === recordPresentationStorageKey) {
        setPresentation(readPresentation());
      }
    };
    const updatePresentation = () => setPresentation(rememberedPresentation);
    setPresentation(readPresentation());
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('popstate', updateViewport);
    window.addEventListener('storage', updateStorage);
    window.addEventListener(presentationChangeEvent, updatePresentation);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('popstate', updateViewport);
      window.removeEventListener('storage', updateStorage);
      window.removeEventListener(presentationChangeEvent, updatePresentation);
    };
  }, [primaryRecord, baseId, tableId]);

  useEffect(() => {
    if (!activePrimary || !visible || !baseId || !tableId) return;
    const detail = { baseId, tableId, recordId };
    const announce = () => {
      window.dispatchEvent(
        new CustomEvent('fourdx:record-context', { detail: { ...detail, open: true } })
      );
    };
    announce();
    window.addEventListener('fourdx:request-record-context', announce);
    return () => {
      window.removeEventListener('fourdx:request-record-context', announce);
      window.dispatchEvent(
        new CustomEvent('fourdx:record-context', { detail: { ...detail, open: false } })
      );
    };
  }, [activePrimary, visible, baseId, tableId, recordId]);

  const changePresentation = useCallback((mode: RecordPresentation) => {
    rememberedPresentation = mode;
    try {
      window.localStorage.setItem(recordPresentationStorageKey, mode);
    } catch {
      // The React state and same-page event remain usable without localStorage.
    }
    setPresentation(mode);
    window.dispatchEvent(new CustomEvent(presentationChangeEvent, { detail: { mode } }));
  }, []);

  return {
    presentation,
    headerPresentation: activePrimary ? presentation : undefined,
    changePresentation,
    primary: activePrimary,
    drawer: activePrimary && wide && presentation === 'drawer',
  };
}
