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
  ].join('');

  function composerText(ed) {
    const ps = [...ed.querySelectorAll('p')];
    const t = ps.length ? ps.map((p) => p.textContent).join('\n') : ed.textContent;
    return LB.norm(t);
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
          menu.hidden = true;
          choose(s);
        });
        menu.appendChild(b);
      }
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        menu.hidden = !menu.hidden;
      });
      wrap.appendChild(menu);
      wrap.appendChild(btn);
      const anchor = footer.querySelector(LB.SEL.sendButton) || footer.querySelector('.msg-form__send-toggle');
      if (anchor) anchor.parentNode.insertBefore(wrap, anchor);
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

    async function choose(seconds) {
      const ed = LB.findComposer(doc);
      if (!ed) return { ok: false, reason: 'selector_missing' };
      const text = composerText(ed);
      if (!text) return { ok: false, reason: 'empty' };
      if (LB.hasAttachment(doc)) return { ok: false, reason: 'attachment' };
      const tag = LB.tagLine(seconds);
      const before = new Set(LB.ownMessages(doc));
      LB.setEditable(doc, ed, text + '\n' + tag);
      const sendBtn = LB.findSendButton(doc);
      if (sendBtn) sendBtn.click();
      else pressEnter(ed);
      const el = await LB.waitFor(
        () => LB.ownMessages(doc).find((e) => !before.has(e) && (LB.bodyText(e) || '').endsWith(tag)),
        waitMs,
      );
      if (!el) return { ok: false, reason: 'send_not_seen' };
      const bomb = LB.newBomb({ conversationUrl: url(), key: LB.messageKeyOf(el), sentAt: now(), seconds });
      await send({ type: 'arm', bomb });
      later(() => send({ type: 'fireNow', id: bomb.id }), seconds * 1000);
      drawRing(el, bomb);
      return { ok: true, bomb };
    }

    async function explode(bomb) {
      await LB.waitFor(() => doc.querySelector(LB.SEL.item), waitMs);
      const m = LB.matchMessage(doc, bomb.key || {});
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
