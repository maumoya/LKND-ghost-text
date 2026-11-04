# Contributing

1. Open an issue first for anything bigger than a typo, so we agree on the change.
2. Branch, change, and run the tests locally (Node 20+):
   ```bash
   npm ci && npm test
   ```
3. Every new behavior gets a test in `test/`. A bug fix gets a test that fails without the fix.
4. The extension must keep making zero network calls; `test/guards.test.js` enforces it.
5. Open a PR. CI (tests, CodeQL) must be green. A maintainer reviews and merges.

Report security problems privately: see [SECURITY.md](SECURITY.md).
