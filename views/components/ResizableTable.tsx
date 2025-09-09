import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    th: {
        position: 'relative',
        userSelect: 'none',
        padding: '12px 10px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        whiteSpace: 'nowrap',
    },
    resizer: {
        position: 'absolute',
        top: 0,
        right: '-2px',
        width: '5px',
        cursor: 'col-resize',
        height: '100%',
        backgroundColor: 'transparent',
        zIndex: 1,
    },
    resizerHover: {
        backgroundColor: 'var(--primary-color)',
        opacity: 0.5,
    },
};

export const useResizableColumns = (initialWidths: number[]) => {
    const [widths, setWidths] = useState(initialWidths);
    const currentlyResizing = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const handleMouseDown = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
        currentlyResizing.current = index;
        startX.current = e.clientX;
        startWidth.current = widths[index];
    }, [widths]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (currentlyResizing.current === null) return;
        const diffX = e.clientX - startX.current;
        const newWidth = Math.max(startWidth.current + diffX, 80); // Minimum width 80px
        setWidths(prev => {
            const newWidths = [...prev];
            newWidths[currentlyResizing.current!] = newWidth;
            return newWidths;
        });
    }, []);

    const handleMouseUp = useCallback(() => {
        currentlyResizing.current = null;
    }, []);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
        const handleGlobalMouseUp = () => handleMouseUp();

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);
    
    useEffect(() => {
        if (initialWidths.length !== widths.length) {
            setWidths(initialWidths);
        }
    }, [initialWidths, widths.length]);


    const getHeaderProps = useCallback((index: number) => ({
        onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => handleMouseDown(index, e),
    }), [handleMouseDown]);

    return { widths, getHeaderProps };
};

interface ResizableThProps {
    children: ReactNode;
    index: number;
    getHeaderProps: (index: number) => { onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void };
    style?: React.CSSProperties;
    onClick?: () => void;
}

export const ResizableTh = ({ children, index, getHeaderProps, style, onClick }: ResizableThProps) => {
    const [isHovering, setIsHovering] = useState(false);
    return (
        <th style={{...styles.th, ...style}} onClick={onClick}>
            {children}
            <div
                onMouseDown={getHeaderProps(index).onMouseDown}
                style={{...styles.resizer, ...(isHovering ? styles.resizerHover : {})}}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                onClick={(e) => e.stopPropagation()} 
            />
        </th>
    );
};