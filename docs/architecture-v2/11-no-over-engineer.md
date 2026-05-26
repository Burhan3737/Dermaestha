# 11 — What NOT to Over-Engineer

Every item below is a real temptation that must be explicitly resisted in v1.

---

## Anti-Pattern Table

| Area | Keep in v1 | Avoid |
|---|---|---|
| **Auth** | JWT + bcrypt. 7-day expiry. No refresh tokens. | OAuth/social login, 2FA, refresh token rotation, session denylist |
| **Frontend state** | React Context for auth. `useState`/`useEffect` for everything else. | Redux, Zustand, Jotai, MobX, React Query, SWR |
| **API style** | Plain REST with Express Router. JSON over HTTPS. | GraphQL, tRPC, WebSockets (add Socket.io in v1.1 for live queue only) |
| **Database** | Single Postgres instance. No connection pooler. Direct Prisma client. | Read replicas, PgBouncer, sharding, multi-region |
| **Caching** | None. Every request hits Postgres. | Redis, in-memory LRU cache, HTTP cache headers on dynamic data |
| **File storage** | Railway volume. PDFs served by Express at `/api/prescriptions/:id/pdf`. | S3, CloudFront, Cloudinary, signed URLs |
| **PDF generation** | PDFKit (in-process, ~5KB). | Puppeteer, headless Chrome, wkhtmltopdf, external PDF service |
| **Scheduling** | node-cron in the Express process. DB poll every 5 minutes. | BullMQ, Agenda, Bee-Queue, separate worker service, Redis queues |
| **Video** | Daily.co prebuilt `<DailyProvider>` React component. | Custom WebRTC signalling, proprietary TURN/STUN servers |
| **Validation** | Zod at route entry points only. | Defensive validation inside services, DB layer, or utilities |
| **Testing** | Manual QA across all three roles. | Unit/integration/E2E suite — add in v1.1 once flows stabilize |
| **Monorepo tooling** | Two `package.json` files. `npm run dev` in each. | Nx, Turborepo, Lerna, Yarn workspaces |
| **Error monitoring** | `console.error` + Railway logs. | Sentry, Datadog, Honeycomb — add in v1.1 when real users hit real bugs |
| **Security hardening** | HTTPS (Vercel/Railway enforce), bcrypt, JWT, Zod. | Rate limiting (add `express-rate-limit` in v1.1), CSRF tokens, helmet.js |
| **Logging** | `console.log`/`console.error` with context. | Winston, Pino, log aggregation pipeline |

---

## Decision Rules

**"While we're at it..."** — Stop. If it's not in the v1 Must Have list, it goes to the backlog.

**"Users will expect..."** — Maybe. Ask: does this prevent the core flow from working? If no, it's a Should Have at best.

**"Competitors have it..."** — Irrelevant. Ola Doc and Al Marham took years to build their feature sets. Dermestha v1 tests one hypothesis: will patients complete a paid dermatology video consultation?

**"It would only take a day..."** — Probably three. And it distracts from Integration QA week.

**"We should add tests..."** — After the flows stabilize. Writing tests for code that is still changing is waste.
