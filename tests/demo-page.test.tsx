import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fake = vi.hoisted(() => ({
  id: 'sample_extension' as string | undefined,
  data: {} as Record<string, unknown>,
  get: vi.fn(),
  set: vi.fn(),
  listeners: new Set<(changes: Record<string, unknown>, area: string) => void>(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      get id() {
        return fake.id;
      },
    },
    storage: {
      local: { get: fake.get, set: fake.set },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          fake.listeners.add(fn),
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          fake.listeners.delete(fn),
      },
    },
  },
}));
vi.mock('../components/mount', () => ({
  mountApp: (_element: HTMLElement, content: ReactNode) => render(content),
}));
beforeEach(() => {
  vi.resetModules();
  fake.id = 'sample_extension';
  fake.data = { 'tuiclean:keywords': ['青杉词'] };
  fake.get.mockReset().mockImplementation(async () => ({ ...fake.data }));
  fake.set.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  expect(fake.listeners.size).toBe(0);
});
const open = () => import('../entrypoints/demo/main');
const enter = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: '测试内容' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '检测并预览' }));
};

it('connects the real demo entrypoint to saved preferences and follows storage changes', async () => {
  await act(open);
  enter('虚构测试作者🍑青杉词');
  expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词');
  fake.data = { 'tuiclean:keywords': [] };
  await act(async () => {
    fake.listeners.forEach((fn) => fn({ 'tuiclean:keywords': {} }, 'local'));
  });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('未命中'));
  expect(document.querySelectorAll('[data-custom="true"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '查看完整设置' }));
  fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
  fireEvent.change(screen.getByPlaceholderText('填写你不想看到的词语'), {
    target: { value: '青杉词' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
  await screen.findByText(/个人规则已保存/);
  fireEvent.click(screen.getByRole('button', { name: '返回演示' }));
  expect(screen.getByRole('status').textContent).toContain('命中你的关键词：青杉词');
  fireEvent.click(screen.getByRole('button', { name: '重置演示' }));
  enter('合成文本青杉词');
  expect(screen.getByRole('status').textContent).toContain('未命中');
  expect(fake.set).not.toHaveBeenCalled();
  expect(fake.data).toEqual({ 'tuiclean:keywords': [] });
});

it('waits for the saved preferences instead of testing with temporary defaults', async () => {
  let resolve!: (value: Record<string, unknown>) => void;
  fake.get.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(open);
  expect(screen.queryByRole('textbox', { name: '测试内容' })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('读取');
  await act(async () => {
    resolve(fake.data);
  });
  expect(screen.getByRole('textbox', { name: '测试内容' })).toBeTruthy();
});

it('reports unavailable extension settings without silently falling back to default rules', async () => {
  fake.get.mockRejectedValue(new Error('synthetic storage failure'));
  await act(open);
  expect(screen.getByRole('alert').textContent).toContain('读取');
  expect(screen.queryByRole('textbox', { name: '测试内容' })).toBeNull();
});

it('keeps standalone web demos usable without reading extension storage', async () => {
  fake.id = undefined;
  await act(open);
  enter('合成文本青杉词');
  expect(screen.getByRole('status').textContent).toContain('未命中');
  expect(fake.get).not.toHaveBeenCalled();
});
