import { useState, type FormEvent } from 'react';
import {
  decodeBackup,
  defaultSettings,
  encodeBackup,
  validateSettings,
  type Settings,
} from '../lib/settings';
import { RULES } from '../lib/rules';
import { Toggle } from './Toggle';

const personalKeys = ['keywords', 'domains', 'whitelist', 'blockedUsers', 'usernameRules'] as const;
interface Props {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => Promise<void>;
  demo?: boolean;
}
export function SettingsPanel({ settings, onPatch, demo = false }: Props) {
  const [section, setSection] = useState<'general' | 'personal' | 'rules' | 'data'>('general');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Settings | null>(null);
  const [resetting, setResetting] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<(typeof personalKeys)[number], string>>>({});
  function edit(key: (typeof personalKeys)[number], value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const tabs = [
    ['general', '过滤偏好'],
    ['personal', '个人规则'],
    ['rules', '内置规则'],
    ['data', '数据与隐私'],
  ] as const;
  async function save(patch: Partial<Settings>, success = '设置已保存') {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await onPatch(patch);
      setMessage(success);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试。');
      return false;
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: typeof section) {
    if (next === 'personal') setDraft({});
    setSection(next);
    setError('');
    setMessage('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const parsed = validateSettings({
        ...settings,
        // Unedited lists may have changed through a one-click action in another
        // tab. Saving a keyword must not replace that fresh blacklist.
        ...Object.fromEntries(
          Object.entries(draft).map(([key, value]) => [key, value.split('\n')]),
        ),
      });
      if (
        await save(
          Object.fromEntries(
            personalKeys
              .filter((key) => Object.hasOwn(draft, key))
              .map((key) => [key, parsed[key]]),
          ),
          '个人规则已保存，将立即应用到已打开的 X 页面。',
        )
      )
        setDraft({});
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    setMessage('');
    setError('');
    setPending(null);
    try {
      if (file.size > 131_072) throw new Error('文件超过 128 KB，请选择设置备份。');
      setPending(decodeBackup(await file.text()));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([encodeBackup(settings)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'tuiclean-settings.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已生成设置备份。');
    } catch {
      setError('导出失败，请重试。');
    }
  }
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            disabled={busy}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => navigate(key)}
          >
            {label}
          </button>
        ))}
        <div className="nav-note">
          TuiClean 0.1.0
          <br />
          MIT 开源协议
        </div>
      </nav>
      <main className="settings-content">
        <div className="settings-title">
          <h1>{tabs.find(([key]) => key === section)?.[1]}</h1>
          <p>
            {section === 'general'
              ? '按你的习惯，调整信息流的清净程度。'
              : section === 'personal'
                ? '你的偏好优先。白名单高于所有过滤规则。'
                : section === 'rules'
                  ? '每条规则都有明确的依据，也可以单独关闭。'
                  : '内容在本地检查，控制权留在你手里。'}
          </p>
        </div>
        {section === 'general' ? (
          <>
            <section className="settings-section">
              <h2>过滤开关</h2>
              <Toggle
                label="启用 TuiClean"
                description="关闭后立即恢复页面中已折叠的内容"
                checked={settings.enabled}
                disabled={busy}
                onChange={() => save({ enabled: !settings.enabled })}
              />
              <Toggle
                label="色情引流"
                description="检查文字、昵称及链接中的色情招揽线索"
                checked={settings.adult}
                disabled={busy}
                onChange={() => save({ adult: !settings.adult })}
              />
              <Toggle
                label="垃圾广告"
                description="检查刷单、博彩及保证收益类广告招揽"
                checked={settings.spam}
                disabled={busy}
                onChange={() => save({ spam: !settings.spam })}
              />
            </section>
            <section className="settings-section">
              <h2>处理方式</h2>
              <div className="choice-list">
                <label>
                  <input
                    type="radio"
                    name="mode"
                    checked={settings.mode === 'balanced'}
                    disabled={busy}
                    onChange={() => save({ mode: 'balanced' })}
                  />
                  <span>
                    <strong>默认折叠</strong>
                    <small>命中的内容默认折叠，包括疑似项。展开后保留提示条，可再次折叠。</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    checked={settings.mode === 'mark'}
                    disabled={busy}
                    onChange={() => save({ mode: 'mark' })}
                  />
                  <span>
                    <strong>仅标注</strong>
                    <small>默认保留原文并显示提示，需要时可手动折叠。</small>
                  </span>
                </label>
              </div>
            </section>
            <section className="settings-section">
              <h2>生效范围</h2>
              <label className="select-row">
                检查位置
                <select
                  aria-label="生效范围"
                  value={settings.scope}
                  disabled={busy}
                  onChange={(event) => save({ scope: event.target.value as Settings['scope'] })}
                >
                  <option value="all">信息流与帖文详情</option>
                  <option value="replies">仅帖文详情</option>
                </select>
              </label>
              <p className="small-note">仅检查已加载的帖文内容，私信页面不处理。</p>
            </section>
            <div className="notice">
              <strong>当前版本识别文字内容</strong>
              <p>图片和视频的画面尚未分析。规则识别可能漏判或误判，可随时展开内容或设置白名单。</p>
            </div>
          </>
        ) : null}
        {section === 'personal' ? (
          <form onSubmit={submit} className="personal-form">
            <label>
              屏蔽关键词<span>每行一个，按文字匹配，不支持正则表达式。过短的词容易误伤。</span>
              <textarea
                disabled={busy}
                value={draft.keywords ?? settings.keywords.join('\n')}
                onChange={(e) => edit('keywords', e.target.value)}
                placeholder="填写你不想看到的词语"
                rows={5}
              />
            </label>
            <label>
              屏蔽域名<span>每行一个域名，也匹配它的子域名。只检查当前页面可读取的链接。</span>
              <textarea
                disabled={busy}
                value={draft.domains ?? settings.domains.join('\n')}
                onChange={(e) => edit('domains', e.target.value)}
                placeholder="ads.example.test"
                rows={3}
              />
            </label>
            <label>
              本地黑名单
              <span>每行一个完整 @用户名。只在 TuiClean 中屏蔽，可删除后保存以取消拉黑。</span>
              <textarea
                aria-label="本地黑名单"
                disabled={busy}
                value={draft.blockedUsers ?? settings.blockedUsers.join('\n')}
                onChange={(e) => edit('blockedUsers', e.target.value)}
                placeholder="@sample_ad"
                rows={4}
              />
            </label>
            <label>
              用户名匹配规则
              <span>
                每行一个。匹配 @ 后的账号 ID，不匹配昵称。* 代表任意字符，如 demo_* 或
                *_ads；不区分大小写。账号改名后按新用户名判断。
              </span>
              <textarea
                aria-label="用户名匹配规则"
                disabled={busy}
                value={draft.usernameRules ?? settings.usernameRules.join('\n')}
                onChange={(e) => edit('usernameRules', e.target.value)}
                placeholder="demo_*"
                rows={4}
              />
            </label>
            <label>
              账号白名单<span>每行一个 @用户名，这些账号的内容始终保持可见。改名后需要更新。</span>
              <textarea
                disabled={busy}
                value={draft.whitelist ?? settings.whitelist.join('\n')}
                onChange={(e) => edit('whitelist', e.target.value)}
                placeholder="@sample_user"
                rows={4}
              />
            </label>
            <div className="save-row">
              <button className="primary" disabled={busy} type="submit">
                {busy ? '正在保存…' : '保存个人规则'}
              </button>
              <span>其他列表最多各 500 项；本地黑名单受浏览器存储空间限制</span>
            </div>
          </form>
        ) : null}
        {section === 'rules' ? (
          <section className="settings-section rules-list">
            {RULES.map((rule) => (
              <Toggle
                key={rule.id}
                label={rule.name}
                description={rule.description}
                checked={!settings.disabledRules.includes(rule.id)}
                disabled={busy}
                onChange={() =>
                  save({
                    disabledRules: settings.disabledRules.includes(rule.id)
                      ? settings.disabledRules.filter((id) => id !== rule.id)
                      : [...settings.disabledRules, rule.id],
                  })
                }
              />
            ))}
            <div className="notice">
              <strong>让规则保守一点</strong>
              <p>
                单独出现“看主页”或一个外链不会触发内置规则。科普、警示等上下文优先保留。个人关键词和域名规则仍按你的明确设置执行。
              </p>
            </div>
          </section>
        ) : null}
        {section === 'data' ? (
          <>
            <section className="settings-section">
              <h2>你的数据留在哪里</h2>
              <ul className="privacy-list">
                <li>帖子文字、昵称和链接只在当前浏览器中检查。</li>
                <li>设置、关键词、用户名规则及本地黑白名单保存在浏览器的本地存储中。</li>
                <li>不收集浏览历史，不上传推文，不包含统计追踪。</li>
                <li>
                  “本地拉黑”仅保存本机规则；“X 拉黑”在你点击后操作 X 原生菜单，修改 X 黑名单。
                </li>
              </ul>
              {demo ? <p className="small-note">这里是演示环境，修改只影响本次演示。</p> : null}
            </section>
            <section className="settings-section">
              <h2>备份与迁移</h2>
              <p>备份只包含偏好和个人规则，不包含帖子、浏览历史或登录信息。</p>
              <div className="button-row">
                <button className="secondary" onClick={download}>
                  导出设置
                </button>
                <label className="secondary file-button">
                  选择备份文件
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      void readBackup(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {pending ? (
                <div className="notice">
                  <strong>准备导入</strong>
                  <p>
                    {pending.keywords.length} 个关键词 · {pending.domains.length} 个域名 ·{' '}
                    {pending.whitelist.length} 个白名单账号 · {pending.blockedUsers.length}{' '}
                    个本地黑名单账号 · {pending.usernameRules.length}{' '}
                    条用户名规则。应用后将替换当前设置。
                  </p>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={async () => {
                        if (await save(pending, '备份已应用。')) setPending(null);
                      }}
                    >
                      应用备份
                    </button>
                    <button className="secondary" onClick={() => setPending(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
            <section className="settings-section">
              <h2>恢复初始状态</h2>
              <p>清空个人规则和白名单，恢复默认过滤偏好。建议先导出备份。</p>
              {resetting ? (
                <div className="button-row">
                  <button
                    className="secondary danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await save(defaultSettings, '已恢复默认设置。')) setResetting(false);
                    }}
                  >
                    确认恢复默认
                  </button>
                  <button className="text-button" onClick={() => setResetting(false)}>
                    取消
                  </button>
                </div>
              ) : (
                <button className="secondary" onClick={() => setResetting(true)}>
                  恢复默认设置
                </button>
              )}
            </section>
          </>
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
      </main>
    </div>
  );
}
