// @ts-check
import { useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
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

function PrescriptionCard({ p }) {
  const priced = p.items.filter((i) => i.price !== null);
  const unpriced = p.items.length - priced.length;
  const total = priced.reduce((sum, i) => sum + i.price, 0);
  const s = p.patientIdSnapshot ?? {};
  const d = p.doctorSnapshot ?? {};
  return (
    <div className="section-card">
      <h2>Prescription — {formatKarachi(p.issuedAt)}</h2>
      <p className="help">
        {d.name} — {d.specialization} (PMC {d.pmcNumber})
      </p>
      <p>
        Patient: {s.name}
        {!s.forSelf && ` (age ${s.age}, ${s.relation})`}
      </p>
      <ul>
        {p.items.map((i) => (
          <li key={i.id}>
            <strong>{i.medicineName}</strong> — {i.dosage}, {i.duration}
            {i.instructions && <div className="help">{i.instructions}</div>}
            <div>{i.price === null ? '(not priced)' : formatPkr(i.price)}</div>
          </li>
        ))}
      </ul>
      <p>
        <strong>Total: {formatPkr(total)}</strong>
      </p>
      {unpriced > 0 && <p className="help">{unpriced} item(s) not priced</p>}
      {p.notes && <p>Notes: {p.notes}</p>}
      {p.followUpDate && <p>Follow-up: {String(p.followUpDate).slice(0, 10)}</p>}
      <button type="button" className="btn btn--primary" onClick={() => downloadPdf(p)}>
        Download PDF
      </button>
    </div>
  );
}

export function PrescriptionView() {
  const { id } = useParams();
  const { prescriptions } = usePrescription({ appointmentId: id });
  const rows = prescriptions.data?.data ?? [];

  return (
    <PatientLayout>
      <h1>Prescriptions</h1>
      {prescriptions.isPending && <p className="help">Loading…</p>}
      {prescriptions.data && rows.length === 0 && <p className="help">No prescriptions yet.</p>}
      {rows.map((p) => (
        <PrescriptionCard key={p.id} p={p} />
      ))}
    </PatientLayout>
  );
}
