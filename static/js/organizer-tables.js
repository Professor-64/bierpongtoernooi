/* organizer-tables.js — table layout preview and inline edit */

function toggleTableEdit(id) {
  const editRow = document.getElementById('edit-row-' + id);
  if (!editRow) return;
  editRow.style.display = editRow.style.display === 'none' ? '' : 'none';
}

// Live preview update when cols or orientation changes
const colsInput    = document.getElementById('cols-input');
const orientSelect = document.getElementById('orient-select');
const preview      = document.getElementById('layout-preview');

function updatePreview() {
  if (!preview) return;
  const cols   = Math.max(1, Math.min(8, parseInt(colsInput?.value) || 4));
  const orient = orientSelect?.value || 'horizontal';
  preview.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  preview.querySelectorAll('.table-shape').forEach(el => {
    el.classList.remove('horizontal', 'vertical');
    el.classList.add(orient);
  });
}

colsInput?.addEventListener('input', updatePreview);
orientSelect?.addEventListener('change', updatePreview);
