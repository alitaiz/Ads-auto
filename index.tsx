import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PPCManagementView } from './views/PPCManagementView';

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

const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);


function App() {
  // For now, the app has one main view. We set up routing to allow for future expansion
  // with Ad Group and Keyword views.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/campaigns" element={<PPCManagementView />} />
        {/* Default route redirects to the main campaigns view */}
        <Route path="*" element={<Navigate to="/campaigns" />} />
      </Routes>
    </BrowserRouter>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
    console.error('Failed to find the root element');
}
