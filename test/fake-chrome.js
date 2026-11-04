// Minimal in-memory chrome.* for background tests.
function fakeChrome({ tabs = [], explodeReply = { ok: true } } = {}) {
  const store = {};
  const alarms = new Map();
  const sent = [];
  const created = [];
  const removed = [];
  let nextTab = 100;
  const c = {
    _store: store, _alarms: alarms, _sent: sent, _created: created, _removed: removed, _tabs: tabs, badge: '',
    explodeReply,
    storage: { local: {
      get: async (k) => (k == null ? { ...store } : { [k]: store[k] }),
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
    } },
    alarms: {
      create: (name, info) => { alarms.set(name, info); },
      clear: async (name) => alarms.delete(name),
      clearAll: async () => { alarms.clear(); return true; },
      onAlarm: { addListener() {} },
    },
    tabs: {
      query: async () => tabs.map((t) => ({ ...t })),
      create: async (props) => {
        const t = { id: nextTab++, url: props.url, active: props.active, status: 'complete' };
        tabs.push(t); created.push(t);
        return t;
      },
      get: async (id) => tabs.find((t) => t.id === id),
      remove: async (id) => { removed.push(id); const i = tabs.findIndex((t) => t.id === id); if (i >= 0) tabs.splice(i, 1); },
      sendMessage: async (tabId, msg) => { sent.push({ tabId, msg }); return c.explodeReply; },
      onUpdated: { addListener() {}, removeListener() {} },
    },
    action: { setBadgeText: async ({ text }) => { c.badge = text; }, setBadgeBackgroundColor: async () => {} },
    runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
  };
  return c;
}
module.exports = { fakeChrome };
