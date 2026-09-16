import { useEffect, useMemo, useRef, useState } from 'react';
import { Tester } from './Tester';
import { createSample, textSegments, type Draft, type Sample } from './input';
import { inspectBatch } from '../../lib/detector';
import { Brand } from '../../components/Brand';
import { Popup } from '../../components/Popup';
import { SettingsPanel } from '../../components/SettingsPanel';
import { defaultSettings, validateSettings, type Settings } from '../../lib/settings';
import { createController, type PageStats } from '../../lib/controller';
import { createHistoryStore } from '../../lib/history';
import { DEFAULT_RULES, type RuleSet } from '../../lib/rules';
import '../../components/theme.css';
import './style.css';

const examples: Sample[] = [
  {
    id: '101',
    author: 'demo_builder',
    name: '示例开发者',
    kind: '正常分享',
    text: '这个周末做了一个小工具，把读到的资料整理成笔记。代码已开源，欢迎交流使用体验。',
    time: '12 分钟前',
  },
  {
    id: '102',
    author: 'demo_adult',
    name: '示例引流账号',
    kind: '色情引流样本',
    text: '成人资源，私信获取完整链接，主页查看。',
    time: '10 分钟前',
  },
  {
    id: '103',
    author: 'demo_spam',
    name: '示例广告账号',
    kind: '垃圾广告样本',
    text: '刷单返佣，私信领取任务，每日结算。',
    time: '8 分钟前',
  },
  {
    id: '104',
    author: 'demo_reader',
    name: '示例读者',
    kind: '普通讨论',
    text: '我更关心误判怎么办。识别原因写清楚，并且能随时展开，才会放心一直开着。',
    time: '6 分钟前',
  },
  {
    id: '105',
    author: 'demo_education',
    name: '示例科普作者',
    kind: '上下文保护样本',
    text: '科普：看到“裸聊，私信获取链接”这样的招揽，应当保持警惕。这是一条防范引流的讨论。',
    time: '4 分钟前',
  },
  {
    id: '106',
    author: 'demo_uncertain',
    name: '示例待判断账号',
    kind: '普通话题样本',
    text: '这篇合成文章提到了 NSFW 标签。',
    time: '2 分钟前',
  },
].map((post) => ({ ...post, links: [] }));

