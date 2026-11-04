// Bomb record and its one-way state machine: pending -> done | failed | missed | cancelled.
(function (root) {
  const EVENTS = { done: 'done', failed: 'failed', missed: 'missed', cancel: 'cancelled' };

  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function newBomb({ conversationUrl, key, sentAt, seconds }) {
    return { id: newId(), conversationUrl, key, sentAt, seconds, fireAt: sentAt + seconds * 1000, status: 'pending' };
  }

  function transition(bomb, event, reason) {
    if (!(event in EVENTS)) throw new Error('unknown event ' + event);
    if (bomb.status !== 'pending') throw new Error('bomb ' + bomb.id + ' is ' + bomb.status);
    const next = Object.assign({}, bomb, { status: EVENTS[event] });
    if (reason) next.reason = reason;
    return next;
  }

  const api = { newBomb, transition };
  root.LB = Object.assign(root.LB || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
