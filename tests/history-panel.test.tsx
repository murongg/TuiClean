import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HistoryPanel } from '../components/HistoryPanel';
import { defaultSettings } from '../lib/settings';
import type { HistoryEntry, HistorySource } from '../lib/history';

const entries: HistoryEntry[] = [
  {
    id: '1001',
    author: 'sample_ad',
    category: 'adult',
    action: 'folded',
    recordedAt: 1000,
    rules: ['adult-profile'],
    reasons: ['合成昵称招揽依据'],
  },
  {
    id: '1002',
    author: 'sample_spam',
    category: 'spam',
    action: 'marked',
    recordedAt: 2000,
    rules: ['spam-template'],
    reasons: ['合成重复模板依据'],
  },
];
function source(rows = entries): HistorySource {
  return {
    list: vi.fn().mockResolvedValue(rows),
    clear: vi.fn().mockResolvedValue(undefined),
    subscribe: () => () => {},
  };
}
afterEach(cleanup);
describe('history panel with synthetic records', () => {
  it('displays captured text safely and distinguishes old records without a snapshot', async () => {
    const original = '合成原文 <img src=x onerror=example()>\n下一行';
    const { container } = render(
      <HistoryPanel
        source={source([{ ...entries[0]!, text: original }, entries[1]!])}
        settings={defaultSettings}
        onPatch={vi.fn()}
      />,
    );
    await screen.findByText(/合成原文/);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('旧记录未保存原文')).toBeTruthy();
  });
  it('shows metadata and canonical links, with category and rule filters', async () => {
    render(<HistoryPanel source={source()} settings={defaultSettings} onPatch={vi.fn()} />);
    await screen.findByText('@sample_ad');
    expect(screen.getAllByRole('link', { name: /查看原帖/ })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /查看原帖/ })[0]!.getAttribute('href')).toMatch(
      /^https:\/\/x\.com\/sample_/,
    );
    fireEvent.change(screen.getByLabelText('按分类筛选'), { target: { value: 'spam' } });
    expect(screen.queryByText('@sample_ad')).toBeNull();
    expect(screen.getByText('合成重复模板依据')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('按命中规则筛选'), {
      target: { value: 'adult-profile' },
    });
    expect(screen.getByText('没有符合筛选条件的记录')).toBeTruthy();
  });
  it('can trust a historical author without deleting or restoring records', async () => {
    const history = source();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<HistoryPanel source={history} settings={defaultSettings} onPatch={onPatch} />);
    fireEvent.click(await screen.findByRole('button', { name: '信任 @sample_ad' }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ whitelist: ['sample_ad'] }));
    expect(history.clear).not.toHaveBeenCalled();
  });
  it('confirms clearing and preserves data on failure with a visible retry', async () => {
    const history = source();
    vi.mocked(history.clear).mockRejectedValueOnce(new Error('合成清空失败'));
    render(<HistoryPanel source={history} settings={defaultSettings} onPatch={vi.fn()} />);
    await screen.findByText('@sample_ad');
    fireEvent.click(screen.getByRole('button', { name: '清空记录' }));
    expect(history.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await screen.findByText('合成清空失败');
    expect(screen.getByText('@sample_ad')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await screen.findByText('还没有拦截记录');
  });
  it('retries a failed read and can switch off future recording', async () => {
    const history = source([]);
    vi.mocked(history.list).mockRejectedValueOnce(new Error('合成读取失败'));
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<HistoryPanel source={history} settings={defaultSettings} onPatch={onPatch} />);
    await screen.findByText('合成读取失败');
    expect(screen.queryByText('还没有拦截记录')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await screen.findByText('还没有拦截记录');
    fireEvent.click(screen.getByRole('switch', { name: '记录拦截历史' }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ historyEnabled: false }));
  });
});
