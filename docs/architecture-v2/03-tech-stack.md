# 03 — Tech Stack Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | React + Vite | Fast DX, large ecosystem, no SSR complexity needed for a SPA with JWT auth |
| Frontend hosting | Vercel | Zero-config CDN, automatic HTTPS, global edge — free tier covers MVP |
| Backend | Node.js + Express | Same language as frontend reduces context-switching for a solo/small team; large ecosystem |
| Backend hosting | Railway | Managed Postgres + persistent volume + env vars in one platform; Singapore region (~40ms from Pakistan) |
| Database | PostgreSQL | Relational integrity for appointments ↔ prescriptions ↔ medicines; strong Prisma support |
| ORM | Prisma | Type-safe queries, schema migrations, readable schema-as-code |
| Auth | JWT + bcrypt | Stateless — no session store; 7-day expiry; bcrypt for password hashing |
| Video | Daily.co | Prebuilt `<DailyProvider>` React component; adaptive bitrate for 3G; private rooms via server tokens; free tier |
| Email | Resend | Clean REST API, template-free (HTML strings), high deliverability, generous free tier |
| PDF generation | PDFKit | In-process, no headless Chrome, ~5KB library, fast; prescription templates are structured enough for a programmatic API |
| Scheduling | node-cron | Zero infrastructure; 5-minute poll is sufficient at 100 bookings/week |
| File storage | Railway volume | Zero-config for MVP; migrate to S3 when volume size becomes a constraint |
| Input validation | Zod | Schema validation at route entry points only; type-safe, composable |

---

## Key Packages

```
server:
  express           — HTTP framework
  @prisma/client    — ORM
  bcryptjs          — password hashing
  jsonwebtoken      — JWT sign/verify
  zod               — request validation
  pdfkit            — PDF generation
  node-cron         — reminder scheduler
  resend            — transactional email
  cors              — CORS middleware
  dotenv            — env loading

client:
  react             — UI framework
  react-router-dom  — SPA routing
  @daily-co/daily-react  — video call component
  axios             — HTTP client
```
