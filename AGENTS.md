# TuiClean project instructions

## Version policy

Keep the extension and package version at **0.1.0** until the user explicitly requests a version change. Do not automatically increment patch, minor, or major versions for fixes or new features. Keep the popup, settings, demo and current installation instructions consistent with this version.

## Commit messages

Write all future commit descriptions and body prose in Chinese. Keep Conventional Commit type prefixes such as `feat`, `fix`, `docs`, `ci`, and `chore`; technical identifiers and version numbers may retain their original spelling. Examples: `fix: 修复昵称误判` and `chore: 发布 v%s`. This also applies to automatically generated release commit messages.

## Verification data

Use synthetic content and fictional accounts in tests. Never copy real user posts, screenshots or account identifiers into test fixtures or assertions.

## Documentation

Report validation evidence in test/CI output and task responses. Do not create per-task validation report documents unless explicitly requested. Keep documentation focused on durable product, usage, and setup guidance.

## Display behavior

Matched content folds by default, including tentative matches and template repetition. Preserve the explicit mark-only option. Expanding a post must keep its toolbar and allow folding again; only explicit dismissal or removing the match should remove the toolbar. Keep expansion, folding and dismissal as separate states.

## Installed updates

A successful build does not update every installed copy. Chrome may load a separate directory under UnpackedExtensions after importing a ZIP. Verify the actual loaded directory before telling the user that reloading alone applies a build. If it differs, update that code directory or provide concrete copy instructions; keep the installed extension and its data instead of recommending an uninstall.
