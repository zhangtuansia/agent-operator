import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { ensureRandomUUID } from './browserCompat';
import { initDaziBridge } from './bridge/DaziBridge';

async function main() {
  ensureRandomUUID();

  // Always running in browser/standalone mode for DAZI.
  // Load assets via HTTP (browserMock handles fetching + dispatching).
  const { initBrowserMock } = await import('./browserMock.js');
  await initBrowserMock();

  // Initialize WebSocket bridge for real-time agent events from DAZI.
  // This connects to the same server that's serving the static files.
  initDaziBridge();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
