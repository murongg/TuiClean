import { act, useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { mountApp } from '../components/mount';

it('unmounts the old React tree and its effects before a hot-reload remount', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const cleanup = vi.fn();
  let dispose: (() => void) | undefined;
  function Probe() {
    useEffect(() => cleanup, []);
    return <span>示例内容</span>;
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await act(async () => {
    mountApp(element, <Probe />, {
      dispose: (fn) => {
        dispose = fn;
      },
    });
  });
  expect(element.textContent).toBe('示例内容');
  await act(async () => {
    dispose?.();
  });
  expect(cleanup).toHaveBeenCalledOnce();
  expect(element.textContent).toBe('');
  let root: ReturnType<typeof mountApp>;
  await act(async () => {
    root = mountApp(element, <span>重新挂载</span>);
  });
  expect(element.textContent).toBe('重新挂载');
  await act(async () => root!.unmount());
  element.remove();
  vi.unstubAllGlobals();
});
