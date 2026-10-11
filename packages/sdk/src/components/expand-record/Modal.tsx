import { Dialog, DialogContent, DialogOverlay, cn } from '@teable/ui-lib';
import { type FC, type PropsWithChildren } from 'react';
import { useRef } from 'react';
import { ModalContext } from './ModalContext';

export const Modal: FC<
  PropsWithChildren<{
    modal?: boolean;
    drawer?: boolean;
    className?: string;
    container?: HTMLDivElement;
    visible?: boolean;
    onClose?: () => void;
  }>
> = (props) => {
  const { modal, drawer, className, children, container, visible, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={visible} modal={modal}>
      <DialogContent
        closeable={false}
        container={container}
        className={cn(
          'h-full block rounded-lg p-0 max-w-4xl',
          className,
          drawer &&
            'z-20 start-auto end-0 bottom-0 translate-x-0 translate-y-0 rounded-none sm:rounded-none border-y-0 border-e-0 data-[state=open]:animate-none data-[state=closed]:animate-none'
        )}
        style={
          drawer
            ? {
                insetInlineStart: 'auto',
                insetInlineEnd: 0,
                top: 'calc(var(--fourdx-topbar-height, 0px) + var(--teable-top-banner-height, 0px))',
                width: 'min(720px, 55vw)',
                minWidth: '360px',
                maxWidth: 'calc(100vw - 280px)',
                height:
                  'calc(100dvh - var(--fourdx-topbar-height, 0px) - var(--teable-top-banner-height, 0px))',
              }
            : { width: 'calc(100% - 40px)', height: 'calc(100% - 100px)' }
        }
        overlay={
          <DialogOverlay
            onClick={(e) => {
              // When a nested modal layer (e.g. a SingleSelect Popover with
              // modal=true) is open, Radix sets DialogContent's pointer-events
              // to 'none'. Visual clicks inside DialogContent then hit-test
              // through to this overlay and would falsely trigger onClose.
              // DialogContent is fixed-positioned, so checking whether the
              // pointer coordinates fall inside its bounding rect cleanly
              // separates real overlay clicks from click-through events,
              // without depending on any internal layer state.
              const rect = ref.current?.getBoundingClientRect();
              if (
                rect &&
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
              ) {
                return;
              }
              onClose?.();
            }}
          />
        }
        onKeyDown={(e) => {
          if (e.key === 'Escape' && (!drawer || !e.defaultPrevented)) {
            onClose?.();
          }
          e.stopPropagation();
        }}
        onEscapeKeyDown={
          drawer
            ? (event) => {
                // Radix dispatches only to its highest layer, including when focus
                // is on the uncovered table. Nested editors and selects retain Escape.
                event.preventDefault();
                onClose?.();
              }
            : undefined
        }
        onPaste={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        ref={ref}
      >
        <ModalContext.Provider value={{ ref, isRecordModal: true }}>
          {children}
        </ModalContext.Provider>
      </DialogContent>
    </Dialog>
  );
};
