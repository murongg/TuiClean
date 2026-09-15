import { normalizeUsername, normalizeUsernameRule } from './accounts';

export interface Settings {
  enabled: boolean;
  adult: boolean;
  spam: boolean;
  historyEnabled: boolean;
  mode: 'balanced' | 'mark';
  scope: 'all' | 'replies';
  keywords: string[];
  domains: string[];
  whitelist: string[];
  blockedUsers: string[];
  usernameRules: string[];
  disabledRules: string[];
}

export const defaultSettings: Settings = {
  enabled: true,
  adult: true,
  spam: true,
  historyEnabled: true,
  mode: 'balanced',
  scope: 'all',
  keywords: [],
  domains: [],
  whitelist: [],
  blockedUsers: [],
  usernameRules: [],
  disabledRules: [],
};

export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('设置格式不正确。');
  const data = value as Record<string, unknown>;
  const result = { ...defaultSettings };
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(defaultSettings, key)) throw new Error(`无法识别的设置：${key}`);
  }
  for (const key of ['enabled', 'adult', 'spam', 'historyEnabled'] as const) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean')
      throw new Error('开关必须是布尔值。');
    result[key] = (data[key] ?? defaultSettings[key]) as boolean;
  }
  if (
    data.mode !== undefined &&
    (typeof data.mode !== 'string' || !['balanced', 'mark'].includes(data.mode))
  )
    throw new Error('无法识别的处理方式。');
  if (
    data.scope !== undefined &&
    (typeof data.scope !== 'string' || !['all', 'replies'].includes(data.scope))
  )
    throw new Error('无法识别的生效范围。');
  result.mode = (data.mode ?? defaultSettings.mode) as Settings['mode'];
  result.scope = (data.scope ?? defaultSettings.scope) as Settings['scope'];
  for (const key of [
    'keywords',
    'domains',
    'whitelist',
    'blockedUsers',
    'usernameRules',
    'disabledRules',
  ] as const) {
    const list = data[key] ?? [];
    if (
      !Array.isArray(list) ||
      list.some((item) => typeof item !== 'string' || item.length > 200)
    ) {
      throw new Error('列表必须由文字组成，每项最多 200 个字符。');
    }
    // Local blocks are independent per-account records. A read-time count cap
    // would strand settings when separate tabs add accounts concurrently.
    // Browser storage quota bounds those records; other rule lists stay capped.
    if (key !== 'blockedUsers' && list.length > 500) throw new Error('每份规则列表最多 500 项。');
    let items = list.map((item) => (item as string).trim()).filter(Boolean);
    if (key === 'whitelist' || key === 'blockedUsers') items = items.map(normalizeUsername);
    if (key === 'usernameRules') items = items.map(normalizeUsernameRule);
    if (key === 'domains') {
      items = items.map((item) => item.toLowerCase().replace(/\.$/, ''));
      if (
        items.some((item) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(item))
      ) {
        throw new Error('域名只填写主机名，例如 ads.example.test，去掉协议和路径。');
      }
    }
    result[key] = [...new Set(items)];
  }
  return result;
}

export function encodeBackup(settings: Settings): string {
  return JSON.stringify(
    { app: 'tuiclean', version: 1, settings: validateSettings(settings) },
    null,
    2,
  );
}

export function decodeBackup(text: string): Settings {
  if (text.length > 131_072) throw new Error('备份过大，请选择小于 128 KB 的设置文件。');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('这不是有效的 JSON 文件。');
  }
  if (!data || data.app !== 'tuiclean' || data.version !== 1 || !data.settings)
    throw new Error('请选择 TuiClean v1 格式的设置备份。');
  return validateSettings(data.settings);
}
