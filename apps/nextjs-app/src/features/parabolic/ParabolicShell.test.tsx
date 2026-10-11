import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParabolicShell } from './ParabolicShell';

vi.mock('./WorkspaceHeader', () => ({
  WorkspaceHeader: ({ onToggleAssistant }: { onToggleAssistant: () => void }) => (
    <button onClick={onToggleAssistant}>Open assistant</button>
  ),
}));
vi.mock('./AssistantPanel', () => ({
  AssistantPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <aside hidden={!open} data-testid="assistant">
      <button onClick={onClose}>Close assistant</button>
    </aside>
  ),
}));

const navigation = { links: [{ name: 'Assistant', href: '/chat/' }] };
const response = (status: number, data = navigation) => ({
  status,
  ok: status === 200,
  json: async () => data,
});
const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('source-native shell authorization', () => {
  it('does not mount local services before the owner session is confirmed', async () => {
    let resolve: (value: ReturnType<typeof response>) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    localStorage.setItem('4dx.chat.sidebar.open.v1', 'true');
    render(
      <ParabolicShell>
        <input aria-label="Table editor" />
      </ParabolicShell>
    );
    expect(screen.getByLabelText('Table editor')).toBeVisible();
    expect(screen.queryByTestId('assistant')).toBeNull();
    await act(async () => resolve(response(403)));
    expect(screen.queryByText('Open assistant')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--fourdx-topbar-height')).toBe('0px');
  });

  it('retains table state while authorization resolves and while the popup closes', async () => {
    let resolve: (value: ReturnType<typeof response>) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    function Table() {
      const [value, setValue] = useState('');
      return (
        <input
          aria-label="Table editor"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(
      <ParabolicShell>
        <Table />
      </ParabolicShell>
    );
    fireEvent.change(screen.getByLabelText('Table editor'), { target: { value: 'Unsaved input' } });
    await act(async () => resolve(response(200)));
    expect(screen.getByLabelText('Table editor')).toHaveValue('Unsaved input');
    expect(document.documentElement.style.getPropertyValue('--fourdx-topbar-height')).toBe('48px');
    fireEvent.click(screen.getByText('Open assistant'));
    const assistant = screen.getByTestId('assistant');
    fireEvent.click(screen.getByText('Close assistant'));
    expect(screen.getByTestId('assistant')).toBe(assistant);
    expect(assistant).not.toBeVisible();
  });

  it('retains native navigation through transient outages and removes services on denied access', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200))
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response(401));
    render(
      <ParabolicShell>
        <input aria-label="Table editor" />
      </ParabolicShell>
    );
    await waitFor(() => expect(screen.getByText('Open assistant')).toBeVisible());
    fireEvent.click(screen.getByText('Open assistant'));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByTestId('assistant')).toBeVisible();
    await act(async () => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.queryByTestId('assistant')).toBeNull());
    expect(screen.getByLabelText('Table editor')).toBeVisible();
  });
});
