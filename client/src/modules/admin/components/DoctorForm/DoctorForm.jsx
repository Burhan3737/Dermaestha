// @ts-check
import { useState } from 'react';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { WeeklyBlocksEditor } from '../WeeklyBlocksEditor/WeeklyBlocksEditor.jsx';

/**
 * A-01 add/edit form. Edit mode (F10.02) has NO pmc/email/password inputs — immutability by
 * absence (#8) — and shows the fee-snapshot note (#6). Photo is handed back as a File (or null);
 * the caller uploads it in a follow-up multipart request.
 * @param {{ mode: 'add'|'edit', initial?: object, isSaving?: boolean, error?: Error|null,
 *   onSubmit: (payload: object, photoFile: File|null) => void, onCancel: () => void }} props
 */
export function DoctorForm({ mode, initial = {}, isSaving = false, error = null, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    fullName: initial.fullName ?? '',
    email: '',
    phone: initial.phone ?? '',
    pmcNumber: '',
    specialization: initial.specialization ?? '',
    fee: initial.fee != null ? String(initial.fee / 100) : '',
    bio: initial.bio ?? '',
    initialPassword: '',
  });
  const [blocks, setBlocks] = useState(initial.blocks ?? []);
  const [photoFile, setPhotoFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const common = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      fee: Math.round(parseFloat(form.fee) * 100),
      bio: form.bio.trim(),
    };
    if (mode === 'add') {
      onSubmit(
        {
          ...common,
          email: form.email.trim(),
          pmcNumber: form.pmcNumber.trim(),
          initialPassword: form.initialPassword,
          blocks,
        },
        photoFile,
      );
    } else {
      onSubmit({ ...common, blocks }, photoFile);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <Alert variant="danger">{error.message}</Alert>}
      <Field label="Full name" id="df-name" value={form.fullName} onChange={set('fullName')} required />
      {mode === 'add' && (
        <>
          <Field label="Email" id="df-email" type="email" value={form.email} onChange={set('email')} required />
          <Field label="PMC number" id="df-pmc" value={form.pmcNumber} onChange={set('pmcNumber')} required />
        </>
      )}
      <Field label="Phone" id="df-phone" value={form.phone} onChange={set('phone')} required />
      <Field label="Specialization" id="df-spec" value={form.specialization} onChange={set('specialization')} required />
      <Field label="Consultation fee (PKR)" id="df-fee" type="number" min="1" step="0.01" value={form.fee} onChange={set('fee')} required />
      {mode === 'edit' && (
        <p className="help">Fee changes never affect existing appointments — the fee was snapshotted at booking.</p>
      )}
      <Field label="Bio" id="df-bio" value={form.bio} onChange={set('bio')} required />
      {mode === 'add' && (
        <Field
          label="Initial password"
          id="df-pw"
          type="password"
          value={form.initialPassword}
          onChange={set('initialPassword')}
          required
        />
      )}

      <Field
        label="Profile photo (JPEG/PNG/WebP, max 2MB)"
        id="df-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
      />
      {photoFile && <p className="help">Selected: {photoFile.name}</p>}

      <h3>Weekly availability template</h3>
      {mode === 'edit' && (
        <p className="help">
          Blocks entered here replace the doctor's entire existing weekly template on save.
          Leave empty to keep the current schedule unchanged.
        </p>
      )}
      <WeeklyBlocksEditor blocks={blocks} onChange={setBlocks} />

      <div className="modal__actions" style={{ marginTop: 'var(--sp-4)' }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" isLoading={isSaving}>Save doctor</Button>
      </div>
    </form>
  );
}
