import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWebApi } from '../lib/api-page';
let page: JSDOM | undefined;
const url =
  'https://x.com/i/api/graphql/synthetic/TweetDetail?variables=%7B%22focalTweetId%22%3A%222601%22%7D';
const init = {
  headers: { authorization: 'Bearer synthetic-page-token', 'x-csrf-token': 'synthetic-csrf' },
};
function setup() {
  page = new JSDOM('', { url: 'https://x.com/sample_page/status/2601' });
  Object.assign(page.window, {
    fetch: vi.fn().mockResolvedValue(new Response('{}')),
    Request,
    Headers,
  });
  vi.stubGlobal('window', page.window);
  vi.stubGlobal('location', page.window.location);
  installWebApi();
  return page;
}
afterEach(() => {
  page?.window.close();
  vi.unstubAllGlobals();
});
describe('MAIN-world request bridge', () => {
  it('exposes commands and readiness without exposing captured credentials', async () => {
    setup();
    await window.fetch(url, init);
    expect(window.__tuicleanWebApi?.status()).toEqual({ ready: true });
    expect(Object.keys(window.__tuicleanWebApi!).sort()).toEqual([
      'block',
      'cancel',
      'protocol',
      'status',
    ]);
    expect(Object.isFrozen(window.__tuicleanWebApi)).toBe(true);
    expect(JSON.stringify(window.__tuicleanWebApi)).not.toContain('synthetic-page-token');
  });
  it('resumes capture after the page returns from the back-forward cache', async () => {
    const dom = setup();
    await window.fetch(url, init);
    window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
    expect(window.__tuicleanWebApi?.status()).toEqual({ ready: false });
    window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
    await window.fetch(url, init);
    expect(window.__tuicleanWebApi?.status()).toEqual({ ready: true });
  });
});
