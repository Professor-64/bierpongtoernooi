/* public-base.js — header timer + sound management for all public pages
   Requires PUBLIC_CONFIG = { slug } defined inline in base_public.html */

(function() {
  const slug      = PUBLIC_CONFIG.slug;
  const el        = document.getElementById('header-timer-display');
  const unlockBtn = document.getElementById('sound-unlock-btn');
  if (!el) return;

  let serverRemaining = 0, isActive = false, fetchedAt = null;
  let soundEnabled = false, audioUnlocked = false;
  let prevIsActive = false, prevRemaining = null;
  let warningPlayed = false, endPlayed = false;

  const sounds = { start: null, end: null, warning: null };

  // Expose timer state globally so other page scripts can read it
  window.bpTimer = { remaining: 0, isActive: false, fetchedAt: null };

  function fmt(s) {
    if (s < 0) s = 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function preloadSound(key, url) {
    if (!url) { sounds[key] = null; return; }
    if (sounds[key] && sounds[key]._url === url) return;
    const audio = new Audio(url);
    audio._url = url;
    audio.preload = 'auto';
    sounds[key] = audio;
  }

  function playSound(key) {
    if (!audioUnlocked || !soundEnabled) return;
    const s = sounds[key];
    if (!s) return;
    try { s.currentTime = 0; s.play().catch(() => {}); } catch(e) {}
  }

  function unlockAudio() {
    audioUnlocked = true;
    if (unlockBtn) unlockBtn.style.display = 'none';
    Object.values(sounds).forEach(s => {
      if (!s) return;
      const vol = s.volume; s.volume = 0;
      s.play().then(() => { s.pause(); s.currentTime = 0; s.volume = vol; }).catch(() => {});
    });
  }
  window.unlockAudio = unlockAudio;

  async function fetchTimer() {
    try {
      const r = await fetch(`/api/${slug}/timer/`);
      const d = await r.json();
      const newActive    = d.is_active;
      const newRemaining = d.remaining_seconds;

      soundEnabled = d.sound_enabled || false;
      if (soundEnabled) {
        preloadSound('start',   d.sound_start_url   || null);
        preloadSound('end',     d.sound_end_url     || null);
        preloadSound('warning', d.sound_warning_url || null);
        if (!audioUnlocked && unlockBtn &&
            (d.sound_start_url || d.sound_end_url || d.sound_warning_url)) {
          unlockBtn.style.display = 'block';
        }
      } else {
        if (unlockBtn) unlockBtn.style.display = 'none';
      }

      if (soundEnabled && audioUnlocked) {
        if (newActive && !prevIsActive) { playSound('start'); warningPlayed = false; endPlayed = false; }
        if (prevIsActive && newActive && newRemaining === 0 && !endPlayed) { playSound('end'); endPlayed = true; }
        if (newActive && newRemaining <= 30 && (prevRemaining === null || prevRemaining > 30) && !warningPlayed) {
          playSound('warning'); warningPlayed = true;
        }
      }
      if (!newActive && prevIsActive) { warningPlayed = false; endPlayed = false; }

      prevIsActive   = newActive;
      prevRemaining  = newRemaining;
      serverRemaining = newRemaining;
      isActive        = newActive;
      fetchedAt       = Date.now();
      window.bpTimer  = { remaining: serverRemaining, isActive, fetchedAt };
    } catch(e) {}
  }

  function tick() {
    let rem = serverRemaining;
    if (isActive && fetchedAt) rem = Math.max(0, serverRemaining - Math.floor((Date.now() - fetchedAt) / 1000));
    el.textContent = fmt(rem);
    el.className = 'header-timer' + (rem <= 120 && isActive ? ' danger' : !isActive ? ' inactive' : '');
  }

  fetchTimer();
  setInterval(tick, 1000);
  setInterval(fetchTimer, 5000);
})();
