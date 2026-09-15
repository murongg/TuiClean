import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Demo from '../entrypoints/demo/DemoApp';
import { defaultSettings } from '../lib/settings';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const enter = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: '测试内容' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '检测并预览' }));
};

describe('interactive demo testing', () => {
  it('uses saved extension keywords for the verdict and folded preview', async () => {
    render(<Demo savedSettings={{ ...defaultSettings, keywords: ['青杉词'] }} />);
    enter('虚构测试作者🍑青杉词');
    expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词');
    const sample = document.querySelector('[data-custom="true"]')!;
    await waitFor(() => expect(sample.hasAttribute('data-tuiclean-folded')).toBe(true));
  });
  it('rechecks existing input when saved extension rules change and resets to those rules', async () => {
    const { rerender } = render(<Demo savedSettings={defaultSettings} />);
    enter('虚构测试作者🍑青杉词');
    expect(screen.getByRole('status').textContent).toContain('未命中');
    const saved = { ...defaultSettings, keywords: ['青杉词'] };
    rerender(<Demo savedSettings={saved} />);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词'),
    );
    expect(document.querySelectorAll('[data-custom="true"]')).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: '测试内容' }) as HTMLTextAreaElement).value).toBe(
      '虚构测试作者🍑青杉词',
    );
    fireEvent.click(screen.getByRole('button', { name: '重置演示' }));
    enter('另一段虚构文本：青杉词');
    expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词');
  });
  it('applies personal keywords saved inside the standalone demo', async () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole('button', { name: '查看完整设置' }));
    fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
    fireEvent.change(screen.getByPlaceholderText('填写你不想看到的词语'), {
      target: { value: '青杉词' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    await screen.findByText(/个人规则已保存/);
    fireEvent.click(screen.getByRole('button', { name: '返回演示' }));
    enter('虚构测试作者🍑青杉词');
    expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词');
  });
  it('opens history from the popup and keeps cleared records empty when returning to the same feed', async () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole('button', { name: '拦截记录' }));
    await screen.findByText('@demo_adult');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    fireEvent.click(screen.getByRole('button', { name: '清空记录' }));
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await screen.findByText('还没有拦截记录');
    fireEvent.click(screen.getByRole('button', { name: '返回演示' }));
    fireEvent.click(screen.getByRole('button', { name: '拦截记录' }));
    await screen.findByText('还没有拦截记录');
    expect(screen.queryByText('@demo_adult')).toBeNull();
  });
  it('shows both block actions and shares local account state with the settings form', async () => {
    render(<Demo />);
    const sample = screen
      .getAllByTestId('tweet')
      .find((node) => node.querySelector('a[href="https://x.com/demo_spam/status/103"]'))!;
    await waitFor(() => expect(sample.querySelector('[data-tuiclean-host]')).not.toBeNull());
    const host = sample.querySelector('[data-tuiclean-host]')!;
    expect(host.shadowRoot!.querySelector('[data-action="block-x"]')).not.toBeNull();
    fireEvent.click(host.shadowRoot!.querySelector('[data-action="block"]')!);
    await waitFor(() =>
      expect(
        sample
          .querySelector('[data-tuiclean-host]')!
          .shadowRoot!.querySelector('[data-action="unblock"]'),
      ).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: '查看完整设置' }));
    fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
    expect((screen.getByRole('textbox', { name: '本地黑名单' }) as HTMLTextAreaElement).value).toBe(
      'demo_spam',
    );
  });
  it('accepts typed content and shows the real classification and folding preview', async () => {
    render(<Demo />);
    enter('刷单返佣，私信领取任务。');
    expect(screen.getByRole('status').textContent).toContain('命中');
    expect(screen.getByRole('status').textContent).toContain('招揽');
    const sample = screen
      .getAllByTestId('tweet')
      .find((node) => node.getAttribute('data-custom') === 'true')!;
    await waitFor(() => expect(sample.hasAttribute('data-tuiclean-folded')).toBe(true));
    expect(sample.querySelector('[data-tuiclean-host]')).not.toBeNull();
  });
  it('reports no match for safe input and rejects empty input without adding a card', () => {
    render(<Demo />);
    const initial = screen.getAllByTestId('tweet').length;
    enter('  ');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getAllByTestId('tweet')).toHaveLength(initial);
    enter('这是一段虚构的正常交流内容。');
    expect(screen.getByRole('status').textContent).toContain('未命中');
    expect(screen.getAllByTestId('tweet')).toHaveLength(initial + 1);
  });
  it('re-evaluates comparisons across added accounts and responds to filter switches', async () => {
    render(<Demo />);
    enter('虚构文本今天的小纸船🌿虚构文本明天的小风车');
    enter('虚构文本今天的小纸船🧩虚构文本明天的小风车');
    expect(screen.getByRole('status').textContent).toContain('2 个不同账号');
    fireEvent.click(screen.getByRole('switch', { name: '垃圾广告' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('未命中'));
    fireEvent.click(screen.getByRole('button', { name: '清空自定义内容' }));
    expect(document.querySelectorAll('[data-custom="true"]')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('renders pasted markup as plain text and allows input after resetting the demo', () => {
    const { container } = render(<Demo />);
    enter('<img src=x onerror=example()> 虚构的测试文本');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重置演示' }));
    expect((screen.getByRole('textbox', { name: '测试内容' }) as HTMLTextAreaElement).value).toBe(
      '',
    );
    enter('另一段虚构文本。');
    expect(document.querySelectorAll('[data-custom="true"]')).toHaveLength(1);
  });
  it('preserves an unfinished draft while visiting settings', () => {
    render(<Demo />);
    fireEvent.change(screen.getByRole('textbox', { name: '测试内容' }), {
      target: { value: '尚未提交的虚构测试内容' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查看完整设置' }));
    fireEvent.click(screen.getByRole('button', { name: '返回演示' }));
    expect((screen.getByRole('textbox', { name: '测试内容' }) as HTMLTextAreaElement).value).toBe(
      '尚未提交的虚构测试内容',
    );
  });
});
