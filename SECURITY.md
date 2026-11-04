# Security policy

## Reporting a vulnerability

If you find a problem, for example a way the extension could edit a message that is not yours,
send data off the page, or touch your LinkedIn session, report it privately through GitHub's
[private vulnerability reporting](https://github.com/maumoya/LKND-ghost-text/security/advisories/new).
You will get an answer within 7 days.

## What the extension promises

- No network calls, no external services, no telemetry (enforced by `test/guards.test.js`).
- Permissions: `storage`, `alarms`, `tabs`; host access only to `https://www.linkedin.com/messaging/*`.
- It never reads or stores your LinkedIn password, cookies or tokens.
- It only edits your own message, and only when it can match it exactly.

## Supported versions

Only the latest release is supported.
