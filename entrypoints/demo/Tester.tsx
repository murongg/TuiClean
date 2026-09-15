import { useState, type FormEvent } from 'react';
import type { Decision } from '../../lib/detector';
import type { Settings } from '../../lib/settings';
import type { Draft } from './input';

interface Props {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  onAdd: (draft: Draft) => void;
  onClear: () => void;
  result: Decision | null;
  settings: Settings;
  customCount: number;
  paused: boolean;
}

export function Tester({
  draft,
  setDraft,
  onAdd,
  onClear,
  result,
  settings,
  customCount,
  paused,
}: Props) {
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      onAdd(draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法测试这段内容，请重试。');
    }
  }
  return (
    <section className="tester" aria-label="自定义内容测试">
      <header className="tester-heading">
        <div>
          <h2>自己试一条</h2>
          <p>输入文字，使用当前演示设置检测。</p>
        </div>
        <span className="tiny-tag">仅本页 · 不上传</span>
      </header>
      <form onSubmit={submit}>
        <label className="tester-label" htmlFor="test-content">
          测试内容
        </label>
        <textarea
          id="test-content"
          value={draft.text}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          placeholder="粘贴你想测试的文字，也可以包含链接、表情和隐形字符…"
          rows={4}
          maxLength={20_000}
          aria-describedby="tester-help"
        />
        <div className="tester-hint" id="tester-help">
          <span>保留原始字符，最多 20,000 字符</span>
          <span>{draft.text.length.toLocaleString()} / 20,000</span>
        </div>
        <details className="tester-identity">
          <summary>昵称、账号（可选）</summary>
          <div>
            <label>
              昵称
              <input
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="测试作者"
              />
            </label>
            <label>
              账号
              <input
                value={draft.author}
                maxLength={16}
                onChange={(event) => setDraft({ ...draft, author: event.target.value })}
                placeholder="留空，每次生成不同账号"
              />
            </label>
          </div>
          <p>测试重复模板时，连续添加多条内容。填写相同账号则视为同一作者。</p>
        </details>
        <div className="tester-actions">
          <button type="submit" className="primary">
            检测并预览
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft({ text: '', author: '', name: '' });
              setError('');
            }}
          >
            清空输入
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {result ? (
        <div
          className={`tester-result ${result.level === 'allow' ? 'clear' : 'matched'}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="result-meta">最近加入的一条 · 随设置更新</span>
          <strong>
            {!settings.enabled
              ? '过滤已关闭'
              : result.level === 'allow'
                ? '未命中规则'
                : result.level === 'suspect'
                  ? '命中疑似内容规则'
                  : '命中规则'}
          </strong>
          <p>
            {!settings.enabled
              ? '开启右侧的过滤开关后，可查看识别结果。'
              : result.reasons.length
                ? result.reasons.join('；')
                : '依照当前设置，这段内容会保持可见。'}
          </p>
          <span className="result-meta">
            {paused
              ? '评论预览已暂停过滤，可在右侧恢复本页。'
              : '已加入下方评论预览，可展开、折叠或查看详情。'}
          </span>
        </div>
      ) : null}
      {customCount ? (
        <div className="tester-samples">
          <span>已加入 {customCount} / 50 条自定义内容</span>
          <button className="text-button" onClick={onClear}>
            清空自定义内容
          </button>
        </div>
      ) : null}
    </section>
  );
}
