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
  const EMPTY = { name: '', genericName: '', dosageForms: '', unitPrice: '' };
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // medicine row being edited, or null (add mode)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      genericName: m.genericName ?? '',
      dosageForms: m.dosageForms.join(', '),
      unitPrice: String(m.unitPrice / 100),
    });
  };
  const cancelEdit = () => {
    setEditing(null);
    setForm(EMPTY);
  };

  const submit = (e) => {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      ...(form.genericName.trim() ? { genericName: form.genericName.trim() } : {}),
      dosageForms: form.dosageForms.split(',').map((s) => s.trim()).filter(Boolean),
      unitPrice: Math.round(parseFloat(form.unitPrice) * 100),
    };
    if (editing) {
      // F11.03: edits (incl. price/name) propagate to the builder; existing prescriptions keep their snapshot.
      updateMedicine.mutate(
        { id: editing.id, ...body },
        { onSuccess: () => { setForm(EMPTY); setEditing(null); } },
      );
    } else {
      createMedicine.mutate(body, { onSuccess: () => setForm(EMPTY) });
    }
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
                    <Button variant="ghost" onClick={() => startEdit(m)}>Edit</Button>{' '}
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
        <h2>{editing ? `Edit ${editing.name}` : 'Add medicine'}</h2>
        {(createMedicine.error || updateMedicine.error) && (
          <Alert variant="danger">{(createMedicine.error || updateMedicine.error).message}</Alert>
        )}
        <form onSubmit={submit}>
          <Field label="Name" id="med-name" value={form.name} onChange={set('name')} required />
          <Field label="Generic name (optional)" id="med-generic" value={form.genericName} onChange={set('genericName')} />
          <Field label="Dosage forms (comma-separated)" id="med-forms" value={form.dosageForms} onChange={set('dosageForms')} required />
          <Field label="Unit price (PKR)" id="med-price" type="number" min="1" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} required />
          <div className="modal__actions" style={{ marginTop: 'var(--sp-4)' }}>
            {editing && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>Cancel</Button>
            )}
            <Button type="submit" isLoading={createMedicine.isPending || updateMedicine.isPending}>
              {editing ? 'Save changes' : 'Add medicine'}
            </Button>
          </div>
        </form>
      </div>
    </SidebarLayout>
  );
}
