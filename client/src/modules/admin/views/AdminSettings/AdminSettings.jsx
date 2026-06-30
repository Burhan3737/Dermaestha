// @ts-check
import { useState, useEffect } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ConfirmDialog } from '../../../../shared/ConfirmDialog/ConfirmDialog.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';

export function AdminSettings() {
  const { settings, saveSettings } = useAdmin({ settings: true });
  const [form, setForm] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (settings.data && !form) {
      const d = settings.data;
      setForm({
        minBookingLeadMinutes: String(d.minBookingLeadMinutes),
        bankName: d.bankName ?? '',
        bankAccountName: d.bankAccountName ?? '',
        bankAccountNumber: d.bankAccountNumber ?? '',
        bankInstructions: d.bankInstructions ?? '',
      });
    }
  }, [settings.data, form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    const lead = parseInt(form.minBookingLeadMinutes, 10);
    if (Number.isNaN(lead)) return;
    const payload = {
      minBookingLeadMinutes: lead,
      bankName: form.bankName.trim(),
      bankAccountName: form.bankAccountName.trim(),
      bankAccountNumber: form.bankAccountNumber.trim(),
      bankInstructions: form.bankInstructions.trim(),
    };
    saveSettings.mutate(payload, {
      onSuccess: () => setConfirming(false),
      onError: () => setConfirming(false),
    });
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Platform settings</h1>

      <div className="section-card">
        {settings.isLoading && <p>Loading…</p>}
        {settings.error && <Alert variant="danger">{settings.error.message}</Alert>}
        {saveSettings.error && <Alert variant="danger">{saveSettings.error.message}</Alert>}

        {!settings.isLoading && !settings.error && !form && (
          <p className="empty">No settings record found. Run the database seed to initialise defaults.</p>
        )}

        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirming(true);
            }}
          >
            <Field
              label="Minimum booking lead time (minutes)"
              id="s-lead"
              type="number"
              min="30"
              max="1440"
              value={form.minBookingLeadMinutes}
              onChange={set('minBookingLeadMinutes')}
              help="Applies to future booking attempts only; existing appointments are unaffected."
              required
            />
            <Field
              label="Bank name"
              id="s-bank-name"
              value={form.bankName}
              onChange={set('bankName')}
              help="Shown to patients on the payment-instructions screen."
            />
            <Field
              label="Account name"
              id="s-bank-account-name"
              value={form.bankAccountName}
              onChange={set('bankAccountName')}
            />
            <Field
              label="Account number"
              id="s-bank-account-number"
              value={form.bankAccountNumber}
              onChange={set('bankAccountNumber')}
            />
            <div className="field">
              <label htmlFor="s-bank-instructions">Bank instructions</label>
              <textarea
                id="s-bank-instructions"
                className="input"
                rows={3}
                value={form.bankInstructions}
                onChange={set('bankInstructions')}
              />
              <div className="help">
                Optional note shown to patients (e.g. add your name in the transfer reference).
              </div>
            </div>
            <Button type="submit">Save settings</Button>
          </form>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          confirmLabel="Confirm save"
          isLoading={saveSettings.isPending}
          onConfirm={save}
          onCancel={() => { setConfirming(false); saveSettings.reset(); }}
        >
          <p>
            Save these values? The lead time changes which slots patients can book from the next
            request, and the bank details are shown to patients on the payment-instructions screen.
          </p>
        </ConfirmDialog>
      )}
    </SidebarLayout>
  );
}
