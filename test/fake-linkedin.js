// Emulates LinkedIn's live edit flow on the fixture (as recorded in docs/DOM_NOTES.md):
// options trigger -> open dropdown -> "Edit" -> main form turns into edit form -> Save writes body + "(Edited)".
function wireFakeLinkedIn(doc, { noEdit = false, breakSave = false } = {}) {
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
      form.querySelector('.msg-form__contenteditable').innerHTML = '<p>' + body.textContent + '</p>';
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
  return doc;
}
module.exports = { wireFakeLinkedIn };
