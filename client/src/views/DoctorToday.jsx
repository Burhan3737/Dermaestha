// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { SidebarLayout } from '../layouts/SidebarLayout.jsx';
import { formatKarachi } from '../lib/format.js';
import { DoctorCancelModal } from '../components/DoctorCancelModal.jsx';

export function DoctorToday() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['doctor-appointments'],
    queryFn: () => api.get('/appointments'),
  });
  const [cancelId, setCancelId] = useState(null);
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => {
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['doctor-appointments'] });
    },
  });
  const rows = list.data?.data ?? [];
  return (
    <SidebarLayout>
      <section className="section-card">
        <h1>Today's appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && <p className="help">No appointments.</p>}
        {rows.map((a) => {
          const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
          const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
          const active = Date.now() >= opensAt && Date.now() <= closesAt;
          return (
            <div key={a.id} className="appt-row">
              <div>{formatKarachi(a.slotStart)}</div>
              <strong>{a.patientName}</strong>
              {!a.forSelf && <div>for: {a.subjectName}</div>}
              {active ? (
                <Link className="btn btn--secondary" to={`/video/${a.id}`}>
                  Join Call
                </Link>
              ) : (
                <button type="button" className="btn btn--secondary" disabled>
                  Join Call
                </button>
              )}
              {a.state === 'confirmed' && (
                <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>
                  Cancel
                </button>
              )}
            </div>
          );
        })}
      </section>
      {cancelId && (
        <DoctorCancelModal
          onClose={() => setCancelId(null)}
          onConfirm={(reason) => cancelMut.mutate({ id: cancelId, reason })}
        />
      )}
    </SidebarLayout>
  );
}
