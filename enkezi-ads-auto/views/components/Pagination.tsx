import React from 'react';

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: '16px 0',
  },
  button: {
    padding: '8px 12px',
    margin: '0 4px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--card-background-color)',
    color: 'var(--primary-color)',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  buttonDisabled: {
    backgroundColor: '#e9ecef',
    color: '#6c757d',
    cursor: 'not-allowed',
  },
  pageInfo: {
    margin: '0 16px',
    fontSize: '0.9rem',
  },
};

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div style={styles.container}>
      <button
        style={{ ...styles.button, ...(currentPage === 1 ? styles.buttonDisabled : {}) }}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      <span style={styles.pageInfo}>
        Page {currentPage} of {totalPages}
      </span>
      <button
        style={{ ...styles.button, ...(currentPage === totalPages ? styles.buttonDisabled : {}) }}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
}
