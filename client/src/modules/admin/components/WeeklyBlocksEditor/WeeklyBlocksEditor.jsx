// @ts-check
import { Button } from '../../../../shared/Button/Button.jsx';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Controlled editor for [{weekday,startTime,endTime}] (F10.01 weekly template). */
export function WeeklyBlocksEditor({ blocks, onChange }) {
  const update = (i, key, value) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, [key]: value } : b)));
  const remove = (i) => onChange(blocks.filter((_, j) => j !== i));
  const add = () => onChange([...blocks, { weekday: 1, startTime: '09:00', endTime: '17:00' }]);

  return (
    <div>
      {blocks.map((b, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="filters" style={{ marginBottom: 'var(--sp-2)' }}>
          <select
            className="input"
            aria-label={`Block ${i + 1} weekday`}
            value={b.weekday}
            onChange={(e) => update(i, 'weekday', Number(e.target.value))}
          >
            {WEEKDAYS.map((w, idx) => (
              <option key={w} value={idx}>{w}</option>
            ))}
          </select>
          <input
            className="input"
            type="time"
            aria-label={`Block ${i + 1} start`}
            value={b.startTime}
            onChange={(e) => update(i, 'startTime', e.target.value)}
          />
          <input
            className="input"
            type="time"
            aria-label={`Block ${i + 1} end`}
            value={b.endTime}
            onChange={(e) => update(i, 'endTime', e.target.value)}
          />
          <Button type="button" variant="ghost" onClick={() => remove(i)}>Remove</Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>Add block</Button>
    </div>
  );
}
