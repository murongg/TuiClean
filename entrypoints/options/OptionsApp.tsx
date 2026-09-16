import { browser } from 'wxt/browser';
import { Brand } from '../../components/Brand';
import { SettingsPanel } from '../../components/SettingsPanel';
import { useSettings } from '../../components/use-settings';
import { historyClient } from '../../lib/history-client';
import { ruleClient } from '../../lib/rule-client';
import '../../components/theme.css';

export default function Options() {
  const { settings, patch, error } = useSettings();
  return (
    <div className="settings-shell">
      <header className="site-header">
        <Brand />
        <button
          className="secondary"
          onClick={() => browser.tabs.create({ url: browser.runtime.getURL('/demo.html') })}
        >
          打开体验演示
        </button>
      </header>
      {settings ? (
        <SettingsPanel
          settings={settings}
          onPatch={patch}
          history={historyClient}
          ruleSource={ruleClient}
          initialSection={location.hash === '#history' ? 'history' : 'general'}
        />
      ) : (
        <p className="loading" role="status">
          {error || '正在读取设置…'}
        </p>
      )}
    </div>
  );
}
