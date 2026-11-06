import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;

// Load TON-dependent modules only after the browser Buffer is available.
import('./App.jsx').then((module) => {
  const App = module.default;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>
  );
}).catch((error) => {
  console.error('Application startup failed:', error);
  document.getElementById('root').textContent = 'Failed to load the app. Please close and reopen it.';
});
