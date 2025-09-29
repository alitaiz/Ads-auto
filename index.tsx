import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PPCManagementView } from './views/PPCManagementView';
import { AdGroupView } from './views/AdGroupView';
import { KeywordView } from './views/KeywordView';
import { Layout } from './views/components/Layout';
import { SalesAndTrafficView } from './views/SalesAndTrafficView';
import { SPSearchTermsView } from './views/SPSearchTermsView';
import { DatabaseView } from './views/DatabaseView';
import { AutomationView } from './views/AutomationView';
import { AICopilotView } from './views/AICopilotView';
import { DataViewer } from './views/components/DataViewer';
import { SearchQueryPerformanceView } from './views/SearchQueryPerformanceView';
import { DataCacheProvider } from './contexts/DataCacheContext';

// Basic global styles
const styles = `
  :root {
    --primary-color: #007185;
    --primary-hover-color: #005a6a;
    --danger-color: #d9534f;
    --success-color: #28a745;
    --background-color: #f0f2f2;
    --card-background-color: #ffffff;
    --text-color: #0f1111;
    --border-color: #ddd;
    --border-radius: 8px;
    --box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
  }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: var(--background-color);
    color: var(--text-color);
  }
  * {
    box-sizing: border-box;
  }
`;

function App() {
  // Encapsulate global style injection within a useEffect to ensure it runs
  // after the component mounts, preventing potential module initialization race conditions.
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    
    // Return a cleanup function to remove the stylesheet when the component unmounts.
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []); // Empty dependency array ensures this effect runs only once.

  return (
    <HashRouter>
      <Routes>
        {/* Standalone route for the data viewer, outside the main layout */}
        <Route path="data-viewer/:dataKey" element={<DataViewer />} />

        {/* Main application routes with shared layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/campaigns" replace />} />
          <Route path="campaigns" element={<PPCManagementView />} />
          <Route path="campaigns/:campaignId/adgroups" element={<AdGroupView />} />
          <Route path="adgroups/:adGroupId/keywords" element={<KeywordView />} />
          <Route path="query-performance" element={<SearchQueryPerformanceView />} />
          <Route path="sp-search-terms" element={<SPSearchTermsView />} />
          <Route path="sales-and-traffic" element={<SalesAndTrafficView />} />
          <Route path="database" element={<DatabaseView />} />
          <Route path="automation" element={<AutomationView />} />
          <Route path="ai-copilot" element={<AICopilotView />} />
          <Route path="*" element={<Navigate to="/campaigns" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <DataCacheProvider>
        <App />
      </DataCacheProvider>
    </React.StrictMode>
  );
} else {
    console.error('Failed to find the root element');
}