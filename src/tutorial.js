/* ============================================================
   Forge — Comprehensive Interactive Tutorial System
   A custom-built, animated spotlight onboarding tour that
   covers EVERY feature in Forge, phase by phase.
   ============================================================ */

import * as db from './db.js';
import { getStyleConfig } from './styleConfig.js';
import { navigate } from './router.js';

const TUTORIAL_STATE_KEY = 'forge_tutorial_state';

function getTutorialState() {
  const saved = localStorage.getItem(TUTORIAL_STATE_KEY);
  return saved ? JSON.parse(saved) : { active: false, currentPhase: 0 };
}

function saveTutorialState(state) {
  localStorage.setItem(TUTORIAL_STATE_KEY, JSON.stringify(state));
}

// ─── SpotlightTutorial Class ───────────────
class SpotlightTutorial {
  constructor() {
    this.steps = [];
    this.currentStepIndex = 0;
    this.isActive = false;
    this.onFinish = null;
    this.nextLabel = null;
    this.taskPollInterval = null;
    this.taskCompleted = false;
    this.transitionTimeouts = [];
    this.initDOM();
  }

  initDOM() {
    if (document.getElementById('forge-tutorial-overlay')) {
      this.overlay  = document.getElementById('forge-tutorial-overlay');
      this.spotlight = document.getElementById('forge-tutorial-spotlight');
      this.popover   = document.getElementById('forge-tutorial-popover');
      this.popoverTitle = this.popover.querySelector('#forge-tut-title');
      this.popoverDesc  = this.popover.querySelector('#forge-tut-desc');
      this.popoverStep  = this.popover.querySelector('#forge-tut-step');
      this.nextBtn  = this.popover.querySelector('#forge-tut-next');
      this.closeBtn = this.popover.querySelector('#forge-tut-skip');
      this.prevBtn  = this.popover.querySelector('#forge-tut-prev');
      return;
    }

    // Inject CSS
    if (!document.getElementById('forge-tutorial-css')) {
      const style = document.createElement('style');
      style.id = 'forge-tutorial-css';
      style.textContent = `
        #forge-tutorial-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          z-index: 99999; pointer-events: none; opacity: 0;
          transition: opacity 0.35s ease; display: none;
        }
        #forge-tutorial-spotlight {
          position: absolute; border-radius: 10px;
          box-shadow: 0 0 0 9999px rgba(8, 6, 16, 0.88);
          transition: all 0.45s cubic-bezier(0.25, 1, 0.5, 1);
          pointer-events: none;
          outline: 2px solid rgba(229, 169, 59, 0.4);
          outline-offset: 2px;
        }
        #forge-tutorial-popover {
          position: absolute; width: 340px;
          background: rgba(18, 14, 32, 0.92);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(229, 169, 59, 0.25);
          border-radius: 14px;
          padding: 22px 22px 18px;
          color: #fff;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(229,169,59,0.05);
          transition: opacity 0.35s ease, top 0.45s cubic-bezier(0.25, 1, 0.5, 1), left 0.45s cubic-bezier(0.25, 1, 0.5, 1);
          opacity: 0;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .forge-tut-highlighted-target {
          outline: 3px solid var(--accent-primary, #e5a93b) !important;
          outline-offset: 4px !important;
          box-shadow: 0 0 25px var(--accent-primary, #e5a93b), inset 0 0 10px rgba(229,169,59,0.3) !important;
          animation: forge-tut-target-pulse 2s ease-in-out infinite !important;
          z-index: 100001 !important;
        }
        @keyframes forge-tut-target-pulse {
          0%, 100% {
            box-shadow: 0 0 15px var(--accent-primary, #e5a93b), inset 0 0 5px rgba(229,169,59,0.2) !important;
          }
          50% {
            box-shadow: 0 0 35px var(--accent-primary, #e5a93b), inset 0 0 15px rgba(229,169,59,0.5) !important;
          }
        }
        #forge-tut-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #forge-tut-icon {
          font-size: 1.3rem;
          flex-shrink: 0;
        }
        #forge-tut-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: var(--accent-primary, #e5a93b);
          font-family: var(--font-heading, sans-serif);
          letter-spacing: -0.01em;
          line-height: 1.3;
        }
        #forge-tut-desc {
          margin: 0;
          font-size: 0.875rem;
          color: rgba(200, 195, 220, 0.9);
          line-height: 1.6;
        }
        #forge-tut-desc strong { color: #fff; }
        #forge-tut-desc em { color: var(--accent-primary, #e5a93b); font-style: normal; font-weight: 600; }
        #forge-tut-desc code {
          background: rgba(229,169,59,0.12);
          border: 1px solid rgba(229,169,59,0.25);
          border-radius: 4px;
          padding: 1px 5px;
          font-family: monospace;
          font-size: 0.8rem;
          color: #e5a93b;
        }
        #forge-tut-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 4px;
          gap: 8px;
        }
        #forge-tut-step {
          font-size: 0.7rem;
          color: rgba(150,140,180,0.7);
          font-family: var(--font-hud, monospace);
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .forge-tut-btn {
          border: none; cursor: pointer;
          font-family: var(--font-hud, sans-serif);
          font-size: 0.78rem;
          font-weight: 600;
          padding: 7px 14px;
          border-radius: 7px;
          transition: opacity 0.15s, transform 0.1s;
        }
        .forge-tut-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .forge-tut-btn:active { transform: translateY(0); }
        #forge-tut-skip {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(150,140,180,0.8);
        }
        #forge-tut-prev {
          background: transparent;
          border: 1px solid rgba(229,169,59,0.25);
          color: var(--accent-primary, #e5a93b);
        }
        #forge-tut-next {
          background: var(--accent-primary, #e5a93b);
          color: #0a0812;
          margin-left: auto;
        }
        #forge-tut-action-hint {
          font-size: 0.72rem;
          color: rgba(229, 169, 59, 0.75);
          font-family: var(--font-hud, monospace);
          text-align: center;
          padding: 6px 10px;
          background: rgba(229, 169, 59, 0.06);
          border-radius: 6px;
          border: 1px solid rgba(229, 169, 59, 0.15);
          animation: forge-tut-pulse 2s ease-in-out infinite;
          transition: all 0.2s ease;
        }
        @keyframes forge-tut-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        .forge-tut-progress {
          display: flex;
          gap: 4px;
          align-items: center;
          flex-wrap: wrap;
        }
        .forge-tut-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(229,169,59,0.2);
          transition: background 0.2s, transform 0.2s;
          flex-shrink: 0;
        }
        .forge-tut-dot.active {
          background: var(--accent-primary, #e5a93b);
          transform: scale(1.4);
        }
        .forge-tut-dot.done {
          background: rgba(229,169,59,0.5);
        }
        body.tut-restrict-phase2 #sidebar > *:not(.sidebar-nav),
        body.tut-restrict-phase2 .sidebar-nav > *:not(.sidebar-tab-list),
        body.tut-restrict-phase2 .sidebar-tab-list > *:not(.sidebar-schema-group),
        body.tut-restrict-phase2 #page-container .page-header-row > *:not(.flex),
        body.tut-restrict-phase2 #page-container .page-header-row .flex > *:not(#new-database-btn),
        body.tut-restrict-phase2 #page-container .stats-grid,
        body.tut-restrict-phase2 #page-container .grid-2 {
          opacity: 0.15 !important;
          filter: blur(2px) !important;
          pointer-events: none !important;
          transition: all 0.3s ease !important;
        }
        body.tut-restrict-phase2 #sidebar {
          z-index: auto !important;
        }
        body.tut-restrict-phase2 .modal-backdrop,
        body.tut-restrict-phase2 .modal {
          z-index: 100000 !important;
        }
        body.tut-restrict-phase2 .sidebar-schema-group,
        body.tut-restrict-phase2 #new-database-btn {
          position: relative;
          z-index: 100000 !important;
          box-shadow: 0 0 15px var(--accent-primary, #e5a93b);
          outline: 2px solid var(--accent-primary, #e5a93b);
          border-radius: 6px;
        }
      `;
      document.head.appendChild(style);
    }

    // The overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'forge-tutorial-overlay';

    // The spotlight hole
    this.spotlight = document.createElement('div');
    this.spotlight.id = 'forge-tutorial-spotlight';

    // The popover (tooltip)
    this.popover = document.createElement('div');
    this.popover.id = 'forge-tutorial-popover';

    // Header row: icon + title
    const header = document.createElement('div');
    header.id = 'forge-tut-header';

    this.popoverIcon = document.createElement('span');
    this.popoverIcon.id = 'forge-tut-icon';

    this.popoverTitle = document.createElement('h3');
    this.popoverTitle.id = 'forge-tut-title';

    header.appendChild(this.popoverIcon);
    header.appendChild(this.popoverTitle);

    // Description
    this.popoverDesc = document.createElement('p');
    this.popoverDesc.id = 'forge-tut-desc';

    // Action hint (for requireClickOnTarget steps)
    this.actionHint = document.createElement('div');
    this.actionHint.id = 'forge-tut-action-hint';
    this.actionHint.style.display = 'none';

    // Progress dots
    this.progressEl = document.createElement('div');
    this.progressEl.className = 'forge-tut-progress';

    // Footer
    const footer = document.createElement('div');
    footer.id = 'forge-tut-footer';

    this.popoverStep = document.createElement('span');
    this.popoverStep.id = 'forge-tut-step';

    this.closeBtn = document.createElement('button');
    this.closeBtn.id = 'forge-tut-skip';
    this.closeBtn.className = 'forge-tut-btn';
    this.closeBtn.textContent = 'Skip Tour';

    this.prevBtn = document.createElement('button');
    this.prevBtn.id = 'forge-tut-prev';
    this.prevBtn.className = 'forge-tut-btn';
    this.prevBtn.textContent = '← Back';

    this.nextBtn = document.createElement('button');
    this.nextBtn.id = 'forge-tut-next';
    this.nextBtn.className = 'forge-tut-btn';
    this.nextBtn.textContent = 'Next →';

    footer.appendChild(this.closeBtn);
    footer.appendChild(this.prevBtn);
    footer.appendChild(this.popoverStep);
    footer.appendChild(this.nextBtn);

    this.popover.appendChild(header);
    this.popover.appendChild(this.popoverDesc);
    this.popover.appendChild(this.actionHint);
    this.popover.appendChild(this.progressEl);
    this.popover.appendChild(footer);

    this.overlay.appendChild(this.spotlight);
    this.overlay.appendChild(this.popover);
    document.body.appendChild(this.overlay);

    // Event listeners
    this.nextBtn.addEventListener('click', () => this.next());
    this.prevBtn.addEventListener('click', () => this.prev());
    this.closeBtn.addEventListener('click', () => this.stop());

    // Intercept clicks to prevent interacting with background unless target
    document.addEventListener('click', this.handleDocumentClick.bind(this), true);
  }

