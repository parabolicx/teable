import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@teable/ui-lib';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

// jsdom's getBoundingClientRect returns an all-zero DOMRect by default, which
// breaks the overlay's "click is inside DialogContent rect" check (a default
// fireEvent.click sends clientX/Y=0 and would be treated as inside the 0x0
// rect). Stub a realistic rect for all tests so the geometric check behaves
// like a real browser layout.
const CONTENT_RECT = {
  left: 100,
  right: 500,
  top: 100,
  bottom: 400,
  width: 400,
  height: 300,
  x: 100,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

describe('Modal (ExpandRecord wrapper)', () => {
  let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    originalGetRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute('role') === 'dialog') return CONTENT_RECT;
      return originalGetRect.call(this);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  });

  it('calls onClose when the overlay is clicked (T956)', () => {
    const onClose = vi.fn();
    render(
      <Modal visible onClose={onClose}>
        <div data-testid="content">inner</div>
      </Modal>
    );

    const overlay = document.querySelector<HTMLElement>('[data-state="open"].fixed.inset-0');
    expect(overlay).not.toBeNull();
    // Click coordinate clearly outside DialogContent rect.
    fireEvent.click(overlay!, { clientX: 50, clientY: 50 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the dialog content', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Modal visible onClose={onClose}>
        <div data-testid="content">inner</div>
      </Modal>
    );

    fireEvent.click(getByTestId('content'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the table interactive when the drawer uses a nonmodal native root', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <>
        <button>Table action</button>
        <Modal visible modal={false} drawer onClose={onClose}>
          <button>Record action</button>
        </Modal>
      </>
    );
    expect(document.querySelector('[data-state="open"].fixed.inset-0')).toBeNull();
    const tableAction = getByRole('button', { name: 'Table action' });
    tableAction.focus();
    fireEvent.pointerDown(tableAction);
    expect(document.activeElement).toBe(tableAction);
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(tableAction, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a focused drawer once when native Escape and React bubbling both run', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Modal visible modal={false} drawer onClose={onClose}>
        <button>Record action</button>
      </Modal>
    );
    const recordAction = getByRole('button', { name: 'Record action' });
    recordAction.focus();
    fireEvent.keyDown(recordAction, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves drawer Escape to a nested native modal', () => {
    const onClose = vi.fn();
    const onNestedClose = vi.fn();
    const { getByRole } = render(
      <Modal visible modal={false} drawer onClose={onClose}>
        <Modal visible onClose={onNestedClose}>
          <button>Nested record action</button>
        </Modal>
      </Modal>
    );
    fireEvent.keyDown(getByRole('button', { name: 'Nested record action' }), { key: 'Escape' });
    expect(onNestedClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses a nested field select without closing its drawer', () => {
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(
      <Modal visible modal={false} drawer onClose={onClose}>
        <Select defaultValue="first">
          <SelectTrigger aria-label="Field option">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first">First option</SelectItem>
            <SelectItem value="second">Second option</SelectItem>
          </SelectContent>
        </Select>
      </Modal>
    );
    fireEvent.click(getByRole('combobox', { name: 'Field option' }));
    fireEvent.keyDown(getByRole('option', { name: 'First option' }), { key: 'Escape' });
    expect(queryByRole('option', { name: 'First option' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets a nested native modal own and release its pointer lock', () => {
    const content = (nestedOpen: boolean) => (
      <Modal visible modal={false} drawer>
        <button>Record field</button>
        <Modal visible={nestedOpen}>
          <button>Nested field action</button>
        </Modal>
      </Modal>
    );
    const { getByRole, rerender } = render(content(true));
    expect(
      getByRole('button', { name: 'Record field', hidden: true }).closest('[role="dialog"]')
    ).toHaveClass('z-20');
    expect(
      getByRole('button', { name: 'Nested field action', hidden: true }).closest('[role="dialog"]')
    ).toHaveClass('z-50');
    expect(document.body.style.pointerEvents).toBe('none');
    rerender(content(false));
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  // Reproduces the bug where opening a nested modal Popover (e.g. SingleSelect)
  // makes a click inside DialogContent hit-test through to DialogOverlay. The
  // overlay click handler should detect that the pointer landed inside
  // DialogContent's bounding rect and skip onClose.
  it('ignores overlay click when pointer lands inside DialogContent rect', () => {
    const onClose = vi.fn();
    render(
      <Modal visible onClose={onClose}>
        <div data-testid="content">inner</div>
      </Modal>
    );

    const overlay = document.querySelector<HTMLElement>('[data-state="open"].fixed.inset-0');
    expect(overlay).not.toBeNull();

    // Click coordinate inside DialogContent rect (click-through case).
    fireEvent.click(overlay!, { clientX: 200, clientY: 200 });
    expect(onClose).not.toHaveBeenCalled();
  });
});
