// Service worker: stores bombs, schedules them with chrome.alarms, routes the explosion
// to the chat tab (or a quiet background tab it opens and closes), and keeps the badge.
// No network calls: everything is chrome.* local APIs.
if (typeof importScripts === 'function') importScripts('lib/timers.js', 'lib/bombs.js');

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('./lib/timers.js') : root.LB;
  const B = typeof module !== 'undefined' && module.exports ? require('./lib/bombs.js') : root.LB;

  function makeBackground(chrome, opts = {}) {
    const now = opts.now || Date.now;
    const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const firing = new Set();
    let chain = Promise.resolve();

    // Serialise every read-modify-write of storage so handlers never overwrite each other.
    function mutate(fn) {
      const run = chain.then(async () => {
        const got = await chrome.storage.local.get(null);
        const state = { bombs: got.bombs || {}, seenAt: got.seenAt || 0 };
        const out = await fn(state);
        await chrome.storage.local.set({ bombs: state.bombs, seenAt: state.seenAt });
        return out;
      });
      chain = run.catch(() => {});
      return run;
    }

    async function getBombs() {
      await chain;
      return (await chrome.storage.local.get('bombs')).bombs || {};
    }

    async function updateBadge() {
      await chain;
      const got = await chrome.storage.local.get(null);
      const seenAt = got.seenAt || 0;
      const n = Object.values(got.bombs || {}).filter(
        (b) => (b.status === 'missed' || b.status === 'failed') && (b.endedAt || 0) > seenAt,
      ).length;
      await chrome.action.setBadgeText({ text: n ? String(n) : '' });
      if (n && chrome.action.setBadgeBackgroundColor) await chrome.action.setBadgeBackgroundColor({ color: '#c92a2a' });
    }

    async function finish(id, event, reason) {
      await mutate((s) => {
        const b = s.bombs[id];
        if (!b || b.status !== 'pending') return;
        s.bombs[id] = Object.assign(B.transition(b, event, reason), { endedAt: now() });
      });
      await updateBadge();
    }

    async function findTab(url) {
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url && t.url.startsWith(url));
    }

    async function waitComplete(tabId) {
      for (let i = 0; i < 60; i++) {
        const t = await chrome.tabs.get(tabId);
        if (!t) return false;
        if (t.status === 'complete') return true;
        await sleep(500);
      }
      return false;
    }

    async function explodeIn(tabId, bomb) {
      for (let i = 0; i < 10; i++) {
        try {
          const r = await chrome.tabs.sendMessage(tabId, { type: 'explode', bomb });
          if (r && typeof r.ok === 'boolean') return r;
        } catch (_) { /* content script not ready yet */ }
        await sleep(1000);
      }
      return { ok: false, reason: 'no_content_script' };
    }

    const WATCHDOG = 'lb-watchdog';

    // Close a tab this extension opened for a bomb and forget it (survives worker restarts).
    async function closeCreatedTab(id) {
      const tabId = ((await getBombs())[id] || {}).createdTabId;
      if (tabId == null) return;
      try { await chrome.tabs.remove(tabId); } catch (_) { /* already closed */ }
      await mutate((s) => { if (s.bombs[id]) delete s.bombs[id].createdTabId; });
    }

    // Runs on every worker start and every minute: fire overdue bombs a dead worker dropped,
    // close tabs a dead worker left open, keep the watchdog alarm alive.
    async function sweep() {
      chrome.alarms.create(WATCHDOG, { periodInMinutes: 1 });
      for (const b of Object.values(await getBombs())) {
        if (b.status === 'pending') {
          if (b.fireAt > now()) chrome.alarms.create(b.id, { when: b.fireAt });
          else await onAlarm(b.id);
        } else if (b.createdTabId != null && !firing.has(b.id)) {
          await closeCreatedTab(b.id);
        }
      }
      await updateBadge();
    }

    async function onAlarm(id) {
      if (id === WATCHDOG) return sweep();
      if (firing.has(id)) return;
      firing.add(id);
      try {
        const bomb = (await getBombs())[id];
        if (!bomb || bomb.status !== 'pending') return;
        if (T.lateFireDecision(now(), bomb.sentAt) === 'missed') return await finish(id, 'missed', 'late');
        let tab = await findTab(bomb.conversationUrl);
        if (!tab) {
          tab = await chrome.tabs.create({ url: bomb.conversationUrl, active: false });
          await mutate((s) => { if (s.bombs[id]) s.bombs[id].createdTabId = tab.id; });
          if (!(await waitComplete(tab.id))) return await finish(id, 'failed', 'tab_load_failed');
        }
        const r = await explodeIn(tab.id, bomb);
        await finish(id, r.ok ? 'done' : 'failed', r.ok ? undefined : r.reason || 'unknown');
      } catch (e) {
        await finish(id, 'failed', 'error: ' + (e && e.message ? e.message : String(e)));
      } finally {
        try { await closeCreatedTab(id); } catch (_) { /* best effort; the next sweep retries */ }
        firing.delete(id);
      }
    }

    const onStartup = sweep;

    async function handleMessage(msg) {
      switch (msg && msg.type) {
        case 'arm': {
          const b = msg.bomb;
          await mutate((s) => { s.bombs[b.id] = b; });
          chrome.alarms.create(b.id, { when: b.fireAt });
          chrome.alarms.create(WATCHDOG, { periodInMinutes: 1 });
          return { ok: true };
        }
        case 'sendFailed': {
          // A bomb that never went out: recorded as failed so the badge and popup show it.
          const id = 'f-' + now() + '-' + Math.random().toString(36).slice(2, 8);
          const preview = String(msg.preview || '').slice(0, 40);
          await mutate((s) => {
            s.bombs[id] = { id, status: 'failed', reason: String(msg.reason || 'unknown'), sentAt: now(), endedAt: now(), key: { text: preview } };
          });
          await updateBadge();
          return { ok: true };
        }
        case 'result':
          await finish(msg.id, msg.ok ? 'done' : 'failed', msg.ok ? undefined : msg.reason);
          return { ok: true };
        case 'fireNow':
          await onAlarm(msg.id);
          return { ok: true };
        case 'cancel':
          await chrome.alarms.clear(msg.id);
          await finish(msg.id, 'cancel');
          return { ok: true };
        case 'cancelAll': {
          await chrome.alarms.clearAll();
          const ids = Object.values(await getBombs()).filter((b) => b.status === 'pending').map((b) => b.id);
          for (const id of ids) await finish(id, 'cancel');
          return { ok: true };
        }
        case 'popupOpened':
          await mutate((s) => { s.seenAt = now(); });
          await updateBadge();
          return { ok: true };
        case 'list':
          return { ok: true, bombs: await getBombs() };
        default:
          return { ok: false, reason: 'unknown_message' };
      }
    }

    return { handleMessage, onAlarm, onStartup, sweep, updateBadge, getBombs };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeBackground };
  } else if (root.chrome && root.chrome.runtime && root.chrome.runtime.id) {
    const bg = makeBackground(root.chrome);
    root.chrome.alarms.onAlarm.addListener((a) => { bg.onAlarm(a.name); });
    root.chrome.runtime.onStartup.addListener(() => { bg.onStartup(); });
    root.chrome.runtime.onInstalled.addListener(() => { bg.onStartup(); });
    // Every worker start (not only browser start): an MV3 worker can die mid-countdown.
    bg.sweep();
    root.chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      bg.handleMessage(msg).then(reply, (e) => reply({ ok: false, reason: String(e) }));
      return true;
    });
  }
})(globalThis);
