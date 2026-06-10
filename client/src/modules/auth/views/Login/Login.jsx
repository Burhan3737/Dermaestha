// @ts-check
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../useAuth.js';
import { AuthSplitLayout } from '../../../../layouts/AuthSplitLayout/AuthSplitLayout.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';

const DASHBOARD = { patient: '/', doctor: '/doctor', admin: '/admin' };

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(form);
      if (user.mustChangePassword) return navigate('/doctor/change-password');
      navigate(DASHBOARD[user.role] ?? '/');
    } catch (err) {
      setError(err.message ?? 'Could not log you in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Welcome back">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Log in</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          required
        />
        <Button type="submit" block isLoading={submitting}>
          Log in
        </Button>
        <p className="help">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="help">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
