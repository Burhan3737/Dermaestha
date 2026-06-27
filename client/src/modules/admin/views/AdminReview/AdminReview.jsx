// @ts-check
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { formatPkr, formatKarachiTable } from '../../../../lib/format/format.js';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

/**
 * A-06 — manual-payment review queue (design §7.2). Lists `pending` appointments and lets the admin
 * verify the bank transfer, then Accept (→ confirmed) or Reject (→ cancelled, slot freed).
 */
export function AdminReview() {
  const { pendingReview, acceptAppointment, rejectAppointment } = useAdmin({ pendingReview: true });
  const rows = pendingReview.data?.data ?? [];
  const actionError = acceptAppointment.error || rejectAppointment.error;

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Payment review</h1>
      <div className="section-card">
        {pendingReview.isLoading && <p>Loading…</p>}
        {pendingReview.error && <Alert variant="danger">{pendingReview.error.message}</Alert>}
        {actionError && <Alert variant="danger">{actionError.message}</Alert>}
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
                    <Button
                      size="sm"
                      isLoading={acceptAppointment.isPending}
                      onClick={() => acceptAppointment.mutate(r.id)}
                    >
                      Accept
                    </Button>{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={rejectAppointment.isPending}
                      onClick={() => rejectAppointment.mutate(r.id)}
                    >
                      Reject
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SidebarLayout>
  );
}
