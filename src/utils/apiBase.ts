export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const winAny = window as any;
  if (winAny.__WINISLE_SERVER_URL__) return winAny.__WINISLE_SERVER_URL__;
  if (typeof winAny.electronAPI?.getServerUrl === 'function') {
    try {
      const url = winAny.electronAPI.getServerUrl();
      if (url) return url;
    } catch {
      // ignore
    }
  }
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:45781';
  }
  return '';
}

export function getWsBaseUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:45781';
  const apiBase = getApiBaseUrl();
  if (apiBase) {
    return apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || '127.0.0.1:45781';
  return `${proto}//${host}`;
}
