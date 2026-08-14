/* public-tables.js — public table cards, modal and refresh
   Requires PUBLIC_CONFIG = { slug } */

let showDrinks = true;

/* ── Drink badge ─────────────────────────────────────────────── */
function drinkBadge(d) {
  if (!showDrinks || !d) return '';
  if (d.photo) return `<div class="t-drink"><img class="t-drink-img" src="${d.photo}" alt="${d.name || ''}"></div>`;
  if (d.name)  return `<div class="t-drink"><span class="t-drink-name">${d.name}</span></div>`;
  return '';
}

/* ── Status helpers ──────────────────────────────────────────── */
function matchState(m) { return m ? m.status : 'free'; }
function winner(m) {
  if (!m || m.status !== 'finished') return 0;
  if (m.score1 > m.score2) return 1;
  if (m.score2 > m.score1) return 2;
  // Gelijkstand in de knock-out: de golden goal wijst de winnaar aan.
  return m.golden_goal || 0;
}

/* ── Name bar ────────────────────────────────────────────────── */
function nameBar(name, phaseLabel, live, done) {
  const phase  = phaseLabel ? `<span class="t-phase-lbl">${phaseLabel}</span>` : '<span></span>';
  const status = live ? '<span class="live-dot"></span><span style="font-size:.7rem">LIVE</span>'
               : done ? '<span style="font-size:.7rem;opacity:.9">✓</span>' : '<span></span>';
  return `<div class="t-name-bar"><span>${name}</span>${phase}<div class="t-name-bar-right">${status}</div></div>`;
}

/* ── Horizontal card ─────────────────────────────────────────── */
function cardH(t, m, clickable = true) {
  const live = matchState(m) === 'in_progress';
  const done = matchState(m) === 'finished';
  const w    = winner(m);
  const t1   = m?.team1, t2 = m?.team2;
  const n1   = done ? (w === 1 ? 't-winner' : w === 2 ? 't-loser' : '') : '';
  const n2   = done ? (w === 2 ? 't-winner' : w === 1 ? 't-loser' : '') : '';
  const score = live
    ? `<span class="t-score-num">${m.score1}</span><span class="t-score-sep">–</span><span class="t-score-num">${m.score2}</span>`
    : done
    ? `<span class="t-done-score">${m.score1}</span><span class="t-score-sep-done">–</span><span class="t-done-score">${m.score2}</span>`
    : `<span class="t-score-sep" style="font-size:.85rem">vs</span>`;
  const body = (t1 || t2) ? `
    <div class="t-body">
      <div class="t-side-l"><span class="t-label">Links</span><span class="t-team-name ${n1}">${t1 || '?'}</span>${drinkBadge(m?.team1_drink)}</div>
      <div class="t-score-mid">${score}</div>
      <div class="t-side-r"><span class="t-label">Rechts</span><span class="t-team-name ${n2}">${t2 || '?'}</span>${drinkBadge(m?.team2_drink)}</div>
    </div>` : `<div class="t-free">Vrij</div>`;
  const click = clickable ? `onclick="openTableModal(${t.id})"` : '';
  return `<div class="t-card h ${live ? 'live' : ''} ${done ? 'done' : ''}" ${click}>${nameBar(t.name, m?.phase_label, live, done)}${body}</div>`;
}

