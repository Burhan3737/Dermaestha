// @ts-check
import { useState, useEffect } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
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
        fallbackFeePctBps: String(d.fallbackFeePctBps),
        // display in PKR (paisa / 100)
        fallbackFeeFixedPkr: String(d.fallbackFeeFixed / 100),
      });
    }
  }, [settings.data, form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = () => setConfirming(true);

  const confirmSave = () => {
    saveSettings.mutate(
      {
        minBookingLeadMinutes: parseInt(form.minBookingLeadMinutes, 10),
        fallbackFeePctBps: parseInt(form.fallbackFeePctBps, 10),
        fallbackFeeFixed: Math.round(parseFloat(form.fallbackFeeFixedPkr) * 100),
      },
      {
        onSuccess: () => setConfirming(false),
      },
    );
  };

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Platform settings</h1>

      <div className="section-card">
        {settings.isLoading && <p>Loading…</p>}
        {settings.error && <Alert variant="danger">{settings.error.message}</Alert>}
        {saveSettings.error && <Alert variant="danger">{saveSettings.error.message}</Alert>}

        {form && (
          <>
            <Field
              id="setting-lead"
              label="Minimum booking lead time (minutes)"
              type="number"
              min={30}
              max={1440}
              value={form.minBookingLeadMinutes}
              onChange={set('minBookingLeadMinutes')}
              help="Applies to future booking attempts only — existing confirmed appointments are unaffected."
            />
            <Field
              id="setting-bps"
              label="Fallback fee — percentage (basis points)"
              type="number"
              min={0}
              max={10000}
              value={form.fallbackFeePctBps}
              onChange={set('fallbackFeePctBps')}
              help="Used only when the gateway does not report a per-transaction fee. 100 bps = 1%."
            />
            <Field
              id="setting-fee"
              label="Fallback fee — fixed (PKR)"
              type="number"
              min={0}
              step={0.01}
              value={form.fallbackFeeFixedPkr}
              onChange={set('fallbackFeeFixedPkr')}
            />
            <div className="modal__actions" style={{ justifyContent: 'flex-start', marginTop: 'var(--sp-4)' }}>
              <Button onClick={handleSave}>Save settings</Button>
            </div>
          </>
        )}
      </div>

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal__body">
              <h2>Confirm settings change</h2>
              <p>
                Save these values? The lead time changes which slots patients can book from the next
                request, and the fallback fee model feeds refund amounts.
              </p>
              {saveSettings.error && (
                <Alert variant="danger">{saveSettings.error.message}</Alert>
              )}
            </div>
            <div className="modal__actions">
              <Button
                variant="ghost"
                onClick={() => { setConfirming(false); saveSettings.reset(); }}
              >
                Cancel
              </Button>
              <Button isLoading={saveSettings.isPending} onClick={confirmSave}>
                Confirm save
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
