import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DialogContext } from './dialog-context';
import type { AlertOptions, ConfirmOptions, DialogApi, PromptOptions } from './dialog-context';
import Icon from './Icon';
import './dialog.css';
import { t } from '../../i18n/core';

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void };

/**
 * Hộp thoại xác nhận / nhập liệu của web, thay cho window.confirm và window.prompt của trình duyệt.
 * Mỗi lúc chỉ mở một hộp; Esc hoặc bấm ra ngoài là hủy, Enter là xác nhận.
 */
export default function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        lastFocus.current = document.activeElement as HTMLElement | null;
        setPending({ kind: 'confirm', options, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        lastFocus.current = document.activeElement as HTMLElement | null;
        setValue(options.defaultValue ?? '');
        setPending({ kind: 'prompt', options, resolve });
      }),
    [],
  );

  const alert = useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => {
        lastFocus.current = document.activeElement as HTMLElement | null;
        setPending({ kind: 'alert', options, resolve });
      }),
    [],
  );

  const close = useCallback(
    (accepted: boolean) => {
      if (!pending) return;
      if (pending.kind === 'confirm') pending.resolve(accepted);
      else if (pending.kind === 'prompt') pending.resolve(accepted ? value : null);
      else pending.resolve();
      setPending(null);
      // Trả focus về nút đã mở hộp thoại (người dùng bàn phím không bị lạc chỗ)
      lastFocus.current?.focus?.();
    },
    [pending, value],
  );

  // Focus vào ô nhập hoặc nút xác nhận khi mở; Esc để hủy
  useEffect(() => {
    if (!pending) return;
    (pending.kind === 'prompt' ? inputRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  const api = useMemo<DialogApi>(() => ({ confirm, prompt, alert }), [confirm, prompt, alert]);

  const o = pending && pending.kind !== 'alert' ? pending.options : undefined;
  const danger = o?.tone === 'danger';
  const blocked = pending?.kind === 'prompt' && (pending.options.required ?? false) && !value.trim();

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending?.kind === 'alert' && (
        <div className="ui-dialog-overlay" onMouseDown={() => close(false)}>
          <div
            className="ui-dialog ui-dialog--read"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ui-dialog-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="ui-dialog__body">
              <span className="ui-dialog__icon ui-dialog__icon--primary">
                <Icon name={pending.options.icon === 'megaphone' ? 'megaphone' : 'bell'} size={20} />
              </span>
              <div className="ui-dialog__text">
                <h2 id="ui-dialog-title" className="ui-dialog__title">
                  {pending.options.title}
                </h2>
                {pending.options.meta && <p className="ui-dialog__meta">{pending.options.meta}</p>}
              </div>
            </div>
            <div className="ui-dialog__content">{pending.options.message}</div>
            <div className="ui-dialog__actions">
              <button
                ref={confirmRef}
                type="button"
                className="ui-dialog__btn ui-dialog__btn--primary"
                onClick={() => close(true)}
              >
                {pending.options.closeLabel ?? t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {pending && pending.kind !== 'alert' && o && (
        <div className="ui-dialog-overlay" onMouseDown={() => close(false)}>
          <div
            className="ui-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ui-dialog-title"
            aria-describedby={o.message ? 'ui-dialog-message' : undefined}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked) close(true);
              }}
            >
              <div className="ui-dialog__body">
                <span className={`ui-dialog__icon ui-dialog__icon--${danger ? 'danger' : 'primary'}`}>
                  <Icon name={danger ? 'alert' : pending.kind === 'prompt' ? 'edit' : 'check'} size={20} />
                </span>
                <div className="ui-dialog__text">
                  <h2 id="ui-dialog-title" className="ui-dialog__title">
                    {o.title}
                  </h2>
                  {o.message && (
                    <p id="ui-dialog-message" className="ui-dialog__message">
                      {o.message}
                    </p>
                  )}
                  {pending.kind === 'prompt' && (
                    <label className="ui-dialog__field">
                      {pending.options.label && <span>{pending.options.label}</span>}
                      <textarea
                        ref={inputRef}
                        rows={3}
                        value={value}
                        maxLength={pending.options.maxLength}
                        placeholder={pending.options.placeholder}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter để xác nhận, Shift+Enter để xuống dòng
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!blocked) close(true);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className="ui-dialog__actions">
                <button type="button" className="ui-dialog__btn" onClick={() => close(false)}>
                  {o.cancelLabel ?? t('common.cancel')}
                </button>
                <button
                  ref={confirmRef}
                  type="submit"
                  className={`ui-dialog__btn ui-dialog__btn--${danger ? 'danger' : 'primary'}`}
                  disabled={blocked}
                >
                  {o.confirmLabel ?? t('common.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
