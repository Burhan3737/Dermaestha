// @ts-check
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { useAppointment } from '../../../appointment/useAppointment.js';
import { usePrescription } from '../../usePrescription.js';

/** Keyboard-navigable medicine listbox (doc 06: custom listbox for D-05 medicine search). */
function MedicineSearch({ medicines, search, onSearch, onPick, onFreeText }) {
  const options = medicines.data?.data ?? [];
  const open = search.length >= 2;
  const [active, setActive] = useState(0);
  const count = options.length + 1; // +1 = free-text fallback row

  const pick = (i) => {
    if (i < options.length) onPick(options[i]);
    else onFreeText(search);
    onSearch('');
  };

  return (
    <div className="field">
      <label htmlFor="med-search">Add medicine</label>
      <input
        id="med-search"
        placeholder="Search medicine…"
        value={search}
        role="combobox"
        aria-expanded={open}
        aria-controls="med-listbox"
        onChange={(e) => {
          onSearch(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') setActive((a) => (a + 1) % count);
          else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + count) % count);
          else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active);
          }
        }}
      />
      {open && (
        <ul id="med-listbox" role="listbox" className="listbox">
          {options.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'option option--active' : 'option'}
              onClick={() => pick(i)}
            >
              {m.name}
              {m.genericName ? ` (${m.genericName})` : ''} — {formatPkr(m.unitPrice)}
            </li>
          ))}
          <li
            role="option"
            aria-selected={active === options.length}
            className={active === options.length ? 'option option--active' : 'option'}
            onClick={() => pick(options.length)}
          >
            Add "{search}" as free text (not priced)
          </li>
        </ul>
      )}
    </div>
  );
}

export function PrescriptionBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]); // {medicineId?, medicineName, price, dosage, duration, instructions}
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [confirming, setConfirming] = useState(false);

  const { detail } = useAppointment({ detailId: id });
  const { prescriptions, medicines, submit } = usePrescription({
    appointmentId: id,
    medicineSearch: search,
  });

  const a = detail.data;
  const existing = prescriptions.data?.data ?? [];
  const priced = rows.filter((r) => r.price !== null);
  const total = priced.reduce((sum, r) => sum + r.price, 0);
  const unpriced = rows.length - priced.length;
  const complete =
    rows.length > 0 && rows.every((r) => r.dosage && r.duration && r.instructions);

  const setRow = (i, field, value) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const doSubmit = () =>
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
      { onSuccess: () => navigate('/doctor') },
    );

  return (
    <SidebarLayout>
      <section className="section-card">
        <h1>Write prescription</h1>
        {detail.isPending && <p className="help">Loading…</p>}
        {a && (
          // Read-Only Patient-ID Header (P8): auto-pulled, never typed by the doctor.
          <div className="section-card">
            <strong>
              {a.forSelf
                ? a.patientName
                : `${a.subjectName} (age ${a.subjectAge}, ${a.subjectRelation})`}
            </strong>
            <div className="help">Consultation: {formatKarachi(a.slotStart)}</div>
          </div>
        )}

        <MedicineSearch
          medicines={medicines}
          search={search}
          onSearch={setSearch}
          onPick={(m) =>
            setRows((rs) => [
              ...rs,
              { medicineId: m.id, medicineName: m.name, price: m.unitPrice, dosage: '', duration: '', instructions: '' },
            ])
          }
          onFreeText={(name) =>
            setRows((rs) => [
              ...rs,
              { medicineName: name, price: null, dosage: '', duration: '', instructions: '' },
            ])
          }
        />

        {rows.map((r, i) => (
          <div key={`${r.medicineName}-${i}`} className="appt-row">
            <strong>{r.medicineName}</strong>{' '}
            {r.price === null ? (
              <span className="badge badge--neutral">not priced</span>
            ) : (
              formatPkr(r.price)
            )}
            <div className="field">
              <label htmlFor={`dosage-${i}`}>Dosage</label>
              <input
                id={`dosage-${i}`}
                value={r.dosage}
                onChange={(e) => setRow(i, 'dosage', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`duration-${i}`}>Duration</label>
              <input
                id={`duration-${i}`}
                value={r.duration}
                onChange={(e) => setRow(i, 'duration', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`instructions-${i}`}>Instructions</label>
              <input
                id={`instructions-${i}`}
                value={r.instructions}
                onChange={(e) => setRow(i, 'instructions', e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}

        <p>
          <strong>Total: {formatPkr(total)}</strong>
        </p>
        {unpriced > 0 && <p className="help">{unpriced} item(s) not priced</p>}

        <div className="field">
          <label htmlFor="notes">General notes (optional)</label>
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="follow-up">Follow-up date (optional)</label>
          <input
            id="follow-up"
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>

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
          // Immutability Rule (#4): explicit confirm before the irreversible write.
          <div className="section-card">
            <p>
              A submitted prescription cannot be edited. To fix an error you will need to issue a
              new prescription.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={submit.isPending}
              onClick={doSubmit}
            >
              Confirm & issue
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
              Back
            </button>
          </div>
        )}
        {submit.isError && <p className="help">Could not submit — please retry.</p>}

        {existing.length > 0 && (
          <>
            <h2>Previously issued for this appointment</h2>
            {existing.map((p) => (
              <div key={p.id} className="appt-row">
                {formatKarachi(p.issuedAt)} — {p.items.length} item(s)
              </div>
            ))}
          </>
        )}
      </section>
    </SidebarLayout>
  );
}
