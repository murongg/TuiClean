import { useState } from 'react';
import { encodeBackup, type Settings } from '../lib/settings';
import {
  DATA_BACKUP_LIMIT,
  decodeDataBackup,
  encodeDataBackup,
  type DataBackup,
} from '../lib/backup';
import type { HistorySource } from '../lib/history';

interface Props {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => Promise<void>;
  history?: HistorySource;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

export function BackupPanel({ settings, onPatch, history, busy, onBusyChange }: Props) {
  const [pending, setPending] = useState<DataBackup | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function read(file?: File) {
    if (!file) return;
    onBusyChange(true);
    setPending(null);
    setError('');
    setMessage('');
    try {
      if (file.size > DATA_BACKUP_LIMIT) throw new Error('备份过大，请选择小于 8 MB 的文件。');
      setPending(decodeDataBackup(await file.text()));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '读取备份失败，请重新选择文件。');
    } finally {
      onBusyChange(false);
    }
  }
  async function download(full: boolean) {
    onBusyChange(true);
    setError('');
    setMessage('');
    try {
      const text =
        full && history ? encodeDataBackup(settings, await history.list()) : encodeBackup(settings);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = full ? 'tuiclean-data.json' : 'tuiclean-settings.json';
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(full ? '完整备份已生成，包含配置、名单和拦截原文。' : '已生成设置备份。');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '导出失败，请重试。');
    } finally {
      onBusyChange(false);
    }
  }
  async function apply() {
    if (!pending) return;
    onBusyChange(true);
    setError('');
    setMessage('');
    let settingsRestored = false;
    try {
      if (pending.history && !history?.merge)
        throw new Error('当前页面不支持恢复拦截记录，请在扩展设置中导入。');
      await onPatch(pending.settings);
      settingsRestored = true;
      if (pending.history) await history!.merge!(pending.history);
      setMessage(pending.history ? '配置已恢复，拦截记录已合并。' : '备份已应用。');
      setPending(null);
    } catch (failure) {
      // Preferences and the serialized history writer are separate stores.
      // Never label a partial restore as success; keep the backup for retry.
      const reason = failure instanceof Error ? failure.message : '请重试。';
      setError(
        settingsRestored ? `配置已恢复，但拦截记录恢复失败：${reason} 可再次应用备份。` : reason,
      );
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>备份与迁移</h2>
      <p>
        卸载会清除本地数据。重装或换设备前，请先导出完整备份；普通更新只需覆盖原目录并重新加载。
      </p>
      <div className="button-row">
        {history ? (
          <button className="primary" disabled={busy} onClick={() => download(true)}>
            导出完整备份
          </button>
        ) : null}
        <button className="secondary" disabled={busy} onClick={() => download(false)}>
          导出设置
        </button>
        <label className="secondary file-button">
          选择备份文件
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              void read(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="small-note">
        完整备份包含配置、个人名单与拦截原文；仅导出设置不含历史。旧版设置备份仍可导入。
      </p>
      {pending ? (
        <div className="notice">
          <strong>准备导入</strong>
          <p>
            {pending.settings.keywords.length} 个关键词 · {pending.settings.domains.length} 个域名 ·{' '}
            {pending.settings.whitelist.length} 个白名单账号 ·{' '}
            {pending.settings.blockedUsers.length} 个本地黑名单账号 ·{' '}
            {pending.settings.usernameRules.length} 条用户名规则。
          </p>
          <p>
            应用后替换当前配置。
            {pending.history
              ? `备份中的 ${pending.history.length} 条拦截记录将合并到当前历史，同一帖文保留现有记录；超出 1000 条或 4 MB 时保留较新的记录。`
              : '现有拦截记录会保留。'}
          </p>
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={apply}>
              {busy ? '正在恢复…' : '应用备份'}
            </button>
            <button className="secondary" disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className="feedback" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
