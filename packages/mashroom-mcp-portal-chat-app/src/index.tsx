import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import type {MashroomPortalAppPluginBootstrapFunction} from '@mashroom/mashroom-portal/type-definitions';

const bootstrap: MashroomPortalAppPluginBootstrapFunction = (portalEl, portalAppSetup, clientServices) => {
  console.log(portalAppSetup);
  console.log(clientServices);
  console.log(portalAppSetup.proxyPaths);

  if (portalEl) {
    const root = ReactDOM.createRoot(portalEl);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }  
}

(window as any).startMCPClientApp = bootstrap;
