// @ts-check
import { useState } from 'react';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';

export function DoctorCancelModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog
      title="Cancel appointment"
      intent="danger"
      confirmLabel="Cancel appointment"
      cancelLabel="Keep appointment"
      confirmDisabled={!reason.trim()}
      onConfirm={() => onConfirm(reason.trim())}
      onCancel={onClose}
    >
      <p className="body-sm muted">
        The slot is freed and the patient is emailed. Any payment is handled offline — there is no
        in-app refund.
      </p>
      <div className="field field--wide">
        <label htmlFor="cancel-reason">Reason (internal)</label>
        <textarea
          id="cancel-reason"
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
