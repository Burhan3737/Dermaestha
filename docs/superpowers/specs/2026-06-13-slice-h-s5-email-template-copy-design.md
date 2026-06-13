# Slice H · S5 — Email Template Copy — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S5 of 7 |
| Depends on | Slice E (notification outbox + dispatch worker + Resend adapter, merged). Fully independent of S1–S4, S6. |
| Canon refs | F07 (notifications), F01.03 (`password_reset`); doc 14 §5 email merge-variable catalog (8 templates — the data contract); doc 14 §4 Resend `{ from, to, subject, text }` shape |

---

## 0. Decision provenance (read first)

The email **transport** is fully built (Slice E: outbox, dispatch worker, real Resend adapter + console fallback). S5 is purely the **copy** + turning the placeholder body renderer into real prose. Current state: `resend.js` has reasonable subjects but its body is a debug dump (`renderText` emits `key: value` lines); `console.dev.js` only logs vars.

Approved decisions (user, 2026-06-13):
- **Plain-text** emails for v1 (matches the built Resend `text` field; no HTML-rendering layer or new deps).
- Copy authored in-house (English, calm/professional Dermestha voice), embedded in this spec for review (done — §3).
- The merge-var catalog (doc 14 §5) is the **fixed data contract**; copy references only those vars. Amounts arrive as **paisa** → the copy layer owns rupee formatting.

English only (Urdu deferred → v1.2+ per doc 13).

---

## 1. Scope & goals

**Goal:** real, on-brand transactional copy for all 8 templates, rendered from one shared module used by both email adapters.

**In scope**
1. **`server/src/integrations/email/templates.js`** — `{ [template]: { subject, body(vars) } }` for all 8 templates + a `formatPKR(paisa)` helper + a common footer; body functions omit null-valued lines.
2. **`resend.js` refactor** — use `templates.js` for subject + body→`text` (replacing `SUBJECTS` + `renderText`).
3. **`console.dev.js` refactor** — render the real subject+body (so dev logs the actual email, not a var dump).
4. **Tests** — per-template rendering (key facts present, PKR formatting, null-var handling).

**Out of scope**
- HTML emails (plain text for v1).
- Any transport/outbox/worker/adapter-selection change (Slice E owns those).
- The merge-var contract (fixed; doc 14 §5) — S5 changes copy, not vars.
- Bounce/complaint webhook copy (`parseWebhook` is a separate M4 item, untouched here).

**Success criteria**
1. Server suite stays green; rendering lands test-test-first.
2. Each of the 8 templates renders a real subject + plain-text body from sample vars, with no leftover `key: value` debug lines.
3. `formatPKR(250000)` → `"PKR 2,500"`; money lines render rupees, never raw paisa.
4. A null var (e.g. `refundAmount`, `doctorName`) omits its line cleanly rather than printing `null`.
5. The console adapter logs the same rendered body the Resend adapter would send.

---

## 2. Rendering module

`templates.js`:
- `formatPKR(paisa)` → `"PKR " + (paisa/100).toLocaleString('en-PK')` (integer rupees; v1 fees are whole rupees).
- `FOOTER` constant: `— Dermestha · Online dermatology consultations · Need help? {SUPPORT_EMAIL}`.
- `templates[type] = { subject: string, body: (vars) => string }`; `body` composes lines, filters null/undefined, appends `FOOTER`.
- A single `render(template, vars) => { subject, text }` used by both adapters.

`resend.js`: `const { subject, text } = render(template, vars)` → POST body `{ from, to:[to], subject, text }`. `console.dev.js`: log `{ to, subject, text }`.

**Placeholders (config, flagged):** `SUPPORT_EMAIL` and the footer entity name — drawn from a constant (or `env`) with a documented placeholder until the business value is provided. Not a code blocker.

## 3. The copy (all 8 — the deliverable)

`{PKR x}` = `formatPKR(x)`. Vars per doc 14 §5; lines with null vars are omitted.

**1. `booking_confirmation`** — Subject: *Your Dermestha appointment is confirmed*
```
Hi {patientName},

Your consultation with {doctorName} is confirmed.

When: {slotStartLocal} (Pakistan time)
Fee paid: {PKR fee}

Join from your appointments dashboard a few minutes before the start time:
{dashboardUrl}

See you soon.
```

**2. `reminder_24h`** — Subject: *Reminder: your Dermestha appointment is tomorrow*
```
Hi {patientName},

A reminder of your consultation with {doctorName}.

When: {slotStartLocal} (Pakistan time)
Join here when it's time: {joinUrl}

Tip: find a well-lit, quiet spot so your doctor can see your skin clearly.
```

**3. `reminder_1h`** — Subject: *Reminder: your Dermestha appointment starts in 1 hour*
```
Hi {patientName},

Your consultation with {doctorName} starts in about an hour.

When: {slotStartLocal} (Pakistan time)
Join here: {joinUrl}

You can join a few minutes early to check your camera and microphone.
```

**4. `prescription_ready`** — Subject: *Your Dermestha prescription is ready*
```
Hi {patientName},

{doctorName} has issued your prescription.

View and download it here:
{prescriptionUrl}

This link stays available in your appointments dashboard.
```

**5. `refund_confirmation`** — Subject: *Your Dermestha refund has been initiated*
```
Hi {patientName},

We've initiated a refund for your appointment ({appointmentRef}).

Refund amount: {PKR amount}
Reference: {refundRef}

It may take a few business days to appear, depending on your bank or card provider.
```

**6. `cancellation_apology`** — Subject: *Your Dermestha appointment was cancelled*
```
Hi {patientName},

We're sorry — your consultation with {doctorName} on {slotStartLocal} (Pakistan time) has been cancelled.

A refund of {PKR refundAmount} has been initiated and may take a few business days to appear.

You're welcome to book another appointment whenever suits you.
```

**7. `refund_delayed`** — Subject: *Your Dermestha refund is taking longer than expected*
```
Hi {patientName},

The refund for your appointment ({appointmentRef}) is taking longer than usual to process.

We're on it — you don't need to do anything, and we'll confirm as soon as it's complete.

Thank you for your patience.
```

**8. `password_reset`** — Subject: *Reset your Dermestha password*
```
Hi,

We received a request to reset your Dermestha password.

Reset it here (link expires in {expiresInMinutes} minutes):
{resetUrl}

If you didn't request this, you can safely ignore this email — your password won't change.
```

## 4. Testing

`templates.test.js`: each of the 8 renders a non-empty subject + body from representative vars; money vars render via `formatPKR` (assert `"PKR 2,500"` not `250000`); a null `refundAmount`/`doctorName` omits its line; the footer is appended once. Adapter tests updated so `resend`/`console` use `render()`. Full server suite green.

## 5. Spec-doc impact (tracked; applied at task end with approval)

| Doc | Change |
| --- | --- |
| 14 | §5 — resolve the "final copy is M4" note (copy now shipped); vars unchanged |
| 13 | M4 "Email automation" → final template copy Built (plain text); Notification/email module note |
| 15 | If `SUPPORT_EMAIL`/footer entity become env values, add them (else documented constant) |

**Pre-launch nicety (non-blocking):** confirm the real support email + footer entity name to replace the placeholders.

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S5 brainstorming output (approved) |
