import { browser } from 'wxt/browser';
import { requestApiBatch } from './api-client';
import type { NativeBatch } from './batch';

export const blockHistoryOnX: NativeBatch = (targets, signal, progress) =>
  requestApiBatch(
    () => browser.runtime.connect({ name: 'tuiclean:api' }),
    targets,
    signal,
    progress,
    () => browser.runtime.lastError?.message,
  );
