import React, { useState } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    datePickerContainer: {
        position: 'absolute',
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginTop: '5px',
        display: 'flex',
        padding: '10px',
        right: 0,
        userSelect: 'none',
    },
    datePickerPresets: {
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        paddingRight: '15px',
        borderRight: '1px solid var(--border-color)',
    },
    datePickerCalendars: {
         display: 'flex',
         gap: '10px',
         paddingLeft: '15px',
    },
    calendarContainer: {
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center',
    },
    calendarHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '240px',
        marginBottom: '10px',
    },
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 34px)',
        gap: '1px'
    },
    calendarDay: {
        width: '34px',
        height: '34px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        borderRadius: '4px',
        fontSize: '0.9rem',
    },
     datePickerActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        paddingTop: '10px',
        borderTop: '1px solid var(--border-color)',
        marginTop: '10px'
    },
    button: {
        padding: '8px 15px',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        backgroundColor: 'white',
        color: 'var(--text-color)',
        cursor: 'pointer',
    },
     primaryButton: {
        padding: '8px 15px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        cursor: 'pointer',
    },
};


interface DateRangePickerProps {
  onApply: (range: { start: Date; end: Date }) => void;
  onClose: () => void;
  initialRange: { start: Date; end: Date };
}

export function DateRangePicker({ onApply, onClose, initialRange }: DateRangePickerProps) {
    const [viewDate, setViewDate] = useState(new Date(initialRange.end.getFullYear(), initialRange.end.getMonth(), 1));
    const [startDate, setStartDate] = useState<Date | null>(initialRange.start);
    const [endDate, setEndDate] = useState<Date | null>(initialRange.end);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    const handleDateClick = (day: Date) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(day);
            setEndDate(null);
        } else {
            if (day < startDate) {
                setEndDate(startDate);
                setStartDate(day);
            } else {
                setEndDate(day);
            }
        }
    };
    
    const setPresetRange = (preset: string) => {
        const end = new Date();
        const start = new Date();
        end.setHours(0,0,0,0);
        start.setHours(0,0,0,0);

        switch(preset) {
            case 'today': break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                break;
             case 'last30':
                start.setDate(start.getDate() - 29);
                break;
            case 'thisMonth':
                start.setDate(1);
                break;
        }
        setStartDate(start);
        setEndDate(end);
        setViewDate(new Date(end.getFullYear(), end.getMonth(), 1));
    };

    const generateCalendar = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };
    
    const prevMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const calendar1 = generateCalendar(prevMonthDate);
    const calendar2 = generateCalendar(viewDate);

    const renderDay = (day: Date | null) => {
        if (!day) return <div />;
        const dayTime = day.getTime();
        const startTime = startDate?.getTime();
        const endTime = endDate?.getTime();
        const hoverTime = hoverDate?.getTime();

        let inRange = false;
        let isStart = false;
        let isEnd = false;

        if (startDate && endDate) {
            inRange = dayTime > startTime! && dayTime < endTime!;
            isStart = dayTime === startTime!;
            isEnd = dayTime === endTime!;
        } else if (startDate && hoverDate) {
            const start = Math.min(startTime!, hoverTime!);
            const end = Math.max(startTime!, hoverTime!);
            inRange = dayTime > start && dayTime < end;
            isStart = dayTime === start;
            isEnd = dayTime === end;
        } else if (startDate) {
            isStart = dayTime === startTime;
        }
        
        const dayStyle: React.CSSProperties = { ...styles.calendarDay };
        if (isStart || isEnd) {
            dayStyle.backgroundColor = 'var(--primary-color)';
            dayStyle.color = 'white';
        } else if (inRange) {
            dayStyle.backgroundColor = 'var(--primary-hover-color)';
            dayStyle.color = 'white';
        }


        return (
            <div style={dayStyle} onClick={() => handleDateClick(day)} onMouseEnter={() => setHoverDate(day)} onMouseLeave={() => setHoverDate(null)}>
                {day.getDate()}
            </div>
        );
    };
    
    const presets = [
        { label: 'Today', key: 'today' },
        { label: 'Yesterday', key: 'yesterday' },
        { label: 'Last 7 days', key: 'last7' },
        { label: 'Last 30 days', key: 'last30' },
        { label: 'This month', key: 'thisMonth' },
    ];

    return (
        <div style={styles.datePickerContainer}>
             <div style={styles.datePickerPresets}>
                {presets.map(p => <button key={p.key} style={{...styles.button, justifyContent: 'flex-start', width: '100%'}} onClick={() => setPresetRange(p.key)}>{p.label}</button>)}
            </div>
            <div style={{display: 'flex', flexDirection: 'column'}}>
                <div style={styles.datePickerCalendars}>
                    <div style={styles.calendarContainer}>
                         <div style={styles.calendarHeader}>
                             <button style={styles.button} onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>&lt;</button>
                            <strong>{prevMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
                            <span></span>
                        </div>
                        <div style={styles.calendarGrid}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} style={{...styles.calendarDay, fontWeight: 'bold', fontSize: '0.8rem'}}>{d}</div>)}
                            {calendar1.map((d, i) => renderDay(d) )}
                        </div>
                    </div>
                     <div style={styles.calendarContainer}>
                         <div style={styles.calendarHeader}>
                             <span></span>
                            <strong>{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
                            <button style={styles.button} onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>&gt;</button>
                        </div>
                        <div style={styles.calendarGrid}>
                           {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} style={{...styles.calendarDay, fontWeight: 'bold', fontSize: '0.8rem'}}>{d}</div>)}
                           {calendar2.map((d, i) => renderDay(d) )}
                        </div>
                    </div>
                </div>
                 <div style={styles.datePickerActions}>
                    <button style={styles.button} onClick={onClose}>Cancel</button>
                    <button style={styles.primaryButton} onClick={() => onApply({ start: startDate!, end: endDate || startDate!})} disabled={!startDate}>Apply</button>
                </div>
            </div>
        </div>
    );
};
