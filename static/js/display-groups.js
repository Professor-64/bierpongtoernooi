/* display-groups.js — drag-and-drop DisplayGroup manager (Sortable.js) */

const DG = {
  slug: null,
  tableCount: 0,

  /* swap-on-hover state */
  _swapTimeout: null,
  _swapHoverMatchId: null,   // ID of the card being hovered over
  _swapHoverEl: null,        // DOM element of that card
  _swapFromEl: null,         // source sortable container
  _swapFromId: null,         // source groupId string
  _swapToEl: null,           // target sortable container

  /* last known mouse position for the Sortable nudge */
  _mouseX: 0,
  _mouseY: 0,

  init(slug, tableCount) {
    this.slug      = slug;
    this.tableCount = tableCount;

    document.addEventListener('mousemove', e => { DG._mouseX = e.clientX; DG._mouseY = e.clientY; });
    document.addEventListener('touchmove', e => {
      DG._mouseX = e.touches[0].clientX; DG._mouseY = e.touches[0].clientY;
    }, { passive: true });

    /* Re-sort + check duplicates when table-select changes inside a group body */
    document.addEventListener('change', e => {
      const sel = e.target;
      if (!sel.classList.contains('table-select-inline')) return;
      const body = sel.closest('.dg-group-body');
      if (body) {
        setTimeout(() => {
          DG._sortByTable(body);
          DG._checkDuplicates();
        }, 80);
      }
    });

    this._initSortables();
    /* Check on load */
    setTimeout(() => this._checkDuplicates(), 100);
  },

  _csrf() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
  },

  _initSortables() {
    const pool = document.getElementById('dg-pool-zone');
    if (pool) this._makeSortable(pool);
    document.querySelectorAll('.dg-group-body').forEach(el => this._makeSortable(el));
  },

  _makeSortable(el) {
    Sortable.create(el, {
      group: 'dg-matches',
      animation: 150,
      ghostClass: 'sortable-ghost',
      handle: '.card-header',
      filter: 'select,button,input',
      preventOnFilter: false,

      onMove: (evt) => {
        const to     = evt.to;
        const from   = evt.from;
        const toId   = to.dataset.groupId;
        const fromId = from.dataset.groupId;
        const rel    = evt.related;

        /* Reordering within the same container — always allowed */
        if (!toId || toId === fromId) {
          DG._cancelSwap();
          return true;
        }

        const count = to.querySelectorAll('.match-card').length;

        if (count < DG.tableCount) {
          /* Target has room — normal drop */
          DG._cancelSwap();
          return true;
        }

        /* Target is full → start / continue swap countdown */
        if (!rel || !rel.dataset?.matchId) {
          /* Hovering over empty space in a full group — block but no swap */
          DG._cancelSwap();
          return false;
        }

        const relId = rel.dataset.matchId;

        if (relId !== DG._swapHoverMatchId) {
          /* Hovering over a new card — restart countdown */
          DG._cancelSwap();
          DG._swapHoverMatchId = relId;
          DG._swapHoverEl      = rel;
          DG._swapFromEl       = from;
          DG._swapFromId       = fromId;
          DG._swapToEl         = to;

          rel.classList.add('dg-swap-pending');

          DG._swapTimeout = setTimeout(() => DG._doSwap(), 3000);
        }

        return false;   /* block until swap fires (or card moves away) */
      },

      onEnd: (evt) => {
        DG._cancelSwap();
        DG._onDragEnd(evt);
      },
    });
  },

  /* ── Swap logic ── */

  _doSwap() {
    const targetCard = DG._swapHoverEl;
    const fromEl     = DG._swapFromEl;
    const fromId     = DG._swapFromId;
    const toEl       = DG._swapToEl;

    /* Reset swap state first */
    DG._swapTimeout     = null;
    DG._swapHoverMatchId = null;
    DG._swapHoverEl     = null;

    if (!targetCard || !fromEl || !toEl) return;

    targetCard.classList.remove('dg-swap-pending');

    /* Move the hovered card into the source container */
    fromEl.appendChild(targetCard);

    /* Persist its new group */
    const order = Array.from(fromEl.querySelectorAll('.match-card')).length - 1;
    DG._post(`/t/${DG.slug}/display-groep/verplaats/`, {
      match_id: parseInt(targetCard.dataset.matchId, 10),
      group_id: fromId ? parseInt(fromId, 10) : null,
      order,
    });

    DG._updateEmptyState(toEl);
    DG._updateEmptyState(fromEl);
    DG._updatePoolCount();

    /* Nudge Sortable so it re-evaluates onMove for the now-free slot */
    setTimeout(() => {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true,
        clientX: DG._mouseX, clientY: DG._mouseY,
      }));
    }, 60);
  },

  _cancelSwap() {
    clearTimeout(DG._swapTimeout);
    DG._swapTimeout      = null;
    DG._swapHoverMatchId = null;
    if (DG._swapHoverEl) {
      DG._swapHoverEl.classList.remove('dg-swap-pending');
      DG._swapHoverEl = null;
    }
    DG._swapFromEl = null;
    DG._swapFromId = null;
    DG._swapToEl   = null;
  },

  /* ── Drag-end handler ── */

  _onDragEnd(evt) {
    const card    = evt.item;
    const matchId = parseInt(card.dataset.matchId, 10);
    const toEl    = evt.to;
    const groupId = toEl.dataset.groupId || '';

    const siblings = Array.from(toEl.querySelectorAll('.match-card'));
    const order    = siblings.indexOf(card);

    this._post(`/t/${this.slug}/display-groep/verplaats/`, {
      match_id: matchId,
      group_id: groupId ? parseInt(groupId, 10) : null,
      order,
    });

    this._updatePoolCount();
    this._updateEmptyState(evt.from);
    this._updateEmptyState(toEl);
    this._checkDuplicates();
  },

  /* ── Sort group cards by assigned table number (FLIP animation) ── */

  _getTableNum(card) {
    const sel = card.querySelector('select.table-select-inline');
    if (!sel || !sel.value) return Infinity;
    const opt = sel.querySelector(`option[value="${sel.value}"]`);
    return parseInt(opt?.dataset?.number ?? '0', 10) || Infinity;
  },

  _sortByTable(groupBody) {
    const cards = Array.from(groupBody.querySelectorAll('.match-card'));

    /* FLIP step 1: record positions before sort */
    const before = cards.map(c => ({ el: c, rect: c.getBoundingClientRect() }));

    cards.sort((a, b) => DG._getTableNum(a) - DG._getTableNum(b));
    cards.forEach(card => groupBody.appendChild(card));

    /* FLIP step 2: animate from old positions to new */
    before.forEach(({ el, rect: from }) => {
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top  - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform .35s ease';
        el.style.transform  = '';
        el.addEventListener('transitionend', () => { el.style.transition = ''; el.style.transform = ''; }, { once: true });
      });
    });

    /* Persist updated order */
    cards.forEach((card, idx) => {
      DG._post(`/t/${DG.slug}/display-groep/verplaats/`, {
        match_id: parseInt(card.dataset.matchId, 10),
        order: idx,
      });
    });
  },

  /* ── Duplicate table detection ── */

  _checkDuplicates() {
    document.querySelectorAll('.dg-group-body, .dg-pool-zone').forEach(container => {
      const seen = {};
      const cards = Array.from(container.querySelectorAll('.match-card'));
      cards.forEach(card => {
        const sel = card.querySelector('select.table-select-inline');
        const val = sel?.value;
        if (val) seen[val] = (seen[val] || 0) + 1;
      });
      cards.forEach(card => {
        const val = card.querySelector('select.table-select-inline')?.value;
        card.classList.toggle('dg-table-conflict', !!(val && seen[val] > 1));
      });
    });
  },

  /* ── Helpers ── */

  _post(url, body) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this._csrf() },
      body: JSON.stringify(body),
    }).catch(console.error);
  },

  _updatePoolCount() {
    const pool  = document.getElementById('dg-pool-zone');
    const badge = document.getElementById('dg-pool-count');
    if (!pool || !badge) return;
    const n = pool.querySelectorAll('.match-card').length;
    badge.textContent = n;
    const msg = document.getElementById('dg-pool-empty-msg');
    pool.classList.toggle('is-empty', n === 0);
    if (msg) msg.style.display = n === 0 ? '' : 'none';
  },

  _updateEmptyState(el) {
    if (!el) return;
    const has = el.querySelectorAll('.match-card').length > 0;
    el.classList.toggle('is-empty', !has);
    let ph = el.querySelector('.dg-empty-placeholder');
    if (!has && !ph) {
      ph = document.createElement('span');
      ph.className = 'text-muted small dg-empty-placeholder';
      ph.textContent = el.id === 'dg-pool-zone'
        ? 'Alle wedstrijden zijn ingedeeld'
        : 'Sleep een wedstrijd hierheen';
      el.appendChild(ph);
    } else if (has && ph) {
      ph.remove();
    }
  },
};

