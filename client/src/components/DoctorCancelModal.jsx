// @ts-check
import { useState } from 'react';

export function DoctorCancelModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--danger">
        <h2>Cancel appointment</h2>
        <p className="help">The patient is refunded automatically (net of the gateway fee) and emailed an apology.</p>
        <label htmlFor="cancel-reason">Reason (internal)</label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Keep appointment</button>
          <button type="button" className="btn btn--danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            Cancel &amp; refund
          </button>
        </div>
      </div>
    </div>
  );
}
