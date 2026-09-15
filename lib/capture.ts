import { tweetRequestUrl } from './api';

type Scope = Pick<
  typeof globalThis,
  'fetch' | 'XMLHttpRequest' | 'Request' | 'Headers' | 'location'
>;
interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

export function captureRequests(
  scope: Scope,
  observe: (url: string, headers: Record<string, string>) => void,
  invalidate: () => void,
): () => void {
  const originalFetch = scope.fetch;
  const proto = scope.XMLHttpRequest.prototype;
  const originalOpen = proto.open,
    originalHeader = proto.setRequestHeader,
    originalSend = proto.send;
  const requests = new WeakMap<XMLHttpRequest, CapturedRequest>();
  let stopped = false;
  const received = (meta: CapturedRequest, status: number, responseUrl: string) => {
    if (stopped) return;
    try {
      if (status === 401 || status === 403) {
        invalidate();
        return;
      }
      if (
        status < 200 ||
        status >= 300 ||
        (responseUrl && new URL(responseUrl).origin !== scope.location.origin)
      )
        return;
      observe(meta.url, meta.headers);
    } catch {
      /* Observation must never break X's own requests. */
    }
  };
  const wrappedFetch: typeof fetch = function (input, init) {
    let meta: CapturedRequest | undefined;
    try {
      const request = input instanceof scope.Request ? input : undefined;
      const url = tweetRequestUrl(request?.url ?? String(input), scope.location.origin);
      if (!stopped && url && (init?.method ?? request?.method ?? 'GET').toUpperCase() === 'GET')
        meta = {
          url: url.href,
          headers: Object.fromEntries(
            new scope.Headers(init?.headers ?? request?.headers).entries(),
          ),
        };
    } catch {
      /* Unrecognized inputs are forwarded unchanged. */
    }
    const result = originalFetch.call(scope, input, init);
    if (meta)
      void result
        .then((response) => received(meta!, response.status, response.url))
        .catch(() => {});
    return result;
  };
  const wrappedOpen = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    _async?: boolean,
    _username?: string | null,
    _password?: string | null,
  ) {
    const result = Reflect.apply(originalOpen, this, arguments);
    const parsed = tweetRequestUrl(String(url), scope.location.origin);
    if (!stopped && parsed && method.toUpperCase() === 'GET')
      requests.set(this, { url: parsed.href, headers: {} });
    else requests.delete(this);
    return result;
  } as XMLHttpRequest['open'];
  const wrappedHeader: XMLHttpRequest['setRequestHeader'] = function (
    this: XMLHttpRequest,
    name,
    value,
  ) {
    originalHeader.call(this, name, value);
    const meta = requests.get(this);
    if (meta) {
      const key = name.toLowerCase();
      meta.headers[key] = meta.headers[key] ? meta.headers[key] + ', ' + value : String(value);
    }
  };
  const wrappedSend: XMLHttpRequest['send'] = function (this: XMLHttpRequest) {
    const meta = requests.get(this);
    if (meta && !stopped)
      this.addEventListener(
        'loadend',
        () => {
          if (requests.get(this) === meta) received(meta, this.status, this.responseURL);
        },
        { once: true },
      );
    return Reflect.apply(originalSend, this, arguments);
  };
  scope.fetch = wrappedFetch;
  proto.open = wrappedOpen;
  proto.setRequestHeader = wrappedHeader;
  proto.send = wrappedSend;
  return () => {
    stopped = true;
    // Another extension may wrap us later; do not overwrite its hooks.
    if (scope.fetch === wrappedFetch) scope.fetch = originalFetch;
    if (proto.open === wrappedOpen) proto.open = originalOpen;
    if (proto.setRequestHeader === wrappedHeader) proto.setRequestHeader = originalHeader;
    if (proto.send === wrappedSend) proto.send = originalSend;
  };
}
