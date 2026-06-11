// @ts-check
import { formatPkr } from '../format/format.js';

/**
 * §3.5 Client-Render Rule: the ONLY place PDF bytes are produced. Swap this file to move
 * rendering server-side (v1.2+); callers depend only on (prescriptionJson) => Uint8Array.
 * pdf-lib is dynamically imported so it never enters the main bundle (3G target).
 */
export async function renderPrescriptionPdf(p) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait (points)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const draw = (text, { size = 11, f = font, x = 50 } = {}) => {
    page.drawText(String(text), { x, y, size, font: f });
    y -= size + 7;
  };

  draw('Dermestha - Prescription', { size: 18, f: bold });
  const d = p.doctorSnapshot ?? {};
  draw(`${d.name ?? ''} - ${d.specialization ?? ''} (PMC ${d.pmcNumber ?? ''})`);
  draw(
    `Issued: ${new Date(p.issuedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`,
  );
  const s = p.patientIdSnapshot ?? {};
  draw(
    s.forSelf
      ? `Patient: ${s.name ?? ''}`
      : `Patient: ${s.name ?? ''} (age ${s.age ?? '-'}, ${s.relation ?? ''})`,
    { f: bold },
  );
  y -= 8;

  let total = 0;
  let unpriced = 0;
  for (const item of p.items ?? []) {
    draw(`${item.medicineName} - ${item.dosage}, ${item.duration}`, { f: bold });
    if (item.instructions) draw(item.instructions, { x: 62 });
    if (item.price == null) {
      unpriced += 1;
      draw('not priced', { x: 62 });
    } else {
      total += item.price;
      draw(formatPkr(item.price), { x: 62 });
    }
  }
  y -= 8;
  draw(`Total: ${formatPkr(total)}`, { f: bold });
  if (unpriced) draw(`${unpriced} item(s) not priced`);
  if (p.notes) {
    y -= 8;
    draw('Notes:', { f: bold });
    draw(p.notes);
  }
  if (p.followUpDate) draw(`Follow-up: ${String(p.followUpDate).slice(0, 10)}`);

  return doc.save(); // Uint8Array
}
