// @ts-check
import { LegalPage } from '../../components/LegalPage/LegalPage.jsx';

const SECTIONS = [
  { heading: 'Eligibility', body: 'DRAFT: You must be 18 or older (or have the consent of a parent or guardian) and resident in Pakistan to create an account and book consultations on Dermestha.' },
  { heading: 'Scope of service & medical disclaimer', body: 'DRAFT: Dermestha connects you with PMC-registered dermatologists for remote video consultations. It is not a substitute for emergency care. In a medical emergency contact local emergency services. Consultations are subject to the clinical judgement of the treating physician.' },
  { heading: 'Bookings, payments & refunds', body: 'DRAFT: A consultation fee is shown before you confirm a booking and is captured at confirmation. Refunds are handled in line with our cancellation and no-show terms below and applicable consumer law.' },
  { heading: 'Cancellations & no-shows', body: 'DRAFT: You may cancel up to a defined window before your appointment for a refund. Missed appointments (no-shows) after the grace period may be non-refundable.' },
  { heading: 'Data handling & privacy', body: 'DRAFT: Your personal and health information is processed as described in our Privacy Policy. By using Dermestha you consent to that processing.' },
  { heading: 'Contact', body: 'DRAFT: Questions about these terms can be directed to support@dermestha.example. This address is a placeholder pending final copy.' },
];

export function Terms() {
  return <LegalPage title="Terms of Service" lastUpdated="DRAFT — not yet finalised" sections={SECTIONS} />;
}
