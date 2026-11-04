// LinkedIn messaging selectors, finders and the refuse-on-ambiguity match.
// Every selector lives in SEL (see docs/DOM_NOTES.md) so a markup change is a one-line fix.
(function (root) {
  const SEL = {
    item: '.msg-s-event-listitem',
    other: 'msg-s-event-listitem--other',
    body: 'p.msg-s-event-listitem__body',
    edited: 'span.pl1',
    bubble: '.msg-s-event-listitem__message-bubble',
    optionsTrigger: 'button.msg-s-event-listitem__options-trigger',
    openMenu: '.artdeco-dropdown__content--is-open',
    menuItem: '.artdeco-dropdown__item',
    form: 'form.msg-form',
    composer: '.msg-form__contenteditable',
    sendButton: '.msg-form__send-button',
    footer: '.msg-form__footer',
    attachment: '[class*="attachment-preview"], [class*="msg-form__attachment"], .msg-form img:not(.msg-form__footer img)',
    editForm: 'form.msg-edit-form__base-form',
    editSave: 'button.msg-edit-form__save-button',
  };

  function norm(t) {
    return String(t == null ? '' : t).replace(/\r\n/g, '\n').trim();
  }

  // Compare text ignoring whitespace differences (nbsp, line-break shapes) between editor and bubble.
  function loose(t) {
    return norm(t).replace(/\s+/g, ' ');
  }

  // Text in a contenteditable: one line per paragraph.
  function editorText(ed) {
    const ps = [...ed.querySelectorAll('p')];
    return norm(ps.length ? ps.map((p) => p.textContent).join('\n') : ed.textContent);
  }

  function findComposer(doc) {
    return doc.querySelector(SEL.form + ' ' + SEL.composer) || doc.querySelector(SEL.composer);
  }

  function findSendButton(doc) {
    return doc.querySelector(SEL.sendButton);
  }

  function hasAttachment(doc) {
    const form = doc.querySelector(SEL.form);
    return !!(form && form.querySelector(SEL.attachment));
  }

  function ownMessages(doc) {
    return [...doc.querySelectorAll(SEL.item)].filter((el) => !el.classList.contains(SEL.other));
  }

  function bodyText(el) {
    const p = el.querySelector(SEL.body);
    if (!p) return null;
    const clone = p.cloneNode(true);
    clone.querySelectorAll(SEL.edited).forEach((s) => s.remove());
    return norm(clone.textContent);
  }

  function messageKeyOf(el) {
    const key = {};
    const urn = el.getAttribute('data-event-urn');
    if (urn) key.urn = urn;
    key.text = bodyText(el) || '';
    return key;
  }

  function matchMessage(doc, key) {
    const all = doc.querySelectorAll(SEL.item);
    if (!all.length) return { ok: false, reason: 'selector_missing' };
    const own = ownMessages(doc);
    const want = norm(key.text);
    if (key.urn) {
      const el = own.find((e) => e.getAttribute('data-event-urn') === key.urn);
      if (el) return bodyText(el) === want ? { ok: true, el } : { ok: false, reason: 'not_found' };
    }
    const hits = own.filter((e) => bodyText(e) === want);
    if (hits.length === 1) return { ok: true, el: hits[0] };
    return { ok: false, reason: hits.length ? 'ambiguous' : 'not_found' };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Poll for fn() to be truthy: check now, then every 50 ms until waitMs.
  async function waitFor(fn, waitMs) {
    const end = Date.now() + waitMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(50);
    }
  }

  // Put text into a contenteditable the way LinkedIn's editor accepts it (verified live:
  // selectAll + insertText). Fallback for environments without execCommand.
  function setEditable(doc, ed, text) {
    ed.focus && ed.focus();
    let done = false;
    try {
      if (typeof doc.execCommand === 'function' && doc.execCommand('selectAll')) {
        done = doc.execCommand('insertText', false, text);
      }
    } catch (_) { done = false; }
    if (!done) {
      ed.innerHTML = '';
      const p = doc.createElement('p');
      p.textContent = text;
      ed.appendChild(p);
      ed.dispatchEvent(new (doc.defaultView.InputEvent || doc.defaultView.Event)('input', { bubbles: true }));
    }
  }

  // Edit the owner's own message `el` so its whole text becomes `text`.
  async function editMessage(doc, el, text, opts = {}) {
    const delay = opts.delay || sleep;
    const rand = opts.rand || Math.random;
    const waitMs = opts.waitMs == null ? 3000 : opts.waitMs;
    const urn = el.getAttribute('data-event-urn');
    await delay(1000 + rand() * 2000);

    // Refuse if LinkedIn is already mid-edit or a menu is open: the next steps could act on it.
    if (doc.querySelector(SEL.editForm) || doc.querySelector(SEL.openMenu)) return { ok: false, reason: 'busy' };
    const trigger = el.querySelector(SEL.optionsTrigger);
    if (!trigger) return { ok: false, reason: 'edit_control_missing' };
    trigger.click();
    // The only open menu now is the one this trigger opened (none was open before the click).
    const editItem = await waitFor(() => {
      const menus = doc.querySelectorAll(SEL.openMenu);
      if (menus.length !== 1) return null;
      return [...menus[0].querySelectorAll(SEL.menuItem)].find((i) => norm(i.textContent) === 'Edit');
    }, waitMs);
    if (!editItem) {
      if (typeof doc.body.click === 'function') doc.body.click();
      return { ok: false, reason: 'edit_control_missing' };
    }
    editItem.click();

    const form = await waitFor(() => doc.querySelector(SEL.editForm), waitMs);
    const ed = form && form.querySelector(SEL.composer);
    const save = form && form.querySelector(SEL.editSave);
    if (!ed || !save) return { ok: false, reason: 'edit_control_missing' };
    // Only replace text we can prove belongs to the bombed message.
    if (loose(editorText(ed)) !== loose(bodyText(el))) {
      ed.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return { ok: false, reason: 'edit_mismatch' };
    }
    setEditable(doc, ed, text);
    save.click();

    const want = norm(text);
    const ok = await waitFor(() => {
      const cur = (urn && doc.querySelector(SEL.item + '[data-event-urn="' + urn + '"]')) || el;
      return bodyText(cur) === want;
    }, waitMs);
    return ok ? { ok: true } : { ok: false, reason: 'verify_failed' };
  }

  const api = { SEL, norm, loose, editorText, bodyText, waitFor, setEditable, editMessage, findComposer, findSendButton, hasAttachment, ownMessages, messageKeyOf, matchMessage };
  root.LB = Object.assign(root.LB || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
