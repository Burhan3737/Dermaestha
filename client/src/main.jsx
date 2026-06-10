import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/components.css';
import { AppProviders } from './context/AppProviders.jsx';
import { AppRoutes } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </React.StrictMode>,
);
