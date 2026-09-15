import type { Settings } from '../lib/settings';
import type { PageStats } from '../lib/controller';
import { Brand } from './Brand';
import { Toggle } from './Toggle';

export interface PopupProps {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
  stats: PageStats | null;
  onPause: () => void;
  onSettings: () => void;
  onDemo: () => void;
  error?: string;
  busy?: boolean;
}

export function Popup({
  settings,
  onPatch,
  stats,
  onPause,
  onSettings,
  onDemo,
  error,
  busy,
}: PopupProps) {
  const working = settings.enabled && stats?.supported && !stats.paused;
  return (
    <main className="popup">
      <header className="popup-header">
        <Brand />
        <span className="version">v0.1.0</span>
      </header>
      <div className="power-row">
        <span>
          <i className={`status-dot ${settings.enabled ? 'active' : ''}`} />
          {settings.enabled ? '过滤已开启' : '过滤已暂停'}
        </span>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-label="启用过滤"
          aria-checked={settings.enabled}
          disabled={busy}
          onClick={() => onPatch({ enabled: !settings.enabled })}
        >
          <span />
        </button>
      </div>
      <section className="page-status" aria-label="当前页面状态">
        <div className="section-heading">
          <h2>
            {stats?.supported
              ? stats.paused
                ? '本页已暂停'
                : working
                  ? '正在守护当前页面'
                  : '开启后继续过滤'
              : '打开 X 开始过滤'}
          </h2>
          <span className="tiny-tag">本地处理</span>
        </div>
        {stats?.supported ? (
          <>
            <div className="counts">
              <div>
                <strong>{stats.scanned}</strong>
                <span>已检查</span>
              </div>
              <div>
                <strong>{stats.folded}</strong>
                <span>已折叠</span>
              </div>
              <div>
                <strong>{stats.marked}</strong>
                <span>仅标注</span>
              </div>
            </div>
            <div className="status-bottom">
              <span>仅统计当前已加载内容</span>
              <button
                className="text-button"
                onClick={onPause}
                disabled={!settings.enabled || busy}
              >
                {stats.paused ? '恢复本页' : '暂停本页'}
              </button>
            </div>
          </>
        ) : (
          <p className="empty-description">
            在 X 的信息流或评论区使用。安装后，请刷新已打开的 X 页面。
          </p>
        )}
        {stats?.errors ? <p className="small-note">部分内容结构无法识别，已保留原文。</p> : null}
      </section>
      <section className="filter-section" aria-label="过滤类别">
        <h2>过滤什么</h2>
        <Toggle
          label="色情引流"
          description="识别文字招揽与导流话术"
          checked={settings.adult}
          disabled={busy}
          onChange={() => onPatch({ adult: !settings.adult })}
        />
        <Toggle
          label="垃圾广告"
          description="识别广告招揽与跨账号模板刷屏"
          checked={settings.spam}
          disabled={busy}
          onChange={() => onPatch({ spam: !settings.spam })}
        />
      </section>
      <section className="mode-section">
        <h2>如何处理</h2>
        <div className="segmented" role="radiogroup" aria-label="处理方式">
          <button
            role="radio"
            aria-checked={settings.mode === 'balanced'}
            disabled={busy}
            onClick={() => onPatch({ mode: 'balanced' })}
          >
            默认折叠
          </button>
          <button
            role="radio"
            aria-checked={settings.mode === 'mark'}
            disabled={busy}
            onClick={() => onPatch({ mode: 'mark' })}
          >
            仅标注
          </button>
        </div>
        <p className="small-note">
          {settings.mode === 'balanced'
            ? '命中内容默认折叠，展开后仍可再次折叠。'
            : '默认保留原文，需要时可手动折叠。'}
        </p>
      </section>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="popup-footer">
        <button className="primary" onClick={onSettings}>
          规则与设置<span aria-hidden="true">↗</span>
        </button>
        <button className="secondary" onClick={onDemo}>
          体验演示
        </button>
        <p>开源 · 无需账号 · 文字识别</p>
      </footer>
    </main>
  );
}
