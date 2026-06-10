// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../useAuth.js';
import { AuthSplitLayout } from '../../../../layouts/AuthSplitLayout/AuthSplitLayout.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
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
