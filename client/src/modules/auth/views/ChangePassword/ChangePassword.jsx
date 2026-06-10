// @ts-check
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../useAuth.js';
import { useSession } from '../../../../context/session/session.jsx';
import { AuthSplitLayout } from '../../../../layouts/AuthSplitLayout/AuthSplitLayout.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';

export function ChangePassword() {
  const { session } = useSession();
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(form);
      navigate('/doctor');
    } catch (err) {
      setError(err.message ?? 'Could not change your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Set a new password to continue">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Change your password</h2>
        <p className="help">
          For your security, please choose a new password before continuing
          {session ? `, ${session.fullName}` : ''}.
        </p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field
          id="currentPassword"
          label="Current password"
          type="password"
          value={form.currentPassword}
          onChange={set('currentPassword')}
          required
        />
        <Field
          id="newPassword"
          label="New password"
          type="password"
          value={form.newPassword}
          onChange={set('newPassword')}
          required
          help="At least 8 characters."
        />
        <Button type="submit" block isLoading={submitting}>
          Update password
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
