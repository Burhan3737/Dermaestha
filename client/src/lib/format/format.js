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

const KHI_TIME = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  hour: 'numeric',
  minute: '2-digit',
});

/** Time-only variant in Asia/Karachi ("1:00 PM") — the doctor Today time column. */
export const formatKarachiTime = (iso) => (iso ? KHI_TIME.format(new Date(iso)) : '');

const KHI_DATE = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Date-only variant in Asia/Karachi with year ("Thu, 29 May 2026") — prescription document header/footer. */
export const formatKarachiDate = (iso) => (iso ? KHI_DATE.format(new Date(iso)) : '');

/** "Ayesha Khan" → "AK": first letters of the first two words, for avatar fallbacks. */
export const initials = (name) =>
  (name ?? '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
