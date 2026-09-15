import { defaultSettings, validateSettings, type Settings } from './settings';
import { normalizeUsername } from './accounts';

export interface StoragePort {
  get: () => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
}
const prefix = 'tuiclean:';
const blockedPrefix = prefix + 'blocked:';

export function createStore(port: StoragePort) {
  async function get(): Promise<Settings> {
    const all = await port.get();
    const values = Object.fromEntries(
      Object.keys(defaultSettings)
        .filter((key) => key !== 'blockedUsers' && all[prefix + key] !== undefined)
        .map((key) => [key, all[prefix + key]]),
    );
    values.blockedUsers = Object.entries(all)
      .filter(([key, value]) => key.startsWith(blockedPrefix) && value === true)
      .map(([key]) => key.slice(blockedPrefix.length));
    return validateSettings(values);
  }
  return {
    get,
    async setBlocked(author: string, blocked: boolean): Promise<Settings> {
      const name = normalizeUsername(author);
      // One key per account prevents clicks in separate X tabs from replacing
      // one another's list. A false value removes only that account.
      await port.set({ [blockedPrefix + name]: blocked });
      return get();
    },
    async patch(patch: Partial<Settings>): Promise<Settings> {
      const current = await get();
      const next = validateSettings({ ...current, ...patch });
      // Separate storage keys prevent popup and options writes to unrelated
      // fields from overwriting one another's preferences.
      const values = Object.fromEntries(
        Object.keys(patch)
          .filter((key) => key !== 'blockedUsers')
          .map((key) => [prefix + key, next[key as keyof Settings]]),
      );
      if (patch.blockedUsers) {
        const desired = new Set(next.blockedUsers);
        for (const name of new Set([...current.blockedUsers, ...desired]))
          values[blockedPrefix + name] = desired.has(name);
      }
      await port.set(values);
      return get();
    },
  };
}
