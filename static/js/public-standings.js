/* public-standings.js — standings, bracket and groups rendering
   Requires PUBLIC_CONFIG = { slug, format, advLine, koPerGroup, poPerGroup } */

function standingsTableRows(data, advAfter) {
  const medals = ['r1', 'r2', 'r3'];
  const rows = data.map((s, i) => {
    const rank = i + 1;
    const adv  = (advAfter && rank === advAfter) ? 'adv-line' : '';
    const diff    = (s.cup_diff !== undefined) ? s.cup_diff : (s.cups_scored - s.cups_conceded);
    const diffCls = diff > 0 ? 'stat-diff-pos' : diff < 0 ? 'stat-diff-neg' : 'stat-diff-zero';
    const diffStr = diff > 0 ? `+${diff}` : String(diff);
    return `<tr class="${adv}">
      <td><span class="rank-badge ${medals[i] || ''}">${rank}</span></td>
      <td><strong>${s.team}</strong></td>
      <td class="text-center">${s.played}</td>
      <td class="text-center stat-win">${s.wins}</td>
      <td class="text-center stat-draw">${s.draws}</td>
      <td class="text-center stat-loss">${s.losses}</td>
      <td class="text-center">${s.cups_scored}</td>
      <td class="text-center stat-muted">${s.cups_conceded}</td>
      <td class="text-center ${diffCls}">${diffStr}</td>
      <td class="text-center pts-col">${s.points}</td>
    </tr>`;
  }).join('');
  return rows || '<tr><td colspan="10" class="text-center text-muted py-4">Nog geen resultaten</td></tr>';
}

function renderStandings(data) {
  const adv = PUBLIC_CONFIG.format === 'combined' ? PUBLIC_CONFIG.advLine : 0;
  document.getElementById('standings-body').innerHTML = standingsTableRows(data, adv);
}

function renderGroupsStandings(groups) {
  const thead = `<thead><tr>
    <th class="col-rank">#</th><th>Ploeg</th>
    <th class="text-center">Gesp.</th><th class="text-center">W</th>
    <th class="text-center">G</th><th class="text-center">V</th>
    <th class="text-center">Bk+</th><th class="text-center">Bk-</th>
    <th class="text-center">+/−</th>
    <th class="text-center">Pts</th>
  </tr></thead>`;
  let html = '';
  groups.forEach(g => {
    html += `<h4 class="grp-heading mb-2 fw-bold">${g.name}</h4>`;
    html += `<table class="standings-table mb-4">${thead}<tbody>${standingsTableRows(g.standings, g.ko_count)}</tbody></table>`;
  });
  const el = document.getElementById('groups-section');
  el.innerHTML = html || '';
  el.style.display = html ? '' : 'none';
}

function _ordNL(n) {
  if (n === 1) return '1ste';
  return `${n}de`;
}

function renderFinalRankingTable(matches, start) {
  if (!matches || !matches.length) return '';
  start = start || 0;

  // Sort ascending by slot (bracket_slot=1 = highest position = 1st/2nd)
  const sorted = [...matches].sort((a, b) => (a.slot || 0) - (b.slot || 0));

  let html = '<div class="fr-rank-table">';
  sorted.forEach(m => {
    const slot   = (m.slot || 1) - 1;        // 0-indexed
    const r1     = start + slot * 2 + 1;      // e.g. 1, 3, 5 ...
    const r2     = r1 + 1;
    const done   = m.status === 'finished';
    const live   = m.status === 'in_progress';
    const cls    = done ? 'finished' : live ? 'in_progress' : 'scheduled';

    const w1     = done && m.score1 > m.score2;
    const w2     = done && m.score2 > m.score1;

    // Determine final positions when match is done
    const pos1   = done ? (w1 ? r1 : r2) : null;
    const pos2   = done ? (w2 ? r1 : r2) : null;

    const statusLabel = done
      ? '✓ Afgelopen'
      : live ? '● Bezig' : 'Gepland';

    const medalCls = (pos) => pos === 1 ? 'r1' : pos === 2 ? 'r2' : pos === 3 ? 'r3' : '';

    const row = (team, score, isWinner, pos) => `
      <div class="fr-rank-row ${isWinner ? 'winner' : done ? 'loser' : ''} ${medalCls(pos)}">
        <span class="fr-rank-pos">${pos !== null ? pos : '?'}</span>
        <span class="fr-rank-team">${team || 'TBD'}</span>
        ${done ? `<span class="fr-rank-score">${score}</span>` : ''}
      </div>`;

    // Show winner first (lower/better position), loser second
    const topRow    = done && w2 ? row(m.team2, m.score2, w2, pos2) : row(m.team1, m.score1, w1, pos1);
    const bottomRow = done && w2 ? row(m.team1, m.score1, w1, pos1) : row(m.team2, m.score2, w2, pos2);

    html += `<div class="fr-rank-group ${cls}">
      <div class="fr-rank-header">
        <span>${_ordNL(r1)}/${_ordNL(r2)} plek</span>
        <span class="fr-rank-status">${statusLabel}</span>
      </div>
      ${topRow}
      ${bottomRow}
    </div>`;
  });
  return html + '</div>';
}

