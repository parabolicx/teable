import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type Link from 'next/link';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceHeader } from './WorkspaceHeader';

const { gpu, route } = vi.hoisted(() => ({
  gpu: { error: '', stale: true, sample: undefined },
  route: { asPath: '/base/bse0000000000000001/table/tbl0000000000000002/viw0000000000000003' },
}));
vi.mock('./useWorkspaceGpu', () => ({ useWorkspaceGpu: () => gpu }));
vi.mock('next/router', () => ({ useRouter: () => route }));
vi.mock('next/link', () => ({
  default: ({
    href,
    shallow,
    children,
    className,
    'aria-current': current,
  }: ComponentProps<typeof Link>) => (
    <a
      href={typeof href === 'string' ? href : href.pathname ?? undefined}
      className={className}
      aria-current={current}
      data-shallow={String(Boolean(shallow))}
    >
      {children}
    </a>
  ),
}));

describe('native workspace header', () => {
  const links = [
    { name: 'Media', href: route.asPath },
    { name: 'Models', href: route.asPath.replace('tbl0000000000000002', 'tbl0000000000000004') },
    {
      name: 'Other base',
      href: route.asPath.replace('bse0000000000000001', 'bse0000000000000005'),
    },
    { name: 'Parabolic Assistant', href: '/chat/' },
    { name: 'Shoot Control', href: '/shoot/' },
  ];
  beforeEach(() => {
    gpu.error = '';
    route.asPath = links[0].href;
  });
  afterEach(cleanup);

  it('opens chat in the current table and keeps navigation usable when GPU fails', () => {
    gpu.error = 'GPU data could not be refreshed.';
    const toggle = vi.fn();
    render(<WorkspaceHeader links={links} assistantOpen={false} onToggleAssistant={toggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Parabolic Assistant' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Media' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('data-shallow', 'true');
    expect(screen.getByRole('link', { name: 'Other base' })).toHaveAttribute(
      'data-shallow',
      'false'
    );
    expect(screen.getByRole('link', { name: 'Shoot Control' })).toHaveAttribute('href', '/shoot/');
  });

  it('uses the standalone chat link outside table context', () => {
    route.asPath = '/space';
    render(<WorkspaceHeader links={links} assistantOpen={false} onToggleAssistant={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Parabolic Assistant' })).toHaveAttribute(
      'href',
      '/chat/'
    );
  });

  it('provides an accessible GPU dialog with a close control and focus return', async () => {
    render(<WorkspaceHeader links={links} assistantOpen={false} onToggleAssistant={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /GPU utilization/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'GPU usage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GPU usage' })).toHaveFocus();
    expect(screen.getByText('Waiting for GPU readings.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close GPU details' }));
    expect(screen.queryByRole('dialog', { name: 'GPU usage' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
