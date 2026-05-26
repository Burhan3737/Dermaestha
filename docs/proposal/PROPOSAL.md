# Project Proposal
## Dermestha — Online Dermatology Consultation Platform

**Author:** Muhammad Burhan Tahir  
**LinkedIn:** [linkedin.com/in/mburhantahir](https://www.linkedin.com/in/mburhantahir/)  
**Date:** May 2026  
**Version:** 1.0    

© 2026 Muhammad Burhan Tahir. All rights reserved.

---

## Executive Summary

Dermestha is a purpose-built online platform that lets patients in Pakistan book and attend a live video consultation with a dermatologist — from their phone, without traveling to a clinic. After the consultation, the doctor creates a digital prescription inside the platform, and the patient downloads it as a PDF. The whole experience, from booking to prescription, happens in one place.

Pakistan's telemedicine market is dominated by large general-purpose platforms that list 20,000+ doctors across 200+ specialties. These are healthcare supermarkets. Dermestha is the opposite: a specialty boutique for skin. Every feature is designed specifically for dermatology — the booking flow, the prescription format, the consultation interface, and the doctor experience.

The v1 launch tests a single question: **will Pakistani patients book and pay for an online dermatology consultation?** If the answer is yes — which the competitive research and market context strongly suggest — the platform is positioned to grow into a trusted home for skin care in Pakistan.

This proposal covers the full scope, timeline, and investment for the first version of Dermestha, ready to launch within 8 weeks.

---

## Why This Approach Works for Your Practice

### The Pakistani telemedicine landscape

Several platforms already offer online doctor consultations in Pakistan. They each serve a different angle of the same general-purpose market:

| Platform | What it is |
|---|---|
| **Ola Doc** (`oladoc.com`) | The market leader by volume. ~25,000 doctors across 120+ specialties. Web + iOS + Android. Includes pharmacy delivery and lab booking. |
| **Al Marham** (`marham.pk`) | Closest competitor to Ola Doc. ~20,000 PMC-verified doctors across 200+ specialties. Strong on patient education and bilingual content. |
| **Sehat Kahani** (`sehatkahani.com`) | Women-doctor-led telemedicine network. Strong focus on rural reach and female patients. Used by NGOs and corporate health programs. |
| **Shifa4U** (`shifa4u.com`) | Telemedicine arm of Shifa International Hospital. Hospital-backed, institutional brand trust, narrower doctor pool. |
| **Healthwire** (`healthwire.pk`) | Appointment booking + teleconsultation directory. Lighter platform — more of a discovery layer than a full telehealth product. |

What they all have in common: **they are generalist platforms.** A patient looking for skin care sees the same interface and the same workflow as a patient looking for a pediatrician, cardiologist, or psychiatrist. Skin care is one tab in a long list.

### How Dermestha is different

Dermestha is the first Pakistani platform built for a single specialty: dermatology. Every choice — the booking flow, the prescription format, the doctor profile fields, even the visual design — exists to serve one type of patient: someone with a skin concern.

| | Generalist platforms (Ola Doc, Al Marham, Sehat Kahani, Shifa4U, Healthwire) | Dermestha |
|---|---|---|
| Doctor variety | Thousands of doctors across 100+ specialties | Curated dermatologists only |
| Patient discovery | Filter by specialty among hundreds of options | Browse skin specialists directly — no filtering needed |
| Prescription format | Generic digital upload or generic e-prescription | Doctor-built in-app: medicines, dosage, instructions — structured for skin treatments |
| Consultation design | Generic telemedicine UI | Built for visual skin examination (good lighting prompts, photo-friendly UX in future versions) |
| Scale at launch | Massive — trust from volume | Small, curated — trust from quality and focus |
| Brand positioning | Healthcare supermarket | Specialty boutique for skin |
| Payments | Cards + wallets (varies by platform) | Cards + JazzCash + Easypaisa + bank transfer (Safepay) |

### Why specialty focus is a real advantage

The generalist platforms have a structural ceiling on how good they can make any single specialty experience. They have to design for every specialty equally, so they design for the average. Dermestha can design for one — and that means the entire patient journey, from landing page to prescription, can be tailored to dermatology in ways the large platforms will never prioritise.

For patients, the message is simple and powerful: **"This platform exists for your skin."** That is a positioning the generalists cannot copy without abandoning the model that makes them work.

---

## What You Get — Version 1 Deliverables

Everything listed below will be live and working at launch.

### Patient-facing

- **Landing page** — A clean, professional website that explains Dermestha, shows the listed dermatologists, and guides visitors to book a consultation. Entry point from social media and search.

- **Patient account** — Patients sign up with an email address. They stay logged in across visits.

- **Doctor profiles** — Each listed dermatologist has a profile page: photo, bio, area of specialization, consultation fee, and which days and times they are available.

- **Slot booking** — Patients pick a doctor, choose a date, select an available 30-minute slot, and confirm. A booking confirmation email is sent immediately.

- **Reminder emails** — An automatic email goes out 24 hours before the appointment, and another 1 hour before. Patients don't miss their call.

- **Live video consultation** — At the scheduled time, the patient clicks "Join Call." The video works on ordinary mobile connections (3G-compatible). No app to download — it works directly in the browser.

- **Online payment via Safepay** — Before or at booking, the patient pays through Safepay. Safepay covers all major payment methods in Pakistan in one step: Visa/Mastercard, JazzCash, Easypaisa, and bank transfer. No separate integrations needed. *(See "A Note on the Payment Gateway" below for why I am suggesting Safepay over a direct bank gateway like UBL.)*

- **Patient dashboard** — After the consultation, the patient's dashboard shows their appointments and any prescriptions. They can download their prescription PDF at any time.

### Doctor-facing

- **Doctor dashboard** — You see the day's appointments in one view, with the patient name, scheduled time, and a "Join Call" button.

- **Prescription builder** — After the consultation, you open the prescription tool, select medicines from the platform's medicine list (with a free-text option for anything not on the list), add dosage, duration, and instructions for each medicine, add any general notes, and submit. The platform generates a formatted PDF prescription automatically.

- **Availability management** — You set your weekly schedule (which days and what hours you are available). Patients can only book within those hours.

### Admin (internal use)

- **Doctor management** — Add new dermatologists to the platform, manage their approval status.

- **Medicine catalogue** — Maintain the list of medicines that appears in the prescription builder. Add, edit, or deactivate medicines as needed.

---

## A Note on the Payment Gateway

Pakistan has two types of online payment products: **aggregators** (Safepay, PayFast) that accept cards plus mobile wallets in a single integration, and **bank gateways** (UBL eMerchant, HBL DirectPay, MCB Direct) that accept Visa/Mastercard only. Bank gateways cannot process JazzCash or Easypaisa — those are mobile wallet products run by separate companies.

This matters because Pakistani patients overwhelmingly pay with mobile wallets: roughly **60% via JazzCash or Easypaisa**, only **20% by card**, with the remainder using direct bank transfer.

| If a patient has only... | Safepay | UBL gateway |
|---|---|---|
| A debit/credit card | ✅ Pays | ✅ Pays |
| A JazzCash or Easypaisa wallet | ✅ Pays | ❌ Cannot pay |
| A bank account (no card) | ✅ Pays via direct transfer | ❌ Cannot pay |

**My recommendation: Safepay for v1.** Zero setup fee, zero monthly fee, one merchant application, and all four payment methods at checkout — no patient is turned away. UBL's slightly lower per-card-transaction rate (~1.5–2% vs Safepay's ~3%) is real, but it comes with a setup fee (~PKR 25–50K), monthly maintenance, and roughly 80% of Pakistani patients blocked from paying because they don't have a card.