  handleDocumentClick(e) {
    if (!this.isActive) return;
    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    // Always allow clicks inside popover
    if (this.popover.contains(e.target)) return;

    // Check allowed targets if defined
    if (step.allowedTargets) {
      const allowed = Array.isArray(step.allowedTargets) ? step.allowedTargets : [step.allowedTargets];
      let isAllowed = false;
      for (const selector of allowed) {
        if (e.target.closest(selector)) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }

    if (step.requireClickOnTarget && step.target) {
      let el = null;
      if (typeof step.target === 'function') {
        el = step.target();
      } else if (typeof step.target === 'string') {
        el = document.querySelector(step.target);
      } else {
        el = step.target;
      }
      if (el && typeof el === 'string') {
        el = document.querySelector(el);
      }
      if (el && (el === e.target || el.contains(e.target))) {
        if (step.onTargetClick) step.onTargetClick();
        if (this.isActive && this.steps[this.currentStepIndex] === step) {
          this.next();
        }
      } else if (!step.allowPageInteraction) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
  }

  clearTaskPolling() {
    if (this.taskPollInterval) {
      clearInterval(this.taskPollInterval);
      this.taskPollInterval = null;
    }
    this.taskCompleted = false;
    this.clearTransitionTimeouts();
  }

  clearTransitionTimeouts() {
    if (this.transitionTimeouts) {
      this.transitionTimeouts.forEach(t => clearTimeout(t));
    }
    this.transitionTimeouts = [];
  }

  updateBodyClass() {
    const step = this.steps[this.currentStepIndex];
    document.body.classList.remove('tut-restrict-phase2');
    if (step && step.bodyClass) {
      document.body.classList.add(step.bodyClass);
    }
  }

  setTimeoutTracked(fn, delay) {
    if (!this.transitionTimeouts) this.transitionTimeouts = [];
    const t = setTimeout(fn, delay);
    this.transitionTimeouts.push(t);
    return t;
  }

  start(steps, config = {}) {
    this.steps = steps;
    this.currentStepIndex = 0;
    this.isActive = true;
    this.onFinish = config.onFinish || null;
    this.nextLabel = config.nextLabel || null;
    this.overlay.style.display = 'block';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.overlay.style.pointerEvents = 'auto';
      this.renderStep();
    });
  }

