import { describe, expect, it, vi } from 'vitest';
import { captureRequests } from '../lib/capture';
const url =
  'https://x.com/i/api/graphql/synthetic/TweetDetail?variables=%7B%22focalTweetId%22%3A%222101%22%7D';
function setup() {
  class XHR extends EventTarget {
    status = 200;
    responseURL = url;
    open(_method: string, _url: string) {}
    setRequestHeader(_name: string, _value: string) {}
    send() {}
  }
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  const scope = {
    fetch: fetcher,
    XMLHttpRequest: XHR,
    Request,
    Headers,
    location: { origin: 'https://x.com' },
  };
  const observe = vi.fn(),
    invalidate = vi.fn();
  const stop = captureRequests(scope as never, observe, invalidate);
  return { scope, fetcher, observe, invalidate, stop };
}
describe('scoped page request capture', () => {
  it('observes successful native fetch headers without replacing the response', async () => {
    const { scope, fetcher, observe, stop } = setup();
    const result = await scope.fetch(url, {
      headers: { Authorization: 'Bearer synthetic', 'x-csrf-token': 'synthetic' },
    });
    expect(result).toBe(await fetcher.mock.results[0]!.value);
    expect(observe).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ authorization: 'Bearer synthetic' }),
    );
    stop();
    expect(scope.fetch).toBe(fetcher);
  });
  it('ignores unrelated URLs and unsuccessful requests', async () => {
    const { scope, fetcher, observe, invalidate, stop } = setup();
    await scope.fetch('https://example.test/private');
    await scope.fetch('https://x.com/i/api/graphql/synthetic/DirectMessages');
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await scope.fetch(url);
    expect(observe).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledOnce();
    stop();
  });
  it('captures XHR request headers only when that request completes successfully', () => {
    const { scope, observe, stop } = setup();
    const xhr = new scope.XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Bearer synthetic');
    xhr.send();
    expect(observe).not.toHaveBeenCalled();
    xhr.dispatchEvent(new Event('loadend'));
    expect(observe).toHaveBeenCalledWith(url, { authorization: 'Bearer synthetic' });
    stop();
  });
  it('does not capture after disposal or disturb a later wrapper', async () => {
    const { scope, observe, stop } = setup();
    const wrapped = scope.fetch;
    const later = vi.fn((...args: Parameters<typeof fetch>) => wrapped(...args));
    scope.fetch = later;
    stop();
    await scope.fetch(url);
    expect(scope.fetch).toBe(later);
    expect(observe).not.toHaveBeenCalled();
  });
});