/* ── Vertical card ───────────────────────────────────────────── */
function cardV(t, m, clickable = true) {
  const live = matchState(m) === 'in_progress';
  const done = matchState(m) === 'finished';
  const w    = winner(m);
  const t1   = m?.team1, t2 = m?.team2;
  const n1   = done ? (w === 1 ? 't-winner' : w === 2 ? 't-loser' : '') : '';
  const n2   = done ? (w === 2 ? 't-winner' : w === 1 ? 't-loser' : '') : '';
  const score = live
    ? `<span class="t-score-num">${m.score1}</span><span class="t-score-sep">–</span><span class="t-score-num">${m.score2}</span>`
    : done
    ? `<span class="t-done-score">${m.score1}</span><span class="t-score-sep-done">–</span><span class="t-done-score">${m.score2}</span>`
    : `<span class="t-score-sep">vs</span>`;
  const body = (t1 || t2) ? `
    <div class="t-body">
      <div class="t-side-top"><span class="t-label">Boven</span><span class="t-team-name ${n1}">${t1 || '?'}</span>${drinkBadge(m?.team1_drink)}</div>
      <div class="t-score-vert">${score}</div>
      <div class="t-side-bot"><span class="t-label">Onder</span><span class="t-team-name ${n2}">${t2 || '?'}</span>${drinkBadge(m?.team2_drink)}</div>
    </div>` : `<div class="t-free">Vrij</div>`;
  const click = clickable ? `onclick="openTableModal(${t.id})"` : '';
  return `<div class="t-card v ${live ? 'live' : ''} ${done ? 'done' : ''}" ${click}>${nameBar(t.name, m?.phase_label, live, done)}${body}</div>`;
}

/* ── Modal: enlarged card ────────────────────────────────────── */
function cardModal(t, m) {
  const live = matchState(m) === 'in_progress';
  const done = matchState(m) === 'finished';
  const w    = winner(m);
  const t1   = m?.team1, t2 = m?.team2;
  const c1   = done ? (w === 1 ? '#15803d' : w === 2 ? '#94a3b8' : '#1e293b') : '#1e293b';
  const c2   = done ? (w === 2 ? '#15803d' : w === 1 ? '#94a3b8' : '#1e293b') : '#1e293b';
  const sNum  = s => `<span style="font-size:4rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;color:var(--bp-primary)">${s}</span>`;
  const sDone = s => `<span style="font-size:4rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;color:#1e293b">${s}</span>`;
  const scoreHtml = live
    ? `${sNum(m.score1)}<span style="font-size:1.8rem;color:#94a3b8;margin:0 .6rem">–</span>${sNum(m.score2)}`
    : done
    ? `${sDone(m.score1)}<span style="font-size:1.8rem;color:#94a3b8;margin:0 .6rem">–</span>${sDone(m.score2)}`
    : `<span style="font-size:2rem;color:#94a3b8">vs</span>`;

  const teamBlock = (name, drinkObj, col) => `
    <div style="flex:1;text-align:center;padding:.75rem .5rem">
      <div style="font-size:1.6rem;font-weight:800;color:${col};word-break:break-word;line-height:1.2">${name || '?'}</div>
      ${showDrinks && drinkObj
        ? drinkObj.photo
          ? `<img src="${drinkObj.photo}" alt="" style="width:52px;height:52px;border-radius:8px;object-fit:cover;margin-top:.5rem;opacity:.8">`
          : drinkObj.name
            ? `<div style="font-size:.8rem;color:#94a3b8;font-style:italic;margin-top:.4rem">${drinkObj.name}</div>`
            : ''
        : ''}
    </div>`;

  const body = (t1 || t2) ? `
    <div style="display:flex;align-items:center;padding:2rem 1rem;gap:.75rem">
      ${teamBlock(t1, m?.team1_drink, c1)}
      <div style="text-align:center;flex-shrink:0;padding:0 .5rem">${scoreHtml}</div>
      ${teamBlock(t2, m?.team2_drink, c2)}
    </div>` : `<div style="padding:3rem;text-align:center;color:#94a3b8;font-style:italic;font-size:1.1rem">Vrij</div>`;

  const phaseLabel = m?.phase_label || '';
  const statusBit  = live
    ? '<span class="live-dot" style="width:10px;height:10px"></span> <span style="font-size:.9rem;font-weight:700">LIVE</span>'
    : done ? '<span style="font-size:.95rem;opacity:.9">✓</span>' : '';

  return `<div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35)">
    <div style="background:var(--bp-primary);color:white;padding:.75rem 1.25rem;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.5rem">
      <span style="font-size:1.15rem;font-weight:800">${t.name}</span>
      <span style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;opacity:.85;text-align:center;white-space:nowrap">${phaseLabel}</span>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:.4rem">${statusBit}</div>
    </div>
    ${body}
  </div>`;
}

