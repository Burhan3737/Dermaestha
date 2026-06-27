// @ts-check
export function CancelModal({ onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--danger">
        <h2>Cancel appointment?</h2>
        <p className="help">Cancel this appointment? This cannot be undone.</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Keep appointment
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            Cancel appointment
          </button>
        </div>
      </div>
    </div>
  );
}
