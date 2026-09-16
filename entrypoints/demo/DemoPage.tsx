import { browser } from 'wxt/browser';
import { useMemo } from 'react';
import { Brand } from '../../components/Brand';
import { useSettings } from '../../components/use-settings';
import Demo from './DemoApp';
import { useRules } from '../../components/use-rules';
import { ruleClient } from '../../lib/rule-client';
import { compileRules } from '../../lib/rules';

function ExtensionDemo() {
  const { settings, error } = useSettings();
  const ruleCache = useRules(ruleClient);
  const rules = useMemo(() => compileRules(ruleCache.state.pack), [ruleCache.state.pack]);
  // Test changes stay inside Demo. This boundary only reads saved preferences
  // and must never pass through patch, history or real account actions.
  if (settings && !error && !ruleCache.error && !ruleCache.loading)
    return <Demo savedSettings={settings} rules={rules} />;
  return (
    <div className="demo-shell">
      <header className="site-header">
        <Brand large />
      </header>
      {error || ruleCache.error ? (
        <p className="error" role="alert">
          {error || ruleCache.error}
        </p>
      ) : (
        <p className="loading" role="status">
          正在读取已保存的设置和规则…
        </p>
      )}
    </div>
  );
}

export default function DemoPage() {
  return browser?.runtime?.id ? <ExtensionDemo /> : <Demo />;
}
