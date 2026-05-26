# Competitive Baseline: Ola Doc & Al Marham

Reference document for Dermestha architect and proposal. These are the two dominant Pakistani telemedicine platforms the client cited as prior context.

---

## Ola Doc (oladoc.com)

- 25,000+ doctors, 120+ specialties (dermatology is one of many)
- Web + iOS + Android
- **Booking:** Scheduled slots OR "Instant Doctor" (no-wait same-second connection)
- **Video:** In-app video consultation
- **Prescription:** Digital prescription upload and storage (not doctor-built in-app)
- **Pharmacy:** Integrated, 2-hour home delivery, no extra delivery fee
- **Lab tests:** Booking from top Pakistan labs, results in-app
- **Payments:** Credit/debit card, JazzCash, Easypaisa
- **UX pattern:** Accessibility-first, simple interface for low-tech-literacy users; 300,000+ patient reviews for trust
- **Medical records:** Centralized history, prescriptions, lab reports

## Al Marham (marham.pk)

- 20,000+ PMC-verified doctors, 200+ specialties
- Web + iOS + Android + phone (042-34500888)
- **Booking:** Scheduled OR "Call Doctor Now" (immediate)
- **Video:** Audio + video consultations
- **Prescription:** Integrated into consultation workflow + pharmacy delivery
- **Pharmacy:** Integrated delivery; "Parents Care Program" monthly medicine subscription
- **Lab tests:** Booking + results integration
- **Payments:** Marham Wallet + card
- **UX pattern:** Education-first discovery (disease info before doctor selection); bilingual Urdu/English; free Q&A forum for anonymous questions; YouTube + Facebook community
- **Medical records:** Full history

---

## How Dermestha Differentiates

| Dimension | Ola Doc / Al Marham | Dermestha |
|---|---|---|
| Specialty focus | Generalist (120–200 specialties) | Dermatology only |
| Doctor discovery | Filter by specialty among hundreds | Curated skin specialists |
| Prescription UX | Upload or generic workflow | Doctor-built form: selects medicines, dosage, instructions |
| Consultation UX | Generic telemedicine | Skin-first: designed for visual examination |
| Scale at launch | Massive (tens of thousands of doctors) | Tight, curated, quality-controlled |
| Pharmacy | Full integrated delivery | Deferred to v1.1 |
| Mobile | Native iOS + Android | Web-first for MVP |

**Dermestha's position:** Where Ola Doc and Al Marham are healthcare supermarkets, Dermestha is a specialty boutique for skin. The niche focus enables deeper UX (visual-first, derma-specific prescription templates, skin condition categorization) that generalist platforms will never prioritize.

---

## Features NOT to replicate in MVP (already commoditized by competitors)

- Lab test integration
- Medical records history
- Instant/on-demand no-wait consultation
- Pharmacy delivery
- Native mobile app
- Wallet / loyalty programs
- Forum / Q&A layer
- Bilingual content (Urdu — valuable but defer)
