/* Bierpongtournooi — shared JS helpers */

function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

/* Auto-dismiss alerts after 4 seconds */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.alert.alert-dismissible').forEach(el => {
    setTimeout(() => {
      const btn = el.querySelector('.btn-close');
      if (btn) btn.click();
    }, 4000);
  });
});
