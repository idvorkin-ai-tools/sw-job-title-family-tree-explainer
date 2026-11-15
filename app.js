// Job title family tree: lane-folding map with a lineage lens.
// Model: families are lanes on a shared time axis. Folding a lane narrows it to a strip of dots;
// no title or edge is ever removed. See the "How collapsing works" section in index.html.
(() => {
  const STRIP = 26, MINLANE = 150, MAXLANE = 236, CARD_H = 58, CARD_GAP = 6, ROW_PAD = 8, DOT_STEP = 10;
  const PREF = ['dev', 'ops', 'data', 'lead', 'net', 'sup', 'qa']; // who stays open when space runs out
  const $ = (s) => document.querySelector(s);
  const svgNS = 'http://www.w3.org/2000/svg';

  let D, N = {}, F = {}, parents = {}, children = {};
  let requested = [];  // families asked to be open, oldest first
  let effective = [];  // what actually fits, same order
  let sel = null;
  let pos = {};        // id -> {x,y,w,h,dot:boolean}
  const hoverable = matchMedia('(hover:hover) and (pointer:fine)').matches;

  fetch('data.json').then((r) => r.json()).then(init);

  function init(data) {
    D = data;
    D.families.forEach((f, i) => { F[f.id] = f; f.idx = i; });
    D.nodes.forEach((n) => { N[n.id] = n; parents[n.id] = []; children[n.id] = []; n.year = yearOf(n); });
    D.edges.forEach((e) => { parents[e.t].push(e); children[e.s].push(e); });
    const counts = {}; D.nodes.forEach((n) => (counts[n.family] = (counts[n.family] || 0) + 1));
    D.families.forEach((f) => (f.count = counts[f.id]));
    D.periods = [...new Set(D.nodes.map((n) => n.period))].sort((a, b) => a - b);

    $('#titles').innerHTML = D.nodes.slice().sort((a, b) => a.title.localeCompare(b.title))
      .map((n) => `<option value="${esc(n.title)}"></option>`).join('');
    $('#find').addEventListener('change', onFind);
    $('#find').addEventListener('keydown', (e) => { if (e.key === 'Enter') onFind(); });
    $('#openAll').onclick = () => { requested = PREF.slice().reverse(); commit(); };
    $('#foldAll').onclick = () => { requested = sel ? [N[sel].family] : []; commit(); };
    $('#fams').innerHTML = D.families.map((f) =>
      `<div class="famcard" style="--fc:${f.color}"><b>${esc(f.name)}</b> (${f.count} titles). ${esc(f.intro)}</div>`).join('');

    readHash();
    window.addEventListener('hashchange', () => { readHash(); });
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 120); });
    document.addEventListener('keydown', onKey);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  }

  function yearOf(n) {
    const m = n.date.match(/(\d{4})/); return m ? +m[1] : n.period;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------------------------------------------------------------- state + URL
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has('open')) requested = h.get('open').split(',').filter((x) => F[x]);
    else requested = PREF.slice().reverse(); // default: as many as fit, Development last to fold
    sel = N[h.get('sel')] ? h.get('sel') : null;
    render(); renderPanel();
  }
  function commit() { // user action: requested becomes what they now see, written to the URL
    render();
    requested = effective.slice();
    const p = new URLSearchParams(); p.set('open', effective.join(','));
    if (sel) p.set('sel', sel);
    history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ','));
    renderPanel();
  }
  function toggle(fid) {
    if (requested.includes(fid) && effective.includes(fid)) requested = requested.filter((x) => x !== fid);
    else { requested = requested.filter((x) => x !== fid); requested.push(fid); }
    commit();
  }
  function select(id, opts = {}) {
    sel = id;
    if (id) {
      const fid = N[id].family;
      if (!effective.includes(fid)) { requested = requested.filter((x) => x !== fid); requested.push(fid); }
    }
    commit();
    if (id && opts.scroll !== false) scrollToNode(id);
    if (id && opts.focus) { const el = document.querySelector(`.card[data-id="${id}"]`); if (el) el.focus({ preventScroll: true }); }
  }

  // ---------------------------------------------------------------- fitting rule
  function fit(width) {
    const avail = width - gutter(width);
    const k = Math.max(1, Math.floor((avail - D.families.length * STRIP) / (MINLANE - STRIP)));
    let open = requested.filter((x, i, a) => F[x] && a.indexOf(x) === i);
    const keep = sel ? N[sel].family : null;
    if (keep) { open = open.filter((x) => x !== keep); open.push(keep); }
    if (open.length > k) open = open.slice(open.length - k); // oldest-opened fold first
    return D.families.map((f) => f.id).filter((x) => open.includes(x)); // lane order
  }
  function gutter(w) { return w < 500 ? 34 : 44; }

  // ---------------------------------------------------------------- lineage lens
  function closure(start, dir) { // solid edges only, visited set guards the two-way pairs
    const seen = new Set(), stack = [start];
    while (stack.length) {
      const x = stack.pop();
      for (const e of dir === 'up' ? parents[x] : children[x]) {
        if (e.kind !== 'grew') continue;
        const y = dir === 'up' ? e.s : e.t;
        if (y !== start && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
    return seen;
  }
  function lens() {
    if (!sel) return null;
    const up = closure(sel, 'up'), down = closure(sel, 'down');
    const near = new Set([...parents[sel].map((e) => e.s), ...children[sel].map((e) => e.t)]);
    return { up, down, near };
  }

  // ---------------------------------------------------------------- layout + render
  function render() {
    if (!D) return;
    const map = $('#map'), heads = $('#heads');
    const W = map.clientWidth || document.documentElement.clientWidth - 32;
    effective = fit(W);
    const G = gutter(W);
    const nOpen = effective.length, nShut = D.families.length - nOpen;
    const laneW = nOpen ? Math.min(MAXLANE, Math.floor((W - G - nShut * STRIP) / nOpen)) : 0;
    const lanes = {}; let x = G;
    D.families.forEach((f) => {
      const open = effective.includes(f.id);
      lanes[f.id] = { x, w: open ? laneW : STRIP, open }; x += open ? laneW : STRIP;
    });

    // cells: family x period, ordered by year then source order
    const cell = {};
    D.nodes.forEach((n) => { (cell[n.family + n.period] ||= []).push(n); });
    Object.values(cell).forEach((a) => a.sort((p, q) => p.year - q.year));
    const rows = {}; let y = 0;
    D.periods.forEach((p) => {
      let h = 30;
      D.families.forEach((f) => {
        const c = (cell[f.id + p] || []).length; if (!c) return;
        h = Math.max(h, lanes[f.id].open ? ROW_PAD * 2 + c * CARD_H + (c - 1) * CARD_GAP : ROW_PAD * 2 + c * DOT_STEP + 4);
      });
      rows[p] = { y, h }; y += h;
    });
    const H = y + 8;

    pos = {};
    D.families.forEach((f) => {
      const L = lanes[f.id];
      D.periods.forEach((p) => {
        (cell[f.id + p] || []).forEach((n, i) => {
          if (L.open) pos[n.id] = { x: L.x + 4, y: rows[p].y + ROW_PAD + i * (CARD_H + CARD_GAP), w: L.w - 8, h: CARD_H, dot: false };
          else pos[n.id] = { x: L.x + STRIP / 2, y: rows[p].y + ROW_PAD + 4 + i * DOT_STEP, w: 0, h: 0, dot: true };
        });
      });
    });

    // headers
    const anyShut = nShut > 0;
    heads.style.height = (anyShut ? 88 : 44) + 'px';
    heads.innerHTML = '';
    D.families.forEach((f) => {
      const L = lanes[f.id], b = document.createElement('button');
      b.type = 'button'; b.className = 'head ' + (L.open ? 'open' : 'shut');
      b.style.cssText = `left:${L.x}px;width:${L.w}px;--fc:${f.color}`;
      b.setAttribute('aria-expanded', L.open); b.setAttribute('aria-label', `${f.name}, ${f.count} titles, ${L.open ? 'open: fold it' : 'folded: open it'}`);
      b.innerHTML = L.open ? `<span class="sw" style="background:${f.color}"></span><span>${esc(f.short)} <span class="n">${f.count}</span></span><span class="chev"></span>`
        : `<span>${esc(f.short)} <span class="n">${f.count}</span></span>`;
      b.onclick = () => toggle(f.id);
      heads.appendChild(b);
    });

    // background bands, labels, strips, cards
    const L2 = lens();
    map.style.height = H + 'px';
    map.classList.toggle('focus', !!L2);
    [...map.querySelectorAll('.band,.plabel,.lanebg,.strip,.card')].forEach((e) => e.remove());
    const frag = document.createDocumentFragment();
    D.periods.forEach((p, i) => {
      const dec = p % 10 === 0;
      frag.appendChild(el('div', `band${dec ? ' decade' : ''}${Math.floor(p / 10) % 2 ? ' alt' : ''}`, `top:${rows[p].y}px;height:${rows[p].h}px`));
      const lab = el('div', 'plabel' + (dec ? ' decade' : ''), `top:${rows[p].y}px;width:${G}px`);
      lab.textContent = dec ? (G < 40 ? `'${String(p).slice(2)}s` : `${p}s`) : (G < 40 ? `'${String(p).slice(2)}` : String(p));
      frag.appendChild(lab);
    });
    D.families.forEach((f) => {
      const L = lanes[f.id];
      frag.appendChild(el('div', 'lanebg', `left:${L.x}px;width:${L.w}px`));
      if (!L.open) {
        const s = el('button', 'strip', `left:${L.x}px;width:${L.w}px;height:${H}px;--fc:${f.color}`);
        s.type = 'button'; s.tabIndex = -1; s.setAttribute('aria-hidden', 'true'); s.onclick = () => toggle(f.id);
        frag.appendChild(s);
      }
    });
    D.nodes.forEach((n) => {
      const P = pos[n.id]; if (P.dot) return;
      const f = F[n.family];
      const c = el('button', 'card' + (n.landmark ? ' lm' : ''), `left:${P.x}px;top:${P.y}px;width:${P.w}px;height:${P.h}px;--fc:${f.color}`);
      c.type = 'button'; c.dataset.id = n.id;
      if (L2) c.classList.add(n.id === sel ? 'sel' : L2.near.has(n.id) ? 'near' : (L2.up.has(n.id) || L2.down.has(n.id)) ? 'far' : 'dim');
      c.setAttribute('aria-pressed', n.id === sel);
      c.innerHTML = `<span class="t">${esc(n.short || n.title)}</span><span class="d">${esc(n.date)}</span>`;
      c.title = `${n.title} (${n.date})`;
      c.onclick = () => select(n.id === sel ? null : n.id, { scroll: false });
      frag.appendChild(c);
    });
    map.appendChild(frag);
    drawEdges(W, H, L2);
  }
  function el(tag, cls, css) { const e = document.createElement(tag); e.className = cls; e.style.cssText = css; return e; }

  function drawEdges(W, H, L2) {
    const svg = $('#edges');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('hoverable', hoverable);
    let defs = '<defs>';
    D.families.forEach((f) => {
      defs += `<marker id="m-${f.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${f.color}"/></marker>`;
    });
    defs += '</defs>';
    const lines = [];
    D.edges.forEach((e) => {
      const a = pos[e.s], b = pos[e.t], col = F[N[e.t].family].color;
      let op, w = 1.4;
      const touchesOpen = !a.dot || !b.dot;
      if (L2) {
        const direct = e.s === sel || e.t === sel;
        const upChain = e.kind === 'grew' && (e.t === sel || L2.up.has(e.t)) && L2.up.has(e.s);
        const downChain = e.kind === 'grew' && (e.s === sel || L2.down.has(e.s)) && L2.down.has(e.t);
        op = direct ? 1 : (upChain || downChain) ? 0.6 : 0.05;
        if (direct) w = 2.4; else if (upChain || downChain) w = 1.6;
      } else op = touchesOpen ? 0.55 : 0.14;
      const d = route(a, b);
      const arrow = touchesOpen || (L2 && op > 0.5) ? ` marker-end="url(#m-${N[e.t].family})"${e.both ? ` marker-start="url(#m-${N[e.t].family})"` : ''}` : '';
      lines.push(`<path d="${d}" stroke="${col}" stroke-opacity="${op}" stroke-width="${w}"${e.kind === 'influence' ? ' stroke-dasharray="5 4"' : ''}${arrow}/>`);
    });
    const dots = [];
    D.nodes.forEach((n) => {
      const P = pos[n.id]; if (!P.dot) return;
      let op = 1;
      if (L2) op = n.id === sel || L2.near.has(n.id) ? 1 : (L2.up.has(n.id) || L2.down.has(n.id)) ? 0.75 : 0.25;
      dots.push(`<circle class="dot" data-id="${n.id}" cx="${P.x}" cy="${P.y}" r="${n.landmark ? 4.2 : 3.2}" fill="${F[n.family].color}" fill-opacity="${op}"><title>${esc(n.title)} (${esc(n.date)})</title></circle>`);
    });
    svg.innerHTML = defs + lines.join('') + dots.join('');
    if (hoverable) svg.querySelectorAll('circle.dot').forEach((c) => (c.onclick = () => select(c.dataset.id)));
  }

  function route(a, b) { // pick anchors by relative position: edges run down, up and sideways
    const box = (p) => p.dot ? { l: p.x - 3, r: p.x + 3, t: p.y - 3, b: p.y + 3, cx: p.x, cy: p.y }
      : { l: p.x, r: p.x + p.w, t: p.y, b: p.y + p.h, cx: p.x + p.w / 2, cy: p.y + p.h / 2 };
    const A = box(a), B = box(b);
    let x1, y1, x2, y2, c1x, c1y, c2x, c2y;
    if (B.t >= A.b + 4) { x1 = A.cx; y1 = A.b; x2 = B.cx; y2 = B.t; const k = Math.max(16, (y2 - y1) * 0.45); c1x = x1; c1y = y1 + k; c2x = x2; c2y = y2 - k; }
    else if (B.b <= A.t - 4) { x1 = A.cx; y1 = A.t; x2 = B.cx; y2 = B.b; const k = Math.max(16, (y1 - y2) * 0.45); c1x = x1; c1y = y1 - k; c2x = x2; c2y = y2 + k; }
    else { const right = B.cx > A.cx; x1 = right ? A.r : A.l; x2 = right ? B.l : B.r; y1 = A.cy; y2 = B.cy; const k = Math.max(14, Math.abs(x2 - x1) * 0.4) * (right ? 1 : -1); c1x = x1 + k; c1y = y1; c2x = x2 - k; c2y = y2; }
    return `M${x1.toFixed(1)},${y1.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  // ---------------------------------------------------------------- panel
  function chip(id, kind) {
    const n = N[id], f = F[n.family];
    return `<button type="button" class="chip${kind === 'influence' ? ' dash' : ''}" data-go="${id}" style="--cc:${f.color}" title="${esc(f.name)}${kind === 'influence' ? ', influence' : ''}"><span class="sw"></span>${esc(n.title)} <span class="y">${esc(String(n.year))}</span></button>`;
  }
  function byYear(ids) { return [...ids].sort((a, b) => N[a].year - N[b].year || N[a].title.localeCompare(N[b].title)); }
  function renderPanel() {
    const p = $('#panel');
    if (!sel) { p.hidden = true; document.body.style.paddingBottom = ''; return; }
    const n = N[sel], f = F[n.family], L2 = lens();
    const ps = parents[sel].slice().sort((a, b) => N[a.s].year - N[b.s].year), cs = children[sel].slice().sort((a, b) => N[a.t].year - N[b.t].year);
    const upFar = byYear([...L2.up].filter((x) => !L2.near.has(x))), downFar = byYear([...L2.down].filter((x) => !L2.near.has(x)));
    const block = (label, ids, cap) => !ids.length ? '' : ids.length <= cap
      ? `<h4>${label}</h4><div class="chips">${ids.map((x) => chip(x)).join('')}</div>`
      : `<details><summary>${label} (${ids.length})</summary><div class="chips">${ids.map((x) => chip(x)).join('')}</div></details>`;
    p.style.setProperty('--fc', f.color);
    p.innerHTML = `<button type="button" class="x" aria-label="Stop tracing">×</button>
      <h3>${esc(n.title)}</h3>
      <div class="meta"><span class="fam">${esc(f.name)}</span> · ${esc(n.date)}${n.landmark ? ' · landmark' : ''}</div>
      <p>${esc(n.what)}</p><p class="roots">${esc(n.roots)}</p>
      ${ps.length ? `<h4>Grew out of</h4><div class="chips">${ps.map((e) => chip(e.s, e.kind)).join('')}</div>` : '<h4>Grew out of</h4><p class="roots">A root: nothing earlier on this map.</p>'}
      ${cs.length ? `<h4>Led to</h4><div class="chips">${cs.map((e) => chip(e.t, e.kind)).join('')}</div>` : ''}
      ${block('Earlier ancestry', upFar, 10)}
      ${block('Further descendants', downFar, 10)}
      <div class="panel-actions"><button type="button" class="openfam">Open the families in this lineage</button></div>
      <div class="src">Dashed chips are influence links. Graph: <a href="https://ianmiell.github.io/sw-job-title-family-tree/">Ian Miell</a>.</div>`;
    p.hidden = false;
    document.body.style.paddingBottom = Math.min(p.offsetHeight, innerHeight * 0.6) + 'px';
    p.querySelector('.x').onclick = () => select(null);
    p.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => select(b.dataset.go)));
    p.querySelector('.openfam').onclick = () => {
      const fams = new Set([...L2.near, ...L2.up, ...L2.down].map((x) => N[x].family));
      requested = requested.filter((x) => !fams.has(x)).concat([...fams]);
      commit();
    };
  }

  function scrollToNode(id) {
    requestAnimationFrame(() => {
      const P = pos[id]; if (!P) return;
      const top = $('#map').getBoundingClientRect().top + scrollY + P.y;
      const panelH = $('#panel').hidden ? 0 : $('#panel').offsetHeight;
      const viewTop = scrollY + 150, viewBottom = scrollY + innerHeight - panelH - 20;
      if (top < viewTop || top + CARD_H > viewBottom) {
        const target = top - Math.max(150, (innerHeight - panelH) / 2 - CARD_H / 2);
        window.scrollTo({ top: Math.max(0, target), behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
      }
    });
  }

  function onFind() {
    const v = $('#find').value.trim().toLowerCase(); if (!v) return;
    const hit = D.nodes.find((n) => n.title.toLowerCase() === v) || D.nodes.find((n) => n.title.toLowerCase().includes(v));
    if (hit) { select(hit.id); $('#find').value = ''; $('#find').blur(); }
  }

  function onKey(e) {
    if (e.target.matches('input,textarea')) return;
    if (e.key === 'Escape' && sel) { select(null); return; }
    if (!sel || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    let next = null;
    const pick = (edges, end) => { const s = edges.filter((x) => x.kind === 'grew'); return ((s.length ? s : edges)[0] || {})[end]; };
    if (e.key === 'ArrowUp') next = pick(parents[sel], 's');
    if (e.key === 'ArrowDown') next = pick(children[sel], 't');
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const fam = D.nodes.filter((n) => n.family === N[sel].family).sort((a, b) => a.period - b.period || a.year - b.year);
      const i = fam.findIndex((n) => n.id === sel);
      next = (fam[i + (e.key === 'ArrowRight' ? 1 : -1)] || {}).id;
    }
    if (next) { e.preventDefault(); select(next, { focus: true }); }
  }
})();