function renderMatchList(matches) {
  if (!matches || !matches.length) return '';
  return `<div class="fr-grid">` +
    matches.map(m => {
      const done   = m.status === 'finished';
      const w1     = done && m.score1 > m.score2;
      const w2     = done && m.score2 > m.score1;
      const cls    = m.status || '';
      const tbl    = m.table ? `<span class="b-table-lbl d-block mt-1">${m.table}</span>` : '';
      const t1cls  = w1 ? 'fr-team-winner' : (done && !w1 ? 'fr-team-loser' : '');
      const t2cls  = w2 ? 'fr-team-winner' : (done && !w2 ? 'fr-team-loser' : '');
      return `<div class="fr-match ${cls}">
        <div class="fr-team ${t1cls}">${m.team1 || 'TBD'}</div>
        <div class="fr-score">${done ? `${m.score1} – ${m.score2}` : '<span class="fr-vs">vs</span>'}${tbl}</div>
        <div class="fr-team text-end ${t2cls}">${m.team2 || 'TBD'}</div>
      </div>`;
    }).join('') + `</div>`;
}

/* ── Bracket renderer ─────────────────────────────────────────────
   Structuur: elke ploeg is een los team-slot.
   Kolommen staan naast elkaar via CSS grid.
   Regels worden na render getekend via SVG.
   ─────────────────────────────────────────────────────────────── */

/**
 * Bepaal de staat van één team in een wedstrijd.
 * Geeft { name, score, state } terug.
 * state: 'winner' | 'loser' | 'live' | 'pending' | 'tbd'
 */
function bkTeamInfo(match, which) {
  if (!match) return { name: null, score: null, state: 'tbd' };
  const name  = which === 1 ? match.team1 : match.team2;
  const score = which === 1 ? match.score1 : match.score2;
  if (!name) return { name: null, score: null, state: 'tbd' };
  if (match.status === 'in_progress') return { name, score, state: 'live' };
  if (match.status === 'finished') {
    const won = which === 1 ? match.score1 > match.score2 : match.score2 > match.score1;
    return { name, score, state: won ? 'winner' : 'loser' };
  }
  return { name, score: null, state: 'pending' };
}

/** Bouw één team-slot HTML. id mag leeg zijn. */
function bkSlot(id, info) {
  const { name, score, state } = info;
  const showScore = (state === 'winner' || state === 'loser' || state === 'live')
    && score !== null && score !== undefined;
  const idAttr  = id ? ` id="${id}"` : '';
  const indicator = state === 'live'
    ? '<span class="bk-pulse"></span>'
    : '<span class="bk-dot"></span>';
  return `<div class="bk-slot ${state}"${idAttr}>${indicator}<span class="bk-name">${name || 'TBD'}</span>${showScore ? `<span class="bk-score">${score}</span>` : ''}</div>`;
}

/**
 * Bouw één ronde-kolom (label + body met team-slots).
 * slots: array van { name, score, state }
 * ids:   array van element-IDs (zelfde lengte als slots)
 */
