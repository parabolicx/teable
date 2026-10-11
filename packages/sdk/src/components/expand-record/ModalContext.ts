import { createContext } from 'react';

interface IModalContext {
  ref: React.RefObject<HTMLDivElement>;
  isRecordModal?: boolean;
}

export const ModalContext = createContext<IModalContext>({ ref: { current: null } });
