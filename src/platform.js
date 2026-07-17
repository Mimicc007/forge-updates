/**
 * platform.js — Forge Platform Detection & Abstraction
 * Detects whether the app is running in Electron, Capacitor mobile, or plain web.
 * Import from any module to gate platform-specific code cleanly.
 */

/** True when running inside Electron desktop app */
export const isElectron = !!(window.electronAPI?.isDesktop);

/** True when running inside Capacitor native shell (iOS/Android) */
export const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor?.isNativePlatform?.());

/** True when running on a touch-primary device (mobile/tablet) or Capacitor */
export const isMobile = isCapacitor ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** True specifically on iOS */
export const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** True specifically on Android */
export const isAndroid = /Android/i.test(navigator.userAgent);

/** Plain web browser (not Electron, not Capacitor) */
export const isWeb = !isElectron && !isCapacitor;

/** Platform string token */
export const platform = isElectron ? 'electron' : isCapacitor ? 'mobile' : 'web';

/**
 * Returns true if the primary input device is touch.
 * Also returns true for mouse+touch hybrids if maxTouchPoints > 1.
 */
export function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

/**
 * Returns true when the viewport is ≤768px, matching the mobile CSS breakpoint.
 */
export function isMobileViewport() {
  return window.innerWidth <= 768;
}

/**
 * Triggers a light haptic feedback on supported devices (iOS/Android).
 * Safe to call anywhere; is a no-op on desktop.
 */
export function haptic(durationMs = 10) {
  if (navigator.vibrate) {
    navigator.vibrate(durationMs);
  }
}
