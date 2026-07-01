// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';
import { formatPkr, formatKarachiTable } from '../../../../lib/format/format.js';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

/**
 * A-06 — manual-payment review queue (design §7.2). Lists `pending` appointments and lets the admin
 * verify the bank transfer, then Accept (→ confirmed) or Reject (→ cancelled, slot freed). Both
 * decisions email the patient and are irreversible (cancelled is terminal), so each is confirm-gated.
 */
export function AdminReview() {
  const { pendingReview, acceptAppointment, rejectAppointment } = useAdmin({ pendingReview: true });
  const rows = pendingReview.data?.data ?? [];
  const [decision, setDecision] = useState(null); // { row, accept } | null
  const mut = decision ? (decision.accept ? acceptAppointment : rejectAppointment) : null;

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Payment review</h1>
      <div className="section-card">
        {pendingReview.isLoading && <p>Loading…</p>}
        {pendingReview.error && <Alert variant="danger">{pendingReview.error.message}</Alert>}
        {!pendingReview.isLoading && rows.length === 0 && (
          <p className="empty">No payments awaiting review.</p>
        )}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Amount</th>
                <th>Bank ref</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatKarachiTable(r.slotStart)}</td>
                  <td>
                    {r.patientName}
                    {r.subjectName && <span className="help"> (for: {r.subjectName})</span>}
                  </td>
                  <td>{r.doctorName}</td>
                  <td>{formatPkr(r.amountDue)}</td>
                  <td>{r.paymentReference ?? '—'}</td>
                  <td>
                    <Button size="sm" onClick={() => setDecision({ row: r, accept: true })}>
                      Accept
                    </Button>{' '}
                    <Button variant="ghost" size="sm" onClick={() => setDecision({ row: r, accept: false })}>
                      Reject
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {decision && (
        <ConfirmDialog
          title={decision.accept ? 'Accept this payment?' : 'Reject this payment?'}
          intent={decision.accept ? 'default' : 'danger'}
          confirmLabel={decision.accept ? 'Accept payment' : 'Reject payment'}
          isLoading={mut.isPending}
          error={mut.error?.message}
          onConfirm={() => mut.mutate(decision.row.id, { onSuccess: () => setDecision(null) })}
          onCancel={() => { setDecision(null); acceptAppointment.reset(); rejectAppointment.reset(); }}
        >
          <p className="body-sm muted">
            {decision.accept
              ? `Confirm ${decision.row.patientName}'s appointment on ${formatKarachiTable(decision.row.slotStart)} (${formatPkr(decision.row.amountDue)}). The patient will be emailed a booking confirmation.`
              : `Reject ${decision.row.patientName}'s payment for ${formatKarachiTable(decision.row.slotStart)}. The slot is freed and the patient is emailed that payment wasn't received — this cannot be undone.`}
          </p>
        </ConfirmDialog>
      )}
    </SidebarLayout>
  );
}
