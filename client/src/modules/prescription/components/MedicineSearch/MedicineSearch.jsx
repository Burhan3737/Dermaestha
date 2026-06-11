// @ts-check
import { useState } from 'react';
import { formatPkr } from '../../../../lib/format/format.js';

/** Keyboard-navigable medicine listbox (doc 06: custom listbox for D-05 medicine search). */
export function MedicineSearch({ medicines, search, onSearch, onPick, onFreeText }) {
  const options = medicines.data?.data ?? [];
  const open = search.length >= 2;
  const [active, setActive] = useState(0);
  const count = options.length + 1; // +1 = free-text fallback row

  const pick = (i) => {
    if (i < options.length) onPick(options[i]);
    else onFreeText(search);
    onSearch('');
  };

  return (
    <div className="field">
      <label htmlFor="med-search">Add medicine</label>
      <input
        id="med-search"
        placeholder="Search medicine…"
        value={search}
        role="combobox"
        aria-expanded={open}
        aria-controls="med-listbox"
        onChange={(e) => {
          onSearch(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') setActive((a) => (a + 1) % count);
          else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + count) % count);
          else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active);
          }
        }}
      />
      {open && (
        <ul id="med-listbox" role="listbox" className="listbox">
          {options.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'option option--active' : 'option'}
              onClick={() => pick(i)}
            >
              {m.name}
              {m.genericName ? ` (${m.genericName})` : ''} — {formatPkr(m.unitPrice)}
            </li>
          ))}
          <li
            role="option"
            aria-selected={active === options.length}
            className={active === options.length ? 'option option--active' : 'option'}
            onClick={() => pick(options.length)}
          >
            Add "{search}" as free text (not priced)
          </li>
        </ul>
      )}
    </div>
  );
}
