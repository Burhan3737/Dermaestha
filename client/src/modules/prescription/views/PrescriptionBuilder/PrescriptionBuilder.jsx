// @ts-check
import { useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import {
  formatPkr,
  formatKarachi,
  formatKarachiDate,
  formatKarachiTime,
} from '../../../../lib/format/format.js';
import { useAppointment } from '../../../appointment/useAppointment.js';
import { usePrescription } from '../../usePrescription.js';
import { MedicineSearch } from '../../components/MedicineSearch/MedicineSearch.jsx';

// Stable React keys for dynamic rows; not persisted — resets on page reload, which is fine.
let nextRowId = 0;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Priced total (paisa) + count of unpriced items for a set of Rx items. */
function summarize(items) {
  const priced = items.filter((i) => i.price !== null);
  return { total: priced.reduce((sum, i) => sum + i.price, 0), unpriced: items.length - priced.length };
}

const detailLine = (i) => [i.dosage, i.duration, i.instructions].filter(Boolean).join(' · ');

export function PrescriptionBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]); // {medicineId?, medicineName, price, dosage, duration, instructions}
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [confirming, setConfirming] = useState(false);

  const inFlight = useRef(false);

  const { detail } = useAppointment({ detailId: id });
  const { prescriptions, medicines, submit } = usePrescription({
    appointmentId: id,
    medicineSearch: search,
  });

  const a = detail.data;
  // Show issued corrections newest-first (mirrors the patient P-13 view).
  const existing = [...(prescriptions.data?.data ?? [])].sort((x, y) =>
    String(y.issuedAt).localeCompare(String(x.issuedAt)),
  );
  const { total, unpriced } = summarize(rows);
  const complete = rows.length > 0 && rows.every((r) => r.dosage && r.duration && r.instructions);

  const setRow = (i, field, value) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const doSubmit = () => {
    if (inFlight.current) return; // immutable artifact: a double-click must not double-issue
    inFlight.current = true;
    submit.mutate(
      {
        appointmentId: id,
        body: {
          items: rows.map((r) =>
            r.medicineId
              ? {
                  medicineId: r.medicineId,
                  dosage: r.dosage,
                  duration: r.duration,
                  instructions: r.instructions,
                }
              : {
                  medicineName: r.medicineName,
                  dosage: r.dosage,
                  duration: r.duration,
                  instructions: r.instructions,
                },
          ),
          ...(notes ? { notes } : {}),
          ...(followUpDate ? { followUpDate } : {}),
        },
      },
      {
        onSuccess: () => navigate('/doctor'),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  return (
    <SidebarLayout>
      <Link className="rx-back" to="/doctor">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="M9 11L5 7l4-4" />
        </svg>
        Back to appointments
      </Link>
      <h1 className="h1">Write prescription</h1>

      {detail.isPending && <p className="help">Loading…</p>}

      {a && (
        // Read-only patient-ID band (P8): auto-pulled, never typed by the doctor.
        <div className="rx-patient-band">
          <p className="rx-patient-label">Prescription for</p>
          <p className="rx-patient-line">
            {a.forSelf
              ? a.patientName
              : `${a.subjectName} · Age ${a.subjectAge} · ${cap(a.subjectRelation)}`}
          </p>
          <p className="help">
            Consultation: {formatKarachi(a.slotStart)} · Auto-filled — you don&apos;t type this.
          </p>
        </div>
      )}

      {/* Add medicines */}
      <section className="section-card">
        <div className="section-card__title">
          <h2 className="h3">Medicines</h2>
        </div>

        <MedicineSearch
          medicines={medicines}
          search={search}
          onSearch={setSearch}
          onPick={(m) =>
            setRows((rs) => [
              ...rs,
              { rowId: nextRowId++, medicineId: m.id, medicineName: m.name, price: m.unitPrice, dosage: '', duration: '', instructions: '' },
            ])
          }
          onFreeText={(name) =>
            setRows((rs) => [
              ...rs,
              { rowId: nextRowId++, medicineName: name, price: null, dosage: '', duration: '', instructions: '' },
            ])
          }
        />

        {rows.length === 0 ? (
          <p className="help">Search the catalogue above to add medicines. Items not in the catalogue can be added as free text — they won&apos;t be priced.</p>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div key={r.rowId} className="rx-builder-item">
                <div className="rx-builder-item__left">
                  <p className="rx-builder-item__name">
                    {r.medicineName}
                    {r.price === null && <span className="tag-unpriced">Not priced</span>}
                  </p>
                  <div className="rx-builder-item__fields">
                    <div className="mini-field">
                      <label htmlFor={`dosage-${i}`}>Dosage</label>
                      <input
                        id={`dosage-${i}`}
                        className="input"
                        value={r.dosage}
                        onChange={(e) => setRow(i, 'dosage', e.target.value)}
                      />
                    </div>
                    <div className="mini-field">
                      <label htmlFor={`duration-${i}`}>Duration</label>
                      <input
                        id={`duration-${i}`}
                        className="input"
                        value={r.duration}
                        onChange={(e) => setRow(i, 'duration', e.target.value)}
                      />
                    </div>
                    <div className="mini-field">
                      <label htmlFor={`instructions-${i}`}>Instructions</label>
                      <input
                        id={`instructions-${i}`}
                        className="input"
                        value={r.instructions}
                        onChange={(e) => setRow(i, 'instructions', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="rx-builder-item__aside">
                  <span className="rx-builder-item__price tnum">
                    {r.price === null ? '—' : formatPkr(r.price)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--danger-ghost btn--sm"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="rx-total">
              <span>Total (priced items)</span>
              <span className="tnum">{formatPkr(total)}</span>
            </div>
            {unpriced > 0 && (
              <p className="caption">
                {unpriced} item{unpriced > 1 ? 's' : ''} not priced — excluded from total.
              </p>
            )}
          </div>
        )}
      </section>

      {/* General notes */}
      <section className="section-card">
        <div className="section-card__title">
          <h2 className="h3">General notes</h2>
        </div>
        <div className="field field--wide">
          <label htmlFor="notes">Clinical notes for the patient (optional)</label>
          <textarea
            id="notes"
            className="input"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. sun sensitivity, dietary advice, warning signs…"
          />
        </div>
      </section>

      {/* Follow-up */}
      <section className="section-card">
        <div className="section-card__title">
          <h2 className="h3">Follow-up</h2>
        </div>
        <div className="field">
          <label htmlFor="follow-up">Follow-up date (optional)</label>
          <input
            id="follow-up"
            type="date"
            className="input"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
          <p className="help">If set, the patient sees this in their prescription view.</p>
        </div>
      </section>

      {/* Submit / immutability confirm */}
      {!confirming ? (
        <button
          type="button"
          className="btn btn--primary"
          disabled={!complete || submit.isPending}
          onClick={() => setConfirming(true)}
        >
          Submit prescription
        </button>
      ) : (
        // Immutability rule (#4): explicit confirm before the irreversible write.
        <div className="section-card">
          <p>
            A submitted prescription cannot be edited. To fix an error, issue a new prescription —
            both will appear in the patient&apos;s history.
          </p>
          <div className="rx-footer-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={submit.isPending}
              onClick={doSubmit}
            >
              Confirm &amp; issue
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
              Back
            </button>
          </div>
        </div>
      )}
      {submit.isError && <p className="help">Could not submit — please retry.</p>}

      {/* Previously submitted (read-only, immutable) */}
      {existing.length > 0 && (
        <>
          <hr className="rx-divider" />
          <p className="label">Previously submitted</p>
          {existing.map((p) => {
            const sum = summarize(p.items);
            return (
              <div key={p.id} className="rx-prev">
                <div className="rx-prev__accent" />
                <div className="rx-prev__body">
                  <div className="rx-prev-header">
                    <div>
                      <p className="h3">Prescription for {p.patientIdSnapshot?.name}</p>
                      <p className="caption">
                        Issued{' '}
                        <span className="tnum">
                          {formatKarachiDate(p.issuedAt)} · {formatKarachiTime(p.issuedAt)}
                        </span>{' '}
                        · {p.doctorSnapshot?.name}
                      </p>
                    </div>
                    <span className="badge badge--success">Submitted</span>
                  </div>
                  {p.items.map((i) => (
                    <div className="rx-item" key={i.id}>
                      <div>
                        <p className="rx-item__name">
                          {i.medicineName}
                          {i.price === null && <span className="tag-unpriced">Not priced</span>}
                        </p>
                        <p className="rx-item__detail">{detailLine(i)}</p>
                      </div>
                      <span className="rx-item__price tnum">
                        {i.price === null ? '—' : formatPkr(i.price)}
                      </span>
                    </div>
                  ))}
                  <div className="rx-total">
                    <span>Total</span>
                    <span className="tnum">{formatPkr(sum.total)}</span>
                  </div>
                  {sum.unpriced > 0 && (
                    <p className="caption">
                      {sum.unpriced} item{sum.unpriced > 1 ? 's' : ''} not priced — excluded from total.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </SidebarLayout>
  );
}
