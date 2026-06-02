// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Reset your password">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Forgot password</h2>
        {sent ? (
          <Alert variant="success">
            If an account exists for that email, a reset link is on its way.
          </Alert>
        ) : (
          <>
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" block isLoading={submitting}>
              Send reset link
            </Button>
          </>
        )}
        <p className="help">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
