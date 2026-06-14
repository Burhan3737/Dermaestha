import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/components.css';
import { initTheme } from './lib/theme/theme.js';
import { AppProviders } from './context/AppProviders.jsx';
import { AppRoutes } from './App.jsx';

// Apply the saved/default theme before first render (the inline bootstrap in index.html
// already set it pre-paint; this keeps SPA state authoritative and idempotent).
initTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </React.StrictMode>,
);