function bkRoundCol(label, roundType, slots, ids) {
  const slotsHtml = slots.map((info, i) => bkSlot(ids[i] || '', info)).join('');
  return `<div class="bk-round bk-round-${roundType}">
    <div class="bk-round-label">${label}</div>
    <div class="bk-round-body">${slotsHtml}</div>
  </div>`;
}

/** Bouw de finale-kolom (speciale grotere box in het midden). */
function bkFinalCol(fin) {
  const t1 = bkTeamInfo(fin, 1);
  const t2 = bkTeamInfo(fin, 2);
  const champion = fin && fin.status === 'finished'
    ? (t1.state === 'winner' ? t1.name : t2.state === 'winner' ? t2.name : null)
    : null;
  return `<div class="bk-round bk-round-final">
    <div class="bk-round-label">Finale</div>
    <div class="bk-round-body bk-final-body">
      <div class="bk-final-box" id="bk-final-box">
        ${bkSlot('', t1)}
        ${bkSlot('', t2)}
        ${champion ? `<div class="bk-champion">&#127942; Kampioen: ${champion}</div>` : ''}
      </div>
    </div>
  </div>`;
}

/**
 * Hoofdfunctie: bouw de volledige bracket HTML op basis van de API data.
 *
 * Ondersteunde formaten:
 *   QF-bracket (≥5 ploegen): 5 kolommen  [QF-L | SF-L | Finale | SF-R | QF-R]
 *   SF-bracket (3-4 ploegen): 3 kolommen  [SF-L | Finale | SF-R]
 *   Finale-only (2 ploegen):  1 kolom     [Finale]
 *
 * Elke ploeg heeft zijn eigen slot. De SVG-lijnen verbinden de slots.
 * Verticale uitlijning werkt automatisch via CSS space-around + vaste hoogte:
 *   - 4 slots (QF) → centers op H/8, 3H/8, 5H/8, 7H/8
 *   - 2 slots (SF) → centers op H/4, 3H/4  (= midpoints van QF-paren ✓)
 *   - Finale box   → center op H/2           (= midpoint van SF-slots ✓)
 */
function renderBracket(bracket) {
  const qf  = [...(bracket.quarterfinal || [])].sort((a, b) => (a.slot||0) - (b.slot||0));
  const sf  = [...(bracket.semifinal    || [])].sort((a, b) => (a.slot||0) - (b.slot||0));
  const fin = (bracket.final       || [])[0] || null;
  const trd = (bracket.third_place || [])[0] || null;

  const hasQF = qf.length > 0;
  const hasSF = sf.length > 0;
  if (!fin && !hasSF && !hasQF) return '';

  const sf1 = sf.find(m => m.slot === 1) || null;
  const sf2 = sf.find(m => m.slot === 2) || null;

  let gridCls, cols = '';

  if (hasQF && hasSF) {
    /* ── 5-koloms QF-bracket ── */
    gridCls = 'bk-grid-qf';
    const qf1 = qf.find(m => m.slot === 1) || null;
    const qf2 = qf.find(m => m.slot === 2) || null;
    const qf3 = qf.find(m => m.slot === 3) || null;
    const qf4 = qf.find(m => m.slot === 4) || null;

    // Linker QF: 4 slots (qf1.t1, qf1.t2, qf2.t1, qf2.t2)
    cols += bkRoundCol('Kwartfinale', 'qf', [
      bkTeamInfo(qf1,1), bkTeamInfo(qf1,2),
      bkTeamInfo(qf2,1), bkTeamInfo(qf2,2),
    ], ['bk-qf1-t1','bk-qf1-t2','bk-qf2-t1','bk-qf2-t2']);

    // Linker SF: 2 slots (sf1.t1, sf1.t2)
    cols += bkRoundCol('Halve finale', 'sf', [
      bkTeamInfo(sf1,1), bkTeamInfo(sf1,2),
    ], ['bk-sf1-t1','bk-sf1-t2']);

    // Finale (midden)
    cols += bkFinalCol(fin);

    // Rechter SF: 2 slots (sf2.t1, sf2.t2)
    cols += bkRoundCol('Halve finale', 'sf', [
      bkTeamInfo(sf2,1), bkTeamInfo(sf2,2),
    ], ['bk-sf2-t1','bk-sf2-t2']);

    // Rechter QF: 4 slots (qf3.t1, qf3.t2, qf4.t1, qf4.t2)
    cols += bkRoundCol('Kwartfinale', 'qf', [
      bkTeamInfo(qf3,1), bkTeamInfo(qf3,2),
      bkTeamInfo(qf4,1), bkTeamInfo(qf4,2),
    ], ['bk-qf3-t1','bk-qf3-t2','bk-qf4-t1','bk-qf4-t2']);

  } else if (hasSF) {
    /* ── 3-koloms SF-bracket ── */
    gridCls = 'bk-grid-sf';

    cols += bkRoundCol('Halve finale', 'sf', [
      bkTeamInfo(sf1,1), bkTeamInfo(sf1,2),
    ], ['bk-sf1-t1','bk-sf1-t2']);

    cols += bkFinalCol(fin);

    cols += bkRoundCol('Halve finale', 'sf', [
      bkTeamInfo(sf2,1), bkTeamInfo(sf2,2),
    ], ['bk-sf2-t1','bk-sf2-t2']);

  } else {
    /* ── Finale-only ── */
    gridCls = 'bk-grid-final';
    cols += bkFinalCol(fin);
  }

  // Kleine finale (geen SVG-lijnen, gewoon gecentreerd eronder)
  let thirdHtml = '';
  if (trd) {
    const t1 = bkTeamInfo(trd, 1);
    const t2 = bkTeamInfo(trd, 2);
    const thirdWinner = trd.status === 'finished'
      ? (t1.state === 'winner' ? t1.name : t2.state === 'winner' ? t2.name : null)
      : null;
    thirdHtml = `<div class="bk-third-section">
      <div class="bk-third-label">Kleine Finale &mdash; 3e Plaats</div>
      <div class="bk-final-box bk-third-box">
        ${bkSlot('', t1)}
        ${bkSlot('', t2)}
        ${thirdWinner ? `<div class="bk-third-winner">&#127949; 3e Plaats: ${thirdWinner}</div>` : ''}
      </div>
    </div>`;
  }

  return `<div class="bk-wrap" id="bk-wrap">
    <svg class="bk-svg" id="bk-svg"></svg>
    <div class="bk-grid ${gridCls}">${cols}</div>
    ${thirdHtml}
  </div>`;
}

/* ── SVG bracket-lijnen ───────────────────────────────────────────
   Getekend na render (via requestAnimationFrame).
   Verbindt paren van team-slots via L-vormige bracket-lijnen:

     topSlot ────┐
                 │
     botSlot ────┘
                 └──────→ destSlot / finale-box
   ─────────────────────────────────────────────────────────────── */

function drawBracketLines() {
  const wrap = document.getElementById('bk-wrap');
  const svg  = document.getElementById('bk-svg');
  if (!wrap || !svg) return;

  svg.innerHTML = '';
  const wRect = wrap.getBoundingClientRect();
  svg.setAttribute('width',   wRect.width);
  svg.setAttribute('height',  wRect.height);
  svg.setAttribute('viewBox', `0 0 ${wRect.width} ${wRect.height}`);

  const GREY  = '#cbd5e1';
  const GREEN = '#22c55e';

  // Bounding rect van een element relatief aan de wrap
  function pos(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const w = wrap.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    return {
      left:  e.left  - w.left,
      right: e.right - w.left,
      cy:    (e.top  + e.bottom) / 2 - w.top,
    };
  }

  function makePath(d, color) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color || GREY);
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    return p;
  }

  function isWinner(id) {
    const el = document.getElementById(id);
    return el ? el.classList.contains('winner') : false;
  }

  /**
   * Teken een L-bracket van twee slots naar één doel-element.
   * De lijn van het winnende team (class='winner') wordt groen gekleurd.
   * side='right': lijnen gaan RECHTS uit de slots, dan naar LINKS van dest
   * side='left':  lijnen gaan LINKS  uit de slots, dan naar RECHTS van dest
   */
  function drawBracket(topId, botId, destId, side) {
    const top  = pos(topId);
    const bot  = pos(botId);
    const dest = pos(destId);
    if (!top || !bot || !dest) return;

    const topWin = isWinner(topId);
    const botWin = isWinner(botId);

    const fromXt = side === 'right' ? top.right : top.left;
    const fromXb = side === 'right' ? bot.right : bot.left;
    const toX    = side === 'right' ? dest.left  : dest.right;
    const midX   = (fromXt + toX) / 2;
    const midY   = (top.cy + bot.cy) / 2;

    // Horizontale lijn van top-slot naar verticale balk (groen als top winnaar)
    svg.appendChild(makePath(`M ${fromXt} ${top.cy} H ${midX}`, topWin ? GREEN : GREY));
    // Horizontale lijn van bot-slot naar verticale balk (groen als bot winnaar)
    svg.appendChild(makePath(`M ${fromXb} ${bot.cy} H ${midX}`, botWin ? GREEN : GREY));
    // Verticale balk: bovenhelft (top.cy → midY) groen als top winnaar
    svg.appendChild(makePath(`M ${midX} ${top.cy} V ${midY}`, topWin ? GREEN : GREY));
    // Verticale balk: onderhelft (midY → bot.cy) groen als bot winnaar
    svg.appendChild(makePath(`M ${midX} ${midY} V ${bot.cy}`, botWin ? GREEN : GREY));
    // Uitgaande lijn naar doel (groen als er een winnaar doorgaat)
    svg.appendChild(makePath(`M ${midX} ${midY} H ${toX}`, (topWin || botWin) ? GREEN : GREY));
  }

  const hasQF = !!document.getElementById('bk-qf1-t1');
  const hasSF = !!document.getElementById('bk-sf1-t1');

  if (hasQF && hasSF) {
    // Linker kant: QF-paren → SF-slots → Finale
    drawBracket('bk-qf1-t1', 'bk-qf1-t2', 'bk-sf1-t1', 'right');
    drawBracket('bk-qf2-t1', 'bk-qf2-t2', 'bk-sf1-t2', 'right');
    drawBracket('bk-sf1-t1', 'bk-sf1-t2', 'bk-final-box', 'right');
    // Rechter kant: QF-paren → SF-slots → Finale
    drawBracket('bk-qf3-t1', 'bk-qf3-t2', 'bk-sf2-t1', 'left');
    drawBracket('bk-qf4-t1', 'bk-qf4-t2', 'bk-sf2-t2', 'left');
    drawBracket('bk-sf2-t1', 'bk-sf2-t2', 'bk-final-box', 'left');
  } else if (hasSF) {
    drawBracket('bk-sf1-t1', 'bk-sf1-t2', 'bk-final-box', 'right');
    drawBracket('bk-sf2-t1', 'bk-sf2-t2', 'bk-final-box', 'left');
  }
}

window.addEventListener('resize', drawBracketLines);

/* ── Refresh loop ─────────────────────────────────────────────── */
async function refresh() {
  try {
    const r    = await fetch(`/api/${PUBLIC_CONFIG.slug}/standings/`);
    const data = await r.json();

    const groupsSec    = document.getElementById('groups-section');
    const standingsSec = document.getElementById('standings-section');
    if (data.has_groups && data.groups && data.groups.length) {
      renderGroupsStandings(data.groups);
      groupsSec.style.display    = '';
      standingsSec.style.display = 'none';
      _addGroupModalBtns();
    } else {
      groupsSec.style.display    = 'none';
      standingsSec.style.display = '';
      renderStandings(data.standings || []);
    }

    const bracketEl = document.getElementById('bracket-section');
    const renderEl  = document.getElementById('bracket-render');
    if (data.has_bracket && data.bracket) {
      const html = renderBracket(data.bracket);
      renderEl.innerHTML      = html;
      bracketEl.style.display = html ? '' : 'none';
      if (html) requestAnimationFrame(drawBracketLines);
    } else {
      bracketEl.style.display = 'none';
    }

    const poEl     = document.getElementById('playoff-section');
    const poRender = document.getElementById('playoff-render');
    if (data.has_playoff && data.playoff && data.playoff.length) {
      poRender.innerHTML = renderMatchList(data.playoff);
      poEl.style.display = '';
    } else {
      poEl.style.display = 'none';
    }

    const frEl     = document.getElementById('final-ranking-section');
    const frRender = document.getElementById('final-ranking-render');
    if (data.has_final_ranking && data.final_ranking && data.final_ranking.length) {
      frRender.innerHTML = renderFinalRankingTable(data.final_ranking, data.fr_start_rank || 0);
      frEl.style.display = '';
    } else {
      frEl.style.display = 'none';
    }

    document.getElementById('last-update').textContent =
      'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-BE');
  } catch(e) { console.error(e); }
}

refresh();
setInterval(refresh, 10000);

/* ── Standings section modal ──────────────────────────────────── */

const SECTION_TITLES = {
  bracket:       'Knockoutfase',
  playoff:       'Play-offs',
  final_ranking: 'Finale ranking',
  standings:     null,
  groups:        null,
};

let _stnTimerInterval = null;

async function _stnUpdateTimer() {
  const el = document.getElementById('standings-modal-timer');
  if (!el) return;
  try {
    const r = await fetch(`/api/${PUBLIC_CONFIG.slug}/timer/`);
    const d = await r.json();
    if (!d.is_active && d.elapsed_seconds === 0) {
      el.style.display = 'none';
    } else {
      const s   = d.remaining_seconds ?? 0;
      const min = Math.floor(s / 60);
      const sec = String(s % 60).padStart(2, '0');
      el.textContent  = `${min}:${sec}`;
      el.style.display = '';
    }
  } catch(e) { el.style.display = 'none'; }
}

function standingsOpenModal(key, groupName) {
  const modal   = document.getElementById('standings-modal');
  const wrap    = document.getElementById('standings-modal-wrap');
  const content = document.getElementById('standings-modal-content');
  if (!modal || !content) return;

  /* Wide variant for knockout bracket */
  wrap.classList.toggle('is-wide', key === 'bracket');

  let title = SECTION_TITLES[key] || groupName || key;
  if (key === 'standings') title = document.getElementById('standings-title')?.textContent || 'Stand';

  let inner = '';
  if      (key === 'bracket')       inner = document.getElementById('bracket-render')?.innerHTML || '';
  else if (key === 'playoff')       inner = document.getElementById('playoff-render')?.innerHTML || '';
  else if (key === 'final_ranking') inner = document.getElementById('final-ranking-render')?.innerHTML || '';
  else if (key === 'standings') {
    const tbl = document.querySelector('#standings-section .standings-table');
    inner = tbl ? tbl.outerHTML : '';
  } else if (key === 'groups')      inner = document.getElementById('groups-section')?.innerHTML || '';

  content.innerHTML = `<div class="standings-modal-title">${title}</div>${inner}`;
  modal.classList.add('open');

  if (key === 'bracket') requestAnimationFrame(drawBracketLines);

  /* Timer */
  clearInterval(_stnTimerInterval);
  _stnUpdateTimer();
  _stnTimerInterval = setInterval(_stnUpdateTimer, 1000);
}

function standingsCloseModal(evt) {
  if (evt && evt.target !== document.getElementById('standings-modal')) return;
  document.getElementById('standings-modal')?.classList.remove('open');
  clearInterval(_stnTimerInterval);
  document.getElementById('standings-modal-timer').style.display = 'none';
}

/* Add expand buttons to dynamically rendered group sections */
function _addGroupModalBtns() {
  const section = document.getElementById('groups-section');
  if (!section) return;
  section.querySelectorAll('h4').forEach(h4 => {
    if (h4.querySelector('.section-heading-btn')) return;
    const name = h4.textContent.trim();
    h4.classList.add('section-heading');
    const btn = document.createElement('button');
    btn.className = 'section-heading-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Volledig scherm`;
    btn.onclick = () => standingsOpenModal('groups', name);
    h4.appendChild(btn);
  });
}
