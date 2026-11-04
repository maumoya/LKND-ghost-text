# LinkedIn messaging DOM notes

Captured 2026-11-04 from the owner's own LinkedIn session (Chrome, desktop
messaging at `/messaging/thread/...`). No names or message text are kept here.
LinkedIn changes class names without notice; `extension/lib/dom.js` keeps every
selector in one `SEL` object so a break is a one-line fix.

## Thread view

| What | Selector | Notes |
|---|---|---|
| Message item | `.msg-s-event-listitem` | carries `data-event-urn` (`urn:li:msg_message:(urn:li:fsd_profile:…,…)`) |
| Other person's message | `.msg-s-event-listitem--other` | own messages lack this class |
| Message body | `p.msg-s-event-listitem__body` | after an edit, a `span` "(Edited)" sits inside the same `p` |
| Edited label | `p.msg-s-event-listitem__body span.pl1` | text `(Edited)`; strip it before comparing text |
| Bubble | `.msg-s-event-listitem__message-bubble` | ring anchors here |
| Options trigger | `button.msg-s-event-listitem__options-trigger` | opens an artdeco dropdown |
| Open menu | `.artdeco-dropdown__content--is-open` | items `.artdeco-dropdown__item` |
| Menu items | text `Forward`, `Share via email`, `Delete`, `Edit` | `Delete`/`Edit` only while the message is under 60 min old |

## Composer

| What | Selector | Notes |
|---|---|---|
| Composer | `.msg-form__contenteditable` | `role=textbox`, aria-label "Write a message…", empty = `<p><br></p>` |
| Footer actions | `.msg-form__footer-action` | attach image/file, GIF, emoji |
| Send mode toggle | `.msg-form__send-toggle` | owner uses "Press Enter to Send": no visible send button |
| Send button | `.msg-form__send-button` | only when Enter-to-send is off |

## Edit flow (verified live)

1. Click the options trigger on the own message, then the `Edit` menu item.
2. The main form switches to edit mode: `form.msg-edit-form__base-form`. The
   same `.msg-form__contenteditable` now holds the message text (inside
   `.msg-edit-form__content-container`).
3. Replace text: focus, `execCommand('selectAll')`, `execCommand('insertText', false, text)`.
   LinkedIn's editor registers this as real input (Save stays enabled).
4. Click `button.msg-edit-form__save-button` (Cancel = `.msg-edit-form__dismiss-button`).
5. Edit form disappears; body reads `💬💣💨` followed by the `(Edited)` span.

## Dev dependency

jsdom 30.1.3, integrity
`sha512-hQMUPvRgN7KxsfIytDQji7bimuJeRQa6Qo5+iuiZQk5CafeRxLIA10/cG5YCBFNpD9RO3oqIiN4CO1Y44kxqXg==`,
`npm audit`: 0 vulnerabilities. Install with `npm ci --ignore-scripts`.
