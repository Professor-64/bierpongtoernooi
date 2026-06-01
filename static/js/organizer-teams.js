/* organizer-teams.js — inline player name editing */

function startPlayerEdit(playerId) {
  const row  = document.getElementById('player-row-' + playerId);
  if (!row) return;
  row.querySelector('.player-name-text').style.display = 'none';
  const form = row.querySelector('.player-edit-form');
  form.style.removeProperty('display');
  form.classList.remove('d-none');
  form.querySelector('input[name="name"]').focus();
}

function cancelPlayerEdit(playerId) {
  const row  = document.getElementById('player-row-' + playerId);
  if (!row) return;
  row.querySelector('.player-name-text').style.display = '';
  const form = row.querySelector('.player-edit-form');
  form.style.setProperty('display', 'none', 'important');
  form.classList.add('d-none');
}
