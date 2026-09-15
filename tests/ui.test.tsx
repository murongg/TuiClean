import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Popup } from '../components/Popup';
import { defaultSettings } from '../lib/settings';

afterEach(cleanup);
const stats = { scanned: 12, folded: 3, marked: 1, paused: false, supported: true, errors: 0 };

describe('popup controls', () => {
  it('changes each filter independently', () => {
    const onPatch = vi.fn();
    render(
      <Popup
        settings={defaultSettings}
        onPatch={onPatch}
        stats={stats}
        onPause={vi.fn()}
        onSettings={vi.fn()}
        onDemo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: '色情引流' }));
    expect(onPatch).toHaveBeenCalledWith({ adult: false });
    fireEvent.click(screen.getByRole('switch', { name: '垃圾广告' }));
    expect(onPatch).toHaveBeenCalledWith({ spam: false });
  });
  it('supports mark-only mode and page pause', () => {
    const onPatch = vi.fn();
    const onPause = vi.fn();
    render(
      <Popup
        settings={defaultSettings}
        onPatch={onPatch}
        stats={stats}
        onPause={onPause}
        onSettings={vi.fn()}
        onDemo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '仅标注' }));
    expect(onPatch).toHaveBeenCalledWith({ mode: 'mark' });
    fireEvent.click(screen.getByRole('button', { name: '暂停本页' }));
    expect(onPause).toHaveBeenCalledOnce();
  });
  it('does not show made-up statistics on unrelated pages', () => {
    render(
      <Popup
        settings={defaultSettings}
        onPatch={vi.fn()}
        stats={null}
        onPause={vi.fn()}
        onSettings={vi.fn()}
        onDemo={vi.fn()}
      />,
    );
    expect(screen.getByText('打开 X 开始过滤')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '暂停本页' })).toBeNull();
  });
});
