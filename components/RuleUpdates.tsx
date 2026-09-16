import { useEffect, useRef, useState } from 'react';
import type { RuleSource, RuleState } from '../lib/rule-updates';
import './rules.css';

interface Props {
  source: RuleSource;
  state: RuleState;
  loading: boolean;
  readError: string;
  disabled: boolean;
}
export function RuleUpdates({ source, state, loading, readError, disabled }: Props) {
  const [busy, setBusy] = useState<'update' | 'restore' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run(action: 'update' | 'restore') {
    if (active.current || loading || disabled) return;
    active.current = true;
    setBusy(action);
    setMessage('');
    setError('');
    try {
      const next = await source[action]();
      if (mounted.current)
        setMessage(
          action === 'restore'
            ? '已恢复内置规则。'
            : next.pack.version > state.pack.version
              ? '规则已更新，已打开的页面会自动重新检查。'
              : '当前已是最新规则。',
        );
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : '规则更新失败，已保留当前规则。');
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <section className="rule-updates" aria-label="规则更新" aria-busy={!!busy || loading}>
      <div className="rule-update-heading">
        <div>
          <h2>当前规则 v{state.pack.version}</h2>
          <p className="small-note">
            {state.source === 'bundled' ? '随扩展提供' : '已下载规则'} · {state.pack.updatedAt}
          </p>
        </div>
        <button
          className="primary"
          disabled={disabled || loading || !!busy}
          onClick={() => void run('update')}
        >
          {busy === 'update' ? '正在更新…' : '更新规则'}
        </button>
      </div>
      <div className="rule-update-actions">
        <span className="small-note">
          {loading
            ? '正在读取规则…'
            : state.checkedAt
              ? `最近检查：${new Date(state.checkedAt).toLocaleString('zh-CN')}`
              : '尚未检查更新'}
        </span>
        <button
          className="text-button"
          disabled={disabled || loading || !!busy || state.source === 'bundled'}
          onClick={() => void run('restore')}
        >
          {busy === 'restore' ? '正在恢复…' : '恢复内置规则'}
        </button>
      </div>
      <p className="small-note">
        点击更新时联网获取规则，下载后在本地使用。个人关键词和黑白名单保持不变。
      </p>
      {message ? (
        <p className="feedback" role="status">
          {message}
        </p>
      ) : null}
      {error || readError ? (
        <p className="error" role="alert">
          {error || readError}
        </p>
      ) : null}
    </section>
  );
}
