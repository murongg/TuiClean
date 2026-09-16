import { browser } from 'wxt/browser';
import { createController } from '../lib/controller';
import { settingsStore, watchSettings } from '../lib/extension';
import { blockOnX } from '../lib/blocking';
import { historyClient } from '../lib/history-client';
import { ruleClient } from '../lib/rule-client';
import { bundledRuleState } from '../lib/rule-updates';
import { compileRules } from '../lib/rules';

export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://www.x.com/*',
    'https://twitter.com/*',
    'https://www.twitter.com/*',
  ],
  runAt: 'document_idle',
  async main(ctx) {
    const [settings, ruleState] = await Promise.all([
      settingsStore.get(),
      ruleClient.get().catch(bundledRuleState),
    ]);
    if (ctx.isInvalid) return;
    const controller = createController({
      document,
      getUrl: () => location.href,
      settings,
      rules: compileRules(ruleState.pack),
      onBlock: settingsStore.setBlocked,
      onBlockX: blockOnX,
      onHistory: historyClient.record,
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
    let ruleRead = 0;
    const refreshRules = () => {
      const revision = ++ruleRead;
      void ruleClient
        .get()
        .then((next) => {
          if (ctx.isValid && revision === ruleRead) controller.updateRules(compileRules(next.pack));
        })
        .catch(() => {
          /* Keep the last working rules if a storage read fails. */
        });
    };
    const stopRules = ruleClient.subscribe(refreshRules);
    const onMessage = (
      message: unknown,
      _sender: { id?: string; url?: string },
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
    // Close the gap between the initial read and installing the storage listener.
    refreshRules();
    ctx.onInvalidated(() => {
      controller.stop();
      stopWatch();
      stopRules();
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});
