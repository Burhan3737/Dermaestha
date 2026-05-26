# 09 — Environment Variables

Never commit `.env` or `.env.local` to git. Add both to `.gitignore`.

---

## Server (`server/.env`)

```bash
# ── Database ─────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host.railway.app:5432/railway"
# Provided by Railway when you add a Postgres plugin.
# Copy from Railway dashboard → Postgres → Connect → DATABASE_URL

# ── Authentication ───────────────────────────────────────────────────────
JWT_SECRET="<minimum-32-character-random-string>"
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_EXPIRES_IN="7d"

# ── Video (Daily.co) ─────────────────────────────────────────────────────
DAILY_API_KEY="<from daily.co dashboard → Developers → API Keys>"
DAILY_DOMAIN="dermestha"
# Rooms will be at: https://dermestha.daily.co/<room-name>

# ── Email (Resend) ───────────────────────────────────────────────────────
RESEND_API_KEY="re_<from resend.com dashboard → API Keys>"
EMAIL_FROM="Dermestha <noreply@dermestha.com>"
# Must match a verified domain in your Resend account.
# Configure SPF + DKIM records via Resend's DNS setup guide before launch.

# ── App Config ───────────────────────────────────────────────────────────
PORT=3001
NODE_ENV="production"
CLIENT_URL="https://dermestha.com"
# Used for CORS allowlist.

# ── File Storage ─────────────────────────────────────────────────────────
UPLOADS_DIR="/uploads"
# Mount point of the Railway persistent volume.
```

---

## Client (`client/.env`)

```bash
VITE_API_URL="https://api.dermestha.com"
# The deployed Railway URL. Note the /api prefix is added per-request in client/src/api/*.

VITE_DAILY_DOMAIN="dermestha"
# Must match DAILY_DOMAIN on the server.
```

---

## Local Development

```bash
# server/.env  (local overrides)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dermestha_dev"
JWT_SECRET="dev-secret-not-for-production"
DAILY_API_KEY="<use your real Daily.co key — sandbox is the same API>"
RESEND_API_KEY="<use your real Resend key — test mode available>"
EMAIL_FROM="Dermestha Dev <dev@youremail.com>"
PORT=3001
NODE_ENV="development"
CLIENT_URL="http://localhost:5173"
UPLOADS_DIR="./uploads"
```

```bash
# client/.env  (local overrides)
VITE_API_URL="http://localhost:3001"
VITE_DAILY_DOMAIN="dermestha"
```

---

## Production Setup

| Variable group | Where to set |
|---|---|
| Server variables | Railway → Project → Variables tab |
| Client variables | Vercel → Project → Settings → Environment Variables |
| `DATABASE_URL` | Auto-injected by Railway when Postgres plugin is connected |

---

## Security Notes

- `JWT_SECRET` must be ≥ 32 random characters. Never reuse across environments.
- `DAILY_API_KEY` grants full control of your Daily.co account — treat as a root credential.
- `RESEND_API_KEY` allows sending email from your domain — treat as high-sensitivity.
- `DATABASE_URL` contains the Postgres password — same care as production DB credentials.
