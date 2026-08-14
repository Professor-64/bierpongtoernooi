/* public-scoreboard.js — live wedstrijden display
   Requires PUBLIC_CONFIG = { slug, refreshSeconds } */

function renderMatch(m) {
  const isLive = m.status === 'in_progress';
  const isDone = m.status === 'finished';
  // 1 of 2 wanneer een gelijkstand met golden goal beslist is
  const gg = m.golden_goal || null;
  const w1 = isDone && (m.score1 > m.score2 || gg === 1);
  const w2 = isDone && (m.score2 > m.score1 || gg === 2);
  const c1 = w1 ? '#16a34a' : isDone && !w1 ? '#dc2626' : '#1e293b';
  const c2 = w2 ? '#16a34a' : isDone && !w2 ? '#dc2626' : '#1e293b';
  const statusBadge = isLive
    ? `<span class="badge ms-auto" style="background:#e8f4e8;color:#16a34a"><span class="live-indicator me-1"></span>LIVE</span>`
    : isDone
    ? `<span class="badge bg-success-lt text-success ms-auto">Klaar</span>`
    : `<span class="badge bg-secondary-lt ms-auto">Gepland</span>`;

  const ggBadge = '<span class="badge gg-badge">Golden goal</span>';
  const ggNote = gg
    ? `<div class="match-gg-note">Gelijkstand ${m.score1}–${m.score2} — <strong>${gg === 1 ? m.team1 : m.team2}</strong> wint met golden goal</div>`
    : '';

  return `
    <div class="match-row ${isLive ? 'live' : isDone ? 'finished' : ''}">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-secondary-lt text-secondary">${m.table || ''}</span>
        ${statusBadge}
      </div>
      <div class="d-flex align-items-center">
        <div class="flex-fill"><div class="team-name-pub" style="color:${c1}">${m.team1}${m.bonus_team1 ? ' <span class="badge bg-warning-lt text-warning">Bonus</span>' : ''}${gg === 1 ? ' ' + ggBadge : ''}</div></div>
        <div class="d-flex align-items-center gap-2 mx-3">
          <span class="score-big" style="color:${c1}">${m.score1}</span>
          <span class="text-muted">–</span>
          <span class="score-big" style="color:${c2}">${m.score2}</span>
        </div>
        <div class="flex-fill text-end"><div class="team-name-pub" style="color:${c2}">${m.team2}${m.bonus_team2 ? ' <span class="badge bg-warning-lt text-warning">Bonus</span>' : ''}${gg === 2 ? ' ' + ggBadge : ''}</div></div>
      </div>
      ${ggNote}
    </div>`;
}

/**
 * Group an array of matches by their `phase` field, preserving insertion order.
 * Returns [{label, matches}]
 */
function groupByPhase(arr) {
  const map = new Map();
  arr.forEach(m => {
    if (!map.has(m.phase)) map.set(m.phase, []);
    map.get(m.phase).push(m);
  });
  return [...map.entries()].map(([label, matches]) => ({ label, matches }));
}

/** Render a bordered phase group with header. */
function renderPhaseGroup(label, matches) {
  return `
    <div class="phase-group mb-3">
      <div class="phase-group-header">${label}</div>
      <div class="phase-group-body">
        ${matches.map(renderMatch).join('')}
      </div>
    </div>`;
}

let _lastScoreboardKey = null;

async function refresh() {
  const scrollX = window.scrollX, scrollY = window.scrollY;
  try {
    const r    = await fetch(`/api/${PUBLIC_CONFIG.slug}/scores/`);
    const data = await r.json();

    document.getElementById('last-update').textContent = 'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-BE');

    // Skip the re-render when nothing changed since the last poll — rebuilding
    // the match list every few seconds regardless causes needless flicker.
    const dataKey = JSON.stringify(data);
    if (dataKey === _lastScoreboardKey) return;
    _lastScoreboardKey = dataKey;

    const live     = data.matches.filter(m => m.status === 'in_progress');
    const done     = data.matches.filter(m => m.status === 'finished');
    const upcoming = data.upcoming || [];
    let html = '';

    if (live.length) {
      html += '<div class="section-label">Nu bezig</div>';
      groupByPhase(live).forEach(g => {
        html += renderPhaseGroup(g.label, g.matches);
      });
    }

    if (upcoming.length) {
      html += '<div class="section-label">Volgende</div>';
      groupByPhase(upcoming.slice(0, 8)).forEach(g => {
        html += renderPhaseGroup(g.label, g.matches);
      });
    }

    if (done.length) {
      html += '<div class="section-label">Afgespeeld</div>';
      groupByPhase(done.slice(0, 20)).forEach(g => {
        html += renderPhaseGroup(g.label, g.matches);
      });
    }

    if (!live.length && !done.length && !upcoming.length) {
      html = '<div class="text-center text-muted py-5">Nog geen wedstrijden gespeeld</div>';
    }

    document.getElementById('scoreboard-content').innerHTML = html;
    window.scrollTo(scrollX, scrollY);
  } catch(e) { console.error(e); }
}

refresh();
setInterval(refresh, (PUBLIC_CONFIG.refreshSeconds || 5) * 1000);
