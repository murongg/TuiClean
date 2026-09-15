import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Popup } from '../../components/Popup';
import { useSettings } from '../../components/use-settings';
import type { PageStats } from '../../lib/controller';
import '../../components/theme.css';

export default function ExtensionPopup() {
  const { settings, patch, error, busy } = useSettings();
  const [stats, setStats] = useState<PageStats | null>(null);
  const [pageError, setPageError] = useState('');
  async function query(type = 'tuiclean:stats') {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return;
      const result = await browser.tabs.sendMessage(tab.id, { type });
      setStats(result as PageStats);
      setPageError('');
    } catch {
      setStats(null);
      if (type === 'tuiclean:pause') setPageError('无法连接当前页面，请刷新 X 后重试。');
    }
  }
  useEffect(() => {
    void query();
    const timer = setInterval(() => {
      void query();
    }, 1200);
    return () => clearInterval(timer);
  }, []);
  if (!settings)
    return (
      <main className="loading" role="status">
        {error || '正在读取本地设置…'}
      </main>
    );
  return (
    <Popup
      settings={settings}
      onPatch={(value) => {
        void patch(value).catch(() => {});
      }}
      stats={stats}
      busy={busy}
      error={error || pageError}
      onPause={() => {
        void query('tuiclean:pause');
      }}
      onSettings={() => {
        void browser.runtime.openOptionsPage();
      }}
      onDemo={() => {
        void browser.tabs.create({ url: browser.runtime.getURL('/demo.html') });
      }}
      onHistory={() => {
        void browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#history` });
      }}
    />
  );
}
