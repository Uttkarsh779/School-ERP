import { useState, useSyncExternalStore, type ReactNode } from "react";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

// In card mode (phones by default) each row becomes a card; unlabeled / "Actions" columns render as its button footer.
const isActionColumn = (col: { key: string; label: string }) =>
  !col.label || /^actions?$/i.test(col.key) || /^actions?$/i.test(col.label);

// True while the viewport is at most `px` wide (tracks resizes / rotation).
const useMaxWidth = (px: number) => {
  const query = `(max-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
};

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  defaultPageSize?: number;
  showPagination?: boolean;
  /** Column shown as the card heading on phones (full width, no label). Defaults to the first column. */
  mobilePrimary?: string;
  /** Viewport width (px) at or below which rows render as cards. Wide tables pass 900 so tablets get cards too. */
  stackBelow?: number;
}

const Table = <T,>({
  columns,
  data,
  keyField,
  emptyMessage = "No records yet",
  defaultPageSize = 10,
  showPagination = true,
  mobilePrimary,
  stackBelow = 640,
}: TableProps<T>) => {
  const asCards = useMaxWidth(stackBelow);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalCount = data.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  const paginatedData = showPagination ? data.slice(startIndex, endIndex) : data;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validPage > 3) pages.push("...");
      const start = Math.max(2, validPage - 1);
      const end = Math.min(totalPages - 1, validPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (validPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className={`${styles.wrapper} ${asCards ? styles.cards : ""}`}>
      <table className={`${styles.table} ${data.length === 0 ? styles.tableEmpty : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            paginatedData.map((row) => (
              <tr key={String(row[keyField])}>
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    data-label={col.label}
                    className={
                      mobilePrimary
                        ? col.key === mobilePrimary
                          ? `${styles.cellPrimary} ${styles.cellLead}`
                          : isActionColumn(col)
                            ? styles.cellActions
                            : undefined
                        : i === 0
                          ? styles.cellPrimary
                          : isActionColumn(col)
                            ? styles.cellActions
                            : undefined
                    }
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showPagination && totalCount > 0 && (
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            <span className={styles.rangeShort}>
              <strong>{startIndex + 1}–{endIndex}</strong> of <strong>{totalCount}</strong>
            </span>
            <span className={styles.rangeFull}>
              Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of <strong>{totalCount}</strong> entries
            </span>
            <div className={styles.pageSize}>
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "0.2rem 0.4rem",
                  borderRadius: "var(--erp-radius-sm)",
                  border: "1px solid var(--erp-border)",
                  background: "var(--erp-surface)",
                  color: "var(--erp-text)",
                  fontSize: "0.8rem",
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>per page</span>
            </div>
          </div>

          <div className={styles.paginationControls}>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={validPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>

            {getPageNumbers().map((p, idx) =>
              typeof p === "number" ? (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.pageBtn} ${styles.pageNum} ${p === validPage ? styles.activePageBtn : ""}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ) : (
                <span key={idx} className={styles.ellipsis}>
                  ...
                </span>
              )
            )}

            <button
              type="button"
              className={styles.pageBtn}
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
