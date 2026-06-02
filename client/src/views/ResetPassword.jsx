// @ts-check
import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch (err) {
      setError(err.message ?? 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Choose a new password">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Set a new password</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field
          id="newPassword"
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          help="At least 8 characters."
        />
        <Button type="submit" block isLoading={submitting} disabled={!token}>
          Update password
        </Button>
        <p className="help">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
