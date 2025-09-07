import React from 'react';

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  label: {
    fontWeight: 500,
  },
  input: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
    fontSize: '0.9rem',
  }
};

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export function DateRangePicker({ startDate, endDate, onStartDateChange, onEndDateChange }: DateRangePickerProps) {
  return (
    <div style={styles.container}>
      <label htmlFor="start-date" style={styles.label}>From:</label>
      <input
        type="date"
        id="start-date"
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        style={styles.input}
      />
      <label htmlFor="end-date" style={styles.label}>To:</label>
      <input
        type="date"
        id="end-date"
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        style={styles.input}
      />
    </div>
  );
}
