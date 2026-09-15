import { decodeBackup, validateSettings, type Settings } from './settings';
import { readHistory, validateHistoryEntries, type HistoryEntry } from './history';

export const DATA_BACKUP_LIMIT = 8 * 1024 * 1024;
export interface DataBackup {
  settings: Settings;
  history?: HistoryEntry[];
}

export function encodeDataBackup(settings: Settings, history: readonly HistoryEntry[]): string {
  const text = JSON.stringify(
    {
      app: 'tuiclean',
      version: 2,
      settings: validateSettings(settings),
      history: readHistory(validateHistoryEntries(history)),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > DATA_BACKUP_LIMIT)
    throw new Error('完整备份过大，请先减少拦截记录或个人规则。');
  return text;
}

export function decodeDataBackup(text: string): DataBackup {
  if (
    text.length > DATA_BACKUP_LIMIT ||
    new TextEncoder().encode(text).byteLength > DATA_BACKUP_LIMIT
  )
    throw new Error('备份过大，请选择小于 8 MB 的文件。');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('这不是有效的 JSON 文件。');
  }
  if (data?.app === 'tuiclean' && data.version === 1) return { settings: decodeBackup(text) };
  if (data?.app !== 'tuiclean' || data.version !== 2 || !data.settings)
    throw new Error('请选择 TuiClean 的设置或完整备份文件。');
  return {
    settings: validateSettings(data.settings),
    history: validateHistoryEntries(data.history),
  };
}
