// Content script for linkedin.com/messaging: the 💣 button, the timer menu, sending with the
// tag line, the countdown ring and the explosion (edit own message to 💬💣💨).
// No network calls: it talks only to its own background via chrome.runtime messages.
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const LB = node
    ? Object.assign({}, require('./lib/timers.js'), require('./lib/bombs.js'), require('./lib/ring.js'), require('./lib/dom.js'))
    : root.LB;

  const LABELS = { 20: '20s', 60: '1m', 300: '5m', 1800: '30m' };
  const STYLE = [
    '.lb-wrap{position:relative;display:inline-flex;align-items:center}',
    '.lb-bomb{background:none;border:0;cursor:pointer;font-size:18px;padding:4px 6px;border-radius:50%}',
    '.lb-bomb:hover{background:rgba(0,0,0,.08)}',
    '.lb-menu{position:absolute;bottom:36px;right:0;background:#fff;border:1px solid #ddd;border-radius:8px;',
    'box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px;display:flex;gap:4px;z-index:9999}',
    '.lb-menu[hidden]{display:none}',
    '.lb-menu button{border:0;background:#f3f2ef;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:600}',
    '.lb-menu button:hover{background:#e8590c;color:#fff}',
    '.lb-ring{margin-left:6px;vertical-align:middle;flex:none}',
    '.lb-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;',
    'padding:10px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif;z-index:10000;max-width:420px}',
  ].join('');

  function composerText(ed) {
    return LB.editorText(ed);
  }

  function conversationUrl(href) {
    try {
      const u = new URL(href);
      return u.origin + u.pathname;
    } catch (_) {
      return String(href).split(/[?#]/)[0];
    }
  }

  function install(doc, chromeLike, opts = {}) {
    if (doc.__lb) {
      doc.__lb.ensureButton();
      return doc.__lb;
    }
    const runtime = chromeLike.runtime;
    const now = opts.now || Date.now;
    const later = opts.setTimeout || setTimeout;
    const every = opts.setInterval || setInterval;
    const stop = opts.clearInterval || clearInterval;
    const waitMs = opts.waitMs == null ? 10000 : opts.waitMs;
    const url = () => conversationUrl(opts.url || (doc.defaultView && doc.defaultView.location.href) || '');

    function send(msg) {
      try {
        return Promise.resolve(runtime.sendMessage(msg)).catch(() => ({ ok: false }));
      } catch (_) {
        return Promise.resolve({ ok: false });
      }
    }

    function addStyle() {
      if (doc.getElementById('lb-style')) return;
      const s = doc.createElement('style');
      s.id = 'lb-style';
      s.textContent = STYLE;
      (doc.head || doc.documentElement).appendChild(s);
    }

    function ensureButton() {
      if (doc.querySelector('.lb-bomb')) return;
      const form = doc.querySelector(LB.SEL.form + ':not(' + LB.SEL.editForm + ')');
      const footer = form && form.querySelector(LB.SEL.footer);
      if (!footer) return;
      addStyle();
      const wrap = doc.createElement('span');
      wrap.className = 'lb-wrap';
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'lb-bomb';
      btn.title = 'Send as self-destructing message';
      btn.setAttribute('aria-label', 'Send as self-destructing message');
      btn.textContent = '💣';
      const menu = doc.createElement('div');
      menu.className = 'lb-menu';
      menu.hidden = true;
      for (const s of LB.TIMERS) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.dataset.seconds = String(s);
        b.textContent = LABELS[s] || s + 's';
        b.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          menu.hidden = true;
          choose(s);
        });
        menu.appendChild(b);
      }
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      wrap.appendChild(menu);
      wrap.appendChild(btn);
      const anchor = footer.querySelector(LB.SEL.sendButton) || footer.querySelector('.msg-form__send-toggle');
      // Live, the send toggle sits inside LinkedIn's hoverable trigger: go outside it, or a 💣
      // click also opens LinkedIn's send-options dropdown.
      const spot = anchor && (anchor.closest('.artdeco-hoverable-trigger') || anchor);
      if (spot && footer.contains(spot)) spot.parentNode.insertBefore(wrap, spot);
      else footer.appendChild(wrap);
    }

    function drawRing(el, bomb) {
      if (!el || el.querySelector('svg.lb-ring')) return;
      const host = el.querySelector(LB.SEL.bubble) || el;
      const ring = LB.makeRing(doc, LB.ringFraction(now(), bomb.sentAt, bomb.fireAt));
      host.appendChild(ring);
      const h = every(() => {
        const f = LB.ringFraction(now(), bomb.sentAt, bomb.fireAt);
        LB.setRing(ring, f);
        if (f >= 1 || !ring.isConnected) {
          ring.remove();
          stop(h);
        }
      }, 250);
    }

    function pressEnter(ed) {
      const KE = doc.defaultView.KeyboardEvent;
      for (const type of ['keydown', 'keypress']) {
        ed.dispatchEvent(new KE(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
    }

    const SAY = {
      selector_missing: 'LKND Ghost Text: could not find the message box. Nothing was sent.',
      empty: 'LKND Ghost Text: type a message first.',
      attachment: 'LKND Ghost Text: text only. Remove the attachment to send a bomb.',
      send_not_seen: 'LKND Ghost Text: the message did not appear as sent. Your text is back in the box, no timer started.',
    };

    function toast(text) {
      addStyle();
      const old = doc.querySelector('.lb-toast');
      if (old) old.remove();
      const t = doc.createElement('div');
      t.className = 'lb-toast';
      t.setAttribute('role', 'alert');
      t.textContent = text;
      doc.body.appendChild(t);
      later(() => t.remove(), 6000);
    }

    // A send that did not happen is not silent: toast on the page, failed entry on the badge.
    function refuse(reason, text) {
      toast(SAY[reason] || 'LKND Ghost Text: ' + reason);
      if (reason !== 'empty') send({ type: 'sendFailed', reason, preview: (text || '').split('\n')[0].slice(0, 40) });
      return { ok: false, reason };
    }

    const urnOf = (e) => e.getAttribute('data-event-urn');

    async function choose(seconds) {
      const ed = LB.findComposer(doc);
      if (!ed) return refuse('selector_missing');
      const text = composerText(ed);
      if (!text) return refuse('empty');
      if (LB.hasAttachment(doc)) return refuse('attachment', text);
      const tag = LB.tagLine(seconds);
      // Messages are told apart by URN: LinkedIn may re-render the list, so element identity lies.
      const before = new Set(LB.ownMessages(doc).map(urnOf));
      LB.setEditable(doc, ed, text + '\n' + tag);
      const sendBtn = LB.findSendButton(doc);
      if (sendBtn) sendBtn.click();
      else pressEnter(ed);
      const el = await LB.waitFor(() => {
        const fresh = LB.ownMessages(doc).filter((e) => urnOf(e) && !before.has(urnOf(e)) && (LB.bodyText(e) || '').endsWith(tag));
        return fresh[fresh.length - 1];
      }, waitMs);
      if (!el) {
        // Still unsent in the box: put the owner's text back without the tag line.
        const cur = LB.findComposer(doc);
        if (cur && composerText(cur).endsWith(tag)) LB.setEditable(doc, cur, text);
        return refuse('send_not_seen', text);
      }
      const bomb = LB.newBomb({ conversationUrl: url(), key: LB.messageKeyOf(el), sentAt: now(), seconds });
      await send({ type: 'arm', bomb });
      later(() => send({ type: 'fireNow', id: bomb.id }), seconds * 1000);
      drawRing(el, bomb);
      return { ok: true, bomb };
    }

    async function explode(bomb) {
      const key = bomb.key || {};
      // Already exploded (a retry after the edit landed): that is success, not not_found.
      const done = () => {
        const el = key.urn && LB.ownMessages(doc).find((e) => urnOf(e) === key.urn);
        return el && LB.bodyText(el) === LB.EXPLOSION_TEXT;
      };
      // A freshly opened tab renders messages progressively: wait until the target is there.
      const m = await LB.waitFor(() => {
        if (done()) return { done: true };
        const r = LB.matchMessage(doc, key);
        return r.ok || r.reason === 'ambiguous' ? r : null;
      }, waitMs) || LB.matchMessage(doc, key);
      if (m.done) return { ok: true };
      if (!m.ok) return { ok: false, reason: m.reason };
      const ring = m.el.querySelector('svg.lb-ring');
      if (ring) ring.remove();
      return LB.editMessage(doc, m.el, LB.EXPLOSION_TEXT, { delay: opts.delay, waitMs: Math.min(waitMs, 5000) });
    }

    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((msg, _sender, reply) => {
        if (!msg || msg.type !== 'explode') return false;
        explode(msg.bomb || {}).then(reply, (e) => reply({ ok: false, reason: 'error: ' + (e && e.message ? e.message : String(e)) }));
        return true;
      });
    }

    // Rings survive a page reload: redraw for pending bombs whose message is on screen.
    send({ type: 'list' }).then((r) => {
      const bombs = (r && r.bombs) || {};
      for (const b of Object.values(bombs)) {
        if (b.status !== 'pending' || !b.key || !b.key.urn) continue;
        const el = LB.ownMessages(doc).find((e) => e.getAttribute('data-event-urn') === b.key.urn);
        if (el) drawRing(el, b);
      }
    });

    ensureButton();
    const api = { choose, explode, ensureButton };
    doc.__lb = api;
    return api;
  }

  if (node) {
    module.exports = { install, composerText, conversationUrl };
  } else if (root.chrome && root.chrome.runtime && root.chrome.runtime.id) {
    install(root.document, root.chrome);
    // LinkedIn is a single-page app: the composer comes and goes, so keep the button there.
    new root.MutationObserver(() => install(root.document, root.chrome)).observe(root.document.body, { childList: true, subtree: true });
  }
})(globalThis);
