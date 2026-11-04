// Emulates LinkedIn's live edit flow on the fixture (as recorded in docs/DOM_NOTES.md):
// options trigger -> open dropdown -> "Edit" -> main form turns into edit form -> Save writes body + "(Edited)".
function wireFakeLinkedIn(doc, { noEdit = false, breakSave = false, wrongEdit = false, noSend = false, rerenderOnSend = false } = {}) {
  doc.addEventListener('click', (ev) => {
    const trig = ev.target.closest('.msg-s-event-listitem__options-trigger');
    if (trig) {
      doc.querySelectorAll('.artdeco-dropdown__content--is-open').forEach((m) => m.remove());
      const menu = doc.createElement('div');
      menu.className = 'artdeco-dropdown__content artdeco-dropdown__content--is-open';
      for (const label of ['Forward', 'Share via email', 'Delete', ...(noEdit ? [] : ['Edit'])]) {
        const it = doc.createElement('div');
        it.className = 'artdeco-dropdown__item';
        it.textContent = label;
        it.dataset.label = label;
        menu.appendChild(it);
      }
      menu._item = trig.closest('.msg-s-event-listitem');
      doc.body.appendChild(menu);
      return;
    }
    const it = ev.target.closest('.artdeco-dropdown__item');
    if (it && it.dataset.label === 'Edit') {
      const menu = it.closest('.artdeco-dropdown__content--is-open');
      const item = menu._item;
      menu.remove();
      const form = doc.querySelector('form.msg-form');
      form.classList.add('msg-edit-form__base-form');
      const body = item.querySelector('p.msg-s-event-listitem__body').cloneNode(true);
      body.querySelectorAll('span.pl1').forEach((s) => s.remove());
      form.querySelector('.msg-form__contenteditable').innerHTML = '<p>' + (wrongEdit ? 'some other message' : body.textContent) + '</p>';
      const save = doc.createElement('button');
      save.type = 'button';
      save.className = 'msg-edit-form__save-button';
      save.textContent = 'Save';
      save._item = item;
      form.appendChild(save);
      return;
    }
    const save = ev.target.closest('.msg-edit-form__save-button');
    if (save) {
      const form = save.closest('form');
      const ed = form.querySelector('.msg-form__contenteditable');
      if (!breakSave) {
        const p = save._item.querySelector('p.msg-s-event-listitem__body');
        p.textContent = ed.textContent;
        const s = doc.createElement('span');
        s.className = 't-14 t-black--light t-normal pl1';
        s.textContent = '(Edited)';
        p.appendChild(s);
      }
      ed.innerHTML = '<p><br></p>';
      form.classList.remove('msg-edit-form__base-form');
      save.remove();
    }
  });
  // Sending, the owner's Enter mode plus a send button when one exists: post the composer
  // text as a new own message (paragraphs joined by newlines) and clear the composer.
  let n = 0;
  const sent = [];
  function post(form) {
    if (noSend) return;
    const ed = form.querySelector('.msg-form__contenteditable');
    const ps = [...ed.querySelectorAll('p')];
    const text = (ps.length ? ps.map((p) => p.textContent).join('\n') : ed.textContent).trim();
    sent.push(text);
    const li = doc.createElement('li');
    li.innerHTML = '<div class="msg-s-event-listitem"><div class="msg-s-event-listitem__message-bubble">' +
      '<p class="msg-s-event-listitem__body"></p></div>' +
      '<button class="msg-s-event-listitem__options-trigger" type="button"></button></div>';
    const item = li.firstChild;
    item.setAttribute('data-event-urn', 'urn:li:msg_message:(urn:li:fsd_profile:OWNER,2-NEW' + ++n + ')');
    item.querySelector('p').textContent = text;
    const list = doc.querySelector('.msg-s-message-list-content');
    list.appendChild(li);
    ed.innerHTML = '<p><br></p>';
    // LinkedIn re-renders the list: every message element is replaced by a fresh copy.
    if (rerenderOnSend) [...list.children].forEach((c) => c.replaceWith(c.cloneNode(true)));
  }
  doc.addEventListener('keydown', (ev) => {
    const ed = ev.target.closest && ev.target.closest('.msg-form__contenteditable');
    if (ed && ev.key === 'Enter' && !ev.shiftKey && !ed.closest('.msg-edit-form__base-form')) post(ed.closest('form'));
  });
  doc.addEventListener('click', (ev) => {
    const b = ev.target.closest('.msg-form__send-button');
    if (b) post(b.closest('form'));
  });
  doc._sent = sent;
  return doc;
}
module.exports = { wireFakeLinkedIn };
