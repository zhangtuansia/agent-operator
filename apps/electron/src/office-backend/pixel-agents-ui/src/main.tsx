import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { ensureRandomUUID } from './browserCompat';
// initDaziBridge is now called from App.tsx useEffect (after message listeners are registered)

async function main() {
  ensureRandomUUID();

  // Always running in browser/standalone mode for DAZI.
  // Load assets via HTTP (browserMock handles fetching + dispatching).
  const { initBrowserMock } = await import('./browserMock.js');
  await initBrowserMock();

  // NOTE: initDaziBridge() is called from App.tsx useEffect AFTER
  // useExtensionMessages registers its message listener. This ensures
  // existingAgents messages are not lost.

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
