import { browser } from 'wxt/browser';
import { Brand } from '../../components/Brand';
import { useSettings } from '../../components/use-settings';
import Demo from './DemoApp';

function ExtensionDemo() {
  const { settings, error } = useSettings();
  // Test changes stay inside Demo. This boundary only reads saved preferences
  // and must never pass through patch, history or real account actions.
  if (settings && !error) return <Demo savedSettings={settings} />;
  return (
    <div className="demo-shell">
      <header className="site-header">
        <Brand large />
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <p className="loading" role="status">
          正在读取已保存的扩展设置…
        </p>
      )}
    </div>
  );
}

export default function DemoPage() {
  return browser?.runtime?.id ? <ExtensionDemo /> : <Demo />;
}
