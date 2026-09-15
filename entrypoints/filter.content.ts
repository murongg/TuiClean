import { browser } from 'wxt/browser';
import { createController } from '../lib/controller';
import { settingsStore, watchSettings } from '../lib/extension';
import { blockOnX } from '../lib/blocking';

export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://www.x.com/*',
    'https://twitter.com/*',
    'https://www.twitter.com/*',
  ],
  runAt: 'document_idle',
  async main(ctx) {
    const settings = await settingsStore.get();
    if (ctx.isInvalid) return;
    const controller = createController({
      document,
      getUrl: () => location.href,
      settings,
      onBlock: settingsStore.setBlocked,
      onBlockX: blockOnX,
      onWhitelist: async (author) => {
        const current = await settingsStore.get();
        await settingsStore.patch({
          whitelist: [...new Set([...current.whitelist, author.toLowerCase()])],
        });
      },
    });
    const stopWatch = watchSettings(() => {
      settingsStore
        .get()
        .then((next) => {
          if (ctx.isValid) controller.updateSettings(next);
        })
        .catch(() => controller.stop());
    });
    const onMessage = (
      message: unknown,
      _sender: unknown,
      respond: (response: unknown) => void,
    ) => {
      const type = (message as { type?: string } | null)?.type;
      if (type === 'tuiclean:stats') {
        controller.scan();
        respond(controller.getStats());
      }
      if (type === 'tuiclean:pause') {
        controller.togglePause();
        respond(controller.getStats());
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    controller.start();
    ctx.onInvalidated(() => {
      controller.stop();
      stopWatch();
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});