  stop(preserveState = false) {
    this.clearTaskPolling();
    this.isActive = false;
    if (this.lastTargetEl) {
      this.lastTargetEl.classList.remove('forge-tut-highlighted-target');
      this.lastTargetEl = null;
    }
    document.body.classList.remove('tut-restrict-phase2');
    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';
    setTimeout(() => { this.overlay.style.display = 'none'; }, 350);
    if (!preserveState) {
      saveTutorialState({ active: false, currentPhase: 0 });
    }
  }

  next() {
    this.clearTaskPolling();
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.renderStep();
    } else {
      if (this.onFinish) {
        this.onFinish();
      } else {
        this.stop();
      }
    }
  }

  prev() {
    this.clearTaskPolling();
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.renderStep();
    }
  }

  async renderStep() {
    this.clearTaskPolling();

    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    this.updateBodyClass();

    // Reset styles and states
    this.actionHint.style.background = '';
    this.actionHint.style.borderColor = '';
    this.actionHint.style.color = '';
    this.nextBtn.disabled = false;
    this.nextBtn.style.opacity = '';
    this.nextBtn.style.pointerEvents = '';
    this.nextBtn.style.display = 'block';

    // Set custom dimming opacity
    if (step.dimOpacity !== undefined) {
      this.spotlight.style.boxShadow = `0 0 0 9999px rgba(8, 6, 16, ${step.dimOpacity})`;
    } else {
      this.spotlight.style.boxShadow = '0 0 0 9999px rgba(8, 6, 16, 0.88)';
    }

    // Update content
    this.popoverIcon.textContent = step.icon || '⚡';
    this.popoverTitle.textContent = step.title;
    let desc = step.description || '';
    desc = desc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    desc = desc.replace(/`(.*?)`/g, '<code>$1</code>');
    this.popoverDesc.innerHTML = desc;

    // Step counter
    this.popoverStep.textContent = `${this.currentStepIndex + 1} / ${this.steps.length}`;

    // Progress dots
    this.progressEl.innerHTML = '';
    this.steps.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'forge-tut-dot' +
        (i === this.currentStepIndex ? ' active' : i < this.currentStepIndex ? ' done' : '');
      this.progressEl.appendChild(dot);
    });

    // Next button label
    this.nextBtn.textContent = this.currentStepIndex === this.steps.length - 1
      ? (this.nextLabel || 'Next →')
      : 'Next →';

    // Prev button visibility
    this.prevBtn.style.display = this.currentStepIndex > 0 ? 'block' : 'none';

    // Run step.onEnter and await it if async
    if (step.onEnter) {
      try {
        await step.onEnter();
      } catch (err) {
        console.error("onEnter error:", err);
      }
    }

    // Handle checkTask steps vs click target vs normal
    if (step.checkTask) {
      this.nextBtn.disabled = true;
      this.nextBtn.style.opacity = '0.5';
      this.nextBtn.style.pointerEvents = 'none';
      this.nextBtn.textContent = 'Complete Task';

      this.overlay.style.pointerEvents = 'none'; // let user click through
      this.actionHint.innerHTML = step.actionHint || '📝 Task: Perform action to continue';
      this.actionHint.style.display = 'block';

      this.taskPollInterval = setInterval(async () => {
        try {
          const isDone = await step.checkTask();
          if (isDone && !this.taskCompleted) {
            this.taskCompleted = true;
            clearInterval(this.taskPollInterval);
            this.taskPollInterval = null;

            // Success feedback
            this.actionHint.innerHTML = `🎉 <strong>Task Complete!</strong>`;
            this.actionHint.style.background = 'rgba(16, 185, 129, 0.1)';
            this.actionHint.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            this.actionHint.style.color = '#10b981';

            // Enable next
            this.nextBtn.disabled = false;
            this.nextBtn.style.opacity = '';
            this.nextBtn.style.pointerEvents = '';
            this.nextBtn.textContent = this.currentStepIndex === this.steps.length - 1
              ? (this.nextLabel || 'Next →')
              : 'Next →';

            if (step.onTaskComplete) step.onTaskComplete();

            if (step.autoAdvance !== false) {
              setTimeout(() => {
                if (this.isActive && this.taskCompleted) {
                  this.next();
                }
              }, 1200);
            }
          }
        } catch (e) {
          console.error('Task check error:', e);
        }
      }, 300);

    } else if (step.requireClickOnTarget) {
      this.nextBtn.style.display = 'none';
      this.overlay.style.pointerEvents = 'none'; // let clicks fall through
      this.actionHint.textContent = step.actionHint || '👆 Click the highlighted element to continue';
      this.actionHint.style.display = 'block';
    } else {
      this.nextBtn.style.display = 'block';
      this.overlay.style.pointerEvents = 'auto';
      this.actionHint.style.display = 'none';

    }

    // Clear previous target highlight
    if (this.lastTargetEl) {
      this.lastTargetEl.classList.remove('forge-tut-highlighted-target');
      this.lastTargetEl = null;
    }

    // Position spotlight
    if (step.target) {
      let targetEl = null;
      if (typeof step.target === 'function') {
        targetEl = step.target();
      } else if (typeof step.target === 'string') {
        targetEl = document.querySelector(step.target);
      } else {
        targetEl = step.target;
      }
      if (targetEl && typeof targetEl === 'string') {
        targetEl = document.querySelector(targetEl);
      }
      if (targetEl) {
        // Expose target element reference for cleaning up later
        this.lastTargetEl = targetEl;
        targetEl.classList.add('forge-tut-highlighted-target');

        // Center canvas view on target element if it is a canvas node
        if (window.canvasState && typeof window.panToNode === 'function') {
          const entry = window.canvasState.nodes.find(n => n.el === targetEl || n.el.contains(targetEl));
          if (entry) {
            window.panToNode(entry);
          }
        }

        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => {
          const rect = targetEl.getBoundingClientRect();
          const pad = step.padding !== undefined ? step.padding : 8;
          this.spotlight.style.top    = `${rect.top - pad}px`;
          this.spotlight.style.left   = `${rect.left - pad}px`;
          this.spotlight.style.width  = `${rect.width + pad * 2}px`;
          this.spotlight.style.height = `${rect.height + pad * 2}px`;
          this.spotlight.style.display = 'block';
          this.popover.style.opacity = '1';
          this.positionPopover(rect, step.placement || 'bottom');
        }, 280);
      } else {
        // Target not found, show centered
        this._centerPopover();
      }
    } else {
      this._centerPopover();
    }
  }

  _centerPopover() {
    this.spotlight.style.boxShadow = '0 0 0 9999px rgba(8, 6, 16, 0.88)';
    this.spotlight.style.width = '0px';
    this.spotlight.style.height = '0px';
    this.spotlight.style.top = '50vh';
    this.spotlight.style.left = '50vw';
    this.popover.style.opacity = '1';
    this.popover.style.top = '50vh';
    this.popover.style.left = '50vw';
    this.popover.style.transform = 'translate(-50%, -50%)';
  }

  positionPopover(targetRect, placement) {
    const popWidth  = 340;
    const popHeight = this.popover.offsetHeight || 180;
    const gap = 18;
    let top = 0, left = 0;

    if (placement === 'bottom') {
      top  = targetRect.bottom + gap;
      left = targetRect.left + (targetRect.width / 2) - (popWidth / 2);
    } else if (placement === 'top') {
      top  = targetRect.top - gap - popHeight;
      left = targetRect.left + (targetRect.width / 2) - (popWidth / 2);
    } else if (placement === 'right') {
      top  = targetRect.top + (targetRect.height / 2) - (popHeight / 2);
      left = targetRect.right + gap;
    } else if (placement === 'left') {
      top  = targetRect.top + (targetRect.height / 2) - (popHeight / 2);
      left = targetRect.left - gap - popWidth;
    }

    // Clamp to screen
    if (left < 12) left = 12;
    if (left + popWidth > window.innerWidth - 12) left = window.innerWidth - popWidth - 12;
    if (top < 12) top = 12;
    if (top + popHeight > window.innerHeight - 12) top = window.innerHeight - popHeight - 12;

    this.popover.style.transform = 'none';
    this.popover.style.top  = `${top}px`;
    this.popover.style.left = `${left}px`;
  }
}

