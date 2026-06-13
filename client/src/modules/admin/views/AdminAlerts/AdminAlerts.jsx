// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { formatKarachiTable } from '../../../../lib/format/format.js';

const KIND_LABEL = {
  'payment.reconciliation_mismatch': { label: 'Payment mismatch', variant: 'danger' },
  'payment.refund_exhausted': { label: 'Refund failed', variant: 'danger' },
  'email.send_failed_final': { label: 'Email failed', variant: 'warning' },
  'system.unhandled_exception': { label: 'Exception', variant: 'danger' },
  awaiting_prescription: { label: 'Awaiting prescription', variant: 'warning' },
};

export function AdminAlerts() {
  const { alerts, resendEmail } = useAdmin({ alerts: true });
  const rows = alerts.data?.data ?? [];
  const [pendingJobId, setPendingJobId] = useState(null);
  const [errorJobId, setErrorJobId] = useState(null);

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>System health</h1>
      <div className="section-card">
        {alerts.isLoading && <p>Loading…</p>}
        {alerts.error && <Alert variant="danger">{alerts.error.message}</Alert>}
        {!alerts.isLoading && rows.length === 0 && <p className="empty">No alerts — all clear.</p>}
        {rows.map((a) => {
          const kind = KIND_LABEL[a.kind] ?? { label: a.kind, variant: 'info' };
          return (
            <div key={a.id} data-testid={a.id} className="section-card" style={{ marginBottom: 'var(--sp-3)' }}>
              <p>
                <span className={`badge badge--${kind.variant}`}>{kind.label}</span>{' '}
                <span className="help">{formatKarachiTable(a.at)}</span>
              </p>
              <p>{a.reason ?? '—'}</p>
              {resendEmail.error && (a.failedJobs ?? []).some((j) => j.id === errorJobId) && (
                <Alert variant="danger">{resendEmail.error.message}</Alert>
              )}
              {/* No confirm modal here by design (A-03 quick action); the detail view (A-04) is the confirmed path. */}
              <p>
                {a.targetRef && a.kind !== 'system.unhandled_exception' && (
                  <Link to={`/admin/records/${a.targetRef}`}>View record</Link>
                )}
                {(a.failedJobs ?? []).map((j) => (
                  <Button
                    key={j.id}
                    variant="secondary"
                    isLoading={resendEmail.isPending && pendingJobId === j.id}
                    onClick={() => {
                      setPendingJobId(j.id);
                      setErrorJobId(null);
                      resendEmail.mutate({ jobId: j.id }, {
                        onSettled: () => setPendingJobId(null),
                        onError: () => setErrorJobId(j.id),
                      });
                    }}
                    style={{ marginLeft: 'var(--sp-2)' }}
                  >
                    Resend {j.type}
                  </Button>
                ))}
              </p>
            </div>
          );
        })}
      </div>
    </SidebarLayout>
  );
}
