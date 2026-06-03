// @ts-check
import { formatPkr } from '../lib/format.js';

export function CancelModal({ quote, lateNoRefund = false, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--danger">
        <h2>Cancel appointment?</h2>
        {quote && !lateNoRefund ? (
          <>
            <p>Paid: {formatPkr(quote.amountPaid)}</p>
            <p>Gateway fee: −{formatPkr(quote.gatewayFee)}</p>
            <p>
              <strong>Refund: <span>{formatPkr(quote.refund)}</span></strong>
            </p>
            <p className="help">Refund excludes the payment-gateway fee charged at booking.</p>
          </>
        ) : (
          <p className="help">No refund available for late cancellations — the slot stays blocked.</p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Keep appointment
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            {quote && !lateNoRefund ? 'Cancel & refund' : 'Cancel anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
