/* ============================================================
   Forge Mobile — Shared Utilities
   ============================================================ */

/**
 * Show a brief toast message above the bottom nav.
 */
export function showMobileToast(message, durationMs = 2000) {
  let toast = document.getElementById('m-global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'm-global-toast';
    toast.className = 'm-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), durationMs);
}
