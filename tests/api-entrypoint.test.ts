import { afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ install: vi.fn() }));
vi.mock('../lib/api-page', () => ({ installWebApi: fake.install }));
afterEach(() => {
  vi.unstubAllGlobals();
  fake.install.mockClear();
});
describe('scoped capture entrypoint', () => {
  it('does not install request interception on an ordinary X page', async () => {
    vi.stubGlobal('defineContentScript', (value: unknown) => value);
    vi.stubGlobal('location', { hash: '' });
    const entry = await import('../entrypoints/api.content');
    entry.default.main({} as never);
    expect(fake.install).not.toHaveBeenCalled();
  });
  it('starts capture on the marked API task page', async () => {
    vi.stubGlobal('defineContentScript', (value: unknown) => value);
    vi.stubGlobal('location', { hash: '#tuiclean-api-00000000-0000-4000-8000-000000000001' });
    const entry = await import('../entrypoints/api.content');
    entry.default.main({} as never);
    expect(fake.install).toHaveBeenCalledOnce();
  });
});