**This is a suggestion, not a requirement.** If you prefer a bank gateway like UBL — for example, because your target patients are primarily card-using, or you already have a UBL merchant relationship you want to leverage — I will integrate that instead at the same project price. The development effort is similar; the trade-off is yours to make with full awareness of the coverage gap.

Either way, the v1 design supports adding a second gateway later. A common post-launch move is to route card payments through a bank gateway (saving 1% on the card share) while keeping an aggregator for wallets. *(See "What Comes After Launch" below.)*

---

## What Is NOT Included in Version 1

To stay focused and ship on time, the following are explicitly out of scope for this initial version. They are not forgotten — they are planned for after launch.

| Not in v1 | Why deferred |
|---|---|
| SMS / WhatsApp reminders | Email-only notifications are sufficient to validate the launch hypothesis; SMS/WhatsApp adds complexity and cost |
| Lab test booking | Requires integrations with third-party labs; not part of the core consultation loop |
| Medical records history | Valuable but not needed to validate the first booking |
| iOS / Android native app | Mobile-responsive website is sufficient for v1; native apps are a v2 consideration |
| Urdu language | High value but significant scope; deferred to v1.2 |
| AI skin diagnosis | Future capability; requires regulatory consideration |
| Instant / on-demand calls | Live queue requires real-time infrastructure; added in v1.1 once the platform is stable |
| Multi-city / multi-specialty | Dermestha is dermatology-only by design |