// ─── Global instance ──────────────────────────────────────────────────────────
const tutorial = new SpotlightTutorial();

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function startTutorial() {
  const project = await db.getActiveProject();
  const styleId = project?.settings?.style || 'story';
  tutorial.styleId = styleId;
  saveTutorialState({ active: true, currentPhase: 1, styleId });
  window.location.hash = '#/dashboard';
  setTimeout(() => runPhase1(), 600);
}

// Helper to get active style config and terms
async function getStyleInfo() {
  const state = getTutorialState();
  const styleId = state.styleId || tutorial.styleId || 'story';
  tutorial.styleId = styleId;
  const styleConf = getStyleConfig(styleId);
  return { styleId, styleConf, terms: styleConf.terms };
}

// =================================══════════════════════════════════════════════
// PHASE 1 — Dashboard & Navigation Overview
// =================================══════════════════════════════════════════════
export async function runPhase1() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 1) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  tutorial.start([
    {
      icon: '⚡',
      title: 'Welcome to Forge',
      description: `Forge is your creative workspace — databases, visual canvases, timelines, and AI writing tools all in one place. This interactive guide will teach you how to use every feature by having you try them! Let's dive in.`,
      target: null
    },
    {
      icon: '🏠',
      title: `The ${terms.dashboardTitle || 'Dashboard'}`,
      description: `This is your **${terms.dashboardTitle || 'Dashboard'}** — your mission control. It shows stats about your project, recent changes, and quick links to open your databases and canvases.`,
      target: '#page-container',
      placement: 'right',
      padding: 4
    },
    {
      icon: '🗂️',
      title: `The ${terms.sidebarTitle || 'Sidebar'}`,
      description: `The **${terms.sidebarTitle || 'Sidebar'}** is your primary navigation. It lists your overview links at the top, your databases and canvases in the middle, and companion tools (Ignis, Scene Mode, Settings) at the bottom.`,
      target: '#sidebar',
      placement: 'right'
    }
  ], {
    onFinish: () => {
      saveTutorialState({ active: true, currentPhase: 2, styleId });
      runPhase2();
    }
  });
}

// =================================══════════════════════════════════════════════
// PHASE 2 — Database Selection / Choice
// =================================══════════════════════════════════════════════
export async function runPhase2() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 2) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  tutorial.start([
    {
      icon: '🗃️',
      title: 'Premade vs Custom Databases',
      description: `Forge automatically seeds premade databases (like **${terms.characters}** or **${terms.locations}**) tailored to your style, or you can create custom ones from scratch.
To proceed, **click on one of the database items** in the sidebar to open it, or click **New Database** on the dashboard to create a new one!`,
      target: '#new-database-btn',
      placement: 'left',
      bodyClass: 'tut-restrict-phase2',
      allowedTargets: ['.sidebar-schema-group', '#new-database-btn', '.modal', '.modal-backdrop', '.modal-overlay', '#forge-tutorial-popover'],
      actionHint: `👆 Open a database or click 'New Database'`,
      checkTask: () => window.location.hash.includes('schema/'),
      onTaskComplete: () => {
        saveTutorialState({ active: true, currentPhase: 3, styleId });
      }
    }
  ], {
    onFinish: () => {
      tutorial.stop(true);
    }
  });
}

