# Slice H · S4 — Public Surface (Landing + Legal) — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S4 of 7 |
| Depends on | Slice A–G (merged). Reuses the client `lib/analytics/track.js` introduced by **S3** (build-order note §E). `booking_confirmed` + the analytics endpoint/writer are **S6**. |
| Canon refs | F16 (legal content), F01.01 (consent links), F02 (doctor listing); doc 02 §F16 + §3.6 consent; doc 06 P-01 + signup-consent links + landing tokens; doc 14 §6 analytics catalog (`landing_view`, `booking_started`, `booking_confirmed`); `mockups/patient-01-landing.html` |

---

## 0. Decision provenance (read first)

S4 has two unrelated halves: the **landing page** (fully mocked → verbatim port) and **legal content** (no source text, no mockup — a compliance artifact). Approved decisions (user, 2026-06-13):
- **Legal:** build the `/legal/*` routes + page scaffolding now, populated with a **structured DRAFT** clearly banner-marked "pending legal review"; final lawyer-authored copy is a **pre-launch gate**. (The pages must exist at launch because the mandatory signup consent checkbox links to them.)
- **Routing:** P-01 landing becomes public `/`; the doctor listing (P-02) **moves `/` → `/browse`** (matches the mockup nav).
- **KPI #1 ownership split:** S4 emits `landing_view` + `booking_started` (client, via S3's `track.js`); **`booking_confirmed` is emitted server-side by S6** in `confirmPaidAppointment` (accurate even when no client returns).

Consent *capture* (`tos_accepted_at`, F16.02) is already built; ToS versioning/re-prompt is explicitly v1.1.

---

## 1. Scope & goals

**Goal:** a public patient-acquisition front door (landing) + the legal pages the consent flow already links to, with the top-of-funnel KPI #1 telemetry.

**In scope**
1. **P-01 landing** at `/` — verbatim mockup port; CTAs → `/browse` + `/signup`; footer legal links.
2. **Doctor-listing relocation** P-02 `/` → `/browse` (+ link/redirect updates).
3. **`/legal/terms` + `/legal/privacy`** — public pages, structured DRAFT content, DRAFT banner.
4. **KPI #1 client emits:** `landing_view` (P-01), `booking_started` (P-06 lock success) via `track.js`.

**Out of scope**
- Final legal copy (pre-launch gate, §7).
- `booking_confirmed` emit + analytics server endpoint/writer (S6).
- ToS versioning / re-prompt-on-update (v1.1).
- New visual design; the `track.js` helper module itself (owned by S3).

**Success criteria**
1. Client suite stays green; new behavior lands test-first.
2. `/` renders the landing; `/browse` renders the (unchanged) doctor listing; old inbound `/` links/redirects resolve correctly.
3. `/legal/terms` + `/legal/privacy` render unauthenticated, show the structured draft + the DRAFT banner, and are reachable from the signup consent checkbox and the landing footer (no broken consent link).
4. `landing_view` fires once on P-01 mount (`meta.referrer`); `booking_started` fires once on a successful slot lock (`meta.doctorId`); both no-op cleanly if the S6 endpoint isn't deployed.

---

## 2. Landing (P-01)

Port `patient-01-landing.html` to `client/src/modules/marketing/views/Landing/Landing.jsx` (+ any landing-only CSS already in `components.css`/`tokens.css`). Public route `/`, logged-out topnav. Sections: hero (CTAs → `/browse`, `/signup`), how-it-works, trust strip, featured doctors grid (static or pulled from the existing listing query — static for v1 unless trivial), footer with `/legal/*` links + copy. Emits `landing_view` on mount.

## 3. Legal pages (F16)

`client/src/modules/legal/` — a reusable `LegalPage` component (title, "last updated", structured sections) + `Terms.jsx` / `Privacy.jsx` content. Public routes `/legal/terms`, `/legal/privacy`. Content = **structured DRAFT**: standard sections (eligibility; scope of service / medical disclaimer; bookings, payments & refunds; data handling & privacy; cancellations & no-shows; contact), placeholder prose, a persistent **"DRAFT — pending legal review"** banner. Linked from the signup consent checkbox (paths already match) + landing footer. The Privacy page cross-references doc 08 data-handling policy.

## 4. Routing changes

`buildRoutes(session)`:
- `/` → `Landing` (public; if a logged-in patient should skip to their dashboard, redirect authenticated sessions — confirm minor behavior at build).
- Doctor listing P-02 → `/browse` (public). `/doctors/:id` profile unchanged.
- `/legal/terms`, `/legal/privacy` → public.
- Update internal references to the old `/` listing: topnav "Browse", post-login patient redirect target, any `<Link to="/">` that meant "listing".

## 5. KPI #1 emits — ownership map

| Event | Surface | Owner | Mechanism |
| --- | --- | --- | --- |
| `landing_view` | P-01 mount | **S4** | client `track('landing_view', { referrer })` |
| `booking_started` | P-06 slot-lock success | **S4** (light touch to Slice-C booking code) | client `track('booking_started', { doctorId })` |
| `booking_confirmed` | `confirmPaidAppointment` | **S6** | server-side `AnalyticsEvent` write |

`networkType` auto-attached by `track.js`. **`track.js` is owned by S3**; S4 reuses it (build-order: S3's helper lands before S4's emits compile). S6 owns `POST /api/analytics/events` + the writer + the server-side `booking_confirmed`.

## 6. Testing

Landing renders + CTAs navigate + one `landing_view`; legal pages render the draft + banner, reachable unauthenticated; `booking_started` fires once on lock success; routing (`/`=landing, `/browse`=listing, old-root link/redirect correct); `track.js` reuse swallows a 404. Full client suite green.

## 7. Spec-doc impact (tracked; applied at task end with approval)

| Doc | Change |
| --- | --- |
| 02 | F16 pages → built-as-DRAFT; KPI #1 client emit points (`landing_view`, `booking_started`) |
| 05 | New public routes `/` (landing), `/browse` (listing relocation), `/legal/terms`, `/legal/privacy` |
| 06 | P-01 → built; routing change (`/`→landing, listing→`/browse`); reusable `LegalPage` pattern |
| 08 | Privacy page ↔ data-handling policy cross-reference |
| 11 | New ADR — "Landing at root, listing → `/browse`; legal pages ship as a review-gated DRAFT" |
| 13 | P-01, F16, legal templates → Built; landing/browse/legal routes |

**Pre-launch gate:** final lawyer-reviewed ToS + Privacy copy replaces the DRAFT before go-live.

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S4 brainstorming output (approved) |
