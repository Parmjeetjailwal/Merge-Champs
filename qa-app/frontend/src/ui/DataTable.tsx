import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  /** Used for sorting and search (and default display when no `render`). */
  value?: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  sortable?: boolean;
  searchable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  emptyText?: string;
  actions?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize = 10,
  searchPlaceholder = 'Search…',
  emptyText = 'No records.',
  actions,
  rowClassName,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const searchable = columns.filter((c) => c.value && c.searchable !== false);
    return rows.filter((r) => searchable.some((c) => String(c.value!(r)).toLowerCase().includes(q)));
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.value) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const toggleSort = (col: Column<T>) => {
    if (!col.value || col.sortable === false) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  return (
    <div>
      <div className="table-toolbar no-print">
        <input
          className="table-search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          {sorted.length} result{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key;
              const canSort = c.value && c.sortable !== false;
              return (
                <th
                  key={c.key}
                  className={c.align === 'right' ? 'right' : ''}
                  style={canSort ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                  onClick={() => toggleSort(c)}
                >
                  {c.header}
                  {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
            {actions && <th className="right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <tr key={rowKey(r)} className={rowClassName?.(r) ?? ''}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right mono' : ''}>
                  {c.render ? c.render(r) : c.value ? c.value(r) : null}
                </td>
              ))}
              {actions && <td className="right no-print">{actions(r)}</td>}
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)} className="muted">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="pagination no-print">
          <button className="btn secondary sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            Prev
          </button>
          <span className="muted" style={{ fontSize: 13 }}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            className="btn secondary sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
