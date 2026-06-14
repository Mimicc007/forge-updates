/* ============================================================
   Forge — Web Audio Sound Effects Service
   Generates satisfying UI sound effects dynamically in real-time.
   ============================================================ */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playClickSound() {
  const enabled = localStorage.getItem('forge-sfx-enabled') !== 'false';
  if (!enabled) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);

    gainNode.gain.setValueAtTime(0.06, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {
    console.warn('Audio play failure:', e);
  }
}

export function playZapSound() {
  const enabled = localStorage.getItem('forge-sfx-enabled') !== 'false';
  if (!enabled) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(660, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(110, now);
    osc2.frequency.exponentialRampToValueAtTime(330, now + 0.15);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);

    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
  } catch (e) {
    console.warn('Audio play failure:', e);
  }
}

export function toggleSfxSetting(enabled) {
  localStorage.setItem('forge-sfx-enabled', enabled ? 'true' : 'false');
}
