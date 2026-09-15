import { useCallback, useEffect, useState } from 'react';
import { settingsStore, watchSettings } from '../lib/extension';
import type { Settings } from '../lib/settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      settingsStore
        .get()
        .then((value) => {
          if (alive) {
            setSettings(value);
            setError('');
          }
        })
        .catch(() => {
          if (alive) setError('读取本地设置失败，请重新打开扩展。');
        });
    };
    const unwatch = watchSettings(refresh);
    refresh();
    return () => {
      alive = false;
      unwatch();
    };
  }, []);
  const patch = useCallback(async (value: Partial<Settings>) => {
    setBusy(true);
    setError('');
    try {
      setSettings(await settingsStore.patch(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置保存失败，请重试。');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);
  return { settings, patch, error, busy };
}
