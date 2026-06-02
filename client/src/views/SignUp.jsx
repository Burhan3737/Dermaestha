// @ts-check
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { AuthSplitLayout } from '../layouts/AuthSplitLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/Alert.jsx';

const DASHBOARD = { patient: '/', doctor: '/doctor', admin: '/admin' };

export function SignUp() {
  const { signup } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [tosAccepted, setTos] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signup({ ...form, tosAccepted });
      navigate(DASHBOARD[user.role] ?? '/');
    } catch (err) {
      setError(err.message ?? 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout headline="Create your account">
      <form className="section-card" onSubmit={onSubmit} noValidate>
        <h2>Sign up</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Field
          id="fullName"
          label="Full name"
          value={form.fullName}
          onChange={set('fullName')}
          required
        />
        <Field
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          required
        />
        <Field id="phone" label="Phone" value={form.phone} onChange={set('phone')} required />
        <Field
          id="password"
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          required
          help="At least 8 characters."
        />
        <label className="choice" htmlFor="tos">
          <input
            type="checkbox"
            id="tos"
            checked={tosAccepted}
            onChange={(e) => setTos(e.target.checked)}
          />
          <span>
            I agree to the <Link to="/legal/terms">Terms of Service</Link> and{' '}
            <Link to="/legal/privacy">Privacy Policy</Link>
          </span>
        </label>
        <Button type="submit" block disabled={!tosAccepted} isLoading={submitting}>
          Create account
        </Button>
        <p className="help">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
