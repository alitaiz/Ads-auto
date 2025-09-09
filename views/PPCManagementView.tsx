import React, { useState } from 'react';
import { CampaignsView } from './CampaignsView';
import { SPSearchTermsView } from './SPSearchTermsView';

const tabs = ['Portfolios', 'Campaigns', 'Ad groups', 'Keywords', 'Search terms'] as const;
type Tab = typeof tabs[number];

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1600px',
    margin: '0 auto',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '20px',
  },
  date: {
    fontSize: '1.2rem',
    fontWeight: 500,
  },
  tabBar: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  tab: {
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    fontSize: '1rem',
  },
  activeTab: {
    borderBottom: '3px solid var(--primary-color)',
    color: 'var(--primary-color)',
    fontWeight: 600,
  },
  placeholder: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
  },
};

export function PPCManagementView() {
  const [activeTab, setActiveTab] = useState<Tab>('Campaigns');
  const today = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const renderContent = () => {
    switch (activeTab) {
      case 'Portfolios':
        return <div style={styles.placeholder}>Portfolios content coming soon.</div>;
      case 'Campaigns':
        return <CampaignsView />;
      case 'Ad groups':
        return <div style={styles.placeholder}>Ad groups content coming soon.</div>;
      case 'Keywords':
        return <div style={styles.placeholder}>Keywords content coming soon.</div>;
      case 'Search terms':
        return <SPSearchTermsView />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.date}>{today}</div>
        <div style={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={tab === activeTab ? { ...styles.tab, ...styles.activeTab } : styles.tab}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
