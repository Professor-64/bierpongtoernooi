/* organizer-base.js — sidebar floating user menu */
(function () {
  var btn  = document.getElementById('sidebar-avatar-btn');
  var menu = document.getElementById('sidebar-avatar-menu');
  if (!btn || !menu) return;

  // Verplaats menu naar body zodat het buiten de sidebar zweeft
  document.body.appendChild(menu);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.style.display !== 'none') {
      menu.style.display = 'none';
      return;
    }
    // Toon onzichtbaar om hoogte te meten, dan positioneren
    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    var rect = btn.getBoundingClientRect();
    var mh   = menu.offsetHeight;
    menu.style.left = (rect.right + 8) + 'px';
    menu.style.top  = Math.max(8, rect.bottom - mh) + 'px';
    menu.style.visibility = 'visible';
  });

  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
})();
