/* ============================================================
   Forge — Icons & Shared UI Styling Utils
   Specifically separated to break circular dependencies on main.js.
   ============================================================ */

import { createIcons, icons } from 'lucide';

/**
 * Re-scan the DOM and refresh Lucide icons.
 */
export function refreshIcons() {
  createIcons({ icons });
}

/**
 * Apply custom theme accent color.
 */
export function applyCustomAccent(hex) {
  let styleEl = document.getElementById('custom-accent-vars');
  if (!hex) {
    if (styleEl) styleEl.remove();
    return;
  }
  
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-accent-vars';
    document.head.appendChild(styleEl);
  }

  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  const accentDim = `rgba(${r}, ${g}, ${b}, 0.12)`;
  const accentGlow = `rgba(${r}, ${g}, ${b}, 0.35)`;
  const accentPrimaryHover = `rgba(${r}, ${g}, ${b}, 0.8)`;

  styleEl.innerHTML = `
    :root, html {
      --accent-primary: ${hex} !important;
      --accent-primary-hover: ${accentPrimaryHover} !important;
      --accent-primary-dim: ${accentDim} !important;
      --accent-primary-glow: ${accentGlow} !important;
      
      --accent-purple: ${hex} !important;
      --accent-purple-dim: ${accentDim} !important;
      --accent-cyan: ${hex} !important;
      --accent-cyan-dim: ${accentDim} !important;
    }
    .sidebar-logo path {
      fill: ${hex} !important;
      stroke: ${hex} !important;
    }
  `;
}
