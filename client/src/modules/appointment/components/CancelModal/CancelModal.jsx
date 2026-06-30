// @ts-check
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';

export function CancelModal({ onConfirm, onClose }) {
  return (
    <ConfirmDialog
      title="Cancel appointment?"
      intent="danger"
      confirmLabel="Cancel appointment"
      cancelLabel="Keep appointment"
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      <p className="body-sm muted">Cancel this appointment? This cannot be undone.</p>
    </ConfirmDialog>
  );
}
