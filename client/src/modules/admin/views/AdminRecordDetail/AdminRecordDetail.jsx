// @ts-check
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { formatPkr, formatKarachiTable } from '../../../../lib/format/format.js';

const pkr = (paisa) => (paisa == null ? '—' : formatPkr(paisa));

export function AdminRecordDetail() {
  const { id } = useParams();
  const { recordDetail, resendEmail, setDisputed } = useAdmin({ recordDetailId: id });
  const [confirming, setConfirming] = useState(null); // null | {kind:'resend', jobId} | {kind:'dispute', disputed}

  const d = recordDetail.data;

  const confirm = () => {
    const done = { onSuccess: () => setConfirming(null) };
    if (confirming.kind === 'resend') resendEmail.mutate({ jobId: confirming.jobId }, done);
    else setDisputed.mutate({ id, disputed: confirming.disputed }, done);
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <p>
        <Link to="/admin/records">← Records</Link>
      </p>
      {recordDetail.isLoading && <p>Loading…</p>}
      {recordDetail.error && <Alert variant="danger">{recordDetail.error.message}</Alert>}
      {d && (
        <>
          <h1>Appointment {d.appointment.id}</h1>

          <div className="section-card">
            <p>
              <strong>{d.appointment.patientName}</strong>
              {d.appointment.subjectName && <span> (for: {d.appointment.subjectName})</span>} with{' '}
              <strong>{d.appointment.doctorName}</strong> — {formatKarachiTable(d.appointment.slotStart)}
            </p>
            <p>
              <span className="badge badge--info">{d.appointment.state}</span>{' '}
              {d.appointment.disputed && <span className="badge badge--danger">Disputed</span>}{' '}
              Paid: {pkr(d.appointment.amountPaid)} · Payment ref: {d.appointment.paymentRef ?? '—'} ·
              Refund ref: {d.appointment.refundRef ?? '—'}
            </p>
            {d.appointment.disputed ? (
              <Button variant="secondary" onClick={() => setConfirming({ kind: 'dispute', disputed: false })}>
                Clear disputed
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirming({ kind: 'dispute', disputed: true })}>
                Mark disputed
              </Button>
            )}
          </div>

          <div className="section-card">
            <h2>State history</h2>
            <table className="table">
              <thead>
                <tr><th>When (Karachi)</th><th>Event</th><th>Actor</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatKarachiTable(h.at)}</td>
                    <td>{h.eventType}</td>
                    <td>{h.actorType}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-card">
            <h2>Prescriptions</h2>
            {d.prescriptions.length === 0 && <p className="empty">None.</p>}
            {d.prescriptions.map((rx) => (
              <p key={rx.id}>
                {formatKarachiTable(rx.issuedAt)} —{' '}
                {rx.items.map((i, idx) => (
                  <span key={i.id}>{i.medicineName}{idx < rx.items.length - 1 ? ', ' : ''}</span>
                ))}
              </p>
            ))}
          </div>

          <div className="section-card">
            <h2>Emails</h2>
            <table className="table">
              <thead>
                <tr><th>Type</th><th>Status</th><th>Last error</th><th /></tr>
              </thead>
              <tbody>
                {d.notificationJobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.type}</td>
                    <td>
                      <span className={`badge badge--${j.status === 'failed' ? 'danger' : j.status === 'sent' ? 'success' : 'info'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>{j.lastError ?? '—'}</td>
                    <td>
                      {j.status === 'failed' && (
                        <Button variant="secondary" onClick={() => setConfirming({ kind: 'resend', jobId: j.id })}>
                          Resend
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal__body">
              {confirming.kind === 'resend' ? (
                <p>Re-queue this failed email? The dispatch worker will retry it within a minute.</p>
              ) : (
                <p>{confirming.disputed ? 'Mark' : 'Clear'} the disputed flag on this appointment?</p>
              )}
              {(resendEmail.error || setDisputed.error) && (
                <Alert variant="danger">{(resendEmail.error || setDisputed.error).message}</Alert>
              )}
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => { setConfirming(null); resendEmail.reset(); setDisputed.reset(); }}>Cancel</Button>
              <Button isLoading={resendEmail.isPending || setDisputed.isPending} onClick={confirm}>
                {confirming.kind === 'resend' ? 'Resend email' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
