import { installWebApi } from '../lib/api-page';

export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://www.x.com/*',
    'https://twitter.com/*',
    'https://www.twitter.com/*',
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if (/^#tuiclean-api-[0-9a-f-]{36}$/.test(location.hash)) installWebApi();
  },
});