// =================================══════════════════════════════════════════════
// PHASE 3 — Schema View (Database editor)
// =================================══════════════════════════════════════════════
export async function runPhase3() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 3) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '📋',
        title: 'Database Schema & Fields',
        description: `This is the **Schema View** representing your database template. The columns represent **Fields** — which define structural properties for all entries in this database (like alignment, status, or tags). Fields keep your worldbuilding structured and organized.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '📄',
        title: 'Task: Create a New Entry',
        description: `Now click the **+ New Entry** button to create a new page in this database.`,
        target: '#sv-new-btn',
        placement: 'left',
        requireClickOnTarget: true,
        actionHint: '👆 Click "+ New Entry" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 4, styleId });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 4 — Page / Entry Editor
// =================================══════════════════════════════════════════════
export async function runPhase4() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 4) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '✍️',
        title: 'Page Editor',
        description: `Test out the Entry!, once youre done click here`,
        target: '#pv-back-btn',
        placement: 'right',
        dimOpacity: 0.15,
        requireClickOnTarget: true,
        allowPageInteraction: true,
        actionHint: "👆 Click '← Back' when you are done testing",
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 5, styleId });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 5 — Sidebar Navigation to Roadmap Timeline
// =================================══════════════════════════════════════════════
export async function runPhase5() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 5) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎬',
        title: `Navigate to ${terms.roadmap || 'Roadmap'}`,
        description: `Let's open the **${terms.roadmap || 'Story Roadmap'}** next. Click on **${terms.roadmap || 'Story Roadmap'}** in the sidebar to open the timeline.`,
        target: '.nav-item[data-route="story-timeline"]',
        placement: 'right',
        requireClickOnTarget: true,
        allowedTargets: ['.nav-item[data-route="story-timeline"]', '.sidebar-collapse-btn', '#forge-tutorial-popover'],
        actionHint: `👆 Click '${terms.roadmap || 'Story Roadmap'}' in the sidebar`,
        onEnter: () => {
          // Reopen the sidebar if it is collapsed
          const sidebar = document.getElementById('sidebar');
          if (sidebar && sidebar.classList.contains('collapsed')) {
            const btn = sidebar.querySelector('.sidebar-collapse-btn');
            if (btn) btn.click();
          }
        },
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 6, styleId });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 6 — Story Roadmap / Timeline
// =================================══════════════════════════════════════════════
export async function runPhase6() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 6) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎬',
        title: `The ${terms.roadmap || 'Roadmap'}`,
        description: `This is the **${terms.roadmap || 'Story Roadmap'}** — a visual timeline for planning acts, chapters, or areas. You can drag cards to order them chronologically, auto-align beats, or check dependencies.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '✏️',
        title: 'Task: Edit the Spark beat',
        description: `Let's inspect your first beat. Click the **The Spark** beat card to open its details.`,
        target: () => {
          const cards = document.querySelectorAll('.stc-card');
          for (const card of cards) {
            const title = card.querySelector('.stc-card-title');
            if (title && title.textContent.trim() === 'The Spark') {
              return card;
            }
          }
          return null;
        },
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: "👆 Click on 'The Spark' beat card to continue",
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 7, styleId });
          runPhase7();
        }
      }
    ]);
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 7 — Beat Edit Modal details & save
// =================================══════════════════════════════════════════════
export async function runPhase7() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 7) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    const modal = document.querySelector('.stc-modal');
    if (!modal) {
      // If modal is not open, guide them back
      tutorial.start([{
        icon: '✏️',
        title: 'Open Beat Editor',
        description: `Click the **The Spark** beat card to open the beat details.`,
        target: () => {
          const cards = document.querySelectorAll('.stc-card');
          for (const card of cards) {
            const title = card.querySelector('.stc-card-title');
            if (title && title.textContent.trim() === 'The Spark') {
              return card;
            }
          }
          return null;
        },
        placement: 'right',
        requireClickOnTarget: true,
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 7, styleId });
          runPhase7();
        }
      }]);
      return;
    }

    tutorial.start([
      {
        icon: '📝',
        title: 'Beat Title',
        description: `This is the beat **Title** — representing this story event's name.`,
        target: '#stc-edit-title',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '↕️',
        title: 'Plot Lane',
        description: `Each beat is assigned to one of three **Plot Lanes** (Main Plot, Sub Plot, or World Event) to keep parallel threads organized.`,
        target: '#stc-edit-lane',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '✍️',
        title: 'Synopsis & Outline',
        description: `Write a brief **Synopsis** explaining what happens in this scene or chapter.`,
        target: '#stc-edit-content',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '🔗',
        title: 'Task: Link your created entry',
        description: `Link the database entry you created earlier to this beat by **checking the box** next to its name.`,
        target: '#stc-chars',
        placement: 'left',
        padding: 4,
        actionHint: '👆 Check the box next to your page entry in the list',
        checkTask: () => {
          const cb = document.querySelector('#stc-chars input[type="checkbox"]:checked');
          return !!cb;
        }
      },
      {
        icon: '💾',
        title: 'Task: Save Changes',
        description: `Now click **Save Changes** to save your beat's new configurations and close the editor.`,
        target: '#stc-edit-save',
        placement: 'top',
        actionHint: "👆 Click 'Save Changes' to continue",
        checkTask: () => !document.querySelector('.stc-modal-overlay'),
        onTaskComplete: () => {
          saveTutorialState({ active: true, currentPhase: 8, styleId });
        }
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 8, styleId });
        runPhase8();
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 8 — Open Canvas from Beat
// =================================══════════════════════════════════════════════
export async function runPhase8() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 8) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎨',
        title: 'Task: Open Beat Canvas',
        description: `Let's dive into this beat's canvas! **Double-click** the **The Spark** beat card to open it as an infinite canvas workspace.`,
        target: () => {
          const cards = document.querySelectorAll('.stc-card');
          for (const card of cards) {
            const title = card.querySelector('.stc-card-title');
            if (title && title.textContent.trim() === 'The Spark') {
              return card;
            }
          }
          return null;
        },
        placement: 'right',
        actionHint: '🖱️ Double-click the beat card to open the canvas',
        checkTask: () => window.location.hash.includes('workspace/'),
        onTaskComplete: () => {
          saveTutorialState({ active: true, currentPhase: 9, styleId });
        }
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 8, styleId });
        runPhase8();
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 9 — Canvas Workspace & Tools
// =================================══════════════════════════════════════════════
export async function runPhase9() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 9) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    const steps = [
      {
        icon: '🎨',
        title: 'The Infinite Canvas',
        description: `Welcome to the beat's infinite <strong>Canvas</strong>! Here you can pan, zoom, draw connection lines, and arrange ideas. Forge automatically seeded nodes for your beat synopsis and linked entries on this grid.`,
        target: null
      },
      {
        icon: '📝',
        title: 'Rich Text Card',
        description: `Add formatted text blocks for your notes, descriptions, or lore.`,
        target: '.canvas-add-node-btn[data-type="richtext"]',
        placement: 'bottom'
      },
      {
        icon: '🖼️',
        title: 'Image Card',
        description: `Import visual references, characters, or mood boards to the board.`,
        target: '.canvas-add-node-btn[data-type="image"]',
        placement: 'bottom'
      },
      {
        icon: '⏳',
        title: 'Timeline Event',
        description: `Plot chronologically ordered events and story beats.`,
        target: '.canvas-add-node-btn[data-type="timeline"]',
        placement: 'bottom'
      },
      {
        icon: '🔗',
        title: 'Relationship Link',
        description: `Connect two entities with a labeled relationship line.`,
        target: '.canvas-add-node-btn[data-type="link"]',
        placement: 'bottom'
      },
      {
        icon: '📌',
        title: 'Mood Board',
        description: `Pin multiple images, notes, and visual inspirations together.`,
        target: '.canvas-add-node-btn[data-type="moodboard"]',
        placement: 'bottom'
      },
      {
        icon: '💬',
        title: 'Quote Card',
        description: `Highlight important dialogue, proverbs, or sayings.`,
        target: '.canvas-add-node-btn[data-type="quote"]',
        placement: 'bottom'
      },
      {
        icon: '📄',
        title: 'Database Page Link',
        description: `Link and embed an existing database page directly onto the canvas.`,
        target: '.canvas-add-node-btn[data-type="pagelink"]',
        placement: 'bottom'
      },
      {
        icon: '🗺️',
        title: 'Interactive Map',
        description: `Pin locations, draw regions, and reference geographies.`,
        target: '.canvas-add-node-btn[data-type="map"]',
        placement: 'bottom'
      }
    ];

    // Style-specific interactive tasks
    if (styleId === 'dnd') {
      steps.push(
        {
          icon: '🛡️',
          title: 'D&D Stat Block',
          description: `This is your interactive <strong>D&D Stat Block</strong>. You can track HP, AC, abilities, saving throws, and click on skills or attacks to auto-roll them directly inside the app!`,
          target: () => document.querySelector('.canvas-node[data-node-type="statblock"]'),
          placement: 'right',
          padding: 4,
          onEnter: async () => {
            if (!document.querySelector('.canvas-node[data-node-type="statblock"]')) {
              if (typeof window.spawnNode === 'function') {
                await window.spawnNode('statblock');
              }
            }
          }
        },
        {
          icon: '⚔️',
          title: 'Encounter Builder',
          description: `This is your <strong>Encounter Builder</strong>. Track initiative order, monitor combatant health, and automatically calculate combat difficulty ratings.`,
          target: () => document.querySelector('.canvas-node[data-node-type="encounter"]'),
          placement: 'right',
          padding: 4,
          onEnter: async () => {
            if (!document.querySelector('.canvas-node[data-node-type="encounter"]')) {
              if (typeof window.spawnNode === 'function') {
                await window.spawnNode('encounter');
              }
            }
          }
        },
        {
          icon: '🎲',
          title: 'Dice Tray',
          description: `This is the <strong>Dice Tray</strong>. Select the dice you want to roll, see physics-based 3D dice rolls on the screen, and track roll history with crit alerts!`,
          target: '#canvas-dice-panel',
          placement: 'left',
          padding: 4,
          onEnter: () => {
            if (!document.getElementById('canvas-dice-panel')) {
              const btn = document.getElementById('canvas-dice-tray-btn');
              if (btn) btn.click();
            }
          }
        }
      );
    } else if (styleId === 'gamedev') {
      steps.push(
        {
          icon: '🔄',
          title: 'Behavior Node',
          description: `This is a <strong>Behavior Node</strong>. Use it to flowchart state machines, map player choice branches, or document complex game mechanics.`,
          target: () => document.querySelector('.canvas-node[data-node-type="flowchart"]'),
          placement: 'right',
          padding: 4,
          onEnter: async () => {
            if (!document.querySelector('.canvas-node[data-node-type="flowchart"]')) {
              if (typeof window.spawnNode === 'function') {
                await window.spawnNode('flowchart');
              }
            }
          }
        },
        {
          icon: '📈',
          title: 'Progression Calc',
          description: `This is a <strong>Progression Calculator</strong>. Plot curves to balance player level scaling, experience points, or resource economies.`,
          target: () => document.querySelector('.canvas-node[data-node-type="progression"]'),
          placement: 'right',
          padding: 4,
          onEnter: async () => {
            if (!document.querySelector('.canvas-node[data-node-type="progression"]')) {
              if (typeof window.spawnNode === 'function') {
                await window.spawnNode('progression');
              }
            }
          }
        },
        {
          icon: '🧮',
          title: 'XP Solver',
          description: `This is the <strong>XP Solver</strong> panel. Test out different formulas and immediately view calculations for level progression and player XP.`,
          target: '#canvas-math-panel',
          placement: 'left',
          padding: 4,
          onEnter: () => {
            if (!document.getElementById('canvas-math-panel')) {
              const btn = document.getElementById('canvas-math-solver-btn');
              if (btn) btn.click();
            }
          }
        }
      );
    } else {
      steps.push(
        {
          icon: '📈',
          title: 'Act Pacing',
          description: `This is the <strong>Act Pacing</strong> tracker. Visualize the dramatic tension curve and pacing across your entire story or screenplay.`,
          target: '#canvas-pacing-panel',
          placement: 'left',
          padding: 4,
          onEnter: () => {
            if (!document.getElementById('canvas-pacing-panel')) {
              const btn = document.getElementById('canvas-pacing-tracker-btn');
              if (btn) btn.click();
            }
          }
        }
      );
    }

    // Add final navigation step
    steps.push({
      icon: '🕸️',
      title: `Next: Open the ${terms.fate || 'Web of Fate'}`,
      description: `Wonderful! You've explored the canvas tools. Now let's view your universe's connections in a project-wide physics graph. We will automatically navigate you to the <strong>${terms.fate || 'Web of Fate'}</strong> now!`,
      target: null,
      onEnter: () => {
        tutorial.setTimeoutTracked(() => {
          saveTutorialState({ active: true, currentPhase: 10, styleId });
          navigate('graph');
        }, 3000);
      }
    });

    tutorial.start(steps, {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 10, styleId });
        navigate('graph');
      }
    });
  }, 600);
}



