# Dermestha — MVP v1 Scope

A dermatology-only virtual consultation platform for the Pakistani market.

---

## 1. Hypothesis

Patients in Pakistan will book and complete a paid online dermatology consultation if we provide a clean booking flow, live video with a qualified dermatologist, and a digital prescription. Validated when **30% of visitors book** and **70% of bookings complete end-to-end**.

## 2. The v1 Loop

Social media → landing page → patient signs up → picks a dermatologist → books a slot → receives confirmation email → reminder emails before the call → joins video call at scheduled time → doctor builds prescription in-app → patient gets "prescription ready" email and downloads PDF from dashboard.

## 3. Must Have (v1)

| # | Feature | Description |
|---|---|---|
| 1 | Landing page | Marketing + booking CTA. Entry point from social media. |
| 2 | Patient sign-up / login | Account creation and login. |
| 3 | Doctor profile listing | Name, photo, specialization, fee, availability per doctor. |
| 4 | Consultation booking | Patient picks doctor + slot, confirms. |
| 5 | Video consultation | Agora or Daily.co SDK. Not proprietary. |
| 6 | Doctor panel | Set availability, see appointments, join call. |
| 7 | Prescription builder | Doctor form: select medicines from list, add dosage/duration/instructions/free-text notes, generate PDF. No validation. |
| 8 | Patient dashboard | View upcoming appointments, download prescription PDF. |
| 9 | Email notifications | Auto-emails: booking confirmation, reminder 24 hr + 1 hr before call, prescription-ready alert. Email only in v1. |

## 4. Should Have (v1.1, 2–4 weeks post-launch)

| Feature | Notes |
|---|---|
| SMS / WhatsApp notifications | Same triggers as email, via SMS/WhatsApp Business API. Reaches patients who don't check email. |
| Online payments — Safepay | One SDK covers Visa/Mastercard + JazzCash + Easypaisa + bank transfer. ~2–3.5% per transaction, no monthly fee. **Client-side dependency: merchant KYC takes 1–2 weeks — start in parallel with v1 dev.** |
| Cash on Delivery via Lapid | Lapid courier API for tracking ID. |
| Live queue / spot booking | Join queue of currently-online doctors. |
| Waiting room | Show queue position. |

## 5. Could Have (v1.2+)

- Derma disease info library
- Pharmacy price calculation + online forwarding
- Raast P2M (State Bank's near-zero-fee rail)
- Proprietary video streaming
- Native mobile apps (iOS/Android)
- Urdu language support

## 6. Out of Scope

- DRAP/PMDC regulatory compliance layer
- Lab test integration
- Medical records history
- AI skin diagnosis / photo analysis
- Insurance / panel billing
- Multi-specialty / multi-city
- Admin analytics dashboard

## 7. Effort Estimate

| Resource | Timeline (v1 Must Have) |
|---|---|
| 1 developer | ~8.5 weeks |
| 2 developers (parallel) | ~4.5–5.5 weeks |
| v1.1 additions | +3–4 weeks after v1 |

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Video quality on weak connections | High | High | Agora/Daily.co adaptive bitrate; test on 3G. |
| Doctor non-adoption | Medium | High | Onboard 3–5 doctors manually; simple doctor UX. |
| Medicine list gaps | Medium | Medium | Curated starter list + free-text input. |
| Payment merchant approval delay (v1.1) | High | Medium | Start Safepay KYC in parallel with v1 dev. |
| Reminder emails land in spam | Medium | Medium | Use reputable provider (Resend/SendGrid/Postmark); SPF/DKIM/DMARC before launch. |
| Scope creep | High | High | Lock v1 in signed proposal; additions to backlog. |

## 9. Success Criteria

| Metric | Target |
|---|---|
| Booking conversion | ≥ 30% |
| Completion rate | ≥ 70% |
| Prescription delivery success | ≥ 95% |
| Doctor week-4 retention | ≥ 80% |
| Patient repeat in 30 days | ≥ 20% |

## 10. Positioning

Ola Doc and Al Marham = healthcare supermarkets (120–200 specialties). **Dermestha = specialty boutique for skin** — curated dermatologists, derma-tailored prescription, visual-first UX.

See `docs/competitive-baseline.md` for the detailed feature comparison.

## 11. Pakistan Payment Stack (v1.1 context)

**Recommended primary:** Safepay (`getsafepay.pk`)
- Single SDK covers Visa/Mastercard + JazzCash + Easypaisa + bank transfer
- Developer-friendly REST API + sandbox
- ~2–3.5% per transaction, no monthly/setup fee

**Alternative:** PayFast Pakistan (`gopayfast.com`) — same coverage, State Bank-regulated, 2–3 day settlement. *Note: not to be confused with the South African `payfast.co.za`.*

**Why one aggregator instead of integrating each wallet:** Pakistani users skew >60% mobile-wallet over cards. A single aggregator gives one integration, one dashboard, one reconciliation flow — instead of three.

**v1 launch:** No online payments; bookings reserved, payment out-of-band. Online payments switch on in v1.1 once merchant approval clears.
