import { useEffect, useState } from 'react';
import { historyUrl, HISTORY_LIMIT, type HistoryEntry, type HistorySource } from '../lib/history';
import type { Settings } from '../lib/settings';
import { RULES } from '../lib/rules';
import { Toggle } from './Toggle';
import './history.css';

const categories = { adult: '色情引流', spam: '垃圾广告', custom: '个人规则' };
const personalRules = new Map([
  ['custom-keyword', '屏蔽关键词'],
  ['custom-domain', '屏蔽域名'],
  ['custom-username', '用户名匹配'],
  ['blocked-user', '本地黑名单'],
]);
const ruleName = (id: string) =>
  RULES.find((rule) => rule.id === id)?.name ?? personalRules.get(id) ?? id;

function HistoryText({ row }: { row: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  if (row.text === undefined) return <p className="small-note">旧记录未保存原文</p>;
  if (!row.text) return <p className="small-note">该帖没有可读取的文字正文</p>;
  const long = row.text.length > 200 || row.text.split('\n').length > 4;
  return (
    <div className="history-original">
      <p className={`history-text${long && !expanded ? ' history-text-clamped' : ''}`} dir="auto">
        {row.text}
      </p>
      {long ? (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起原文' : '展开原文'}
        </button>
      ) : null}
      {row.textTruncated ? (
        <p className="small-note">正文过长，仅保存开头部分。可点击“查看原帖”阅读完整内容。</p>
      ) : null}
    </div>
  );
}
interface Props {
  source: HistorySource;
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => Promise<void>;
}

export function HistoryPanel({ source, settings, onPatch }: Props) {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [category, setCategory] = useState('all');
  const [rule, setRule] = useState('all');
  const [shown, setShown] = useState(50);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      source
        .list()
        .then((entries) => {
          if (!alive || revision !== current) return;
          setRows(entries);
          setError('');
          setLoading(false);
          setRule((selected) =>
            selected === 'all' || entries.some((row) => row.rules.includes(selected))
              ? selected
              : 'all',
          );
        })
        .catch((failure) => {
          if (alive && revision === current) {
            setError(failure instanceof Error ? failure.message : '读取失败，请重试。');
            setLoading(false);
          }
        });
    };
    setLoading(true);
    const stop = source.subscribe(refresh);
    refresh();
    return () => {
      alive = false;
      stop();
    };
  }, [source, reload]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  const filtered = rows.filter(
    (row) =>
      (category === 'all' || row.category === category) &&
      (rule === 'all' || row.rules.includes(rule)),
  );
  const rules = [...new Set(rows.flatMap((row) => row.rules))];
  const trusted = new Set(settings.whitelist.map((author) => author.toLowerCase()));
  return (
    <section className="history-panel" aria-label="拦截历史">
      <Toggle
        label="记录拦截历史"
        checked={settings.historyEnabled}
        disabled={busy}
        description={`在本机保存原文、账号及拦截原因。最多 ${HISTORY_LIMIT} 条或 4 MB，保留较新的记录。`}
        onChange={() => perform(() => onPatch({ historyEnabled: !settings.historyEnabled }))}
      />
      {!settings.historyEnabled ? (
        <p className="small-note">已暂停新增记录，已有记录会保留，可手动清空。</p>
      ) : null}
      <div className="history-tools">
        <label>
          分类
          <select
            disabled={busy}
            aria-label="按分类筛选"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setShown(50);
            }}
          >
            <option value="all">全部分类</option>
            {Object.entries(categories).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          命中规则
          <select
            disabled={busy}
            aria-label="按命中规则筛选"
            value={rule}
            onChange={(event) => {
              setRule(event.target.value);
              setShown(50);
            }}
          >
            <option value="all">全部规则</option>
            {rules.map((id) => (
              <option key={id} value={id}>
                {ruleName(id)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button danger"
          disabled={busy || !rows.length}
          onClick={() => setConfirming(true)}
        >
          清空记录
        </button>
      </div>
      {confirming ? (
        <div className="history-confirm" role="group" aria-label="确认清空记录">
          <p>清空全部拦截记录？个人规则与黑名单会保留。</p>
          <div className="button-row">
            <button
              className="secondary danger"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await source.clear();
                  setRows([]);
                  setConfirming(false);
                  setCategory('all');
                  setRule('all');
                })
              }
            >
              确认清空
            </button>
            <button className="text-button" disabled={busy} onClick={() => setConfirming(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={() => setReload((value) => value + 1)}>
            重新读取
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="history-empty" role="status">
          正在读取拦截记录…
        </p>
      ) : error && rows.length === 0 ? null : rows.length === 0 ? (
        <div className="history-empty">
          <h2>还没有拦截记录</h2>
          <p>开启记录后，浏览 X 时命中规则的内容会出现在这里。</p>
        </div>
      ) : (
        <>
          <p className="history-count">
            {filtered.length} 条符合条件 · 共 {rows.length} 条记录
          </p>
          {filtered.length === 0 ? (
            <div className="history-empty">
              <h2>没有符合筛选条件的记录</h2>
              <button
                className="text-button"
                onClick={() => {
                  setCategory('all');
                  setRule('all');
                }}
              >
                重置筛选
              </button>
            </div>
          ) : (
            <ol className="history-list">
              {filtered.slice(0, shown).map((row) => (
                <li key={row.id}>
                  <div className="history-row-title">
                    <strong>@{row.author}</strong>
                    <span>
                      {categories[row.category]} · {row.action === 'folded' ? '已折叠' : '仅标注'}
                    </span>
                  </div>
                  <HistoryText row={row} />
                  <p className="history-reason">{row.reasons.join('；')}</p>
                  <div className="history-meta">
                    <time dateTime={new Date(row.recordedAt).toISOString()}>
                      {new Date(row.recordedAt).toLocaleString('zh-CN')}
                    </time>
                    <span>{row.rules.map(ruleName).join('、')}</span>
                  </div>
                  <div className="history-actions">
                    {settings.blockedUsers.includes(row.author) ? (
                      <span className="history-local">本地已拉黑</span>
                    ) : null}
                    <a
                      href={historyUrl(row)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`查看原帖 @${row.author}`}
                    >
                      查看原帖 ↗
                    </a>
                    <button
                      className="text-button"
                      disabled={busy || trusted.has(row.author)}
                      aria-label={`信任 @${row.author}`}
                      onClick={() =>
                        perform(() =>
                          onPatch({ whitelist: [...new Set([...settings.whitelist, row.author])] }),
                        )
                      }
                    >
                      {trusted.has(row.author) ? '已信任' : '信任此作者'}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {shown < filtered.length ? (
            <button className="secondary" onClick={() => setShown((count) => count + 50)}>
              加载更多记录
            </button>
          ) : null}
        </>
      )}
      <p className="small-note">
        这里显示首次记录时的处理结果。展开内容或信任作者不会删除历史；原帖能否打开取决于 X。
      </p>
    </section>
  );
}
