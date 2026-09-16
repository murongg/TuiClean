import { useEffect, useState } from 'react';
import { bundledRuleState, type RuleSource } from '../lib/rule-updates';

export function useRules(source?: Pick<RuleSource, 'get' | 'subscribe'>) {
  const [state, setState] = useState(bundledRuleState);
  const [loading, setLoading] = useState(Boolean(source));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!source) return;
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      void source
        .get()
        .then((next) => {
          if (alive && current === revision) {
            setState(next);
            setError('');
          }
        })
        .catch(() => {
          if (alive && current === revision) setError('读取本地规则失败，暂时保留当前规则。');
        })
        .finally(() => {
          if (alive && current === revision) setLoading(false);
        });
    };
    setLoading(true);
    const stop = source.subscribe(refresh);
    refresh();
    return () => {
      alive = false;
      stop();
    };
  }, [source]);
  return { state, loading, error };
}
