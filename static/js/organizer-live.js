/* organizer-live.js — live scoring panel
   Requires LIVE_CONFIG = { slug, cupCount, scores } defined inline in template */

const CSRF = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';

function updateBonusDisplay(matchId, team, isBonus) {
  const el = document.getElementById(`bonus-display-${team}-${matchId}`);
  const cb = document.getElementById(`bonus${team}-${matchId}`);
  if (el) el.style.visibility = isBonus ? 'visible' : 'hidden';
  if (cb) cb.checked = isBonus;
}
function setBonusManual(matchId, team, checked) {
  const el = document.getElementById(`bonus-display-${team}-${matchId}`);
  if (el) el.style.visibility = checked ? 'visible' : 'hidden';
  fetch(`/t/${LIVE_CONFIG.slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'set_bonus', team: String(team), checked }),
  });
}

function changeScore(matchId, field, delta, slug, maxCups) {
  const s = LIVE_CONFIG.scores;
  if (!s[matchId]) s[matchId] = { score1: 0, score2: 0 };
  const newVal = Math.min(maxCups, Math.max(0, s[matchId][field] + delta));
  s[matchId][field] = newVal;
  document.getElementById(field + '-' + matchId).textContent = newVal;
  const bonusTeam = field === 'score1' ? 1 : 2;
  const isMax = newVal >= maxCups;
  updateBonusDisplay(matchId, bonusTeam, isMax);
  if (isMax) {
    fetch(`/t/${slug}/match/${matchId}/update/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
      body: JSON.stringify({ action: 'set_bonus', team: String(bonusTeam), checked: true }),
    });
  }
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'update_score', score1: s[matchId].score1, score2: s[matchId].score2 }),
  });
}

function startMatch(matchId, slug) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'start' }),
  }).then(() => location.reload());
}

function finishMatch(matchId, slug) {
  const bonus1 = document.getElementById('bonus1-' + matchId)?.checked || false;
  const bonus2 = document.getElementById('bonus2-' + matchId)?.checked || false;
  const s = LIVE_CONFIG.scores[matchId] || { score1: 0, score2: 0 };
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'finish', score1: s.score1, score2: s.score2, bonus_team1: bonus1, bonus_team2: bonus2 }),
  }).then(() => location.reload());
}

function reopenMatch(matchId, slug) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'reopen' }),
  }).then(() => location.reload());
}

function resetMatch(matchId, slug) {
  if (!confirm('Wedstrijd resetten? Scores worden gewist.')) return;
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'reset' }),
  }).then(() => location.reload());
}

function setTable(matchId, tableId, slug) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'set_table', table_id: tableId }),
  });
}

function setTableFilter(filterVal, btn) {
  fetch(`/t/${LIVE_CONFIG.slug}/tafel-fase/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': CSRF, 'X-Requested-With': 'XMLHttpRequest' },
    body: 'phase_filter=' + encodeURIComponent(filterVal),
  }).then(() => {
    document.querySelectorAll('#table-filter-btns button').forEach(b => {
      b.className = b.className.replace(/btn-(primary|info|warning|secondary)\b/g, 'btn-ghost-secondary');
    });
    const cls = filterVal === '' ? 'btn-primary'
              : filterVal === 'knockout' ? 'btn-warning'
              : filterVal === 'playoff'  ? 'btn-info'
              : filterVal === 'final_ranking' ? 'btn-secondary'
              : 'btn-primary';
    btn.className = btn.className.replace('btn-ghost-secondary', cls);
  });
}

function toggleHidden(matchId, slug, btn) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'toggle_hidden' }),
  }).then(r => r.json()).then(d => {
    const card = document.getElementById('match-card-' + matchId);
    if (d.hidden) {
      card.classList.add('is-hidden');
      btn.classList.replace('btn-ghost-secondary', 'btn-danger');
      btn.title = 'Tonen in publiek scorebord';
    } else {
      card.classList.remove('is-hidden');
      btn.classList.replace('btn-danger', 'btn-ghost-secondary');
      btn.title = 'Verbergen in publiek scorebord';
    }
  });
}

// Duplicate-table highlight for normal-round grid (same logic as display-groups.js _checkDuplicates)
function checkTableDuplicates() {
  document.querySelectorAll('.matches-grid, .dg-group-body, .dg-pool-zone').forEach(container => {
    const seen = {};
    const cards = Array.from(container.querySelectorAll('.match-card'));
    cards.forEach(card => {
      const val = card.querySelector('select.table-select-inline')?.value;
      if (val) seen[val] = (seen[val] || 0) + 1;
    });
    cards.forEach(card => {
      const val = card.querySelector('select.table-select-inline')?.value;
      card.classList.toggle('dg-table-conflict', !!(val && seen[val] > 1));
    });
  });
}

document.addEventListener('change', e => {
  if (e.target.classList.contains('table-select-inline')) {
    setTimeout(checkTableDuplicates, 80);
  }
});
document.addEventListener('DOMContentLoaded', () => setTimeout(checkTableDuplicates, 100));

// Start-ronde form via AJAX
document.getElementById('start-round-form')?.addEventListener('submit', function(e) {
  e.preventDefault();
  fetch(this.action, { method: 'POST', headers: { 'X-CSRFToken': CSRF }, body: new FormData(this) })
    .then(r => r.json()).then(d => { if (d.success) location.reload(); });
});

// Timer countdown (organizer live panel)
(function() {
  const el = document.getElementById('timer-display');
  if (!el) return;
  let rem = parseInt(el.dataset.seconds) || (LIVE_CONFIG.roundMinutes * 60);
  const active = el.dataset.active === 'true';

  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  el.textContent = fmt(rem);
  if (!active) return;

  setInterval(() => {
    if (rem > 0) rem--;
    el.textContent = fmt(rem);
    if (rem <= 120) el.classList.add('danger');
  }, 1000);
})();
