import { defineConfig } from 'bumpp';

export default defineConfig({
  files: [
    'package.json',
    'package-lock.json',
    'AGENTS.md',
    'README.md',
    'PRIVACY.md',
    'SECURITY.md',
    'docs/rules.md',
    'components/Popup.tsx',
    'components/SettingsPanel.tsx',
    'entrypoints/demo/DemoApp.tsx',
  ],
  noGitCheck: false,
  confirm: true,
  all: false,
  execute: 'npm run verify',
  commit: 'chore: 发布 v%s',
  tag: 'v%s',
  push: true,
});
