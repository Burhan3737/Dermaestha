// @ts-check
const PKR = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** Integer paisa → "Rs 2,500". */
export const formatPkr = (paisa) => `Rs ${PKR.format(Math.round((paisa ?? 0) / 100))}`;

const KHI = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** UTC ISO → human string rendered in Asia/Karachi. */
export const formatKarachi = (iso) => (iso ? KHI.format(new Date(iso)) : '');

const KHI_TABLE = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Dense table-cell variant of formatKarachi (admin tables). */
export const formatKarachiTable = (iso) => (iso ? KHI_TABLE.format(new Date(iso)) : '');
