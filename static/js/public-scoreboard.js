/* public-scoreboard.js — live scores display
   Requires PUBLIC_CONFIG = { slug } */

function renderMatch(m) {
  const isLive = m.status === 'in_progress';
  const isDone = m.status === 'finished';
  const w1 = isDone && m.score1 > m.score2;
  const w2 = isDone && m.score2 > m.score1;
  const c1 = w1 ? '#16a34a' : isDone && !w1 ? '#dc2626' : '#1e293b';
  const c2 = w2 ? '#16a34a' : isDone && !w2 ? '#dc2626' : '#1e293b';
  return `
    <div class="match-row ${isLive ? 'live' : isDone ? 'finished' : ''}">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-secondary-lt text-secondary">${m.table || ''}</span>
        <span class="badge bg-secondary-lt text-secondary">${m.phase}</span>
        ${isLive
          ? `<span class="badge ms-auto" style="background:#e8f4e8;color:#16a34a"><span class="live-indicator me-1"></span>LIVE</span>`
          : isDone
          ? `<span class="badge bg-success-lt text-success ms-auto">Klaar</span>`
          : `<span class="badge bg-secondary-lt ms-auto">Gepland</span>`}
      </div>
      <div class="d-flex align-items-center">
        <div class="flex-fill"><div class="team-name-pub" style="color:${c1}">${m.team1}${m.bonus_team1 ? ' <span class="badge bg-warning-lt text-warning">Bonus</span>' : ''}</div></div>
        <div class="d-flex align-items-center gap-2 mx-3">
          <span class="score-big" style="color:${c1}">${m.score1}</span>
          <span class="text-muted">–</span>
          <span class="score-big" style="color:${c2}">${m.score2}</span>
        </div>
        <div class="flex-fill text-end"><div class="team-name-pub" style="color:${c2}">${m.team2}${m.bonus_team2 ? ' <span class="badge bg-warning-lt text-warning">Bonus</span>' : ''}</div></div>
      </div>
    </div>`;
}

async function refresh() {
  try {
    const r    = await fetch(`/api/${PUBLIC_CONFIG.slug}/scores/`);
    const data = await r.json();
    const live     = data.matches.filter(m => m.status === 'in_progress');
    const done     = data.matches.filter(m => m.status === 'finished');
    const upcoming = data.upcoming || [];
    let html = '';
    if (live.length)     { html += '<div class="section-label">Nu bezig</div>';    live.forEach(m => html += renderMatch(m)); }
    if (upcoming.length) { html += '<div class="section-label">Volgende</div>';    upcoming.slice(0, 4).forEach(m => html += renderMatch(m)); }
    if (done.length)     { html += '<div class="section-label">Afgespeeld</div>'; done.slice(0, 10).forEach(m => html += renderMatch(m)); }
    if (!live.length && !done.length && !upcoming.length) {
      html = '<div class="text-center text-muted py-5">Nog geen wedstrijden gespeeld</div>';
    }
    document.getElementById('scoreboard-content').innerHTML = html;
    document.getElementById('last-update').textContent = 'Bijgewerkt: ' + new Date().toLocaleTimeString('nl-BE');
  } catch(e) { console.error(e); }
}

refresh();
setInterval(refresh, 5000);
