// @ts-check
import { Button } from '../Button/Button.jsx';
import { Alert } from '../Alert/Alert.jsx';

/**
 * Shared confirmation dialog — the canonical modal chrome (doc 06 §520):
 * dimmed backdrop, intent-colored accent bar, padded body, and right-aligned
 * ghost "cancel" + filled "confirm" actions. Body content (paragraphs, a reason
 * textarea, a password field, …) is supplied via `children`; callers own any
 * form state and pass `confirmDisabled` / `error` as needed.
 */
export function ConfirmDialog({
  title,
  intent = 'default',
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading,
  confirmDisabled,
  error,
  children,
}) {
  const danger = intent === 'danger';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className={`modal__accent${danger ? ' modal__accent--danger' : ''}`} />
        <div className="modal__body">
          {title && <h2 className="h3">{title}</h2>}
          {children}
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="modal__actions">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              isLoading={isLoading}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
