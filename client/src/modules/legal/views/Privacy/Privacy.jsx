// @ts-check
import { LegalPage } from '../../components/LegalPage/LegalPage.jsx';

const SECTIONS = [
  { heading: 'Eligibility & consent', body: 'DRAFT: By creating an account you consent to the collection and processing of your information as described here. You may withdraw consent by closing your account, subject to records we must retain by law.' },
  { heading: 'Scope of service', body: 'DRAFT: This policy covers information collected when you browse, register, book, and attend video consultations on Dermestha.' },
  { heading: 'Data we collect & how we handle it', body: 'DRAFT: We collect account details, booking and payment metadata, and consultation-related information. Health information is treated as sensitive and access is restricted to your treating physician and authorised staff. Handling follows the controls described in our internal data handling policy (specification doc 08).' },
  { heading: 'Bookings, payments & third parties', body: 'DRAFT: Payments are processed by a third-party gateway; we store payment metadata, not full card details. Video calls are delivered by a third-party provider under contract.' },
  { heading: 'Retention, cancellations & your rights', body: 'DRAFT: We retain medical and transaction records for the period required by law. You may request access to or correction of your personal data, subject to verification.' },
  { heading: 'Contact', body: 'DRAFT: Privacy questions can be directed to privacy@dermestha.example. This address is a placeholder pending final copy.' },
];

export function Privacy() {
  return <LegalPage title="Privacy Policy" lastUpdated="DRAFT — not yet finalised" sections={SECTIONS} />;
}
