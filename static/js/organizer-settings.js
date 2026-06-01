/* organizer-settings.js — tournament settings page */

// Theme color preview
const pc      = document.getElementById('id_primary_color');
const preview = document.getElementById('theme-preview');
if (pc && preview) {
  pc.addEventListener('input', () => { preview.style.backgroundColor = pc.value; });
}

// Show/hide sections based on selected format
const formatSelect = document.getElementById('id_format');

const VISIBILITY = [
  { id: 'section-groups-header',     show: ['groups'] },
  { id: 'section-competitie-header', show: ['round_robin', 'combined'] },
  { id: 'section-schema-punten',     show: ['round_robin', 'combined', 'groups'] },
  { id: 'row-knockout-advancement',  show: ['combined'] },
  { id: 'section-playoffs-header',   show: ['round_robin', 'combined', 'groups'] },
  { id: 'row-playoffs-toggle',       show: ['combined', 'groups'] },
  { id: 'row-final-ranking-toggle',  show: ['round_robin', 'combined', 'groups'] },
];

function applyFormatVisibility() {
  if (!formatSelect) return;
  const fmt = formatSelect.value;
  VISIBILITY.forEach(({ id, show }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = show.includes(fmt) ? '' : 'none';
  });
}

if (formatSelect) {
  formatSelect.addEventListener('change', applyFormatVisibility);
  applyFormatVisibility();
}

// Play-off count toggle
const playoffToggle  = document.getElementById('id_playoff_enabled');
const playoffOptions = document.getElementById('playoff-options');
function updatePlayoffOptions() {
  if (!playoffToggle || !playoffOptions) return;
  if (playoffToggle.checked) {
    playoffOptions.style.removeProperty('display');
  } else {
    playoffOptions.style.setProperty('display', 'none', 'important');
  }
}
if (playoffToggle) {
  playoffToggle.addEventListener('change', updatePlayoffOptions);
  updatePlayoffOptions();
}
