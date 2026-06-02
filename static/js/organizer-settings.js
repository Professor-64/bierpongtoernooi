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
  { id: 'section-groups-header',          show: ['groups'] },
  { id: 'section-competitie-header',      show: ['round_robin', 'combined'] },
  { id: 'section-knockout-advancement',   show: ['combined', 'groups'] },
  { id: 'section-schema-punten',          show: ['round_robin', 'combined', 'groups'] },
  { id: 'section-playoffs-header',        show: ['round_robin', 'combined', 'groups'] },
  { id: 'row-playoffs-toggle',            show: ['combined', 'groups'] },
  { id: 'row-final-ranking-toggle',       show: ['round_robin', 'combined', 'groups'] },
];

function applyFormatVisibility() {
  if (!formatSelect) return;
  const fmt = formatSelect.value;
  VISIBILITY.forEach(({ id, show }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !show.includes(fmt);
  });
  // Context-sensitive hint under knockout_advancement
  const hintCombined = document.getElementById('hint-knockout-combined');
  const hintGroups   = document.getElementById('hint-knockout-groups');
  if (hintCombined) hintCombined.hidden = fmt !== 'combined';
  if (hintGroups)   hintGroups.hidden   = fmt !== 'groups';
}

const originalFormat = formatSelect ? formatSelect.value : null;

if (formatSelect) {
  formatSelect.addEventListener('change', applyFormatVisibility);
  applyFormatVisibility();
}

// Intercept game-form submit: ask about rules regeneration when format changes
const gameForm = document.querySelector('#tab-game form');
if (gameForm && originalFormat !== null) {
  gameForm.addEventListener('submit', function() {
    if (formatSelect.value === originalFormat) return;
    const regen = window.confirm(
      'Het formaat is gewijzigd.\n\nWil je de afspraken automatisch opnieuw genereren op basis van de nieuwe instellingen?\n\nOK = opnieuw genereren   Annuleren = huidig tekst bewaren'
    );
    let inp = document.getElementById('_regenerate_rules_field');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'hidden';
      inp.id   = '_regenerate_rules_field';
      inp.name = 'regenerate_rules';
      gameForm.appendChild(inp);
    }
    inp.value = regen ? '1' : '0';
  });
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
