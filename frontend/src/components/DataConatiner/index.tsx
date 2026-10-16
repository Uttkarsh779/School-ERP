import React, { useEffect, useState } from "react";
import styles from "./DataConatiner.module.css";

interface DataContainerProps<T> {
  fetchData: (params?: {
    page: number;
    search?: string;
  }) => Promise<{ data: T[]; total?: number }>;
  loading: boolean;
  isNavigate?: boolean;
  isSearch?: boolean;
  children: (data: T[]) => React.ReactNode;
}

export const DataContainer = <T,>({
  fetchData,
  loading,
  isNavigate = true,
  isSearch = true,
  children,
}: DataContainerProps<T>) => {
  const [data, setData] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const limit = isNavigate ? 10 : 100000;

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const result = await (isSearch
          ? fetchData({ page, search })
          : fetchData());

        if (isMounted) {
          setData(result.data);
          setTotal(result?.total ?? 0);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [search, page, fetchData, isSearch, isNavigate]);

  const totalPages = Math.ceil(total / limit);

  const LoadingSkeleton: React.FC = () => {
    return (
      <div className={styles.card}>
        <div className={styles.image} />
        <div className={styles.line} />
        <div className={`${styles.line} ${styles.short}`} />
        <div className={styles.line} />
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.actions}>
        {isSearch && (
          <input
            type="text"
            className={styles.search}
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        )}
      </div>
      <div>
        {loading
          ? [...Array(4)].map((_, i) => <LoadingSkeleton key={i} />)
          : children(data)}
      </div>

      {isNavigate && (
        <div className={styles.pagination}>
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default DataContainer;
