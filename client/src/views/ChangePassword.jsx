// @ts-check
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { useSession } from '../lib/session.jsx';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ChangePassword() {
  const { setSession, session } = useSession();
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
      const user = await api.post('/auth/change-password', form);
      setSession(user);
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
        <p className="help">For your security, please choose a new password before continuing{session ? `, ${session.fullName}` : ''}.</p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field id="currentPassword" label="Current password" type="password" value={form.currentPassword} onChange={set('currentPassword')} required />
        <Field id="newPassword" label="New password" type="password" value={form.newPassword} onChange={set('newPassword')} required help="At least 8 characters." />
        <Button type="submit" block isLoading={submitting}>Update password</Button>
      </form>
    </AuthSplitLayout>
  );
}
