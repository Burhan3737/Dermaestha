// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { SidebarLayout } from '../layouts/SidebarLayout.jsx';
import { formatKarachi } from '../lib/format.js';
import { DoctorCancelModal } from '../components/DoctorCancelModal.jsx';

const karachiDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso));

export function DoctorToday() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('today');
  const list = useQuery({
    queryKey: ['doctor-appointments', tab],
    queryFn: () => api.get(tab === 'history' ? '/appointments?scope=history' : '/appointments'),
  });
  const [cancelId, setCancelId] = useState(null);
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => {
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['doctor-appointments'] });
    },
  });

  const all = list.data?.data ?? [];
  const today = karachiDay(new Date().toISOString());
  const rows = tab === 'history' ? all : all.filter((a) => karachiDay(a.slotStart) === today);

  return (
    <SidebarLayout>
      <section className="section-card">
        <div className="tabs" role="tablist">
          <button
            type="button"
            className={`tab${tab === 'today' ? ' tab--active' : ''}`}
            onClick={() => setTab('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`tab${tab === 'history' ? ' tab--active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </div>
        <h1>{tab === 'history' ? 'Appointment history' : 'Today’s appointments'}</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <p className="help">{tab === 'history' ? 'No past appointments.' : 'No appointments today.'}</p>
        )}
        {rows.map((a) => {
          const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
          const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
          const active = Date.now() >= opensAt && Date.now() <= closesAt;
          return (
            <div key={a.id} className="appt-row">
              <div>{formatKarachi(a.slotStart)}</div>
              <strong>{a.patientName}</strong>
              {!a.forSelf && <div>for: {a.subjectName}</div>}
              {tab === 'today' &&
                (active ? (
                  <Link className="btn btn--secondary" to={`/video/${a.id}`}>
                    Join Call
                  </Link>
                ) : (
                  <button type="button" className="btn btn--secondary" disabled>
                    Join Call
                  </button>
                ))}
              {tab === 'history' && <span className="badge">{a.state}</span>}
              {a.state === 'confirmed' && tab === 'today' && (
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
