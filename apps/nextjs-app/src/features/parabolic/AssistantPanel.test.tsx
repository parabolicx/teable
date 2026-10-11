import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantPanel } from './AssistantPanel';

const { router, theme } = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {
      baseId: 'bse0123456789ABCDEF',
      slug: ['table', 'tbl0123456789ABCDEF', 'viw0123456789ABCDEF'],
    },
  },
  theme: { resolvedTheme: 'dark', forcedTheme: undefined as string | undefined },
}));

vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('@teable/next-themes', () => ({ useTheme: () => theme }));
vi.mock('@teable/ui-lib', async () => {
  const { createElement, forwardRef } = await import('react');
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
    useUiDirection: () => 'ltr',
    Button: forwardRef<
      HTMLButtonElement,
      Omit<ComponentProps<'button'>, 'size'> & { variant?: string; size?: string }
    >(({ variant: _variant, size: _size, ...props }, ref) =>
      createElement('button', { ...props, ref })
    ),
  };
});

const baseId = 'bse0123456789ABCDEF';
const tableId = 'tbl0123456789ABCDEF';
const recordId = 'rec0123456789ABCDEF';
const nativeSetAttribute = (frame: HTMLIFrameElement, name: string, value: string) =>
  Element.prototype.setAttribute.call(frame, name, value);
// Retain native iframe elements and source attributes without requesting the chat backend.
const iframeDocument = vi
  .spyOn(HTMLIFrameElement.prototype, 'setAttribute')
  .mockImplementation(function (this: HTMLIFrameElement, name, value) {
    if (name === 'src') nativeSetAttribute(this, 'srcdoc', '');
    nativeSetAttribute(this, name, value);
  });
const frames = new WeakMap<HTMLIFrameElement, Window>();
const frameWindows = vi
  .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
  .mockImplementation(function (this: HTMLIFrameElement) {
    let frame = frames.get(this);
    if (!frame) {
      // Distinct frame identities exercise the strict host source gate, including stale frames.
      frame = { postMessage: vi.fn() } as unknown as Window;
      frames.set(this, frame);
    }
    return frame;
  });

afterAll(() => {
  iframeDocument.mockRestore();
  frameWindows.mockRestore();
});

beforeEach(() => {
  router.query.slug = ['table', tableId, 'viw0123456789ABCDEF'];
  theme.resolvedTheme = 'dark';
  theme.forcedTheme = undefined;
  localStorage.clear();
});

describe('native assistant host', () => {
  it('uses the native forced theme when it differs from the resolved preference', async () => {
    theme.resolvedTheme = 'light';
    theme.forcedTheme = 'dark';
    render(<AssistantPanel open onClose={vi.fn()} />);
    const iframe = (await screen.findByTitle(
      'Parabolic Assistant conversation'
    )) as HTMLIFrameElement;
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    fireEvent.load(iframe);
    expect(
      post.mock.calls.some(
        ([message]) => message.type === '4dx-chat-theme' && message.theme === 'dark'
      )
    ).toBe(true);
    post.mockRestore();
  });

  it('retains its conversation iframe through close, minimize, and native view navigation', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<AssistantPanel open onClose={onClose} />);
    const iframe = await screen.findByTitle('Parabolic Assistant conversation');
    const originalSource = iframe.getAttribute('src');

    fireEvent.click(screen.getByLabelText('Minimize assistant'));
    expect(screen.getByTitle('Parabolic Assistant conversation')).toBe(iframe);
    fireEvent.click(screen.getByLabelText('Restore assistant'));
    rerender(<AssistantPanel open={false} onClose={onClose} />);
    expect(screen.getByLabelText('Parabolic Assistant')).toHaveAttribute('hidden');
    expect(screen.getByTitle('Parabolic Assistant conversation')).toBe(iframe);

    router.query.slug = ['table', 'tblFEDCBA9876543210', 'viwFEDCBA9876543210'];
    rerender(<AssistantPanel open onClose={onClose} />);
    expect(screen.getByTitle('Parabolic Assistant conversation')).toBe(iframe);
    expect(iframe.getAttribute('src')).toBe(originalSource);
  });

  it('accepts iframe messages only from the mounted frame at the application origin', async () => {
    const onClose = vi.fn();
    render(<AssistantPanel open onClose={onClose} />);
    const iframe = (await screen.findByTitle(
      'Parabolic Assistant conversation'
    )) as HTMLIFrameElement;
    const send = (origin: string, source: Window | null) =>
      window.dispatchEvent(
        new MessageEvent('message', { origin, source, data: { type: '4dx-chat-close' } })
      );

    act(() => send('https://foreign.example', iframe.contentWindow));
    act(() => send(window.location.origin, window));
    expect(onClose).not.toHaveBeenCalled();
    act(() => send(window.location.origin, iframe.contentWindow));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sends increasing context revisions and removes a record when the native table changes', async () => {
    const { rerender } = render(<AssistantPanel open onClose={vi.fn()} />);
    const iframe = (await screen.findByTitle(
      'Parabolic Assistant conversation'
    )) as HTMLIFrameElement;
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    fireEvent.load(iframe);
    const messages = () =>
      post.mock.calls
        .map(([message]) => message as { type: string; context?: object; revision?: number })
        .filter((message) => message.type === '4dx-chat-context');
    const initial = messages().at(-1)!;

    act(() => {
      window.dispatchEvent(
        new CustomEvent('fourdx:record-context', {
          detail: { baseId, tableId, recordId, open: true },
        })
      );
    });
    await waitFor(() =>
      expect(messages().at(-1)?.context).toEqual({
        baseId,
        tableId,
        viewId: 'viw0123456789ABCDEF',
        recordIds: [recordId],
      })
    );
    const selected = messages().at(-1)!;
    expect(selected.revision).toBeGreaterThan(initial.revision!);

    router.query.slug = ['table', 'tblFEDCBA9876543210', 'viwFEDCBA9876543210'];
    rerender(<AssistantPanel open onClose={vi.fn()} />);
    await waitFor(() =>
      expect(messages().at(-1)?.context).toEqual({
        baseId,
        tableId: 'tblFEDCBA9876543210',
        viewId: 'viwFEDCBA9876543210',
      })
    );
    expect(messages().at(-1)?.revision).toBeGreaterThan(selected.revision!);
    post.mockRestore();
  });
});
