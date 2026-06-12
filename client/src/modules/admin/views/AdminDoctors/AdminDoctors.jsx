// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { formatPkr } from '../../../../lib/format/format.js';
import { DoctorForm } from '../../components/DoctorForm/DoctorForm.jsx';

function statusBadge(d) {
  if (d.status === 'pending') return <span className="badge badge--info">Pending</span>;
  if (!d.isActive) return <span className="badge badge--warning">Deactivated</span>;
  return <span className="badge badge--success">Active</span>;
}

export function AdminDoctors() {
  const { doctors, setDoctorActive, resetDoctorPassword, createDoctor, updateDoctor, uploadDoctorPhoto, saveDoctorBlocks } = useAdmin({ doctors: true });
  const [deactivating, setDeactivating] = useState(null); // doctor row or null
  const [resetting, setResetting] = useState(null); // doctor row or null
  const [newPassword, setNewPassword] = useState('');
  const [editing, setEditing] = useState(null); // null | 'add' | doctor row
  const [followUpError, setFollowUpError] = useState(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const afterSave = async (doctorId, blocks, photoFile, isEdit) => {
    setSavingFollowUp(true);
    try {
      if (isEdit && blocks.length > 0) await saveDoctorBlocks.mutateAsync({ id: doctorId, blocks });
      if (photoFile) await uploadDoctorPhoto.mutateAsync({ id: doctorId, file: photoFile });
      setFollowUpError(null);
      setEditing(null);
    } catch (err) {
      setFollowUpError(err); // doctor already created/updated — keep the form open and show why
    } finally {
      setSavingFollowUp(false);
    }
  };

  const submitForm = (payload, photoFile) => {
    if (editing === 'add') {
      // blocks travel inside the create body; only the photo needs the follow-up request
      createDoctor.mutate(payload, {
        onSuccess: (created) => afterSave(created.id, [], photoFile, false),
      });
    } else {
      const { blocks, ...body } = payload;
      updateDoctor.mutate({ id: editing.id, ...body }, {
        onSuccess: () => afterSave(editing.id, blocks, photoFile, true),
      });
    }
  };

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
        <div className="modal__actions" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditing('add')}>Add doctor</Button>
        </div>
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
                    <Button variant="ghost" onClick={() => setEditing(d)}>Edit</Button>{' '}
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

      {editing && (
        <div className="section-card">
          <h2>{editing === 'add' ? 'Add doctor' : `Edit ${editing.fullName}`}</h2>
          <DoctorForm
            key={editing === 'add' ? 'add' : editing.id}
            mode={editing === 'add' ? 'add' : 'edit'}
            initial={editing === 'add' ? {} : editing}
            isSaving={createDoctor.isPending || updateDoctor.isPending || savingFollowUp}
            error={createDoctor.error || updateDoctor.error || followUpError}
            onSubmit={submitForm}
            onCancel={() => { setEditing(null); setFollowUpError(null); }}
          />
        </div>
      )}

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
