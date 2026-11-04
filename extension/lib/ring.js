// WhatsApp-style shrinking countdown ring (owner's side only).
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const R = 8;
  const C = 2 * Math.PI * R;

  function ringFraction(now, sentAt, fireAt) {
    const total = fireAt - sentAt;
    if (total <= 0) return 0;
    const f = (fireAt - now) / total;
    return Math.max(0, Math.min(1, f));
  }

  function setRing(svg, fraction) {
    const arc = svg.querySelector('.lb-ring__arc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(C * (1 - fraction)));
  }

  function makeRing(doc, fraction) {
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'lb-ring');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-label', 'Self-destruct countdown');
    const track = doc.createElementNS(NS, 'circle');
    const arc = doc.createElementNS(NS, 'circle');
    for (const c of [track, arc]) {
      c.setAttribute('cx', '10'); c.setAttribute('cy', '10'); c.setAttribute('r', String(R));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '2.5');
    }
    track.setAttribute('stroke', 'rgba(0,0,0,0.12)');
    arc.setAttribute('class', 'lb-ring__arc');
    arc.setAttribute('stroke', '#e8590c');
    arc.setAttribute('stroke-dasharray', String(C));
    arc.setAttribute('transform', 'rotate(-90 10 10)');
    svg.appendChild(track);
    svg.appendChild(arc);
    setRing(svg, fraction);
    return svg;
  }

  const api = { ringFraction, makeRing, setRing };
  root.LB = Object.assign(root.LB || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
