# 01 — Requirements

---

## Functional Requirements

| Role | Core capabilities |
|---|---|
| **Patient** | Register, browse doctor profiles, book a slot, join video call, view & download prescription PDF |
| **Doctor** | Set weekly availability, view appointment queue, join video call, build prescription (select medicines + dosage + duration + instructions + notes), generate PDF |
| **Admin** | Approve doctor accounts, manage medicine catalogue |

**Automated email triggers:**
1. Booking confirmed → email to patient
2. 24 hr before appointment → reminder email
3. 1 hr before appointment → reminder email
4. Prescription submitted → "prescription ready" email to patient

---

## Non-Functional Requirements

| Dimension | Target |
|---|---|
| Availability | Best-effort MVP (no SLA) |
| Video latency | Must function on 3G (Pakistan common case); handled by Daily.co adaptive bitrate |
| Concurrency | ~10 doctors, ~100 bookings/week at launch |
| Mobile | Mobile-responsive web; no native app in v1 |
| Security | HTTPS enforced by host, JWT auth, bcrypt passwords, Zod input validation at route entry |
| Email deliverability | SPF + DKIM + DMARC configured before launch |

---

## Constraints

| Constraint | Detail |
|---|---|
| Timeline | 8.5 weeks solo / 4.5–5.5 weeks with 2 developers |
| Payments | v1 = no online payments; Safepay added in v1.1, merchant KYC takes 1–2 weeks |
| Video | Third-party SDK only (Daily.co) — no proprietary WebRTC |
| Regulatory | No DRAP/PMDC compliance layer needed |

---

## Out of Scope (v1)

- DRAP/PMDC regulatory compliance
- Lab test integration
- Medical records history
- AI skin diagnosis / photo analysis
- Insurance / panel billing
- Multi-specialty / multi-city
- Admin analytics dashboard
- Native mobile apps
- Instant / on-demand no-wait consultation
- Urdu language support
