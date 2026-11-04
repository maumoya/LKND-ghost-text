// Timer values, tag line, explosion text and the late-fire rule.
(function (root) {
  const TIMERS = [20, 60, 300, 1800];
  const EXPLOSION_TEXT = '💬💣💨';
  const LATE_LIMIT_MS = 55 * 60 * 1000;

  function tagLine(seconds) {
    let amount;
    if (seconds < 60) {
      amount = seconds + (seconds === 1 ? ' second' : ' seconds');
    } else {
      const m = Math.round(seconds / 60);
      amount = m + (m === 1 ? ' minute' : ' minutes');
    }
    return 'This message will self-destruct in ' + amount + '. 💣';
  }

  function fireAt(sentAt, seconds) {
    return sentAt + seconds * 1000;
  }

  function lateFireDecision(now, sentAt) {
    return now - sentAt <= LATE_LIMIT_MS ? 'fire' : 'missed';
  }

  const api = { TIMERS, EXPLOSION_TEXT, LATE_LIMIT_MS, tagLine, fireAt, lateFireDecision };
  root.LB = Object.assign(root.LB || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
