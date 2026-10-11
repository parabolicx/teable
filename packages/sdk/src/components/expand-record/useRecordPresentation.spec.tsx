import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPrimaryRecordRoute,
  recordPresentationStorageKey,
  useRecordPresentation,
} from './useRecordPresentation';

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
const originalWidth = window.innerWidth;
const options = {
  primaryRecord: true,
  baseId: 'bseMain',
  tableId: 'tblMain',
  recordId: 'recMain',
  visible: true,
};

describe('native record presentation', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PARABOLIC_ENABLED', 'true');
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://teable.local/base/bseMain/table/tblMain/viwGallery' },
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('requires the same main table route, without relying on a record query', () => {
    expect(
      isPrimaryRecordRoute('/base/bseMain/table/tblMain/viwGallery', 'bseMain', 'tblMain')
    ).toBe(true);
    expect(isPrimaryRecordRoute('/base/bseMain/table/tblMainOther', 'bseMain', 'tblMain')).toBe(
      false
    );
    expect(isPrimaryRecordRoute('/share/shrMain/view', 'bseMain', 'tblMain')).toBe(false);
    expect(isPrimaryRecordRoute('/base/bseOther/table/tblMain', 'bseMain', 'tblMain')).toBe(false);
  });

  it('keeps the saved drawer choice but uses a modal on a small screen', () => {
    window.localStorage.setItem(recordPresentationStorageKey, 'drawer');
    const { result } = renderHook(() => useRecordPresentation(options));
    expect(result.current.drawer).toBe(true);
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.drawer).toBe(false);
    expect(result.current.presentation).toBe('drawer');
    expect(window.localStorage.getItem(recordPresentationStorageKey)).toBe('drawer');
  });

  it('uses native modal behavior for a non-primary editor or a disabled integration', () => {
    window.localStorage.setItem(recordPresentationStorageKey, 'drawer');
    const { result, rerender } = renderHook(
      (primaryRecord) => useRecordPresentation({ ...options, primaryRecord }),
      { initialProps: false }
    );
    expect(result.current.primary).toBe(false);
    expect(result.current.drawer).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_PARABOLIC_ENABLED', 'false');
    rerender(true);
    expect(result.current.primary).toBe(false);
  });

  it('persists and synchronizes presentation within the page and across tabs', () => {
    const first = renderHook(() => useRecordPresentation(options));
    const second = renderHook(() => useRecordPresentation({ ...options, primaryRecord: false }));
    act(() => first.result.current.changePresentation('drawer'));
    expect(window.localStorage.getItem(recordPresentationStorageKey)).toBe('drawer');
    expect(first.result.current.drawer).toBe(true);
    expect(second.result.current.presentation).toBe('drawer');
    expect(second.result.current.drawer).toBe(false);
    act(() => {
      window.localStorage.setItem(recordPresentationStorageKey, 'modal');
      window.dispatchEvent(
        new StorageEvent('storage', { key: recordPresentationStorageKey, newValue: 'modal' })
      );
    });
    expect(first.result.current.drawer).toBe(false);
  });

  it('announces primary context, responds to host requests and clears on close', () => {
    const listener = vi.fn();
    window.addEventListener('fourdx:record-context', listener);
    const { unmount } = renderHook(() => useRecordPresentation(options));
    expect(listener.mock.calls.at(-1)?.[0].detail).toEqual({
      baseId: 'bseMain',
      tableId: 'tblMain',
      recordId: 'recMain',
      open: true,
    });
    act(() => window.dispatchEvent(new Event('fourdx:request-record-context')));
    expect(listener).toHaveBeenCalledTimes(2);
    unmount();
    expect(listener.mock.calls.at(-1)?.[0].detail.open).toBe(false);
    window.removeEventListener('fourdx:record-context', listener);
  });

  it('supports switching when browser storage is unavailable', () => {
    const storageRead = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    const storageWrite = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    const { result } = renderHook(() => useRecordPresentation(options));
    act(() => result.current.changePresentation('drawer'));
    expect(result.current.drawer).toBe(true);
    act(() => result.current.changePresentation('modal'));
    expect(result.current.drawer).toBe(false);
    storageRead.mockRestore();
    storageWrite.mockRestore();
  });
});
