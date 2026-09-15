import { createWebApi, type ApiRequest, type ApiReply } from './api';
import { captureRequests } from './capture';

export interface WebApiBridge {
  readonly protocol: 1;
  status: () => { ready: boolean };
  block: (target: ApiRequest) => Promise<ApiReply>;
  cancel: (requestId: string) => void;
}
declare global {
  interface Window {
    __tuicleanWebApi?: WebApiBridge;
  }
}

export function installWebApi() {
  if (window.__tuicleanWebApi) return;
  const api = createWebApi({
    origin: location.origin,
    getUrl: () => location.href,
    fetch: window.fetch.bind(window),
  });
  let stopCapture = captureRequests(window, api.observe, api.stop);
  let suspended = false;
  // Only methods and result metadata are exposed. Tokens remain in the closure
  // and never cross into extension messages, logs, persistent storage or backups.
  Object.defineProperty(window, '__tuicleanWebApi', {
    value: Object.freeze({ protocol: 1, status: api.status, block: api.block, cancel: api.cancel }),
    writable: false,
    configurable: false,
  });
  window.addEventListener('pagehide', () => {
    suspended = true;
    stopCapture();
    api.stop();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && suspended) {
      suspended = false;
      stopCapture = captureRequests(window, api.observe, api.stop);
    }
  });
}
