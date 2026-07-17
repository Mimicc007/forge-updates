/* ============================================================
   Forge — Login / Signup Page
   Clean rewrite — fixes broken HTML structure from previous edits.
   Google sign-in shown on desktop only (Capacitor blocks it).
   ============================================================ */

import {
  isFirebaseConfigured, signInWithGoogle,
  signInWithEmail, signUpWithEmail, waitForAuthReady, saveFirebaseConfig, initFirebase
} from '../auth.js';
import { navigate } from '../router.js';
import { isCapacitor } from '../platform.js';

export async function renderLogin(container) {
  container.innerHTML = '';
  _injectStyles();

  if (!isFirebaseConfigured()) {
    _renderSetup(container);
    return;
  }

  const user = await waitForAuthReady();
  if (user) { navigate('hub'); return; }

  const showGoogle = !isCapacitor;

  container.innerHTML = `
    <div class="lp-page">
      <div class="lp-card">

        <div class="lp-logo">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
            <defs>
              <linearGradient id="lpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24"/>
                <stop offset="100%" stop-color="#f59e0b"/>
              </linearGradient>
            </defs>
            <path d="M32 7 L53 19 V45 L32 57 L11 45 V19 Z" fill="url(#lpGrad)" fill-opacity="0.1" stroke="url(#lpGrad)" stroke-width="2" stroke-linejoin="round"/>
            <path d="M22 18 H42 V24 H30 V30 H38 V36 H30 V46 H22 Z" fill="#ffffff"/>
            <path d="M35 29 L23 41 H31 L26 47" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="lp-wordmark">FORGE</div>
          <div class="lp-tagline">Your creative universe, everywhere</div>
        </div>

        <div class="lp-methods">
          ${showGoogle ? `
            <button id="lp-google" class="lp-google-btn">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <div class="lp-divider"><span>or continue with email</span></div>
          ` : ''}

          <input id="lp-username" type="text" class="lp-input"
            placeholder="Choose a username" style="display:none"
            autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" />
          <input id="lp-email" type="email" class="lp-input"
            placeholder="Email address" autocomplete="email"
            autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="email" />
          <input id="lp-password" type="password" class="lp-input"
            placeholder="Password" autocomplete="current-password"
            autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" />
          <button id="lp-submit" class="lp-submit-btn">Sign In</button>
          <button id="lp-toggle" class="lp-link-btn">Don't have an account? Sign up</button>
          <div id="lp-error" class="lp-error" style="display:none"></div>
        </div>

        <p class="lp-privacy">🔒 Your data is private. Only you can access it.</p>
      </div>
    </div>
  `;

  _wire(showGoogle);
}