/* ── Inline onclick handlers ── */

function dgSetActive(groupId, slug, btn) {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M22 12c-2.667 4.667-6 7-10 7s-7.333-2.333-10-7c2.667-4.667 6-7 10-7s7.333 2.333 10 7"/></svg> `;
  fetch(`/t/${slug}/display-groep/${groupId}/actief/`, {
    method: 'POST',
    headers: { 'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || '' },
  })
  .then(r => r.json())
  .then(d => {
    if (!d.success) return;
    document.querySelectorAll('.dg-group-card').forEach(card => {
      const active = card.id === `dg-group-${groupId}`;
      card.classList.toggle('is-active', active);
      const b = card.querySelector('[onclick*="dgSetActive"]');
      if (b) {
        b.classList.toggle('btn-primary', active);
        b.classList.toggle('btn-ghost-secondary', !active);
        b.innerHTML = SVG + (active ? 'Op scherm' : 'Toon');
      }
    });
  })
  .catch(console.error);
}

function dgDeleteGroup(groupId, slug) {
  fetch(`/t/${slug}/display-groep/${groupId}/verwijder/`, {
    method: 'POST',
    headers: { 'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || '' },
  })
  .then(r => r.json())
  .then(d => {
    if (d.success) {
      document.getElementById(`dg-group-${groupId}`)?.remove();
      const container = document.getElementById('dg-groups-container');
      if (container && !container.querySelector('.dg-group-card')) {
        const noMsg = document.createElement('div');
        noMsg.id = 'dg-no-groups-msg';
        noMsg.className = 'text-muted small text-center py-4';
        noMsg.textContent = 'Nog geen groepen — klik op "+ Groep toevoegen".';
        container.appendChild(noMsg);
      }
    } else {
      alert(d.error || 'Kan niet verwijderen — groep is niet leeg.');
    }
  })
  .catch(console.error);
}

function dgAddGroup(slug) {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M22 12c-2.667 4.667-6 7-10 7s-7.333-2.333-10-7c2.667-4.667 6-7 10-7s7.333 2.333 10 7"/></svg> `;
  fetch(`/t/${slug}/display-groep/nieuw/`, {
    method: 'POST',
    headers: { 'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || '' },
  })
  .then(r => r.json())
  .then(d => {
    if (!d.success) return;
    document.getElementById('dg-no-groups-msg')?.remove();
    const container = document.getElementById('dg-groups-container');
    const card = document.createElement('div');
    card.className = 'dg-group-card';
    card.id = `dg-group-${d.id}`;
    card.dataset.groupId = d.id;
    card.innerHTML = `
      <div class="dg-group-header">
        <span class="fw-semibold small">${d.name}</span>
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-xs btn-ghost-secondary" onclick="dgSetActive(${d.id},'${slug}',this)">
            ${SVG}Toon
          </button>
          <button class="btn btn-xs btn-ghost-danger" onclick="dgDeleteGroup(${d.id},'${slug}')">✕</button>
        </div>
      </div>
      <div class="dg-group-body is-empty" id="dg-body-${d.id}" data-group-id="${d.id}">
        <span class="text-muted small dg-empty-placeholder">Sleep een wedstrijd hierheen</span>
      </div>`;
    container.appendChild(card);
    DG._makeSortable(card.querySelector('.dg-group-body'));
  })
  .catch(console.error);
}