---

## What Comes After Launch

Once v1 is live and validated, I can add the following in short follow-on engagements:

**Immediately after launch (2–4 weeks):**
- SMS and WhatsApp notifications (same booking/reminder triggers, additional channel)
- Live queue — doctors go "online" and patients can join a real-time queue without pre-booking

**Later (v1.2 onwards):**
- Additional dermatologists added via admin panel — no development needed
- **Payment gateway optimisation** — once the platform has 3–6 months of booking data, add a direct bank gateway (UBL or HBL) for card payments to save ~1% on the card-paying share, while keeping Safepay for wallet payments. Patient still sees one checkout.
- Pharmacy ordering and price lookup (requires pharmacy partnerships)
- Urdu language support
- Native iOS and Android apps (can reuse the entire backend as-is)

---

## Timeline and Milestones

**Total duration: 8 weeks at 4 hours/day** (equivalent to 4 full-time weeks).

You will see a working version of the platform at each milestone and can provide feedback before the next phase begins.

| Milestone | End of week | What you can see and test |
|---|---|---|
| **M1 — Booking flow** | Week 2 | Working website: patient signs up, browses doctors, books a slot, receives a confirmation email |
| **M2 — Video + Payments** | Week 4 | Full video consultation end-to-end (mobile-tested on a slow connection); Safepay payment flow working |
| **M3 — Prescriptions** | Week 6 | Doctor builds a prescription after the call; patient downloads the PDF from their dashboard |
| **M4 — Launch-ready** | Week 8 | Admin panel, landing page, email automation, full end-to-end QA across all flows — ready to go live |

---

## What I Need From You

To start development immediately and avoid delays:

| Item | When needed | Notes |
|---|---|---|
| Doctor profiles (×3–5) | Week 1 | Photo, name, bio, area of specialization, consultation fee, and weekly availability (e.g., Mon/Wed/Fri, 6pm–9pm) for each doctor you want listed at launch |
| Medicine list | Week 2 | A list of the medicines you commonly prescribe — I'll load these into the prescription builder |
| Domain name | Week 1 | e.g., `dermestha.com` (if not yet registered, I can advise) |
| Business email address | Week 1 | e.g., `noreply@dermestha.com` — used for confirmation and reminder emails |
| **Safepay merchant application** | **Immediately** | Apply at [getsafepay.pk](https://getsafepay.pk) — approval takes 1–2 weeks. Start this in parallel with development so payments are ready by M2. I'll guide you through the application. |

**Note on doctors:** The platform launches with the 3–5 dermatologists you provide. Adding more doctors after launch is a simple admin-panel action — no development needed.

---

## Investment

### Project fee

**Total: PKR 350,000**

A single fixed fee covering all v1 deliverables listed above — the patient booking flow, video consultation, online payments via Safepay, prescription builder, dashboards, admin panel, landing page, and email automation. Based on approximately 160 hours of senior full-stack development work delivered over 8 weeks.

### Payment schedule

| When | Amount | Trigger |
|---|---|---|
| Project start | PKR 105,000 (30%) | Signed proposal |
| M2 completion | PKR 140,000 (40%) | Video calls + Safepay working |
| M4 completion | PKR 105,000 (30%) | Full platform, launch-ready |


### What is NOT included in this fee (paid directly by you)

These are ongoing operational costs, not development costs:

| Service | Estimated monthly cost |
|---|---|
| Vercel (website hosting) | Free tier at launch |
| Railway (backend + database hosting) | ~$5–20/month |
| Daily.co (video calls) | Free up to 10,000 minutes/month |
| Resend (email delivery) | Free up to 3,000 emails/month |
| Domain name | PKR 2,000–5,000/year |
| **Safepay transaction fee** | **~2–3.5% per transaction** (deducted automatically — no extra monthly fee) |

At launch volume (~100 consultations/week), total hosting cost is under $30/month. These services scale gradually as the platform grows.

---

## Next Steps

If this proposal aligns with what you are looking for, the next step is a short call to walk through any questions, confirm timelines, and formalise the engagement through a signed agreement.

---

© 2026 Muhammad Burhan Tahir. All rights reserved.

[linkedin.com/in/mburhantahir](https://www.linkedin.com/in/mburhantahir/)