// =================================══════════════════════════════════════════════
// PHASE 10 — Web of Fate (Graph View)
// =================================══════════════════════════════════════════════
export async function runPhase10() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 10) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🕸️',
        title: `The ${terms.fate || 'Web of Fate'}`,
        description: `The **${terms.fate || 'Web of Fate'}** automatically renders every database entry in your project as a node in a physics-based graph. Any links and mentions draw visual lines between them.`,
        target: '#graph-canvas',
        placement: 'bottom',
        padding: 0
      },
      {
        icon: '🔥',
        title: 'Next: Meeting Ignis',
        description: `Now, let's explore your AI creative partner, **Ignis**. We will proceed to configure and test Ignis companion features!`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            const ignisOff = localStorage.getItem('forge-companion-enabled') === 'false';
            if (ignisOff) {
              saveTutorialState({ active: true, currentPhase: 11, styleId });
              navigate('settings');
            } else {
              saveTutorialState({ active: true, currentPhase: 12, styleId });
              const drawer = document.getElementById('ai-drawer');
              if (!drawer || !drawer.classList.contains('open')) {
                const btn = document.querySelector('.sidebar-ai-toggle-btn');
                if (btn) btn.click();
              }
              runPhase12();
            }
          }, 2500);
        }
      }
    ], {
      onFinish: () => {
        const ignisOff = localStorage.getItem('forge-companion-enabled') === 'false';
        if (ignisOff) {
          saveTutorialState({ active: true, currentPhase: 11, styleId });
          navigate('settings');
        } else {
          saveTutorialState({ active: true, currentPhase: 12, styleId });
          const drawer = document.getElementById('ai-drawer');
          if (!drawer || !drawer.classList.contains('open')) {
            const btn = document.querySelector('.sidebar-ai-toggle-btn');
            if (btn) btn.click();
          }
          runPhase12();
        }
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 11 — Ignis Setup (Settings Rundown)
// =================================══════════════════════════════════════════════
export async function runPhase11() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 11) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '⚙️',
        title: 'Settings Page Rundown',
        description: `Since Ignis is currently disabled, we've navigated to the **Settings** page. Let's do a rundown of settings from top to bottom before turning Ignis on.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '📁',
        title: 'Project Settings',
        description: `In the **General / Project** tab, you customize your universe's name, active genre, and style preset.`,
        target: '[data-tab="project"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🎨',
        title: 'Visuals & Themes',
        description: `In the **Visuals & Themes** tab, you configure visual modes (Light, Cyberpunk, Obsidian) and highlight accents.`,
        target: '[data-tab="visuals"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '☁️',
        title: 'Storage & Sync',
        description: `In the **Storage & Sync** tab, you set up Firebase configuration for cloud backup and multi-device synchronizations.`,
        target: '[data-tab="storage"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔔',
        title: 'Reminders',
        description: `In the **Reminders** tab, you configure writing schedule notifications to keep your project active.`,
        target: '[data-tab="notifications"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔥',
        title: 'AI Companion settings',
        description: `Click the **AI Companion** tab to access Ignis's configurations.`,
        target: '[data-tab="ai"]',
        placement: 'right',
        padding: 4,
        requireClickOnTarget: true,
        actionHint: "👆 Click the 'AI Companion' tab button",
        onTargetClick: () => {
          const btn = document.querySelector('.settings-tab-btn[data-tab="ai"]');
          if (btn) btn.click();
        }
      },
      {
        icon: '🔥',
        title: 'Task: Enable Ignis AI',
        description: `Check the **Enable Ignis AI Companion** toggle to turn Ignis on.`,
        target: '#set-companion-toggle',
        placement: 'bottom',
        padding: 4,
        actionHint: '👆 Toggle the checkbox to turn on Ignis',
        checkTask: () => localStorage.getItem('forge-companion-enabled') !== 'false'
      },
      {
        icon: '🦙',
        title: 'Local Ollama Integration',
        description: `Ignis supports local offline AI using **Ollama**. If you do not have Ollama on your PC, download it from [https://ollama.com](https://ollama.com) and start it, then click Next.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '💬',
        title: 'Next: Open Ignis Chat',
        description: `Great! Let's start the chat. We will open the Ignis Companion drawer for you now!`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            saveTutorialState({ active: true, currentPhase: 12, styleId });
            const drawer = document.getElementById('ai-drawer');
            if (!drawer || !drawer.classList.contains('open')) {
              const btn = document.querySelector('.sidebar-ai-toggle-btn');
              if (btn) btn.click();
            }
            runPhase12();
          }, 1500);
        }
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 12, styleId });
        const drawer = document.getElementById('ai-drawer');
        if (!drawer || !drawer.classList.contains('open')) {
          const btn = document.querySelector('.sidebar-ai-toggle-btn');
          if (btn) btn.click();
        }
        runPhase12();
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 12 — Ignis AI Chat
// =================================══════════════════════════════════════════════
export async function runPhase12() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 12) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🔥',
        title: 'Ignis AI Companion Chat',
        description: `**Ignis** reads your database entries to answer lore questions and brainstorm. You can set personalities like Sage, Spark, Scholar, or Shadow. Let's try it.`,
        target: '#ai-drawer',
        placement: 'left',
        padding: 0
      },
      {
        icon: '💬',
        title: 'Task: Ask Ignis a Question',
        description: `Type a question or idea prompt in the chat box at the bottom of the drawer (e.g. 'Give me three names') and press **Enter** to send.`,
        target: '#ai-drawer',
        placement: 'left',
        padding: 0,
        actionHint: '💬 Type a message in the input and press Enter',
        onEnter: () => {
          tutorial.initialMessageCount = document.querySelectorAll('.ai-bubble').length;
        },
        checkTask: () => document.querySelectorAll('.ai-bubble').length > tutorial.initialMessageCount
      },
      {
        icon: '🎬',
        title: 'Next: Scene Mode',
        description: `Awesome! Next, let's open **Scene Mode** for co-writing paragraphs. We will open it for you now!`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            saveTutorialState({ active: true, currentPhase: 13, styleId });
            // Close Ignis if open
            const ignisDrawer = document.getElementById('ai-drawer');
            if (ignisDrawer && ignisDrawer.classList.contains('open')) {
              const btn = document.querySelector('.sidebar-ai-toggle-btn');
              if (btn) btn.click();
            }
            // Open Scene Mode if closed
            const sceneDrawer = document.getElementById('scene-mode-drawer');
            if (!sceneDrawer || !sceneDrawer.classList.contains('open')) {
              const btn = document.querySelector('.sidebar-scene-mode-btn');
              if (btn) btn.click();
            }
            runPhase13();
          }, 2000);
        }
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 13, styleId });
        // Close Ignis if open
        const ignisDrawer = document.getElementById('ai-drawer');
        if (ignisDrawer && ignisDrawer.classList.contains('open')) {
          const btn = document.querySelector('.sidebar-ai-toggle-btn');
          if (btn) btn.click();
        }
        // Open Scene Mode if closed
        const sceneDrawer = document.getElementById('scene-mode-drawer');
        if (!sceneDrawer || !sceneDrawer.classList.contains('open')) {
          const btn = document.querySelector('.sidebar-scene-mode-btn');
          if (btn) btn.click();
        }
        runPhase13();
      }
    });
  }, 600);
}

