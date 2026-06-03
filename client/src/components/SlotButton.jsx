// @ts-check
import { formatKarachi } from '../lib/format.js';

export function SlotButton({ slot, selected, onSelect }) {
  const cls = `slot${selected ? ' slot--selected' : ''}`;
  return (
    <button type="button" className={cls} onClick={() => onSelect(slot)}>
      {formatKarachi(slot.slotStart)}
    </button>
  );
}
