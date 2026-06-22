// @ts-check
import { Link, useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import {
  formatPkr,
  formatKarachiDate,
  formatKarachiTime,
  initials,
} from '../../../../lib/format/format.js';
import { renderPrescriptionPdf } from '../../../../lib/pdf/renderPrescriptionPdf.js';
import { usePrescription } from '../../usePrescription.js';

async function downloadPdf(p) {
  const bytes = await renderPrescriptionPdf(p);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `prescription-${String(p.issuedAt).slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Whole weeks between issue and follow-up; null when not a clean future gap. */
function followUpWeeks(issuedAt, followUpDate) {
  const ms = new Date(followUpDate).getTime() - new Date(issuedAt).getTime();
  const weeks = Math.round(ms / (7 * 24 * 60 * 60 * 1000));
  return weeks >= 1 ? weeks : null;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function PrescriptionPaper({ p }) {
  const priced = p.items.filter((i) => i.price !== null);
  const unpriced = p.items.length - priced.length;
  const total = priced.reduce((sum, i) => sum + i.price, 0);
  const s = p.patientIdSnapshot ?? {};
  const d = p.doctorSnapshot ?? {};
  const weeks = p.followUpDate ? followUpWeeks(p.issuedAt, p.followUpDate) : null;

  return (
    <div className="rx-paper">
      <div className="rx-paper__accent" />
      <div className="rx-paper__body">
        {/* Document header — clinic lockup + document type/date */}
        <div className="rx-doc-header">
          <span className="brand">
            <span className="brand__mark" />
            <span className="brand__word">Dermestha</span>
          </span>
          <div className="rx-doc-right">
            <p className="rx-doc-type">Prescription</p>
            <p className="rx-doc-date tnum">{formatKarachiDate(p.issuedAt)}</p>
          </div>
        </div>
        <hr className="rx-divider" />

        {/* Patient identification */}
        <div className="rx-patient-band">
          <p className="rx-patient-label">Prescription for</p>
          <p className="rx-patient-line">
            {s.name}
            {!s.forSelf && ` · Age ${s.age} · ${cap(s.relation)}`}
          </p>
        </div>

        {/* Rx items */}
        <div>
          {p.items.map((i) => (
            <div className="rx-item" key={i.id}>
              <div>
                <p className="rx-item__name">
                  {i.medicineName}
                  {i.price === null && <span className="tag-unpriced">Not priced</span>}
                </p>
                <p className="rx-item__detail">
                  {[i.dosage, i.duration, i.instructions].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="rx-item__price tnum">
                {i.price === null ? '—' : formatPkr(i.price)}
              </span>
            </div>
          ))}
          <div className="rx-total">
            <span>Total</span>
            <span className="tnum">{formatPkr(total)}</span>
          </div>
          {unpriced > 0 && (
            <p className="caption">
              {unpriced} item{unpriced > 1 ? 's' : ''} not priced — excluded from total.
            </p>
          )}
        </div>

        {/* General notes */}
        {p.notes && (
          <>
            <p className="rx-section">General notes</p>
            <div className="rx-notes">{p.notes}</div>
          </>
        )}

        {/* Follow-up */}
        {p.followUpDate && (
          <div className="rx-followup">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="2" y="3" width="12" height="11" rx="2" />
              <path d="M5 1v3M11 1v3M2 7h12" />
            </svg>
            <span>Follow-up:</span>
            <span className="rx-followup-date tnum">{formatKarachiDate(p.followUpDate)}</span>
            {weeks && <span className="muted">({weeks} weeks)</span>}
          </div>
        )}

        {/* Doctor signature footer */}
        <div className="rx-doc-footer">
          <span className="avatar avatar--lg">{initials(d.name)}</span>
          <div className="rx-doc-info">
            <p className="rx-doc-name">
              {d.name}
              <span className="pmc-badge pmc-badge--inline">✓ PMC</span>
            </p>
            <p className="rx-stamp tnum">
              {d.specialization} · PMC Reg #{d.pmcNumber} · Issued {formatKarachiDate(p.issuedAt)} ·{' '}
              {formatKarachiTime(p.issuedAt)}
            </p>
          </div>
          <div className="rx-footer-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => downloadPdf(p)}>
              Download PDF
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrescriptionView() {
  const { id } = useParams();
  const { prescriptions } = usePrescription({ appointmentId: id });
  const rows = prescriptions.data?.data ?? [];
  // API returns issuedAt ascending; show newest first (most relevant on top).
  const ordered = [...rows].sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  const issuingDoctor = ordered[0]?.doctorSnapshot?.name;

  return (
    <PatientLayout>
      <div className="rx-page">
        <Link className="rx-back" to="/appointments/history">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
          Back to Past appointments
        </Link>

        <h1 className="h1">Prescriptions</h1>
        {issuingDoctor && (
          <p className="rx-subhead">Issued by {issuingDoctor} · Available indefinitely</p>
        )}

        {prescriptions.isPending && <p className="help">Loading…</p>}
        {/* Cross-tenant / unknown appointment 404s at the API (no leak) — show a message, not a blank page. */}
        {prescriptions.isError && <p className="help">This prescription is not available.</p>}
        {prescriptions.data && ordered.length === 0 && <p className="help">No prescriptions yet.</p>}

        {ordered.map((p, idx) => (
          <div key={p.id}>
            {idx > 0 && <p className="older-label">Earlier prescription</p>}
            <PrescriptionPaper p={p} />
          </div>
        ))}
      </div>
    </PatientLayout>
  );
}
