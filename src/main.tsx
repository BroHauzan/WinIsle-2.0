import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { getApiBaseUrl } from './utils/apiBase';

if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  try {
    const origFetch = window.fetch.bind(window);
    const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        const base = getApiBaseUrl();
        if (base) {
          return origFetch(`${base}${input}`, init);
        }
      }
      return origFetch(input, init);
    };
    try {
      window.fetch = customFetch;
    } catch {
      Object.defineProperty(window, 'fetch', {
        value: customFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Ignore in restrictive web sandboxes
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
