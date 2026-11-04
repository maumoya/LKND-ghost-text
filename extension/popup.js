// Popup: ticking bombs with countdown + cancel, a kill switch, and missed/failed bombs with reasons.
// Text only (textContent), so message text can never inject markup.
(function (root) {
  function left(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return s >= 60 ? Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's' : s + 's';
  }

  function preview(b) {
    const t = (b.key && b.key.text) || '';
    const first = t.split('\n')[0];
    return first.length > 40 ? first.slice(0, 40) + '…' : first || '(message)';
  }

  function row(doc, cls, parts) {
    const li = doc.createElement('li');
    li.className = cls;
    for (const [c, text] of parts) {
      const s = doc.createElement('span');
      s.className = c;
      s.textContent = text;
      li.appendChild(s);
    }
    return li;
  }

  // Render the lists. onCancel(id) is called by each pending row's Cancel button.
  function render(doc, bombs, now, onCancel) {
    const all = Object.values(bombs || {});
    const pending = all.filter((b) => b.status === 'pending').sort((a, b) => a.fireAt - b.fireAt);
    const ended = all
      .filter((b) => b.status === 'missed' || b.status === 'failed')
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
      .slice(0, 20);

    const pl = doc.getElementById('pending');
    pl.textContent = '';
    for (const b of pending) {
      const li = row(doc, 'bomb', [['txt', preview(b)], ['when', left(b.fireAt - now)]]);
      const c = doc.createElement('button');
      c.type = 'button';
      c.textContent = 'Cancel';
      c.dataset.id = b.id;
      c.addEventListener('click', () => onCancel(b.id));
      li.appendChild(c);
      pl.appendChild(li);
    }
    if (!pending.length) pl.appendChild(row(doc, 'empty', [['empty', 'No bombs ticking.']]));
    doc.getElementById('cancelAll').disabled = !pending.length;

    const el = doc.getElementById('ended');
    el.textContent = '';
    for (const b of ended) el.appendChild(row(doc, 'bomb', [['txt', preview(b)], ['reason', b.status + ': ' + (b.reason || 'unknown')]]));
    if (!ended.length) el.appendChild(row(doc, 'empty', [['empty', 'Nothing missed.']]));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { render, left };
  } else if (root.chrome && root.chrome.runtime && root.chrome.runtime.id) {
    const doc = root.document;
    let bombs = {};
    const refresh = async () => {
      const r = await root.chrome.runtime.sendMessage({ type: 'list' });
      bombs = (r && r.bombs) || {};
      draw();
    };
    const cancel = async (id) => { await root.chrome.runtime.sendMessage({ type: 'cancel', id }); refresh(); };
    const draw = () => render(doc, bombs, Date.now(), cancel);
    doc.getElementById('cancelAll').addEventListener('click', async () => {
      await root.chrome.runtime.sendMessage({ type: 'cancelAll' });
      refresh();
    });
    root.chrome.runtime.sendMessage({ type: 'popupOpened' }).then(refresh, refresh);
    setInterval(draw, 1000);
    setInterval(refresh, 5000);
  }
})(globalThis);
