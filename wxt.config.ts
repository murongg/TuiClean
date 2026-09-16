import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    excludeSources: ['work/**', 'coverage/**', 'docs/plans/**', 'docs/specs/**'],
  },
  manifest: ({ browser }) => ({
    name: 'TuiClean · 推净',
    description: '在本地识别 X 中的文字色情引流与垃圾广告。屏蔽有原因，误判可恢复。',
    permissions: ['storage', 'scripting'],
    host_permissions: [
      'https://x.com/*',
      'https://www.x.com/*',
      'https://twitter.com/*',
      'https://www.twitter.com/*',
    ],
    icons: { 16: '/icons/16.png', 32: '/icons/32.png', 48: '/icons/48.png', 128: '/icons/128.png' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'tuiclean@extension.local',
              data_collection_permissions: { required: ['authenticationInfo', 'websiteActivity'] },
            },
          },
        }
      : {}),
  }),
});
