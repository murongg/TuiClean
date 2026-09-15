import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebApi } from '../lib/api';

const origin = 'https://x.com';
const lookup =
  origin +
  '/i/api/graphql/synthetic-query/TweetDetail?variables=' +
  encodeURIComponent(
    JSON.stringify({
      focalTweetId: '2101',
      with_rux_injections: false,
      cursor: 'synthetic-cursor',
    }),
  ) +
  '&features=%7B%22sample%22%3Atrue%7D';
const headers = {
  authorization: 'Bearer synthetic-test-token',
  'x-csrf-token': 'synthetic-test-csrf',
  'x-twitter-auth-type': 'OAuth2Session',
  cookie: 'must-not-copy',
  'x-client-transaction-id': 'must-not-replay',
};
const target = { id: '2101', author: 'sample_api', requestId: 'synthetic-request' };
const tweet = (id = '2101', author = 'sample_api', userId = '9101', blocking = false) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: {
    user_results: {
      result: {
        __typename: 'User',
        rest_id: userId,
        core: { screen_name: author },
        relationship_perspectives: { blocking },
      },
    },
  },
});
const response = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: extra });
function setup() {
  const fetcher = vi.fn<typeof fetch>();
  const api = createWebApi({
    origin,
    getUrl: () => origin + '/home',
    fetch: fetcher,
    now: () => 1000,
  });
  return { api, fetcher };
}
afterEach(() => vi.useRealTimers());
describe('X webpage request executor with synthetic data', () => {
  it('reports numeric API error codes without exposing response text or credentials', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockResolvedValue(
      response({ errors: [{ code: 89, message: 'synthetic-sensitive-token' }] }),
    );
    const result = await api.block(target);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('89') });
    expect(JSON.stringify(result)).not.toContain('synthetic-sensitive-token');
  });
  it('captures a same-origin request and confirms the exact API target without DOM menus', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    expect(api.status()).toEqual({ ready: true });
    expect(JSON.stringify(api.status())).not.toContain('synthetic-test');
    fetcher
      .mockResolvedValueOnce(
        response({ data: { entries: [tweet('2100', 'sample_parent'), tweet()] } }),
      )
      .mockResolvedValueOnce(
        response({ id_str: '9101', screen_name: 'sample_api', blocking: true }),
      );
    expect(await api.block(target)).toMatchObject({ ok: true, result: { status: 'confirmed' } });
    const [url, options] = fetcher.mock.calls[0]!;
    const variables = JSON.parse(new URL(String(url)).searchParams.get('variables')!);
    expect(variables.focalTweetId).toBe('2101');
    expect(variables.cursor).toBeUndefined();
    expect(options?.credentials).toBe('include');
    expect(options?.headers).not.toHaveProperty('cookie');
    expect(options?.headers).not.toHaveProperty('x-client-transaction-id');
    expect(fetcher.mock.calls[1]![0]).toBe(origin + '/i/api/1.1/blocks/create.json');
    expect(fetcher.mock.calls[1]![1]?.body).toBe('user_id=9101');
    expect(await api.block(target)).toMatchObject({ ok: true, result: { status: 'confirmed' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    'https://example.test/i/api/graphql/synthetic/TweetDetail',
    'https://x.com/i/api/graphql/synthetic/DirectMessages',
    'http://x.com/i/api/graphql/synthetic/TweetDetail',
  ])('ignores an unrelated capture: %s', (url) => {
    const { api } = setup();
    api.observe(url, headers);
    expect(api.status()).toEqual({ ready: false });
  });
  it('requires both captured authentication headers before sending requests', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, { authorization: 'Bearer fake' });
    expect(await api.block(target)).toMatchObject({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates the tweet author rather than using a username from a nearby tweet', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockResolvedValue(
      response({ data: [tweet('2101', 'sample_other'), tweet('2102', 'sample_api')] }),
    );
    expect(await api.block(target)).toMatchObject({ ok: false });
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
  it('skips an already-blocked user resolved from the original tweet', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockResolvedValue(response(tweet('2101', 'sample_api', '9101', true)));
    expect(await api.block(target)).toMatchObject({
      ok: true,
      result: { status: 'already-blocked' },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('refuses an authentication context change before mutation', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockImplementationOnce(async () => {
      api.observe(lookup, { ...headers, 'x-csrf-token': 'different-synthetic-session' });
      return response(tweet());
    });
    expect(await api.block(target)).toMatchObject({ ok: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not report another user’s successful response as confirmed', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher
      .mockResolvedValueOnce(response(tweet()))
      .mockResolvedValueOnce(
        response({ id_str: '9102', screen_name: 'sample_other', blocking: true }),
      );
    expect(await api.block(target)).toMatchObject({ ok: true, result: { status: 'unconfirmed' } });
  });
  it('uses a read-back when a successful response omits a blocking state', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher
      .mockResolvedValueOnce(response(tweet()))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(tweet('2101', 'sample_api', '9101', true)));
    expect(await api.block(target)).toMatchObject({ ok: true, result: { status: 'confirmed' } });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
  it('pauses on rate limits and exposes a retry delay without sensitive headers', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockResolvedValue(response({ errors: [{ code: 88 }] }, 429, { 'retry-after': '90' }));
    const result = await api.block(target);
    expect(result).toMatchObject({ ok: false, retryAfterMs: 90000 });
    expect(JSON.stringify(result)).not.toContain('synthetic-test');
  });
  it('does not mistake HTTP 200 errors for successful blocking', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher
      .mockResolvedValueOnce(response(tweet()))
      .mockResolvedValueOnce(response({ errors: [{ code: 326 }] }));
    expect(await api.block(target)).toMatchObject({ ok: false });
  });
  it('reports an accepted POST as unconfirmed if the read-back is rate-limited', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher
      .mockResolvedValueOnce(response(tweet()))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ errors: [{ code: 88 }] }, 429, { 'retry-after': '90' }));
    expect(await api.block(target)).toMatchObject({
      ok: true,
      result: { status: 'unconfirmed' },
      retryAfterMs: 90000,
    });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
  it('cancels an in-flight lookup without submitting a block', async () => {
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort'))),
        ),
    );
    const pending = api.block(target);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    api.cancel(target.requestId);
    expect(await pending).toMatchObject({ ok: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('never retries a timed-out POST and reports the outcome as unknown', async () => {
    vi.useFakeTimers();
    const { api, fetcher } = setup();
    api.observe(lookup, headers);
    fetcher
      .mockResolvedValueOnce(response(tweet()))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('synthetic timeout')),
            ),
          ),
      );
    const pending = api.block(target);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toMatchObject({ ok: true, result: { status: 'unconfirmed' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
