import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPanel } from '../components/SettingsPanel';
import { defaultSettings, encodeBackup } from '../lib/settings';
import { encodeDataBackup } from '../lib/backup';
import { Blob as TestBlob } from 'node:buffer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup() {
  const onPatch = vi.fn().mockResolvedValue(undefined);
  render(<SettingsPanel settings={defaultSettings} onPatch={onPatch} />);
  return onPatch;
}
describe('settings interactions', () => {
  it('exports the saved history text with preferences in a downloadable backup', async () => {
    vi.useFakeTimers();
    const entries = [
      {
        id: '1902',
        author: 'sample_export',
        category: 'spam' as const,
        action: 'folded' as const,
        recordedAt: 2000,
        rules: ['spam-template'],
        reasons: ['合成依据'],
        text: '需要保留的合成原文',
      },
    ];
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:synthetic-backup');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal('Blob', TestBlob);
    let filename = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });
    render(
      <SettingsPanel
        settings={defaultSettings}
        onPatch={vi.fn()}
        history={{
          list: vi.fn().mockResolvedValue(entries),
          clear: vi.fn(),
          subscribe: () => () => {},
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '数据与隐私' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导出完整备份' }));
    });
    expect(screen.getByText('完整备份已生成，包含配置、名单和拦截原文。')).toBeTruthy();
    const contents = JSON.parse(await createObjectURL.mock.calls[0]![0].text());
    expect(contents).toMatchObject({
      app: 'tuiclean',
      version: 2,
      settings: defaultSettings,
      history: entries,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(filename).toBe('tuiclean-data.json');
    vi.runOnlyPendingTimers();
  });
  it('does not export an empty history backup when reading saved records fails', async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL });
    render(
      <SettingsPanel
        settings={defaultSettings}
        onPatch={vi.fn()}
        history={{
          list: vi.fn().mockRejectedValue(new Error('合成历史读取失败')),
          clear: vi.fn(),
          subscribe: () => () => {},
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '数据与隐私' }));
    fireEvent.click(screen.getByRole('button', { name: '导出完整备份' }));
    await screen.findByText('合成历史读取失败');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
  it('previews and restores full data only after Apply, merging history with original text', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const merge = vi.fn().mockResolvedValue(undefined);
    const history = {
      list: vi.fn().mockResolvedValue([]),
      clear: vi.fn(),
      subscribe: () => () => {},
      merge,
    };
    render(<SettingsPanel settings={defaultSettings} onPatch={onPatch} history={history} />);
    fireEvent.click(screen.getByRole('button', { name: '数据与隐私' }));
    expect(screen.getByRole('button', { name: '导出完整备份' })).toBeTruthy();
    const entries = [
      {
        id: '1901',
        author: 'sample_backup',
        category: 'spam' as const,
        action: 'folded' as const,
        recordedAt: 1000,
        rules: ['spam-template'],
        reasons: ['合成依据'],
        text: '合成原文',
      },
    ];
    const body = encodeDataBackup(defaultSettings, entries);
    const file = new File([body], 'synthetic-data.json');
    Object.defineProperty(file, 'text', { value: async () => body });
    fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [file] } });
    await screen.findByText('准备导入');
    expect(merge).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '应用备份' }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith(entries));
    expect(onPatch).toHaveBeenCalledWith(defaultSettings);
    await screen.findByText('配置已恢复，拦截记录已合并。');
  });
  it('reports a partial restore if history storage fails, preserving a retry', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const merge = vi.fn().mockRejectedValue(new Error('合成记录写入失败'));
    render(
      <SettingsPanel
        settings={defaultSettings}
        onPatch={onPatch}
        history={{
          list: vi.fn().mockResolvedValue([]),
          clear: vi.fn(),
          subscribe: () => () => {},
          merge,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '数据与隐私' }));
    const body = encodeDataBackup(defaultSettings, []);
    const file = new File([body], 'synthetic-data.json');
    Object.defineProperty(file, 'text', { value: async () => body });
    fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [file] } });
    await screen.findByText('准备导入');
    fireEvent.click(screen.getByRole('button', { name: '应用备份' }));
    await screen.findByText(/配置已恢复，但拦截记录恢复失败/);
    expect(screen.getByRole('button', { name: '应用备份' })).toBeTruthy();
  });
  it('does not resend an already-saved blacklist when another tab adds an account', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<SettingsPanel settings={defaultSettings} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
    fireEvent.change(screen.getByRole('textbox', { name: '本地黑名单' }), {
      target: { value: 'sample_one' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    await screen.findByText('个人规则已保存，将立即应用到已打开的 X 页面。');
    rerender(
      <SettingsPanel
        settings={{ ...defaultSettings, blockedUsers: ['sample_one', 'sample_two'] }}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('填写你不想看到的词语'), {
      target: { value: '虚构测试词' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    await waitFor(() => expect(onPatch).toHaveBeenLastCalledWith({ keywords: ['虚构测试词'] }));
    expect(
      (screen.getByRole('textbox', { name: '本地黑名单' }) as HTMLTextAreaElement).value,
    ).toContain('sample_two');
  });
  it('saves local account lists and only writes fields edited in the personal form', async () => {
    const onPatch = setup();
    fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
    fireEvent.change(screen.getByRole('textbox', { name: '本地黑名单' }), {
      target: { value: '@Sample_Ad' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '用户名匹配规则' }), {
      target: { value: 'demo_*' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({
        blockedUsers: ['sample_ad'],
        usernameRules: ['demo_*'],
      }),
    );
  });
  it('previews a valid backup and requires Apply before replacing preferences', async () => {
    const onPatch = setup();
    fireEvent.click(screen.getByRole('button', { name: '数据与隐私' }));
    const settings = { ...defaultSettings, adult: false, whitelist: ['sample_user'] };
    const file = new File([encodeBackup(settings)], 'synthetic-settings.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: async () => encodeBackup(settings) });
    fireEvent.change(screen.getByLabelText('选择备份文件'), { target: { files: [file] } });
    await screen.findByText('准备导入');
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '应用备份' }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith(settings));
    await screen.findByText('备份已应用。');
  });
  it('validates custom lists before invoking storage', async () => {
    const onPatch = setup();
    fireEvent.click(screen.getByRole('button', { name: '个人规则' }));
    fireEvent.change(screen.getByPlaceholderText('ads.example.test'), {
      target: { value: 'https://example.test/path' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    expect(screen.getByRole('alert').textContent).toContain('域名');
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('ads.example.test'), {
      target: { value: 'ads.example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存个人规则' }));
    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({
        domains: ['ads.example.test'],
      }),
    );
  });
});
