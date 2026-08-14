/* organizer-live.js — live scoring panel
   Requires LIVE_CONFIG = { slug, cupCount, scores } defined inline in template */

const CSRF = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';

/* ── Scrollpositie bewaren over een herlaad heen ──────────────────
   location.reload() zet de pagina terug bovenaan. We onthouden waar de
   bewerkte kaart in beeld stond en zetten hem daarna op exact dezelfde
   plek terug — beter dan een vaste pixelpositie, want een kaart wordt
   hoger of lager naargelang zijn status (een heropende kaart krijgt er
   vinkjes bij, een afgesloten kaart verliest ze). */
const _SCROLL_KEY = 'bpLiveScroll';

function _reloadKeepScroll(matchId) {
  const card = matchId ? document.getElementById('match-card-' + matchId) : null;
  sessionStorage.setItem(_SCROLL_KEY, JSON.stringify({
    x: window.scrollX,
    y: window.scrollY,
    matchId: matchId || null,
    cardTop: card ? card.getBoundingClientRect().top : null,
  }));
  location.reload();
}

(function _restoreScrollAfterReload() {
  const raw = sessionStorage.getItem(_SCROLL_KEY);
  if (!raw) return;
  sessionStorage.removeItem(_SCROLL_KEY);

  let st;
  try { st = JSON.parse(raw); } catch (e) { return; }
  if (!st) return;

  // De browser mag niet zelf terugspringen terwijl wij herstellen.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let frames = 0;
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('load', apply);
    ['wheel', 'touchmove', 'keydown'].forEach(ev => window.removeEventListener(ev, stop));
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
  }

  // Doelpositie telkens opnieuw berekenen: de kaart kan pas na de layout
  // op zijn definitieve plek staan.
  function targetY() {
    if (st.matchId && st.cardTop !== null && st.cardTop !== undefined) {
      const card = document.getElementById('match-card-' + st.matchId);
      if (card) {
        return Math.max(0, card.getBoundingClientRect().top + window.scrollY - st.cardTop);
      }
    }
    return st.y || 0;
  }

  function apply() {
    if (stopped) return;
    const ty = targetY();
    window.scrollTo(st.x || 0, ty);
    // Dit script draait onderaan de body, dus de pagina is dan nog niet
    // volledig uitgelijnd en scrollTo wordt geklemd op een te kleine
    // documenthoogte. Herhalen tot de positie echt bereikt is.
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (Math.abs(window.scrollY - Math.min(ty, maxY)) < 2 && maxY >= ty) {
      stop();
      return;
    }
    if (++frames > 60) { stop(); return; }   // ~1s, dan opgeven
    requestAnimationFrame(apply);
  }

  // Een echte scrollpoging van de gebruiker wint altijd van het herstel.
  ['wheel', 'touchmove', 'keydown'].forEach(ev =>
    window.addEventListener(ev, stop, { passive: true }));
  window.addEventListener('load', apply);
  apply();
})();

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

// Golden goal: slechts één ploeg kan hem scoren, dus het andere vinkje valt weg.
function setGoldenGoal(matchId, team, checked) {
  const other = team === 1 ? 2 : 1;
  const show = (t, on) => {
    const el = document.getElementById(`gg-display-${t}-${matchId}`);
    if (el) el.style.visibility = on ? 'visible' : 'hidden';
    const cb = document.getElementById(`gg${t}-${matchId}`);
    if (cb) cb.checked = on;
  };
  show(team, checked);
  if (checked) show(other, false);
  fetch(`/t/${LIVE_CONFIG.slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'set_golden_goal', team: String(team), checked }),
  });
}

function _applyScore(matchId, field, newVal, slug, maxCups) {
  const s = LIVE_CONFIG.scores;
  if (!s[matchId]) s[matchId] = { score1: 0, score2: 0 };
  s[matchId][field] = newVal;
  const el = document.getElementById(field + '-' + matchId);
  if (el) { el.tagName === 'INPUT' ? (el.value = newVal) : (el.textContent = newVal); }
  const bonusTeam = field === 'score1' ? 1 : 2;
  const isMax = newVal >= maxCups;
  // In de knock-out staan er geen bonusvinkjes op de kaart (er is daar geen
  // klassement), dus dan valt de automatische bonus bij alle bekers ook weg.
  if (document.getElementById(`bonus-display-${bonusTeam}-${matchId}`)) {
    updateBonusDisplay(matchId, bonusTeam, isMax);
    if (isMax) {
      fetch(`/t/${slug}/match/${matchId}/update/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
        body: JSON.stringify({ action: 'set_bonus', team: String(bonusTeam), checked: true }),
      });
    }
  }
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'update_score', score1: s[matchId].score1, score2: s[matchId].score2 }),
  });
}

function changeScore(matchId, field, delta, slug, maxCups) {
  const s = LIVE_CONFIG.scores;
  if (!s[matchId]) s[matchId] = { score1: 0, score2: 0 };
  const newVal = Math.min(maxCups, Math.max(0, s[matchId][field] + delta));
  _applyScore(matchId, field, newVal, slug, maxCups);
}

function validateAndSetScore(input, matchId, field, slug, maxCups) {
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) val = 0;
  if (val > maxCups) val = maxCups;
  // Only clamp the displayed value when the user has finished typing a number
  // (allow empty/intermediate state while typing)
  if (input.value !== '' && String(val) !== input.value) input.value = val;
  _applyScore(matchId, field, val, slug, maxCups);
}

function startMatch(matchId, slug) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'start' }),
  }).then(() => _reloadKeepScroll(matchId));
}

function finishMatch(matchId, slug) {
  const s = LIVE_CONFIG.scores[matchId] || { score1: 0, score2: 0 };
  const bonusBox1 = document.getElementById('bonus1-' + matchId);
  const bonusBox2 = document.getElementById('bonus2-' + matchId);
  const ggBox1 = document.getElementById('gg1-' + matchId);
  const ggBox2 = document.getElementById('gg2-' + matchId);
  const payload = { action: 'finish', score1: s.score1, score2: s.score2 };
  // Bonus- en golden-goalwaarden enkel meesturen als die vinkjes op deze kaart
  // staan, zodat een kaart zonder die optie niets overschrijft.
  if (bonusBox1 || bonusBox2) {
    payload.bonus_team1 = !!bonusBox1?.checked;
    payload.bonus_team2 = !!bonusBox2?.checked;
  }
  if (ggBox1 || ggBox2) {
    payload.golden_goal_team1 = !!ggBox1?.checked;
    payload.golden_goal_team2 = !!ggBox2?.checked;
    if (s.score1 === s.score2 && !payload.golden_goal_team1 && !payload.golden_goal_team2) {
      if (!confirm('Gelijkstand zonder golden goal — er gaat dan niemand door.\n\nToch afsluiten?')) return;
    }
  }
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify(payload),
  }).then(() => _reloadKeepScroll(matchId));
}

function reopenMatch(matchId, slug) {
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'reopen' }),
  }).then(() => _reloadKeepScroll(matchId));
}

function resetMatch(matchId, slug) {
  if (!confirm('Wedstrijd resetten? Scores worden gewist.')) return;
  fetch(`/t/${slug}/match/${matchId}/update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    body: JSON.stringify({ action: 'reset' }),
  }).then(() => _reloadKeepScroll(matchId));
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
