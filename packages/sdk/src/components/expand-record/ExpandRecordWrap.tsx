import { Sheet, SheetContent } from '@teable/ui-lib';
import { type FC, type PropsWithChildren, useRef } from 'react';
import { Modal } from './Modal';
import { ModalContext } from './ModalContext';
import { ExpandRecordModel } from './type';

export const ExpandRecordWrap: FC<
  PropsWithChildren<{
    model?: ExpandRecordModel;
    drawer?: boolean;
    modal?: boolean;
    visible?: boolean;
    onClose?: () => void;
    className?: string;
  }>
> = (props) => {
  const { children, model, drawer, visible, onClose, modal, className } = props;
  const sheetRef = useRef<HTMLDivElement>(null);

  if (drawer || model === ExpandRecordModel.Modal)
    return (
      <Modal
        visible={visible}
        onClose={onClose}
        modal={drawer ? false : modal}
        drawer={drawer}
        className={className}
      >
        {children}
      </Modal>
    );

  return (
    <Sheet modal={true} open={visible} onOpenChange={onClose}>
      <SheetContent
        className="h-[92dvh] overflow-hidden rounded-t-lg p-0"
        side="bottom"
        closeable={false}
        ref={sheetRef}
      >
        <ModalContext.Provider value={{ ref: sheetRef, isRecordModal: true }}>
          {children}
        </ModalContext.Provider>
      </SheetContent>
    </Sheet>
  );
};
