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
  { id: 'section-gelijkstand',            show: ['round_robin', 'combined', 'groups'] },
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

// ── Tiebreaker drag-and-drop ──────────────────────────────────────
const TIEBREAKER_LABELS = {
  points:        'Punten',
  cup_diff:      'Bekerverschil (gescoord − tegen)',
  cups_scored:   'Meeste bekers gescoord',
  cups_conceded: 'Minste bekers tegen',
};
const DEFAULT_ORDER = ['points', 'cup_diff', 'cups_scored', 'cups_conceded'];

function initTiebreaker() {
  const listEl   = document.getElementById('tiebreaker-list');
  const hiddenEl = document.getElementById('id_tiebreaker_order');
  if (!listEl || !hiddenEl) return;

  // Parse saved order from hidden input
  let order = DEFAULT_ORDER;
  try {
    const parsed = JSON.parse(hiddenEl.value || '[]');
    if (Array.isArray(parsed) && parsed.length === 4) order = parsed;
  } catch(e) {}

  // Ensure all 4 keys are present (forward-compat)
  DEFAULT_ORDER.forEach(k => { if (!order.includes(k)) order.push(k); });

  function buildList() {
    listEl.innerHTML = '';
    order.forEach(key => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center gap-2 py-2 tiebreaker-item';
      li.dataset.key = key;
      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="icon text-muted flex-shrink-0" width="18" height="18"
             viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" style="cursor:grab">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>
        </svg>
        <span class="fw-medium">${order.indexOf(key) + 1}.</span>
        <span>${TIEBREAKER_LABELS[key] || key}</span>`;
      listEl.appendChild(li);
    });
  }

  function syncHidden() {
    order = [...listEl.querySelectorAll('.tiebreaker-item')].map(el => el.dataset.key);
    // Update position numbers
    listEl.querySelectorAll('.tiebreaker-item').forEach((el, i) => {
      el.querySelector('span.fw-medium').textContent = (i + 1) + '.';
    });
    hiddenEl.value = JSON.stringify(order);
  }

  buildList();
  hiddenEl.value = JSON.stringify(order);

  // Tabler/Sortable is available via CDN (see extra_scripts in template)
  if (typeof Sortable !== 'undefined') {
    Sortable.create(listEl, {
      animation: 150,
      handle: '.tiebreaker-item',
      ghostClass: 'sortable-ghost',
      onEnd: syncHidden,
    });
  }
}

initTiebreaker();
