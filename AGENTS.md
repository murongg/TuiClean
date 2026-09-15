# TuiClean project instructions

## Version policy

Keep the extension and package version at **0.1.0** until the user explicitly requests a version change. Do not automatically increment patch, minor, or major versions for fixes or new features. Keep the popup, settings, demo and current installation instructions consistent with this version.

## Verification data

Use synthetic content and fictional accounts in tests. Never copy real user posts, screenshots or account identifiers into test fixtures or assertions.

## Display behavior

Matched content folds by default, including tentative matches and template repetition. Preserve the explicit mark-only option. Expanding a post must keep its toolbar and allow folding again; only explicit dismissal or removing the match should remove the toolbar. Keep expansion, folding and dismissal as separate states.