// =================================══════════════════════════════════════════════
// PHASE 13 — Scene Mode Drawer
// =================================══════════════════════════════════════════════
export async function runPhase13() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 13) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎬',
        title: 'Ignis Scene Mode',
        description: `Scene Mode lets you write collaborative drafts. You select the location, premise, and characters, and Ignis generates suggestions paragraph by paragraph.`,
        target: '#scene-mode-drawer',
        placement: 'left',
        padding: 0
      },
      {
        icon: '✍️',
        title: 'Task: Generate a Draft',
        description: `Click **Generate Scene Draft** to write your first co-authored paragraph. (If you don't have a Gemini API key configured, we will auto-bypass this step).`,
        target: '#scene-mode-drawer',
        placement: 'left',
        padding: 0,
        actionHint: '🎬 Click "Generate Scene Draft" to co-write',
        checkTask: () => {
          if (document.querySelector('.scene-api-key-msg')) return true; // bypass
          return document.querySelectorAll('.scene-para-text, .scene-para-actions').length > 0;
        }
      },
      {
        icon: '🔺',
        title: 'Next: Continuity Engine',
        description: `Let's head to the **Continuity Engine** background consistency scanner. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            document.getElementById('scene-mode-close-btn')?.click();
            saveTutorialState({ active: true, currentPhase: 14, styleId });
            navigate('continuity');
          }, 2000);
        }
      }
    ], {
      onFinish: () => {
        document.getElementById('scene-mode-close-btn')?.click();
        saveTutorialState({ active: true, currentPhase: 14, styleId });
        navigate('continuity');
      }
    });
  }, 600);
}

// =================================══════════════════════════════════════════════
// PHASE 14 — Continuity Engine
// =================================══════════════════════════════════════════════
export async function runPhase14() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 14) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🔺',
        title: 'The Continuity Engine',
        description: `The Continuity Engine passively scans your universe for plot conflicts, character age discrepancies, broken links, or timeline issues as you write.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '🔍',
        title: 'Task: Scan Your Project',
        description: `Click the **Scan Now** button to perform an immediate, full integrity scan of your database entries and timeline links.`,
        target: '.ce-scan-btn',
        placement: 'bottom',
        padding: 4,
        actionHint: '🔍 Click the "Scan Now" button',
        onEnter: () => {
          tutorial.scanTriggered = false;
          const btn = document.querySelector('.ce-scan-btn');
          if (btn) {
            btn.addEventListener('click', () => { tutorial.scanTriggered = true; }, { once: true });
          }
        },
        checkTask: () => tutorial.scanTriggered === true
      },
      {
        icon: '⚙️',
        title: 'Checking Settings tab',
        description: `Great scan! We will now navigate to Settings or wrap up the tour.`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            const ignisOff = localStorage.getItem('forge-companion-enabled') === 'false';
            if (ignisOff) {
              // We already ran down settings in Phase 11, skip Settings Rundown (Phase 15) and go to Search (Phase 16)!
              saveTutorialState({ active: true, currentPhase: 16, styleId });
              runPhase16();
            } else {
              // We haven't run down settings yet! Go to Settings Rundown (Phase 15)
              saveTutorialState({ active: true, currentPhase: 15, styleId });
              navigate('settings');
            }
          }, 1500);
        }
      }
    ], {
      onFinish: () => {
        const ignisOff = localStorage.getItem('forge-companion-enabled') === 'false';
        if (ignisOff) {
          saveTutorialState({ active: true, currentPhase: 16, styleId });
          runPhase16();
        } else {
          saveTutorialState({ active: true, currentPhase: 15, styleId });
          navigate('settings');
        }
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 15 — Settings Rundown (skipped if Ignis was off)
// =================================══════════════════════════════════════════════
export async function runPhase15() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 15) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '⚙️',
        title: 'Settings Page Rundown',
        description: `Welcome to the **Settings** page! Let's do a rundown of settings tabs from top to bottom.`,
        target: '#page-container',
        placement: 'bottom'
      },
      {
        icon: '📁',
        title: 'Project Settings',
        description: `Under **General / Project**, you customize your universe's name, active genre, and style preset.`,
        target: '[data-tab="project"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🎨',
        title: 'Visuals & Themes',
        description: `Under **Visuals & Themes**, you configure visual modes (Light, Cyberpunk, Obsidian) and highlight accents.`,
        target: '[data-tab="visuals"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '☁️',
        title: 'Storage & Sync',
        description: `Under **Storage & Sync**, you set up Firebase configuration for cloud backup and multi-device synchronizations.`,
        target: '[data-tab="storage"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔔',
        title: 'Reminders',
        description: `Under **Reminders**, you configure writing schedule notifications to keep your project active.`,
        target: '[data-tab="notifications"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔥',
        title: 'AI Companion settings',
        description: `Under **AI Companion**, you configure Ignis's personality (Sage, Spark, Scholar, Shadow) and toggle background continuity scanning.`,
        target: '[data-tab="ai"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔍',
        title: 'Next: Global Search',
        description: `Excellent! Now let's wrap up with search.`,
        target: null,
        onEnter: () => {
          tutorial.setTimeoutTracked(() => {
            saveTutorialState({ active: true, currentPhase: 16, styleId });
            runPhase16();
          }, 1500);
        }
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 16, styleId });
        runPhase16();
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// PHASE 16 — Global Search & Wrap-up
// =================================══════════════════════════════════════════════
export async function runPhase16() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 16) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🔍',
        title: 'Global Search & Wrap-up',
        description: `Finally, let's talk about **Global Search**.
Pressing **Ctrl + K** (or **Cmd + K** on Mac) opens the search overlay instantly. You can type any character, scene, or note name to jump straight to it.
Congratulations, you've completed the full onboarding tour! Now go build your universe. The forge awaits! ⚡`,
        target: null
      }
    ], {
      nextLabel: '🎉 Finish',
      onFinish: () => {
        saveTutorialState({ active: false, currentPhase: 0 });
        tutorial.stop();
      }
    });
  }, 450);
}

// =================================══════════════════════════════════════════════
// Global Route Hook — auto-resumes tutorial on navigation
// =================================══════════════════════════════════════════════
window.addEventListener('page-rendered', (e) => {
  const path = e.detail?.path || '';
  const state = getTutorialState();
  if (!state.active) return;

  const phase = state.currentPhase;

  if (phase === 1 && path === 'dashboard')           return runPhase1();
  if (phase === 2 && path === 'dashboard')           return runPhase2();
  if (phase === 3 && path.startsWith('schema/'))     return runPhase3();
  if (phase === 4 && path.startsWith('page/'))       return runPhase4();
  if (phase === 5 && path.startsWith('schema/'))     return runPhase5();
  if (phase === 6 && path === 'story-timeline')      return runPhase6();
  if (phase === 7 && path === 'story-timeline')      return runPhase7();
  if (phase === 8 && path === 'story-timeline')      return runPhase8();
  if (phase === 9 && path.startsWith('workspace/'))  return runPhase9();
  if (phase === 10 && path === 'graph')               return runPhase10();
  if (phase === 11 && path === 'settings')            return runPhase11();
  if (phase === 14 && path === 'continuity')          return runPhase14();
  if (phase === 15 && path === 'settings')            return runPhase15();
});