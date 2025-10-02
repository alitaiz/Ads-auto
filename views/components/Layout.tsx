import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const styles: { [key: string]: React.CSSProperties } = {
    layout: {
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
    },
    header: {
        backgroundColor: 'var(--card-background-color)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        height: '60px',
        zIndex: 10,
    },
    logo: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: 'var(--text-color)',
        textDecoration: 'none',
        marginRight: '30px',
    },
    nav: {
        display: 'flex',
        gap: '20px',
        height: '100%',
    },
    navLink: {
        display: 'flex',
        alignItems: 'center',
        textDecoration: 'none',
        color: '#555',
        fontWeight: 500,
        padding: '0 10px',
        borderBottom: '3px solid transparent',
        transition: 'color 0.2s, border-color 0.2s',
    },
    navLinkActive: {
        color: 'var(--primary-color)',
        borderBottom: '3px solid var(--primary-color)',
    },
    mainContent: {
        flex: 1,
        padding: '0px', // Removed padding to allow full-height views
        backgroundColor: 'var(--background-color)',
    }
};

export function Layout() {
    const getNavLinkStyle = ({ isActive }: { isActive: boolean }) => {
        return isActive ? { ...styles.navLink, ...styles.navLinkActive } : styles.navLink;
    };

    return (
        <div style={styles.layout}>
            <header style={styles.header}>
                <a href="/" style={styles.logo}>Ads Auto</a>
                <nav style={styles.nav}>
                    <NavLink to="/campaigns" style={getNavLinkStyle}>
                        PPC Management
                    </NavLink>
                     <NavLink to="/query-performance" style={getNavLinkStyle}>
                        Search Query Performance
                    </NavLink>
                    <NavLink to="/sp-search-terms" style={getNavLinkStyle}>
                        Search Terms Report
                    </NavLink>
                    <NavLink to="/sales-and-traffic" style={getNavLinkStyle}>
                        Sales & Traffic
                    </NavLink>
                    <NavLink to="/database" style={getNavLinkStyle}>
                        Database Viewer
                    </NavLink>
                    <NavLink to="/automation" style={getNavLinkStyle}>
                        Automation
                    </NavLink>
                    <NavLink to="/ai-copilot" style={getNavLinkStyle}>
                        AI Co-Pilot
                    </NavLink>
                    <NavLink to="/listings" style={getNavLinkStyle}>
                        Listing
                    </NavLink>
                    <NavLink to="/create-ads" style={getNavLinkStyle}>
                        Create Ads
                    </NavLink>
                </nav>
            </header>
            <main style={styles.mainContent}>
                <Outlet />
            </main>
        </div>
    );
}