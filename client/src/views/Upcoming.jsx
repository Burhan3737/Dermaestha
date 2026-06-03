// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../lib/format.js';
import { CancelModal } from '../components/CancelModal.jsx';

export function Upcoming() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['appointments'], queryFn: () => api.get('/appointments') });
  const [cancelId, setCancelId] = useState(null);

  const detail = useQuery({
    queryKey: ['appointment', cancelId],
    queryFn: () => api.get(`/appointments/${cancelId}`),
    enabled: !!cancelId,
  });

  const cancelMut = useMutation({
    mutationFn: (id) => api.post(`/appointments/${id}/cancel`, {}),
    onSuccess: () => {
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const rows = list.data?.data ?? [];

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Upcoming appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <div className="empty-state">
            <p>No upcoming appointments.</p>
            <Link className="btn btn--primary" to="/">
              Browse doctors
            </Link>
          </div>
        )}
        {rows.map((a) => (
          <div key={a.id} className="appt-row">
            <strong>{a.doctorName}</strong> — {a.specialization}
            <div>{formatKarachi(a.slotStart)}</div>
            {!a.forSelf && <div>for: {a.subjectName}</div>}
            <div>{formatPkr(a.feeAtBooking)}</div>
            <button type="button" className="btn btn--secondary" disabled>
              Join Call
            </button>
            {a.state === 'confirmed' && (
              <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>
                Cancel
              </button>
            )}
          </div>
        ))}
      </section>
      {cancelId &&
        detail.data &&
        (() => {
          const appt = rows.find((r) => r.id === cancelId);
          const isLate =
            appt && new Date(appt.slotStart).getTime() - Date.now() < 2 * 60 * 60 * 1000;
          return (
            <CancelModal
              quote={isLate ? null : detail.data.refundQuote}
              lateNoRefund={isLate}
              onClose={() => setCancelId(null)}
              onConfirm={() => cancelMut.mutate(cancelId)}
            />
          );
        })()}
    </PatientLayout>
  );
}
