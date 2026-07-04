import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm: ConfirmFn = (opts) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(opts);
    });

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {options.title && <h3 style={{ marginTop: 0 }}>{options.title}</h3>}
            <p>{options.message}</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => close(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button className={`btn ${options.danger ? 'danger' : ''}`} onClick={() => close(true)}>
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  return useContext(ConfirmContext);
}
