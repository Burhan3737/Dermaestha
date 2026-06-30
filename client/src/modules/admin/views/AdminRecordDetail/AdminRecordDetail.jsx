// @ts-check
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { stateLabel, stateBadge } from '../../../appointment/stateLabel.js';
import { formatPkr, formatKarachiTable } from '../../../../lib/format/format.js';

const pkr = (paisa) => (paisa == null ? '—' : formatPkr(paisa));

export function AdminRecordDetail() {
  const { id } = useParams();
  const { recordDetail, resendEmail } = useAdmin({ recordDetailId: id });
  const [confirming, setConfirming] = useState(null); // null | { jobId }

  const d = recordDetail.data;

  const confirm = () => {
    resendEmail.mutate({ jobId: confirming.jobId }, { onSuccess: () => setConfirming(null) });
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
              <span className={`badge badge--${stateBadge(d.appointment.state)}`}>
                {stateLabel(d.appointment.state)}
              </span>{' '}
              Amount: {pkr(d.appointment.amountDue)} · Payment ref:{' '}
              {d.appointment.paymentReference ?? '—'}
            </p>
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
                        <Button variant="secondary" onClick={() => setConfirming({ jobId: j.id })}>
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
        <ConfirmDialog
          confirmLabel="Resend email"
          isLoading={resendEmail.isPending}
          error={resendEmail.error?.message}
          onConfirm={confirm}
          onCancel={() => { setConfirming(null); resendEmail.reset(); }}
        >
          <p>Re-queue this failed email? The dispatch worker will retry it within a minute.</p>
        </ConfirmDialog>
      )}
    </SidebarLayout>
  );
}
