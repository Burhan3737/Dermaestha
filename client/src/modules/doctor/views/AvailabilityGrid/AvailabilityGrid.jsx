// @ts-check
import { useState, useEffect } from 'react';
import { useSession } from '../../../../context/session/session.jsx';
import { SidebarLayout } from '../../../../layouts/SidebarLayout/SidebarLayout.jsx';
import { Button } from '../../../../shared/Button/Button.jsx';
import { Alert } from '../../../../shared/Alert/Alert.jsx';
import { useDoctor } from '../../useDoctor.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i); // 08:00–22:00

const key = (weekday, hour) => `${weekday}:${hour}`;

// Expand stored blocks into a set of selected (weekday,hour) cells (hour granularity for the editor).
function blocksToCells(blocks) {
  const set = new Set();
  for (const b of blocks) {
    const start = parseInt(b.startTime.slice(0, 2), 10);
    const end = parseInt(b.endTime.slice(0, 2), 10);
    for (let h = start; h < end; h += 1) set.add(key(b.weekday, h));
  }
  return set;
}

// Collapse selected cells back into contiguous hourly blocks.
function cellsToBlocks(cells) {
  const blocks = [];
  for (let d = 0; d < 7; d += 1) {
    let runStart = null;
    for (let h = 8; h <= 23; h += 1) {
      const on = cells.has(key(d, h));
      if (on && runStart === null) runStart = h;
      // Hour 23 is never user-toggleable (the grid renders 08:00–22:00), so `on`
      // is always false at h=23 — that naturally flushes a run ending at 23:00.
      if (!on && runStart !== null) {
        blocks.push({
          weekday: d,
          startTime: `${String(runStart).padStart(2, '0')}:00`,
          endTime: `${String(h).padStart(2, '0')}:00`,
        });
        runStart = null;
      }
    }
  }
  return blocks;
}

export function AvailabilityGrid() {
  const { session } = useSession();
  const [cells, setCells] = useState(new Set());
  const { availability, saveAvailability: save } = useDoctor({
    availabilityDoctorId: session?.doctorId,
  });
  const { data, isPending } = availability;

  useEffect(() => {
    if (data?.blocks) setCells(blocksToCells(data.blocks));
  }, [data]);

  const toggle = (d, h) =>
    setCells((prev) => {
      const next = new Set(prev);
      const k = key(d, h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <SidebarLayout>
      <h1>Weekly availability</h1>
      {isPending && <p className="help">Loading…</p>}
      {save.isError && (
        <Alert variant="danger">
          {save.error?.code === 'BLOCK_HAS_BOOKINGS'
            ? 'Cancel the affected bookings before changing these hours.'
            : 'Could not save availability.'}
        </Alert>
      )}
      {save.isSuccess && <Alert variant="success">Availability saved.</Alert>}
      <div style={{ overflowX: 'auto', margin: 'var(--sp-4) 0' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Hour</th>
              {DAYS.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td>{String(h).padStart(2, '0')}:00</td>
                {DAYS.map((_, d) => (
                  <td key={d}>
                    <button
                      type="button"
                      aria-label={`${DAYS[d]} ${h}:00`}
                      onClick={() => toggle(d, h)}
                      className={cells.has(key(d, h)) ? 'slot slot--selected' : 'slot'}
                      style={{ width: 28, height: 28, minHeight: 0, padding: 0 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={() => save.mutate(cellsToBlocks(cells))} isLoading={save.isPending}>
        Save availability
      </Button>
    </SidebarLayout>
  );
}