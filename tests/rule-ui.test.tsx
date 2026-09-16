import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsPanel } from '../components/SettingsPanel';
import { defaultSettings } from '../lib/settings';
import { bundledRuleState, type RuleSource } from '../lib/rule-updates';

afterEach(cleanup);
function setup() {
  let state = bundledRuleState();
  const listeners = new Set<() => void>();
  const source: RuleSource = {
    get: vi.fn(async () => structuredClone(state)),
    update: vi.fn(async () => {
      state = structuredClone(state);
      state.pack.version++;
      state.pack.rules[0]!.name = '合成更新规则';
      state.source = 'downloaded';
      state.checkedAt = state.updatedAt = 12000;
      listeners.forEach((fn) => fn());
      return state;
    }),
    restore: vi.fn(async () => {
      state = bundledRuleState();
      listeners.forEach((fn) => fn());
      return state;
    }),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const onPatch = vi.fn();
  render(
    <SettingsPanel
      settings={{ ...defaultSettings, keywords: ['合成个人词'], disabledRules: ['adult-profile'] }}
      onPatch={onPatch}
      ruleSource={source}
      history={{
        list: async () => [
          {
            id: '5401',
            author: 'sample_history',
            category: 'adult',
            action: 'folded',
            recordedAt: 1000,
            rules: ['adult-solicitation'],
            reasons: ['合成拦截原因'],
          },
        ],
        clear: vi.fn(),
        subscribe: () => () => {},
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '内置规则' }));
  return { source, onPatch, listeners };
}
it('updates rule metadata on demand and can restore the bundled rules without changing personal settings', async () => {
  const { source, onPatch, listeners } = setup();
  const button = screen.getByRole('button', { name: '更新规则' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(source.update).not.toHaveBeenCalled();
  fireEvent.click(button);
  await screen.findByText(`当前规则 v${bundledRuleState().pack.version + 1}`);
  expect(screen.getByRole('switch', { name: '合成更新规则' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '拦截记录' }));
  await screen.findByText('@sample_history');
  expect(document.querySelector('.history-meta')!.textContent).toContain('合成更新规则');
  fireEvent.click(screen.getByRole('button', { name: '内置规则' }));
  expect(onPatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '恢复内置规则' }));
  await screen.findByText(`当前规则 v${bundledRuleState().pack.version}`);
  expect(onPatch).not.toHaveBeenCalled();
  cleanup();
  expect(listeners.size).toBe(0);
});
it('disables repeated clicks during download and retains the old version on failure', async () => {
  const { source } = setup();
  let reject!: (reason: Error) => void;
  vi.mocked(source.update).mockImplementation(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  const button = screen.getByRole('button', { name: '更新规则' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  expect((screen.getByRole('button', { name: '正在更新…' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    reject(new Error('合成下载失败'));
  });
  expect(screen.getByRole('alert').textContent).toContain('合成下载失败');
  expect(screen.getByText(`当前规则 v${bundledRuleState().pack.version}`)).toBeTruthy();
  expect(source.update).toHaveBeenCalledOnce();
});
