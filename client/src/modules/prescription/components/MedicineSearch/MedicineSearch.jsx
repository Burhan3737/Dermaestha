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
    <div className="field field--wide med-search">
      <label htmlFor="med-search">Add medicine</label>
      <div className="med-search__control">
        <svg
          className="med-search__icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          id="med-search"
          className="input med-search__input"
          placeholder="Search medicines by name…"
          value={search}
          role="combobox"
          aria-expanded={open}
          aria-controls="med-listbox"
          autoComplete="off"
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
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="option__name">
                  {m.name}
                  {m.genericName ? <span className="option__generic"> · {m.genericName}</span> : ''}
                </span>
                <span className="option__price">{formatPkr(m.unitPrice)}</span>
              </li>
            ))}
            <li
              role="option"
              aria-selected={active === options.length}
              className={
                active === options.length
                  ? 'option option--freetext option--active'
                  : 'option option--freetext'
              }
              onMouseEnter={() => setActive(options.length)}
              onClick={() => pick(options.length)}
            >
              <span>
                Add &quot;<strong>{search}</strong>&quot; as free text
              </span>
              <span className="tag-unpriced">Not priced</span>
            </li>
          </ul>
        )}
      </div>
      <p className="help">
        Not in the catalogue? Add it as free text — it won&apos;t be priced and is flagged for the
        patient.
      </p>
    </div>
  );
}
