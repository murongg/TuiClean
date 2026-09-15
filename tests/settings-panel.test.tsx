import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPanel } from '../components/SettingsPanel';
import { defaultSettings, encodeBackup } from '../lib/settings';

afterEach(cleanup);
function setup() {
  const onPatch = vi.fn().mockResolvedValue(undefined);
  render(<SettingsPanel settings={defaultSettings} onPatch={onPatch} />);
  return onPatch;
}
describe('settings interactions', () => {
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