export default function Demo({
  savedSettings,
  rules = DEFAULT_RULES,
}: {
  savedSettings?: Settings;
  rules?: RuleSet;
}) {
  const [settings, setSettings] = useState<Settings>(() =>
    validateSettings(savedSettings ?? defaultSettings),
  );
  const [previousSaved, setPreviousSaved] = useState(savedSettings);
  // Replace only the trial preferences when saved rules change. Remounting the
  // demo would also discard the user's draft, samples and reveal state.
  if (previousSaved !== savedSettings) {
    setPreviousSaved(savedSettings);
    setSettings(validateSettings(savedSettings ?? defaultSettings));
  }
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const [history] = useState(() => {
    let rows: unknown = [];
    return createHistoryStore({
      read: async () => rows,
      write: async (value) => {
        rows = value;
      },
      shouldRecord: async () =>
        latestSettings.current.enabled && latestSettings.current.historyEnabled,
    });
  });
  const [stats, setStats] = useState<PageStats | null>(null);
  const [posts, setPosts] = useState<Sample[]>(examples);
  const [draft, setDraft] = useState<Draft>({ text: '', author: '', name: '' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const nextId = useRef(1000);
  const customCount = posts.filter((post) => post.custom).length;
  const decisions = useMemo(
    () => inspectBatch(posts, settings, '100', rules),
    [posts, settings, rules],
  );
  const active = posts.find((post) => post.id === activeId);
  const result = active ? (decisions.get(active) ?? null) : null;
  const [session, setSession] = useState(0);
  const [view, setView] = useState<'demo' | 'settings'>('demo');
  const [initialSection, setInitialSection] = useState<'general' | 'history'>('general');
  const engine = useRef<ReturnType<typeof createController> | null>(null);
  // Keep the controller alive across preference changes so one-time reveals survive.
  useEffect(() => {
    const controller = createController({
      document,
      getUrl: () => 'https://x.com/demo_author/status/100',
      settings,
      rules,
      onHistory: history.record,
      onBlock: async (author, blocked) => {
        const next = validateSettings({
          ...latestSettings.current,
          blockedUsers: blocked
            ? [...new Set([...latestSettings.current.blockedUsers, author.toLowerCase()])]
            : latestSettings.current.blockedUsers.filter((name) => name !== author.toLowerCase()),
        });
        latestSettings.current = next;
        setSettings(next);
        return next;
      },
      onBlockX: async () => {
        throw new Error('体验页不会修改 X 黑名单。请在 X 实际页面使用此操作。');
      },
      onWhitelist: async (author) => {
        setSettings((current) => ({
          ...current,
          whitelist: [...new Set([...current.whitelist, author])],
        }));
      },
      onStats: setStats,
    });
    engine.current = controller;
    controller.start();
    return () => {
      controller.stop();
      engine.current = null;
    };
  }, [session]);
  useEffect(() => {
    engine.current?.updateSettings(settings);
  }, [settings, session]);
  useEffect(() => {
    engine.current?.updateRules(rules);
  }, [rules, session]);
  function openSettings(section: 'general' | 'history') {
    setInitialSection(section);
    setView('settings');
    window.scrollTo(0, 0);
  }
  function resetDemo() {
    void history.clear();
    setPosts(examples);
    setActiveId(null);
    setDraft({ text: '', author: '', name: '' });
    nextId.current = 1000;
    setSettings(validateSettings(savedSettings ?? defaultSettings));
    setSession((value) => value + 1);
  }
  function addSample(draft: Draft) {
    if (customCount >= 50) throw new Error('已达到 50 条上限，请先清空自定义内容。');
    const sample = createSample(draft, nextId.current);
    nextId.current++;
    setPosts((current) => [sample, ...current]);
    setActiveId(sample.id);
  }
  function clearCustom() {
    setPosts((current) => current.filter((post) => !post.custom));
    setActiveId(null);
    setDraft({ text: '', author: '', name: '' });
    setSession((value) => value + 1);
  }
  async function patch(value: Partial<Settings>) {
    setSettings((current) => validateSettings({ ...current, ...value }));
  }
  return (
    <div className="demo-shell">
      <header className="site-header">
        <Brand large />
        <div className="button-row">
          <span className="demo-label">交互演示</span>
          <button
            className="secondary"
            onClick={() => {
              if (view === 'demo') openSettings('general');
              else {
                setView('demo');
                window.scrollTo(0, 0);
              }
            }}
          >
            {view === 'demo' ? '查看完整设置' : '返回演示'}
          </button>
        </div>
      </header>
      {view === 'settings' ? (
        <SettingsPanel
          settings={settings}
          onPatch={patch}
          history={history}
          rulePack={rules.pack}
          initialSection={initialSection}
          demo
        />
      ) : (
        <>
          <section className="demo-intro">
            <div>
              <h1>
                少一点打扰，
                <br />
                <span>多一点值得读的。</span>
              </h1>
              <p>输入你想测试的内容，再查看识别依据和实际折叠效果。</p>
            </div>
            <div className="demo-explainer">
              <span className="tiny-tag">内置样本为虚构内容</span>
              <p>
                演示与插件使用同一套识别和页面处理逻辑。
                <br />
                输入内容只在本页使用，刷新后清空。
              </p>
              <p>
                {savedSettings
                  ? '已读取扩展设置；扩展保存后会同步到这里。本页调整只用于试验，重置演示可恢复已保存的设置。'
                  : '当前为独立网页演示，使用本页设置。测试扩展已保存的规则，请从插件打开体验演示。'}
              </p>
            </div>
          </section>
          <div className="demo-grid">
            <div className="demo-workspace">
              <Tester
                key={session}
                draft={draft}
                setDraft={setDraft}
                onAdd={addSample}
                onClear={clearCustom}
                result={result}
                settings={settings}
                customCount={customCount}
                paused={stats?.paused ?? false}
              />
              <section className="sample-feed" aria-label="评论预览">
                <header className="feed-header">
                  <div>
                    <h2>一段更清净的讨论</h2>
                    <p>文字规则演示 · {posts.length} 条样本</p>
                  </div>
                  <button className="text-button" onClick={resetDemo}>
                    重置演示
                  </button>
                </header>
                {posts.map((post) => (
                  <article
                    key={`${session}-${post.id}`}
                    data-testid="tweet"
                    data-custom={post.custom ? 'true' : undefined}
                  >
                    <div className="sample-post">
                      <div className="sample-avatar" aria-hidden="true">
                        {post.custom ? '测' : post.name.slice(2, 3)}
                      </div>
                      <div className="sample-body">
                        <div data-testid="User-Name" className="sample-author">
                          <span>{post.name}</span>
                          <small>@{post.author}</small>
                          <a
                            href={`https://x.com/${post.author}/status/${post.id}`}
                            onClick={(event) => event.preventDefault()}
                          >
                            <time>{post.time}</time>
                          </a>
                        </div>
                        <div data-testid="tweetText" className="sample-text">
                          {textSegments(post.text).map((segment, index) =>
                            segment.url ? (
                              <a
                                key={index}
                                href={segment.url}
                                title={segment.url}
                                onClick={(event) => event.preventDefault()}
                              >
                                {segment.text}
                              </a>
                            ) : (
                              segment.text
                            ),
                          )}
                        </div>
                        <div className="sample-footer">
                          <span>{post.kind}</span>
                          <span>{post.custom ? '你的输入 · 仅本页' : '虚构测试内容'}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                <footer className="feed-footer">
                  <button
                    className="secondary"
                    onClick={() =>
                      setPosts((current) => [
                        ...current,
                        {
                          id: String(200 + current.length),
                          links: [],
                          author: 'demo_new_ad',
                          name: '示例新增广告',
                          kind: '动态加载样本',
                          text: '稳赚不赔，私信加入，点击链接领取任务。',
                          time: '刚刚',
                        },
                      ])
                    }
                  >
                    追加一条测试广告
                  </button>
                  <p>模拟滚动后新内容进入页面</p>
                </footer>
              </section>
            </div>
            <aside className="demo-sidebar">
              <div className="preview-label">
                <span>插件弹窗预览</span>
                <span>实时联动</span>
              </div>
              <div className="popup-frame">
                <Popup
                  settings={settings}
                  onPatch={patch}
                  stats={stats}
                  onPause={() => engine.current?.togglePause()}
                  onSettings={() => openSettings('general')}
                  onHistory={() => openSettings('history')}
                  onDemo={resetDemo}
                />
              </div>
              <p className="sidebar-note">
                当前版本检测文字、昵称与链接。
                <br />
                图片及视频画面不在本次识别范围内。
              </p>
            </aside>
          </div>
          <footer className="demo-footer">
            <span>TuiClean · 推净</span>
            <span>本地识别，可解释，可恢复。</span>
            <span>MIT 开源 · v0.1.1</span>
          </footer>
        </>
      )}
    </div>
  );
}
