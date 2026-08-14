/* public-standings.js — standings, bracket and groups rendering
   Requires PUBLIC_CONFIG = { slug, format, advLine, poCount, playoffEnabled, groupsCount, refreshSeconds } */

/**
 * Build tbody rows.
 * Uses s.advancement ('ko'|'po'|'fr'|null) when available (groups format with cross-group tiebreaker).
 * Falls back to koLine/poLine positional logic for combined format or when field is absent.
 */
function standingsTableRows(data, koLine, poLine) {
  koLine = koLine || 0;
  poLine = (poLine && poLine > koLine) ? poLine : 0;
  const medals = ['r1', 'r2', 'r3'];
  const rows = data.map((s, i) => {
    const rank = i + 1;
    const diff    = (s.cup_diff !== undefined) ? s.cup_diff : (s.cups_scored - s.cups_conceded);
    const diffCls = diff > 0 ? 'stat-diff-pos' : diff < 0 ? 'stat-diff-neg' : 'stat-diff-zero';
    const diffStr = diff > 0 ? `+${diff}` : String(diff);

    let cls = '';
    if (s.advancement !== undefined) {
      // Exact API-computed advancement (accounts for cross-group tiebreakers)
      if (s.advancement === 'ko')      cls += ' adv-ko-team';
      else if (s.advancement === 'po') cls += ' adv-po-team';
    } else {
      // Positional fallback
      if (koLine && rank <= koLine)          cls += ' adv-ko-team';
      else if (poLine && rank <= poLine)     cls += ' adv-po-team';
    }

    return `<tr class="${cls.trim()}">
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

function _advancementLines(advLine, poCount, playoffEnabled) {
  const koLine = advLine || 0;
  const poLine = (playoffEnabled && poCount) ? koLine + poCount : 0;
  return { koLine, poLine };
}

function _renderLegend(el, koLine, poLine) {
  if (!el) return;
  if (!koLine && !poLine) { el.innerHTML = ''; return; }
  let html = '<div class="adv-legend">';
  if (koLine) html += `<span class="adv-legend-item adv-legend-ko">Knock-out</span>`;
  if (poLine) html += `<span class="adv-legend-item adv-legend-po">Play-offs</span>`;
  html += '</div>';
  el.innerHTML = html;
}

function renderStandings(data) {
  const fmt = PUBLIC_CONFIG.format;
  let koLine = 0, poLine = 0;
  if (fmt === 'combined') {
    ({ koLine, poLine } = _advancementLines(
      PUBLIC_CONFIG.advLine,
      PUBLIC_CONFIG.poCount,
      PUBLIC_CONFIG.playoffEnabled
    ));
  }
  document.getElementById('standings-body').innerHTML = standingsTableRows(data, koLine, poLine);
  _renderLegend(document.getElementById('standings-legend'), koLine, poLine);
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
  let shownLegend = false;
  groups.forEach(g => {
    const koLine = g.ko_count  || 0;
    const poLine = (koLine + (g.playoff_count || 0)) || 0;
    const legendHtml = (!shownLegend && (koLine || poLine))
      ? (() => { shownLegend = true; let l = '<div class="adv-legend mb-2">'; if (koLine) l += '<span class="adv-legend-item adv-legend-ko">Knock-out</span>'; if (poLine && poLine > koLine) l += '<span class="adv-legend-item adv-legend-po">Play-offs</span>'; return l + '</div>'; })()
      : '';
    html += legendHtml;
    html += `<h4 class="grp-heading mb-2 fw-bold">${g.name}</h4>`;
    html += `<div class="standings-table-wrap mb-4"><table class="standings-table">${thead}<tbody>${standingsTableRows(g.standings, koLine, poLine)}</tbody></table></div>`;
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

    const gg     = done ? (m.golden_goal || null) : null;
    const w1     = done && (m.score1 > m.score2 || gg === 1);
    const w2     = done && (m.score2 > m.score1 || gg === 2);

    // Determine final positions when match is done
    const pos1   = done ? (w1 ? r1 : r2) : null;
    const pos2   = done ? (w2 ? r1 : r2) : null;

    const statusLabel = done
      ? '✓ Afgelopen'
      : live ? '● Bezig' : 'Gepland';

    const medalCls = (pos) => pos === 1 ? 'r1' : pos === 2 ? 'r2' : pos === 3 ? 'r3' : '';

    const row = (team, score, isWinner, pos, isGg) => `
      <div class="fr-rank-row ${isWinner ? 'winner' : done ? 'loser' : ''} ${medalCls(pos)}">
        <span class="fr-rank-pos">${pos !== null ? pos : '?'}</span>
        <span class="fr-rank-team">${team || 'TBD'}${isGg ? ' <span class="bk-gg" title="Won met golden goal">GG</span>' : ''}</span>
        ${done ? `<span class="fr-rank-score">${score}</span>` : ''}
      </div>`;

    // Show winner first (lower/better position), loser second
    const topRow    = done && w2 ? row(m.team2, m.score2, w2, pos2, gg === 2) : row(m.team1, m.score1, w1, pos1, gg === 1);
    const bottomRow = done && w2 ? row(m.team1, m.score1, w1, pos1, gg === 1) : row(m.team2, m.score2, w2, pos2, gg === 2);

    html += `<div class="fr-rank-group ${cls}">
      <div class="fr-rank-header">
        <span>${_ordNL(r1)}/${_ordNL(r2)} plek</span>
        <span class="fr-rank-status">${statusLabel}</span>
      </div>
      ${topRow}
      ${bottomRow}
      ${ggNoteHtml(m, 'fr-gg-note')}
    </div>`;
  });
  return html + '</div>';
}

function renderMatchList(matches) {
  if (!matches || !matches.length) return '';
  return `<div class="fr-grid">` +
    matches.map(m => {
      const done   = m.status === 'finished';
      const gg     = done ? (m.golden_goal || null) : null;
      const w1     = done && (m.score1 > m.score2 || gg === 1);
      const w2     = done && (m.score2 > m.score1 || gg === 2);
      const cls    = m.status || '';
      const tbl    = m.table ? `<span class="b-table-lbl d-block mt-1">${m.table}</span>` : '';
      const t1cls  = w1 ? 'fr-team-winner' : (done && !w1 ? 'fr-team-loser' : '');
      const t2cls  = w2 ? 'fr-team-winner' : (done && !w2 ? 'fr-team-loser' : '');
      const ggTag  = t => gg === t ? ' <span class="bk-gg" title="Won met golden goal">GG</span>' : '';
      return `<div class="fr-match ${cls}">
        <div class="fr-team ${t1cls}">${m.team1 || 'TBD'}${ggTag(1)}</div>
        <div class="fr-score">${done ? `${m.score1} – ${m.score2}` : '<span class="fr-vs">vs</span>'}${tbl}</div>
        <div class="fr-team text-end ${t2cls}">${m.team2 || 'TBD'}${ggTag(2)}</div>
        ${ggNoteHtml(m, 'fr-gg-note')}
      </div>`;
    }).join('') + `</div>`;
}

/* ── Bracket renderer ─────────────────────────────────────────────
   Structuur: elke ploeg is een los team-slot.
   Kolommen staan naast elkaar via CSS grid.
   Regels worden na render getekend via SVG.
   ─────────────────────────────────────────────────────────────── */

/** Naam van de ploeg die een gelijkstand met golden goal won, of null. */
function ggWinnerName(m) {
  if (!m || !m.golden_goal) return null;
  return m.golden_goal === 1 ? m.team1 : m.team2;
}

/** Regeltje onder een wedstrijd dat de golden goal verduidelijkt. */
function ggNoteHtml(m, cls) {
  const winner = ggWinnerName(m);
  if (!winner) return '';
  return `<div class="${cls || 'bk-gg-note'}">Gelijkstand ${m.score1}–${m.score2} — `
       + `<strong>${winner}</strong> wint met golden goal</div>`;
}

/**
 * Bepaal de staat van één team in een wedstrijd.
 * Geeft { name, score, state, gg } terug.
 * state: 'winner' | 'loser' | 'live' | 'pending' | 'tbd'
 * gg:    true wanneer dit team de golden goal scoorde
 */
function bkTeamInfo(match, which) {
  if (!match) return { name: null, score: null, state: 'tbd' };
  const name  = which === 1 ? match.team1 : match.team2;
  const score = which === 1 ? match.score1 : match.score2;
  if (!name) return { name: null, score: null, state: 'tbd' };
  if (match.status === 'in_progress') return { name, score, state: 'live' };
  if (match.status === 'finished') {
    const gg  = match.golden_goal || null;
    const won = which === 1
      ? (match.score1 > match.score2 || gg === 1)
      : (match.score2 > match.score1 || gg === 2);
    return { name, score, state: won ? 'winner' : 'loser', gg: gg === which };
  }
  return { name, score: null, state: 'pending' };
}

/** Bouw één team-slot HTML. id mag leeg zijn. */
function bkSlot(id, info) {
  const { name, score, state, gg } = info;
  const showScore = (state === 'winner' || state === 'loser' || state === 'live')
    && score !== null && score !== undefined;
  const idAttr  = id ? ` id="${id}"` : '';
  const indicator = state === 'live'
    ? '<span class="bk-pulse"></span>'
    : '<span class="bk-dot"></span>';
  const ggTag = gg ? '<span class="bk-gg" title="Won met golden goal">GG</span>' : '';
  return `<div class="bk-slot ${state}"${idAttr}>${indicator}<span class="bk-name">${name || 'TBD'}</span>${ggTag}${showScore ? `<span class="bk-score">${score}</span>` : ''}</div>`;
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
        ${ggNoteHtml(fin)}
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
        ${ggNoteHtml(trd)}
        ${thirdWinner ? `<div class="bk-third-winner">&#127949; 3e Plaats: ${thirdWinner}</div>` : ''}
      </div>
    </div>`;
  }

  return `<div class="bk-wrap" id="bk-wrap">
    <svg class="bk-svg" id="bk-svg"></svg>
    <div class="bk-inner">
      <div class="bk-grid ${gridCls}">${cols}</div>
      ${thirdHtml}
    </div>
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

function drawBracketLines(root) {
  // `root` scopes every lookup to one bracket instance. Without this, the
  // background page (#bracket-render) and the fullscreen "Volledig scherm"
  // modal clone (#standings-modal-content) — which is a raw innerHTML copy
  // that reuses the exact same ids (bk-wrap, bk-qf1-t1, …) and is never
  // cleared on close — both contain elements with the same id. A bare
  // document.getElementById() always resolves to whichever copy happens to
  // sit first in the DOM, so lines could end up measured against one
  // bracket instance and drawn into (or read from) the other — exactly the
  // "jumping to the wrong spot" glitch.
  root = root || document;
  const wrap = root.querySelector('.bk-wrap');
  const svg  = wrap ? wrap.querySelector('.bk-svg') : null;
  if (!wrap || !svg) return;

  svg.innerHTML = '';
  // Size the SVG to the full *content* box, not the visible viewport box:
  // .bk-wrap scrolls horizontally, so its content is usually wider than
  // what's on screen and lines drawn past clientWidth must still exist.
  const svgW = wrap.scrollWidth;
  const svgH = wrap.scrollHeight;
  svg.setAttribute('width',   svgW);
  svg.setAttribute('height',  svgH);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

  const GREY  = '#cbd5e1';
  const GREEN = '#22c55e';

  // Position of an element in the wrap's CONTENT coordinate space.
  //
  // The SVG is position:absolute inside .bk-wrap, which is the overflow-x:auto
  // scroll container — so the SVG is anchored to the content origin and scrolls
  // with the content. getBoundingClientRect() is viewport-relative, and
  // wrap's own rect does NOT move when scrolled, so subtracting it alone
  // leaves the two spaces out of sync by exactly scrollLeft/scrollTop.
  // Adding the scroll offset back converts into the SVG's space.
  //
  // This was invisible while the bracket was always at scrollLeft 0; once
  // scroll position started being preserved across refreshes, every redraw
  // at a non-zero scroll offset shifted the lines by that amount.
  function pos(id) {
    const el = wrap.querySelector('#' + id);
    if (!el) return null;
    const w = wrap.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    return {
      left:  e.left  - w.left + wrap.scrollLeft,
      right: e.right - w.left + wrap.scrollLeft,
      cy:    (e.top  + e.bottom) / 2 - w.top + wrap.scrollTop,
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
    const el = wrap.querySelector('#' + id);
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

    // Uitgaande lijn naar het doel-slot (groen als er een winnaar doorgaat).
    //
    // Loopt expliciet naar dest.cy in plaats van door te tekenen op midY.
    // Vroeger werd aangenomen dat het midpunt van een paar exact samenvalt
    // met het center van het doel-slot; dat klopte alleen zolang álle slots
    // even hoog waren. Nu ploegnamen mogen teruglopen kan een rij hoger
    // worden dan zijn buren, en dan wijkt dest.cy af van midY. Door een
    // verticaal tussenstuk te tekenen komt de lijn altijd exact op het
    // doel-slot uit, ongeacht de hoogtes.
    // Bij gelijke hoogtes is het V-segment 0 lang en ziet de lijn er
    // identiek uit als voorheen (één rechte horizontale lijn).
    const elbowX = (midX + toX) / 2;
    svg.appendChild(makePath(
      `M ${midX} ${midY} H ${elbowX} V ${dest.cy} H ${toX}`,
      (topWin || botWin) ? GREEN : GREY
    ));
  }

  const hasQF = !!wrap.querySelector('#bk-qf1-t1');
  const hasSF = !!wrap.querySelector('#bk-sf1-t1');

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

  // Align the 3rd/4th-place box under the Final column. CSS (flex
  // centering on .bk-third-section) centers it across the *whole* bracket
  // width, which only coincides with the Final column by accident, and
  // stops working entirely once the bracket scrolls horizontally on a
  // narrow screen. Correct it with a measured pixel offset instead.
  const thirdSection = wrap.querySelector('.bk-third-section');
  const finalBox      = wrap.querySelector('#bk-final-box');
  if (thirdSection && finalBox) {
    thirdSection.style.transform = '';
    const finalRect = finalBox.getBoundingClientRect();
    const thirdRect = thirdSection.getBoundingClientRect();
    const dx = (finalRect.left + finalRect.width / 2) - (thirdRect.left + thirdRect.width / 2);
    thirdSection.style.transform = `translateX(${dx}px)`;
  }
}

/* Redraw whichever bracket instance is actually on screen right now — the
   background page, or the fullscreen modal clone if it's open. */
function _visibleBracketRoot() {
  const modal = document.getElementById('standings-modal');
  const modalContent = document.getElementById('standings-modal-content');
  if (modal && modal.classList.contains('open') && modalContent?.querySelector('.bk-wrap')) {
    return modalContent;
  }
  return document.getElementById('bracket-render');
}
window.addEventListener('resize', () => drawBracketLines(_visibleBracketRoot()));

/* The lines are absolute pixel geometry measured from the laid-out slots, so
   anything that moves or resizes a slot must trigger a redraw — a longer team
   name wrapping to a second line, a score appearing and widening a slot, a
   font finally loading, the phone rotating. A window resize listener alone
   misses all of those, since they change the bracket without changing the
   window. */
const _bkResizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(() => {
      // Redraw is cheap (a handful of <path> nodes) but must not run
      // synchronously inside the observer callback, or it can trigger the
      // "ResizeObserver loop completed with undelivered notifications"
      // warning by mutating layout while notifications are still flushing.
      // Drawing only writes SVG path data, which cannot feed back into
      // layout, so this settles after one pass.
      requestAnimationFrame(() => drawBracketLines(_visibleBracketRoot()));
    })
  : null;

/* Point the observer at the currently-rendered bracket.
   Observes the individual slots, not just the wrap: rows are sized with
   `grid-auto-rows: 1fr`, so when one slot needs more height than its share
   it grows and its siblings shrink — the column's *total* height can stay
   exactly the same while every slot centre inside it moves. Watching only
   the wrap would see nothing happen and leave the lines pointing at where
   the boxes used to be. */
function _observeBracket(root) {
  if (!_bkResizeObserver || !root) return;
  // Drop previous targets so detached nodes from the last render don't
  // linger and fire spurious zero-size callbacks.
  _bkResizeObserver.disconnect();
  const wrap = root.querySelector('.bk-wrap');
  if (!wrap) return;
  _bkResizeObserver.observe(wrap);
  wrap.querySelectorAll('.bk-slot, .bk-final-box').forEach(el => _bkResizeObserver.observe(el));
}

/* Capture/restore horizontal scroll of elements matched by a selector,
   keyed by position — used for containers whose content (and therefore
   whose actual scrollable node, e.g. #bk-wrap) gets rebuilt from scratch
   on every refresh, which would otherwise reset scrollLeft to 0. */
function _captureScrollLefts(selector) {
  return Array.from(document.querySelectorAll(selector)).map(el => el.scrollLeft);
}
function _restoreScrollLefts(selector, values) {
  document.querySelectorAll(selector).forEach((el, i) => {
    if (values[i]) el.scrollLeft = values[i];
  });
}

/* ── Refresh loop ─────────────────────────────────────────────── */
let _lastStandingsKey = null;

async function refresh() {
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const tableScrollLefts = _captureScrollLefts('.standings-table-wrap');
  const bkWrap = document.getElementById('bk-wrap');
  const bkScrollLeft = bkWrap ? bkWrap.scrollLeft : 0;
  try {
    const r    = await fetch(`/api/${PUBLIC_CONFIG.slug}/standings/`);
    const data = await r.json();

    document.getElementById('last-update').textContent =
      'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-BE');

    // Nothing actually changed since the last poll — skip the re-render.
    // Rebuilding the bracket's DOM (and therefore its SVG) on every poll,
    // even when the data is identical, is what made the connector lines
    // flicker/jump on every refresh.
    const dataKey = JSON.stringify(data);
    if (dataKey === _lastStandingsKey) return;
    _lastStandingsKey = dataKey;

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
    _restoreScrollLefts('.standings-table-wrap', tableScrollLefts);

    const bracketEl = document.getElementById('bracket-section');
    const renderEl  = document.getElementById('bracket-render');
    if (data.has_bracket && data.bracket) {
      const html = renderBracket(data.bracket);
      renderEl.innerHTML      = html;
      bracketEl.style.display = html ? '' : 'none';
      if (html) requestAnimationFrame(() => {
        // Restore scroll BEFORE drawing: the line coordinates are computed
        // in the wrap's content space using its current scroll offset, so
        // the scroll position has to be final before we measure.
        const newBkWrap = renderEl.querySelector('.bk-wrap');
        if (newBkWrap) newBkWrap.scrollLeft = bkScrollLeft;
        drawBracketLines(renderEl);
        _observeBracket(renderEl);
      });
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

    // Mirror the freshly-rendered sections into the fullscreen modal if it's
    // open — the whole point of the modal is to watch a section live.
    _stnRenderModal();

    window.scrollTo(scrollX, scrollY);
  } catch(e) { console.error(e); }
}

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

/* Which section the modal is currently showing, or null when closed.
   The modal mirrors a background section, and those sections are re-rendered
   with fresh data on every poll — so remembering what's on display lets the
   refresh loop re-clone it and keep the fullscreen view live. */
let _stnModalState = null;

/* Build the {title, inner} pair for a section by cloning the (already
   refreshed) background DOM. Called both on open and on every refresh. */
function _stnModalContent(key, groupName) {
  let title = SECTION_TITLES[key] || groupName || key;
  if (key === 'standings') title = document.getElementById('standings-title')?.textContent || 'Stand';

  let inner = '';
  if (key === 'bracket') {
    inner = document.getElementById('bracket-render')?.innerHTML || '';
  } else if (key === 'playoff') {
    inner = document.getElementById('playoff-render')?.innerHTML || '';
  } else if (key === 'final_ranking') {
    inner = document.getElementById('final-ranking-render')?.innerHTML || '';
  } else if (key === 'standings') {
    const wrap = document.querySelector('#standings-section .standings-table-wrap');
    inner = wrap ? wrap.outerHTML : '';
  } else if (key === 'groups') {
    // Show only the specific group that was clicked
    // Use data-grp-name to avoid matching button text inside the h4
    const section = document.getElementById('groups-section');
    if (section && groupName) {
      const h4s = section.querySelectorAll('h4[data-grp-name]');
      for (const h4 of h4s) {
        if (h4.dataset.grpName === groupName) {
          let el = h4.nextElementSibling;
          while (el && !el.classList.contains('standings-table-wrap')) el = el.nextElementSibling;
          if (el) inner = el.outerHTML;
          break;
        }
      }
    }
    if (!inner) inner = section?.innerHTML || '';  // fallback: all groups
  }
  return { title, inner };
}

/* (Re)paint the open modal from the current background DOM, preserving the
   viewer's scroll position inside it so a refresh doesn't yank the view. */
function _stnRenderModal() {
  if (!_stnModalState) return;
  const { key, groupName } = _stnModalState;
  const content = document.getElementById('standings-modal-content');
  if (!content) return;

  const bodyScrollTop  = content.scrollTop;
  const bodyScrollLeft = content.scrollLeft;
  const innerWrap      = content.querySelector('.bk-wrap');
  const innerScrollLeft = innerWrap ? innerWrap.scrollLeft : 0;

  const { title, inner } = _stnModalContent(key, groupName);
  content.innerHTML = `<div class="standings-modal-title">${title}</div>${inner}`;

  content.scrollTop  = bodyScrollTop;
  content.scrollLeft = bodyScrollLeft;

  if (key === 'bracket') requestAnimationFrame(() => {
    // Scroll first, then measure — the line geometry is computed in the
    // wrap's content space from its current scroll offset.
    const newWrap = content.querySelector('.bk-wrap');
    if (newWrap) newWrap.scrollLeft = innerScrollLeft;
    drawBracketLines(content);
    _observeBracket(content);
  });
}

function standingsOpenModal(key, groupName) {
  const modal   = document.getElementById('standings-modal');
  const wrap    = document.getElementById('standings-modal-wrap');
  const content = document.getElementById('standings-modal-content');
  if (!modal || !content) return;

  /* Wide variant for all section types except plain standings */
  wrap.classList.toggle('is-wide', ['bracket', 'groups', 'playoff', 'final_ranking'].includes(key));

  _stnModalState = { key, groupName };
  _stnRenderModal();
  modal.classList.add('open');

  /* Timer */
  clearInterval(_stnTimerInterval);
  _stnUpdateTimer();
  _stnTimerInterval = setInterval(_stnUpdateTimer, 1000);
}

function standingsCloseModal(evt) {
  if (evt && evt.target !== document.getElementById('standings-modal')) return;
  document.getElementById('standings-modal')?.classList.remove('open');
  clearInterval(_stnTimerInterval);
  _stnModalState = null;
  document.getElementById('standings-modal-timer').style.display = 'none';
  // Drop the cloned content — it's a raw innerHTML copy that reuses the
  // background page's ids (bk-wrap, bk-qf1-t1, …), so leaving it in the DOM
  // creates duplicate ids that confuse later id-based lookups.
  const content = document.getElementById('standings-modal-content');
  if (content) content.innerHTML = '';
  // The observer was pointed at the modal's (now discarded) slots; hand it
  // back to the page bracket so resizes keep redrawing before the next poll.
  _observeBracket(document.getElementById('bracket-render'));
}

/* Add expand buttons to dynamically rendered group sections */
function _addGroupModalBtns() {
  const section = document.getElementById('groups-section');
  if (!section) return;
  section.querySelectorAll('h4.grp-heading').forEach(h4 => {
    if (h4.querySelector('.section-heading-btn')) return;
    // Store the clean group name as a data-attribute before adding button text
    const name = h4.textContent.trim();
    h4.dataset.grpName = name;
    h4.classList.add('section-heading');
    const btn = document.createElement('button');
    btn.className = 'section-heading-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Volledig scherm`;
    btn.onclick = () => standingsOpenModal('groups', name);
    h4.appendChild(btn);
  });
}

/* ── Bootstrap ────────────────────────────────────────────────────
   Kick off the poll loop last, so every declaration above (including the
   modal state the refresh loop touches) is initialised before it runs. */
refresh();
setInterval(refresh, (PUBLIC_CONFIG.refreshSeconds || 5) * 1000);
