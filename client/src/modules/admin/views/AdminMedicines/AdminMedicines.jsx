// @ts-check
import { useState } from 'react';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Field } from '../../../../shared/Field/Field.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { ADMIN_LINKS } from '../../admin.routes.jsx';
import { useAdmin } from '../../useAdmin.js';
import { formatPkr } from '../../../../lib/format/format.js';

export function AdminMedicines() {
  const [search, setSearch] = useState('');
  const { medicines, createMedicine, updateMedicine } = useAdmin({
    medicines: true,
    medicinesSearch: search,
  });
  const [form, setForm] = useState({ name: '', genericName: '', dosageForms: '', unitPrice: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    createMedicine.mutate(
      {
        name: form.name.trim(),
        ...(form.genericName.trim() ? { genericName: form.genericName.trim() } : {}),
        dosageForms: form.dosageForms.split(',').map((s) => s.trim()).filter(Boolean),
        unitPrice: Math.round(parseFloat(form.unitPrice) * 100),
      },
      { onSuccess: () => setForm({ name: '', genericName: '', dosageForms: '', unitPrice: '' }) },
    );
  };

  const rows = medicines.data?.data ?? [];

  return (
    <SidebarLayout links={ADMIN_LINKS}>
      <h1>Medicines</h1>

      <div className="section-card">
        <div className="filters">
          <Field id="med-search" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {medicines.isLoading && <p>Loading…</p>}
        {medicines.error && <Alert variant="danger">{medicines.error.message}</Alert>}
        {!medicines.isLoading && rows.length === 0 && <p className="empty">No medicines.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Generic</th><th>Forms</th><th>Unit price</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.genericName ?? '—'}</td>
                  <td>{m.dosageForms.join(', ')}</td>
                  <td>{formatPkr(m.unitPrice)}</td>
                  <td>
                    {m.isActive ? (
                      <span className="badge badge--success">Active</span>
                    ) : (
                      <span className="badge badge--warning">Deactivated</span>
                    )}
                  </td>
                  <td>
                    {m.isActive ? (
                      <Button
                        variant="danger"
                        onClick={() => updateMedicine.mutate({ id: m.id, isActive: false })}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => updateMedicine.mutate({ id: m.id, isActive: true })}
                      >
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section-card">
        <h2>Add medicine</h2>
        {createMedicine.error && <Alert variant="danger">{createMedicine.error.message}</Alert>}
        <form onSubmit={submit}>
          <Field label="Name" id="med-name" value={form.name} onChange={set('name')} required />
          <Field label="Generic name (optional)" id="med-generic" value={form.genericName} onChange={set('genericName')} />
          <Field label="Dosage forms (comma-separated)" id="med-forms" value={form.dosageForms} onChange={set('dosageForms')} required />
          <Field label="Unit price (PKR)" id="med-price" type="number" min="1" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} required />
          <Button type="submit" isLoading={createMedicine.isPending}>Add medicine</Button>
        </form>
      </div>
    </SidebarLayout>
  );
}