function _renderSetup(container) {
  container.innerHTML = `
    <div class="lp-page">
      <div class="lp-card" style="max-width:480px">
        <div class="lp-logo">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
            <defs><linearGradient id="lpGrad2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs>
            <path d="M32 7 L53 19 V45 L32 57 L11 45 V19 Z" fill="url(#lpGrad2)" fill-opacity="0.1" stroke="url(#lpGrad2)" stroke-width="2"/>
            <path d="M22 18 H42 V24 H30 V30 H38 V36 H30 V46 H22 Z" fill="#ffffff"/>
          </svg>
          <div class="lp-wordmark">FORGE</div>
          <div class="lp-tagline">Connect Firebase to enable sync &amp; login</div>
        </div>
        <p style="color:var(--text-secondary);font-size:0.875rem;text-align:center;line-height:1.65;margin-bottom:20px">
          Paste your <strong style="color:var(--text-primary)">Firebase project config</strong> below.
        </p>
        <textarea id="lp-firebase-input" class="lp-input" rows="9"
          placeholder='{\n  "apiKey": "AIza...",\n  "projectId": "your-app"\n}'
          style="font-family:monospace;font-size:0.78rem;resize:vertical;line-height:1.5"></textarea>
        <button id="lp-firebase-save" class="lp-submit-btn" style="margin-top:12px">Connect Firebase</button>
        <div id="lp-firebase-error" class="lp-error" style="display:none"></div>
        <a href="https://console.firebase.google.com" target="_blank" rel="noopener" class="lp-link-btn" style="margin-top:8px">
          Open Firebase Console →
        </a>
      </div>
    </div>
  `;

  document.getElementById('lp-firebase-save')?.addEventListener('click', () => {
    const raw = document.getElementById('lp-firebase-input')?.value.trim();
    const errEl = document.getElementById('lp-firebase-error');
    try {
      const jsonStr = raw.replace(/^[\s\S]*?(\{)/, '$1').replace(/;\s*$/, '');
      const config = JSON.parse(jsonStr);
      if (!config.apiKey || !config.projectId) throw new Error('Missing fields');
      saveFirebaseConfig(config);
      initFirebase();
      location.reload();
    } catch {
      errEl.textContent = 'Invalid config — paste the full JSON object from Firebase Console.';
      errEl.style.display = 'block';
    }
  });
}

function _wire(showGoogle) {
  let isSignup = false;

  const googleBtn  = document.getElementById('lp-google');
  const submitBtn  = document.getElementById('lp-submit');
  const toggleBtn  = document.getElementById('lp-toggle');
  const usernameEl = document.getElementById('lp-username');
  const errEl      = document.getElementById('lp-error');

  if (showGoogle) {
    googleBtn?.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.textContent = 'Signing in…';
      errEl.style.display = 'none';
      try {
        await signInWithGoogle();
        navigate('hub');
      } catch (err) {
        errEl.textContent = err.message || 'Google sign-in failed.';
        errEl.style.display = 'block';
        googleBtn.disabled = false;
        googleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google`;
      }
    });
  }

  toggleBtn?.addEventListener('click', () => {
    isSignup = !isSignup;
    submitBtn.textContent  = isSignup ? 'Create Account' : 'Sign In';
    toggleBtn.textContent  = isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
    usernameEl.style.display = isSignup ? 'block' : 'none';
    errEl.style.display = 'none';
  });

  submitBtn?.addEventListener('click', async () => {
    const email    = document.getElementById('lp-email')?.value.trim();
    const password = document.getElementById('lp-password')?.value;
    const username = usernameEl?.value.trim();

    if (isSignup && !username) {
      errEl.textContent = 'Please choose a username.';
      errEl.style.display = 'block';
      return;
    }
    if (!email || !password) {
      errEl.textContent = 'Enter your email and password.';
      errEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isSignup ? 'Creating account…' : 'Signing in…';
    errEl.style.display = 'none';

    try {
      if (isSignup) {
        await signUpWithEmail(email, password, username);
      } else {
        await signInWithEmail(email, password);
      }
      navigate('hub');
    } catch (err) {
      const msgs = {
        'auth/wrong-password': 'Incorrect password.',
        'auth/user-not-found': 'No account with that email.',
        'auth/email-already-in-use': 'Email already in use.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/invalid-credential': 'Incorrect email or password.',
      };
      errEl.textContent = msgs[err.code] || err.message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? 'Create Account' : 'Sign In';
    }
  });

  // Enter key submits — use 'input' event check to avoid IME interference
  document.getElementById('lp-password')?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // ignore IME composition
    if (e.key === 'Enter') submitBtn?.click();
  });
}

function _injectStyles() {
  if (document.getElementById('lp-styles')) return;
  const s = document.createElement('style');
  s.id = 'lp-styles';
  s.textContent = `
    .lp-page {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--bg-base);
    }
    .lp-card {
      width: 100%;
      max-width: 400px;
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: 20px;
      padding: 44px 40px;
      box-shadow: 0 32px 96px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
    }
    .lp-logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-bottom: 32px;
    }
    .lp-wordmark {
      font-family: var(--font-heading);
      font-size: 1.7rem;
      font-weight: 900;
      letter-spacing: 0.22em;
      color: var(--text-primary);
      margin-top: 4px;
    }
    .lp-tagline { font-size: 0.8rem; color: var(--text-muted); letter-spacing: 0.03em; }
    .lp-methods { display: flex; flex-direction: column; gap: 10px; }
    .lp-google-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      padding: 13px 20px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: 10px;
      color: var(--text-primary);
      font-size: 0.9rem; font-weight: 600; font-family: var(--font-body);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .lp-google-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
    .lp-google-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .lp-divider {
      display: flex; align-items: center; gap: 10px;
      color: var(--text-muted); font-size: 0.72rem;
      margin: 2px 0;
    }
    .lp-divider::before, .lp-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border-subtle);
    }
    .lp-input {
      width: 100%; box-sizing: border-box;
      padding: 11px 14px;
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: 9px;
      color: var(--text-primary);
      font-size: 0.9rem; font-family: var(--font-body);
      outline: none;
      transition: border-color 0.15s;
    }
    .lp-input:focus { border-color: var(--accent-primary); }
    .lp-submit-btn {
      width: 100%; padding: 13px 20px;
      background: var(--accent-primary);
      color: #070b14;
      border: none; border-radius: 10px;
      font-size: 0.9rem; font-weight: 700; font-family: var(--font-heading);
      cursor: pointer; transition: opacity 0.15s;
    }
    .lp-submit-btn:hover { opacity: 0.87; }
    .lp-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .lp-link-btn {
      background: none; border: none;
      color: var(--text-muted); font-size: 0.8rem;
      cursor: pointer; text-align: center;
      text-decoration: underline; font-family: var(--font-body);
      padding: 4px; display: block;
    }
    .lp-link-btn:hover { color: var(--text-secondary); }
    .lp-error {
      padding: 10px 14px;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      color: #ef4444; font-size: 0.82rem;
    }
    .lp-privacy { margin-top: 28px; font-size: 0.72rem; color: var(--text-muted); text-align: center; line-height: 1.5; }
    @media (max-width: 768px) {
      .lp-card { padding: 36px 24px; border-radius: 16px; }
    }
  `;
  document.head.appendChild(s);
}
