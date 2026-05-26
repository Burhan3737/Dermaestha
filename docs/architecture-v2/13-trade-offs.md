# 13 — Trade-off Analysis

Every architecture decision has alternatives. This section makes the trade-offs explicit and records when to revisit each choice.

---

## Monolith vs Microservices

**Choice:** Monolith — single Express process.

**Why:** At 10 doctors and 100 bookings/week, microservices add network hops between services, distributed tracing overhead, and deployment complexity with zero throughput benefit. The entire v1 workload fits in one process with headroom to spare.

**What was rejected:** Separate services for auth, video, notifications, PDF generation. Each would need its own Railway deployment, inter-service authentication, and failure handling across network boundaries.

**Revisit when:** A specific module (e.g., PDF generation) introduces unacceptable latency or memory pressure on the API process under real load. Extract that module as a Railway worker service — the service interface (`services/pdf.js`) is already a clean boundary.

---

## Auth: Stateless JWT vs Stateful Sessions

**Choice:** Stateless JWT, 7-day expiry, no refresh tokens.

**Why:** No session store to manage, provision, or scale. A single `JWT_SECRET` env var is the only dependency. Token verification is a local CPU operation — no DB or Redis round-trip per request.

**What was rejected:** Server-side sessions (requires Redis or DB session table), refresh token rotation (adds two tokens per session, a refresh endpoint, and revocation logic).

**Trade-off accepted:** A compromised token cannot be invalidated before expiry without a denylist. 7-day window is acceptable for MVP — patient/doctor accounts are low-value targets relative to financial or medical record systems.

**Revisit when:** Account suspension or instant logout is a product requirement (e.g., a doctor account is flagged mid-session). Add a Redis-backed token denylist checked in `verifyJWT`.

---

## PDF: PDFKit vs Puppeteer

**Choice:** PDFKit (in-process programmatic API).

**Why:** PDFKit is ~5KB, loads in milliseconds, and generates PDFs without spawning a subprocess. Puppeteer launches headless Chrome (~300MB memory, ~2s cold start), which adds memory pressure to the Express process and introduces a new class of failures (Chrome crash, zombie processes).

**What was rejected:** Puppeteer/Playwright (HTML-to-PDF), wkhtmltopdf (system binary dependency), external PDF service (latency + cost).

**Trade-off accepted:** Prescription layout is defined in PDFKit's drawing API (coordinates, boxes, text) rather than HTML/CSS. Updating the template requires changing the drawing code rather than editing markup.

**Revisit when:** Prescription templates require complex visual design that is impractical to express in a programmatic drawing API (e.g., logo watermarks, multi-column layouts, embedded images). Migrate `services/pdf.js` to Puppeteer — the interface (`generatePrescriptionPdf(id) → path`) stays the same.

---

## Scheduling: node-cron vs BullMQ

**Choice:** node-cron running inside the Express process.

**Why:** Zero infrastructure. No Redis, no separate worker service, no queue management UI. At 100 bookings/week, a 5-minute cron poll with a ±5 minute window is more than accurate enough — the window is larger than the tick interval by design.

**What was rejected:** BullMQ (requires Redis + a worker process), Agenda (requires MongoDB), Railway managed cron (external trigger, harder to share Prisma context).

**Trade-off accepted:** If the Express process restarts (deploy, crash), the cron does not fire during the restart window (typically <30s). The `notified` boolean flag and wide query window mean at most one 5-minute tick is missed — the next tick catches up.

**Revisit when:** Email failure visibility is required (failed jobs need to be inspectable and retried), or the cron and API need to scale independently. Extract `scheduler.js` to a dedicated Railway worker.

---

## File Storage: Railway Volume vs S3

**Choice:** Railway persistent volume at `/uploads`.

**Why:** Zero configuration — no IAM policies, bucket permissions, or signed URL logic. Express serves the file directly via `res.sendFile()`. Setup time: mounting the volume in the Railway dashboard.

**What was rejected:** AWS S3 (requires IAM, bucket config, SDK integration, signed URLs for private access), Cloudinary (external dependency, adds latency), Railway's object storage (not yet GA at time of design).

**Trade-off accepted:** No CDN delivery — patients download prescriptions from the Express server, not an edge location. At <1000 PDFs, disk usage is negligible. Serving ~50KB files from a Railway instance in Singapore to Pakistan adds ~40–60ms of network latency — acceptable for an infrequent document download.

**Revisit when:** Railway volume approaches the plan's storage limit, or prescriptions need to be delivered globally at low latency. Migration path: change `services/pdf.js` to write to S3 and `GET /prescriptions/:id/pdf` to redirect to a signed S3 URL. Two files.

---

## Caching: None vs Redis

**Choice:** No caching. Every request hits Postgres.

**Why:** At 100 bookings/week, Postgres query volume is trivial. A doctor-list query over 10 rows takes <5ms. Adding Redis introduces a new infrastructure component, cache invalidation logic, and a consistency concern (stale doctor availability shown to patients) — all for a problem that doesn't exist yet.

**What was rejected:** Redis for doctor-list caching, slot availability caching, or session storage.

**Revisit when:** Postgres p95 query latency exceeds 200ms under real load. Measure first, cache second.

---

## Video SDK: Daily.co vs Agora

**Choice:** Daily.co.

**Why:** `@daily-co/daily-react` provides a prebuilt `<DailyProvider>` component that handles the entire call UI (camera/mic controls, participant tiles, connection state). Integration is ~50 lines of React. Adaptive bitrate is built-in — no manual quality-level switching needed for 3G. Free tier covers early usage.

**What was rejected:** Agora — gives more in-call control (virtual backgrounds, cloud recording, noise suppression) but requires building the entire video UI from scratch in React and handling Agora's more complex session lifecycle.

**Trade-off accepted:** Daily.co's pricing scales with minutes used. At 100 calls/week, the free tier is sufficient. If calls average 15 minutes, that's 1500 minutes/week — well within Daily.co's free 10,000 minutes/month allowance.

**Revisit when:** Custom in-call features are required (recording, background blur, breakout rooms), or minute costs become significant at scale. Migration path: replace `services/video.js` on the server and `VideoCall.jsx` on the client — pages (`VideoRoom.jsx`) don't change.
