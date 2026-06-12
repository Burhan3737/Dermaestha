// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { Pagination } from '../../../../shared/Pagination/Pagination.jsx';
import { formatPkr } from '../../../../lib/format/format.js';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

const pkr = (paisa) => (paisa == null ? '—' : formatPkr(paisa));
const karachi = (iso) =>
  new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

const EMPTY_FILTERS = { patient: '', doctorName: '', appointmentId: '', paymentRef: '', from: '', to: '' };

export function AdminRecords() {
  const [tab, setTab] = useState('records');
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({ page: 1 });
  const [auditApplied, setAuditApplied] = useState({ page: 1 });
  const { records, auditEntries } = useAdmin({
    recordsFilters: tab === 'records' ? applied : null,
    auditFilters: tab === 'audit' ? auditApplied : null,
  });
  const set = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value }));
  const search = (e) => {
    e.preventDefault();
    setApplied({ ...draft, page: 1 });
  };

  const rows = records.data?.data ?? [];
  const auditRows = auditEntries.data?.data ?? [];

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Records &amp; audit log</h1>

      <div className="tabs">
        <button type="button" className={`tab${tab === 'records' ? ' tab--active' : ''}`} onClick={() => setTab('records')}>
          Records
        </button>
        <button type="button" className={`tab${tab === 'audit' ? ' tab--active' : ''}`} onClick={() => setTab('audit')}>
          Audit log
        </button>
      </div>

      {tab === 'records' && (
        <div className="section-card">
          <form className="filters" onSubmit={search}>
            <Field label="Patient email / phone" id="f-patient" value={draft.patient} onChange={set('patient')} />
            <Field label="Doctor name" id="f-doctor" value={draft.doctorName} onChange={set('doctorName')} />
            <Field label="Appointment ID" id="f-appt" value={draft.appointmentId} onChange={set('appointmentId')} />
            <Field label="Payment ref" id="f-payref" value={draft.paymentRef} onChange={set('paymentRef')} />
            <Field label="From" id="f-from" type="date" value={draft.from} onChange={set('from')} />
            <Field label="To" id="f-to" type="date" value={draft.to} onChange={set('to')} />
            <Button type="submit">Search</Button>
          </form>

          {records.isLoading && <p>Loading…</p>}
          {records.error && <Alert variant="danger">{records.error.message}</Alert>}
          {!records.isLoading && rows.length === 0 && <p className="empty">No matching records.</p>}
          {rows.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Slot</th><th>Patient</th><th>Doctor</th><th>State</th><th>Paid</th><th>Payment ref</th><th>Refund ref</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{karachi(r.slotStart)}</td>
                      <td>
                        {r.patientName}
                        {r.subjectName && <span className="help"> (for: {r.subjectName})</span>}
                      </td>
                      <td>{r.doctorName}</td>
                      <td>
                        <span className="badge badge--info">{r.state}</span>{' '}
                        {r.disputed && <span className="badge badge--danger">Disputed</span>}
                      </td>
                      <td>{pkr(r.amountPaid)}</td>
                      <td>{r.paymentRef ?? '—'}</td>
                      <td>{r.refundRef ?? '—'}</td>
                      <td>
                        <Link to={`/admin/records/${r.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.data?.page && (
                <Pagination page={records.data.page} onPage={(p) => setApplied((f) => ({ ...f, page: p }))} />
              )}
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="section-card">
          {auditEntries.isLoading && <p>Loading…</p>}
          {auditEntries.error && <Alert variant="danger">{auditEntries.error.message}</Alert>}
          {!auditEntries.isLoading && auditRows.length === 0 && <p className="empty">No audit entries.</p>}
          {auditRows.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>When (Karachi)</th><th>Event</th><th>Actor</th><th>Target</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((eRow) => (
                    <tr key={eRow.id}>
                      <td>{karachi(eRow.at)}</td>
                      <td>{eRow.eventType}</td>
                      <td>{eRow.actorType}{eRow.actorId ? ` (${eRow.actorId})` : ''}</td>
                      <td>{eRow.targetRef ?? '—'}</td>
                      <td>{eRow.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditEntries.data?.page && (
                <Pagination page={auditEntries.data.page} onPage={(p) => setAuditApplied((f) => ({ ...f, page: p }))} />
              )}
            </>
          )}
        </div>
      )}
    </SidebarLayout>
  );
}
