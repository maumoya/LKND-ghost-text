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

  const api = { SEL, norm, findComposer, findSendButton, hasAttachment, ownMessages, messageKeyOf, matchMessage };
  root.LB = Object.assign(root.LB || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