/* ── Modal open / close ──────────────────────────────────────── */
let _modalTableId = null, _modalInterval = null, _modalTimerTick = null;
let _lastTablesData = null;

function openTableModal(tableId) {
  _modalTableId = tableId;
  document.getElementById('table-modal').style.display = 'flex';
  _renderModal();
  _modalInterval  = setInterval(_renderModal, 3000);
  _modalTimerTick = setInterval(_updateModalTimer, 1000);
  document.addEventListener('keydown', _escClose);
}

function closeTableModal(event) {
  if (event && event.target !== document.getElementById('table-modal')) return;
  _doClose();
}

function _doClose() {
  clearInterval(_modalInterval);
  clearInterval(_modalTimerTick);
  document.getElementById('table-modal').style.display = 'none';
  document.removeEventListener('keydown', _escClose);
  _modalTableId = null;
}

function _escClose(e) { if (e.key === 'Escape') _doClose(); }

function _renderModal() {
  if (!_modalTableId || !_lastTablesData) return;
  const t = _lastTablesData.tables.find(x => x.id === _modalTableId);
  if (!t) return;
  document.getElementById('modal-card-wrap').innerHTML = cardModal(t, t.match);
  _updateModalTimer();
}

function _updateModalTimer() {
  const state = window.bpTimer;
  const el    = document.getElementById('modal-timer-float');
  if (!el || !state) return;
  if (!state.isActive && state.remaining <= 0) { el.style.display = 'none'; return; }
  const rem = state.fetchedAt
    ? Math.max(0, state.remaining - Math.floor((Date.now() - state.fetchedAt) / 1000))
    : state.remaining;
  el.style.display = 'block';
  el.textContent   = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
  el.style.color   = rem <= 120 && state.isActive ? 'rgba(255,100,100,.95)' : 'rgba(255,255,255,.9)';
}

/* ── Main refresh ────────────────────────────────────────────── */
let _lastTablesRenderKey = null;

async function refresh() {
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const gridWrap = document.querySelector('.tables-grid-wrap');
  const gridWrapScrollLeft = gridWrap ? gridWrap.scrollLeft : 0;
  try {
    const r    = await fetch(`/api/${PUBLIC_CONFIG.slug}/tables/`);
    const data = await r.json();
    showDrinks      = data.show_drinks !== false;
    _lastTablesData = data;  // always kept fresh — the open table modal reads from this directly

    document.getElementById('last-update').textContent =
      'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-BE');

    // Skip rebuilding the grid when nothing changed since the last poll —
    // avoids needless flicker of the table cards.
    const renderKey = JSON.stringify({ tables: data.tables, orientation: data.orientation, cols: data.cols, showDrinks });
    if (renderKey !== _lastTablesRenderKey) {
      _lastTablesRenderKey = renderKey;

      const orientation = data.orientation || 'horizontal';
      const cols        = data.cols || 4;
      const grid        = document.getElementById('tables-grid');

      grid.style.gridTemplateColumns =
        orientation === 'vertical' ? `repeat(${cols}, auto)` : `repeat(${cols}, 1fr)`;

      const html = data.tables.map(t =>
        orientation === 'vertical' ? cardV(t, t.match) : cardH(t, t.match)
      ).join('');

      grid.innerHTML = html || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8">Geen tafels</div>';
      window.scrollTo(scrollX, scrollY);
      if (gridWrap) gridWrap.scrollLeft = gridWrapScrollLeft;
    }

    if (_modalTableId) _renderModal();
  } catch(e) { console.error(e); }
}

refresh();
setInterval(refresh, (PUBLIC_CONFIG.refreshSeconds || 5) * 1000);
