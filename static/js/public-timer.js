/* public-timer.js — fullscreen timer page
   Requires PUBLIC_CONFIG = { slug } */

let serverRemaining = 0, isActive = false, fetchedAt = null;

function fmt(s) {
  if (s < 0) s = 0;
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

async function fetchTimer() {
  try {
    const r = await fetch(`/api/${PUBLIC_CONFIG.slug}/timer/`);
    const d = await r.json();
    serverRemaining = d.remaining_seconds;
    isActive        = d.is_active;
    fetchedAt       = Date.now();
    document.getElementById('timer-status').textContent =
      isActive ? 'Loopt' : serverRemaining > 0 ? 'Gepauzeerd' : 'Niet gestart';
  } catch(e) {}
}

function tick() {
  const el  = document.getElementById('timer-display');
  const lbl = document.getElementById('timer-label');
  let rem   = serverRemaining;
  if (isActive && fetchedAt) rem = Math.max(0, serverRemaining - Math.floor((Date.now() - fetchedAt) / 1000));
  el.textContent  = fmt(rem);
  el.className    = 'timer-number' +
    (rem <= 0 && (isActive || serverRemaining === 0) ? ' finished' : rem <= 120 && isActive ? ' danger' : '');
  lbl.textContent =
    rem <= 0 && isActive ? 'TIJD OM!' : rem <= 120 && isActive ? 'Ronde bijna voorbij' : 'Ronde timer';
}

fetchTimer();
setInterval(tick, 1000);
setInterval(fetchTimer, (PUBLIC_CONFIG.refreshSeconds || 5) * 1000);
