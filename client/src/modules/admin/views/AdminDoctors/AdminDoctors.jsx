// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { formatPkr } from '../../../../lib/format/format.js';

function statusBadge(d) {
  if (d.status === 'pending') return <span className="badge badge--info">Pending</span>;
  if (!d.isActive) return <span className="badge badge--warning">Deactivated</span>;
  return <span className="badge badge--success">Active</span>;
}

export function AdminDoctors() {
  const { doctors, setDoctorActive, resetDoctorPassword } = useAdmin({ doctors: true });
  const [deactivating, setDeactivating] = useState(null); // doctor row or null
  const [resetting, setResetting] = useState(null); // doctor row or null
  const [newPassword, setNewPassword] = useState('');

  const rows = doctors.data?.data ?? [];

  const confirmDeactivate = () =>
    setDoctorActive.mutate(
      { id: deactivating.id, isActive: false },
      { onSuccess: () => setDeactivating(null) },
    );

  const confirmReset = () =>
    resetDoctorPassword.mutate(
      { id: resetting.id, newPassword },
      { onSuccess: () => { setResetting(null); setNewPassword(''); } },
    );

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Doctors</h1>

      <div className="section-card">
        {doctors.isLoading && <p>Loading…</p>}
        {doctors.error && <Alert variant="danger">{doctors.error.message}</Alert>}
        {!doctors.isLoading && rows.length === 0 && <p className="empty">No doctors yet.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>PMC</th><th>Specialization</th><th>Fee</th><th>Status</th><th>Upcoming</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.fullName}</td>
                  <td>{d.pmcNumber}</td>
                  <td>{d.specialization}</td>
                  <td>{formatPkr(d.fee)}</td>
                  <td>{statusBadge(d)}</td>
                  <td>{d.upcomingConfirmedCount}</td>
                  <td>
                    {d.isActive ? (
                      <Button variant="danger" onClick={() => setDeactivating(d)}>Deactivate</Button>
                    ) : (
                      <Button variant="secondary" isLoading={setDoctorActive.isPending} onClick={() => setDoctorActive.mutate({ id: d.id, isActive: true })}>
                        Activate
                      </Button>
                    )}{' '}
                    <Button variant="ghost" onClick={() => setResetting(d)}>Reset password</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deactivating && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal__body">
              <h2>Deactivate {deactivating.fullName}?</h2>
              <p>
                {deactivating.upcomingConfirmedCount} upcoming confirmed appointment(s) will remain on
                their calendar and will be honoured — deactivation only removes the doctor from the
                public listing and blocks new bookings. Login is not revoked.
              </p>
              {setDoctorActive.error && (
                <Alert variant="danger">{setDoctorActive.error.message}</Alert>
              )}
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => setDeactivating(null)}>Cancel</Button>
              <Button variant="danger" isLoading={setDoctorActive.isPending} onClick={confirmDeactivate}>
                Deactivate doctor
              </Button>
            </div>
          </div>
        </div>
      )}

      {resetting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal__body">
              <h2>Reset password — {resetting.fullName}</h2>
              <p>Share the new password out-of-band; the doctor must change it on next login.</p>
              {resetDoctorPassword.error && (
                <Alert variant="danger">{resetDoctorPassword.error.message}</Alert>
              )}
              <Field
                label="New password"
                id="reset-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="modal__actions">
              <Button variant="ghost" onClick={() => { setResetting(null); setNewPassword(''); resetDoctorPassword.reset(); }}>Cancel</Button>
              <Button isLoading={resetDoctorPassword.isPending} onClick={confirmReset}>Set password</Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
