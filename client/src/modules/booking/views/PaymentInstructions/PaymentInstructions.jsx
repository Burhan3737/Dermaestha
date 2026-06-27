// @ts-check
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PatientLayout } from '../../../../layouts/PatientLayout/PatientLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { formatPkr, formatKarachi } from '../../../../lib/format/format.js';
import { useAppointment } from '../../../appointment/useAppointment.js';

/**
 * P-07 — manual-payment instructions (design §7.1). Shows the clinic bank details + amount due for a
 * `pending` appointment and accepts the patient's bank transaction reference. After submission the
 * patient waits for the admin to verify the transfer offline.
 */
export function PaymentInstructions() {
  const { id } = useParams();
  const { detail, submitReference } = useAppointment({ detailId: id });
  const [ref, setRef] = useState('');

  const d = detail.data;
  const pi = d?.paymentInstructions;
  const submitted = Boolean(d?.paymentReference);

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Pay for your appointment</h1>
        {detail.isLoading && <p className="help">Loading…</p>}
        {detail.error && <Alert variant="danger">{detail.error.message}</Alert>}

        {pi && (
          <>
            <p className="appt-sub tnum">
              {formatKarachi(d.slotStart)} · {formatPkr(pi.amountDue)}
            </p>
            <p>
              <strong>Bank:</strong> {pi.bankName}
            </p>
            <p>
              <strong>Account name:</strong> {pi.bankAccountName}
            </p>
            <p>
              <strong>Account number:</strong> {pi.bankAccountNumber}
            </p>
            {pi.bankInstructions && <p className="help">{pi.bankInstructions}</p>}
          </>
        )}

        {submitted ? (
          <Alert variant="info">
            Awaiting confirmation. We’ll email you once the admin verifies your payment.
          </Alert>
        ) : (
          d && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitReference.mutate({ id, reference: ref.trim() });
              }}
            >
              <Field
                label="Bank transaction reference"
                id="pay-ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                required
                help="Enter the reference/transaction ID from your bank transfer so the admin can verify it."
              />
              {submitReference.error && (
                <Alert variant="danger">{submitReference.error.message}</Alert>
              )}
              <Button
                type="submit"
                isLoading={submitReference.isPending}
                disabled={ref.trim().length < 3}
              >
                I’ve paid — submit reference
              </Button>
            </form>
          )
        )}

        <p className="help">
          <Link to="/appointments">Back to my appointments</Link>
        </p>
      </section>
    </PatientLayout>
  );
}
