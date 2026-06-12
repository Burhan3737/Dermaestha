// @ts-check
import { Button } from '../Button/Button.jsx';

/** Server-page navigator over the house `{ number, size, total }` page envelope. */
export function Pagination({ page, onPage }) {
  const pages = Math.max(1, Math.ceil(page.total / page.size));
  return (
    <div className="filters" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      <Button variant="ghost" disabled={page.number <= 1} onClick={() => onPage(page.number - 1)}>
        Previous
      </Button>
      <span>
        Page {page.number} of {pages}
      </span>
      <Button variant="ghost" disabled={page.number >= pages} onClick={() => onPage(page.number + 1)}>
        Next
      </Button>
    </div>
  );
}
