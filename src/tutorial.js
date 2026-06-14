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

// ─── SpotlightTutorial Class ──────────────────────────────────────────────────

class SpotlightTutorial {
  constructor() {
    this.steps = [];
    this.currentStepIndex = 0;
    this.isActive = false;
    this.onFinish = null;
    this.taskPollInterval = null;
    this.taskCompleted = false;
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

    if (step.requireClickOnTarget && step.target) {
      const el = typeof step.target === 'string' ? document.querySelector(step.target) : step.target;
      if (el && (el === e.target || el.contains(e.target))) {
        if (step.onTargetClick) step.onTargetClick();
      } else {
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
  }

  start(steps, config = {}) {
    this.steps = steps;
    this.currentStepIndex = 0;
    this.isActive = true;
    this.onFinish = config.onFinish || null;
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
      if (this.onFinish) this.onFinish();
      this.stop();
    }
  }

  prev() {
    this.clearTaskPolling();
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.renderStep();
    }
  }

  renderStep() {
    this.clearTaskPolling();

    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    // Reset styles and states
    this.actionHint.style.background = '';
    this.actionHint.style.borderColor = '';
    this.actionHint.style.color = '';
    this.nextBtn.disabled = false;
    this.nextBtn.style.opacity = '';
    this.nextBtn.style.pointerEvents = '';
    this.nextBtn.style.display = 'block';

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
    this.nextBtn.textContent = this.currentStepIndex === this.steps.length - 1 ? '🎉 Finish' : 'Next →';

    // Prev button visibility
    this.prevBtn.style.display = this.currentStepIndex > 0 ? 'block' : 'none';

    // Handle checkTask steps vs click target vs normal
    if (step.checkTask) {
      this.nextBtn.disabled = true;
      this.nextBtn.style.opacity = '0.5';
      this.nextBtn.style.pointerEvents = 'none';
      this.nextBtn.textContent = 'Complete Task';

      this.overlay.style.pointerEvents = 'none'; // let user click through
      this.actionHint.innerHTML = step.actionHint || '📝 Task: Perform action to continue';
      this.actionHint.style.display = 'block';

      if (step.onEnter) step.onEnter();

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
            this.nextBtn.textContent = this.currentStepIndex === this.steps.length - 1 ? '🎉 Finish' : 'Next →';

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
      if (step.onEnter) step.onEnter();
    } else {
      this.nextBtn.style.display = 'block';
      this.overlay.style.pointerEvents = 'auto';
      this.actionHint.style.display = 'none';
      if (step.onEnter) step.onEnter();
    }

    // Position spotlight
    if (step.target) {
      const targetEl = typeof step.target === 'string' ? document.querySelector(step.target) : step.target;
      if (targetEl) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Dashboard & Navigation Overview
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase1() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 1) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  tutorial.start([
    {
      icon: '⚡',
      title: 'Welcome to Forge',
      description: `Forge is your creative workspace — databases, visual canvases, timelines, and AI writing tools all in one place. This interactive guide will teach you how to use every feature by having you **actively try** the core features! Let's dive in.`,
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
    },
    {
      icon: '↔️',
      title: 'Task: Collapse the Sidebar',
      description: `Try collapsing the sidebar to give your content more space. Click the **collapse button** (top-right of sidebar) to close it, then click the logo to expand it again.`,
      target: '.sidebar-collapse-btn',
      placement: 'right',
      actionHint: '👈 Click the sidebar collapse button',
      checkTask: () => document.getElementById('sidebar')?.classList.contains('collapsed'),
      onTaskComplete: () => {
        setTimeout(() => {
          document.getElementById('sidebar')?.classList.remove('collapsed');
        }, 800);
      }
    },
    {
      icon: '🔍',
      title: 'Task: Try Global Search',
      description: `Let's find things quickly. Press **Ctrl + K** (or **Cmd + K** on Mac) to open the **Global Search** overlay, which lets you search across all entities instantly.`,
      target: null,
      actionHint: '⌨️ Press Ctrl + K (or Cmd + K) to open search',
      checkTask: () => !!document.querySelector('.search-overlay') || !!document.querySelector('.search-container'),
      onTaskComplete: () => {
        const overlay = document.querySelector('.search-overlay');
        if (overlay) {
          overlay.click();
        }
      }
    },
    {
      icon: '🗃️',
      title: 'Task: Open New Database Modal',
      description: `Databases store your entities (like ${terms.characters} or ${terms.locations}). Click the **New Database** button on the dashboard to open the template selector.`,
      target: '#new-database-btn',
      placement: 'bottom',
      actionHint: `👆 Click "New Database"`,
      checkTask: () => !!document.querySelector('.modal')
    },
    {
      icon: '🗃️',
      title: 'Task: Create a Database',
      description: `Choose a template (like **${terms.characters}** or **${terms.locations}**) or choose **Custom**, name your database, and click **Create Database** (or **Save Changes**).`,
      target: '.modal',
      placement: 'bottom',
      padding: 8,
      actionHint: `👆 Select a template and click create`,
      checkTask: () => window.location.hash.includes('schema/'),
      onTaskComplete: () => {
        saveTutorialState({ active: true, currentPhase: 2, styleId });
      }
    }
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Schema View (Database editor)
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase2() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 2) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '📋',
        title: 'Your Database Schema',
        description: `This is the **Schema View** — the home screen for a database. It lists all entries (pages) and lets you customize the fields and settings of this database template.`,
        target: null
      },
      {
        icon: '🔧',
        title: 'Task: Open Fields Manager',
        description: `Every entry in this database shares custom fields you define. Click **Fields** at the top to open the field manager.`,
        target: '#sv-fields-btn',
        placement: 'bottom',
        padding: 6,
        actionHint: '⚙️ Click "Fields" to open the field manager',
        checkTask: () => !!document.querySelector('.modal')
      },
      {
        icon: '🔧',
        title: 'Task: Add a Custom Field',
        description: `In the field manager modal, click **+ Add Field** (or customize an existing one), name it, and then click **Save Changes** at the bottom of the modal.`,
        target: '.modal',
        placement: 'bottom',
        padding: 8,
        actionHint: '⚙️ Add a field and click "Save Changes"',
        onEnter: async () => {
          const path = window.location.hash;
          const match = path.match(/schema\/([a-zA-Z0-9_-]+)/);
          if (match) {
            const schema = await db.getSchema(match[1]);
            tutorial.initialFieldsCount = schema ? (schema.fields || []).length : 0;
          } else {
            tutorial.initialFieldsCount = 0;
          }
        },
        checkTask: async () => {
          const path = window.location.hash;
          const match = path.match(/schema\/([a-zA-Z0-9_-]+)/);
          if (!match) return false;
          const schema = await db.getSchema(match[1]);
          return schema && schema.fields && schema.fields.length > tutorial.initialFieldsCount;
        }
      },
      {
        icon: '📄',
        title: 'Task: Create a New Entry',
        description: `Excellent! Now click **+ New Entry** (or the empty state button) to create your first page in this database.`,
        target: '#sv-new-btn',
        placement: 'left',
        requireClickOnTarget: true,
        actionHint: '👆 Click "+ New Entry" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 3, styleId });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Page / Entry Editor
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase3() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 3) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '✍️',
        title: 'The Page Editor',
        description: `This is the full-featured page editor. Here, you write backstories, statistics, or specs. Everything you edit is saved automatically.`,
        target: null
      },
      {
        icon: '🔤',
        title: 'Task: Name your Page',
        description: `Click the title input at the top (which currently says "Untitled") and type a name for this page (e.g. 'Arthur Voss', 'Vortex Reactor', or 'Zone 1').`,
        target: '#pv-title',
        placement: 'bottom',
        actionHint: '📝 Type a name in the title input at the top',
        checkTask: () => {
          const el = document.getElementById('pv-title');
          return el && el.textContent.trim().length > 0 && el.textContent.trim() !== 'Untitled';
        }
      },
      {
        icon: '🏷️',
        title: 'Task: Create a Tag',
        description: `Type a tag name (like 'core' or 'magical') in the tag box and press **Enter** (or comma) to create a visual tag chip.`,
        target: '.pv-tag-input',
        placement: 'bottom',
        padding: 4,
        actionHint: '🏷️ Type a tag and press Enter',
        checkTask: () => document.querySelectorAll('.pv-tag-chip').length > 0
      },
      {
        icon: '📖',
        title: 'Task: Write some Lore/Text',
        description: `Click inside the rich-text editor below and type at least a short sentence (10 characters or more) about this entity.`,
        target: '#pv-editor-mount',
        placement: 'top',
        padding: 4,
        actionHint: '✍️ Type a description in the Quill editor (min. 10 chars)',
        checkTask: () => {
          const el = document.querySelector('.ql-editor');
          return el && el.textContent.trim().length >= 10;
        }
      },
      {
        icon: '↩️',
        title: 'Task: Return to Database',
        description: `Looking good! Now click the **← Back** button at the top of the editor to return. We will automatically take you back to the Dashboard to create a canvas.`,
        target: '#pv-back-btn',
        placement: 'bottom',
        requireClickOnTarget: true,
        actionHint: '👆 Click "← Back" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 4, styleId });
          navigate('dashboard');
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Dashboard → create Canvas → Workspace
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase4() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 4) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    const onDashboard = window.location.hash.includes('dashboard') || !window.location.hash.includes('schema');
    if (!onDashboard) {
      tutorial.start([
        {
          icon: '🏠',
          title: `Go to ${terms.dashboardTitle || 'Dashboard'}`,
          description: `Click on **${terms.dashboardTitle || 'Dashboard'}** in the sidebar to return to the main dashboard.`,
          target: '[data-route="dashboard"]',
          placement: 'right',
          requireClickOnTarget: true,
          actionHint: `👆 Click "${terms.dashboardTitle || 'Dashboard'}" in the sidebar`,
          onTargetClick: () => {
            tutorial.stop(true);
          }
        }
      ]);
      return;
    }

    tutorial.start([
      {
        icon: '🎨',
        title: 'Visual Canvases',
        description: `Canvases are infinite visual workspaces where you can arrange idea cards, images, relationship maps, and database page links. Let's create one.`,
        target: null
      },
      {
        icon: '➕',
        title: 'Task: Open New Canvas Modal',
        description: `Click the **New Canvas** button on the dashboard to open the canvas creation modal.`,
        target: '#new-canvas-btn',
        placement: 'bottom',
        actionHint: '👆 Click "New Canvas"',
        checkTask: () => !!document.querySelector('.modal')
      },
      {
        icon: '➕',
        title: 'Task: Create a Canvas',
        description: `Type a name for your new canvas (e.g. 'Plot Board' or 'Mind Map'), choose an icon, and click **Create Canvas**.`,
        target: '.modal',
        placement: 'bottom',
        padding: 8,
        actionHint: '👆 Name the canvas and click Create',
        checkTask: () => window.location.hash.includes('workspace/'),
        onTaskComplete: () => {
          saveTutorialState({ active: true, currentPhase: 5, styleId });
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Workspace (Infinite Canvas)
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase5() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 5) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🗺️',
        title: 'The Infinite Workspace',
        description: `Welcome to the infinite workspace grid! You can zoom with the mouse wheel, pan by dragging the empty space, and build layouts. Let's practice.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '✏️',
        title: 'Task: Add a Node',
        description: `**Right-click** anywhere on the grid to open the context menu. Select **Text Node** or **Sticky Note** to place a card.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0,
        actionHint: '🖱️ Right-click empty space and choose a node type',
        onEnter: () => {
          tutorial.initialNodeCount = document.querySelectorAll('.canvas-node').length;
        },
        checkTask: () => document.querySelectorAll('.canvas-node').length > tutorial.initialNodeCount
      },
      {
        icon: '📝',
        title: 'Task: Edit the Node Title',
        description: `Double-click the title of your new node (where it says "Untitled") and type a name for it.`,
        target: '.canvas-node-title',
        placement: 'bottom',
        actionHint: "✏️ Double-click the 'Untitled' text and type a new name",
        checkTask: () => {
          const el = document.querySelector('.canvas-node-title');
          return el && el.textContent.trim().length > 0 && el.textContent.trim() !== 'Untitled';
        }
      },
      {
        icon: '🔗',
        title: 'Task: Drag Page to Canvas',
        description: `Expand your database in the sidebar and **drag the entry card you created** directly onto the canvas to place a page-link card.`,
        target: null,
        actionHint: '📄 Drag a database page from the sidebar onto the canvas grid',
        checkTask: () => document.querySelectorAll('.canvas-node[data-node-type="pagelink"]').length > 0
      },
      {
        icon: '⚡',
        title: 'Task: Connect the Nodes',
        description: `Hover over your text node and look for the circular connection handles on the edges. Drag from a handle to your page-link node to draw an arrow connection.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0,
        actionHint: '⚡ Drag a line from one node\'s orange handle to another node',
        checkTask: () => document.querySelectorAll('.canvas-connections path').length > 0
      },
      {
        icon: '📖',
        title: `Next: Open the ${terms.roadmap || 'Roadmap'}`,
        description: `Wonderful! Next, let's explore the **${terms.roadmap || 'Story Roadmap'}** horizontal timeline. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          setTimeout(() => {
            saveTutorialState({ active: true, currentPhase: 6, styleId });
            navigate('story-timeline');
          }, 2000);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Story Roadmap (Timeline)
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase6() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 6) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎬',
        title: `The ${terms.roadmap || 'Roadmap'}`,
        description: `This is the **${terms.roadmap || 'Story Roadmap'}** — a horizontal swimlane timeline for planning acts, beats, or levels. Let's try placing one.`,
        target: null
      },
      {
        icon: '➕',
        title: `Task: Add a Beat`,
        description: `Click the **+ Add Beat** (or **+ Add Level/Zone**) button in the timeline toolbar to place a card on the grid.`,
        target: '.stc-btn-primary',
        placement: 'bottom',
        actionHint: `👆 Click "+ Add Beat" in the toolbar`,
        onEnter: () => {
          tutorial.initialBeatCount = document.querySelectorAll('.stc-card').length;
        },
        checkTask: () => document.querySelectorAll('.stc-card').length > tutorial.initialBeatCount
      },
      {
        icon: '↔️',
        title: 'Task: Drag the Beat',
        description: `Try **dragging** the beat card left or right to re-order it chronologically, or drag it vertically to move it to a different swim lane.`,
        target: '.stc-card',
        placement: 'top',
        actionHint: '↔️ Drag the beat card to change its position',
        onEnter: () => {
          tutorial.initialCardPositions = {};
          document.querySelectorAll('.stc-card').forEach(card => {
            tutorial.initialCardPositions[card.dataset.beatId] = { left: card.style.left };
          });
        },
        checkTask: () => {
          const cards = document.querySelectorAll('.stc-card');
          for (const card of cards) {
            const initial = tutorial.initialCardPositions?.[card.dataset.beatId];
            if (initial && card.style.left !== initial.left) return true;
          }
          return false;
        }
      },
      {
        icon: '🕸️',
        title: `Next: Open the ${terms.fate || 'Fate Web'}`,
        description: `Awesome! Now click **${terms.fate || 'Web of Fate'}** in the sidebar to view your universe's connections in a force-directed graph. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          setTimeout(() => {
            saveTutorialState({ active: true, currentPhase: 7, styleId });
            navigate('graph');
          }, 2000);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Web of Fate (Graph View)
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase7() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 7) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🕸️',
        title: `The ${terms.fate || 'Fate Web'}`,
        description: `The **${terms.fate || 'Web of Fate'}** automatically renders every page in your project as a node in a physics-based graph. Connections draw between referenced pages. Let's interact with it.`,
        target: null
      },
      {
        icon: '🔍',
        title: 'Task: Filter the Graph',
        description: `Try typing in the search box in the graph toolbar, or click the **Recenter Graph** button to re-focus the view.`,
        target: '.graph-toolbar',
        placement: 'bottom',
        padding: 4,
        actionHint: '🔍 Type in search or click the focus target icon',
        onEnter: () => {
          tutorial.recenterClicked = false;
          const btn = document.getElementById('graph-recenter-btn');
          if (btn) {
            btn.addEventListener('click', () => { tutorial.recenterClicked = true; }, { once: true });
          }
        },
        checkTask: () => {
          const input = document.getElementById('graph-search');
          if (input && input.value.trim().length > 0) return true;
          return tutorial.recenterClicked === true;
        }
      },
      {
        icon: '📬',
        title: 'Next: Open the Inbox',
        description: `Excellent! Now let's head to the **Inbox** to check your notifications and AI suggestions. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          setTimeout(() => {
            saveTutorialState({ active: true, currentPhase: 8, styleId });
            navigate('inbox');
          }, 2000);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — Inbox
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase8() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 8) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '📬',
        title: 'The Inbox',
        description: `The **Inbox** lists writing reminders, AI suggestions, and system notices. Let's check out your AI creative companion.`,
        target: null
      },
      {
        icon: '⚡',
        title: 'Next: Open Ignis Companion',
        description: `We will now automatically open **Ignis Companion**, your AI assistant drawer.`,
        target: '.sidebar-ai-toggle-btn',
        placement: 'right',
        onEnter: () => {
          setTimeout(() => {
            const btn = document.querySelector('.sidebar-ai-toggle-btn');
            if (btn) btn.click();
            saveTutorialState({ active: true, currentPhase: 9, styleId });
            runPhase9();
          }, 2000);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 9 — Ignis AI Companion Drawer
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase9() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 9) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    const drawerEl = document.querySelector('.ai-drawer') || document.querySelector('[class*="ai-drawer"]');
    tutorial.start([
      {
        icon: '🔥',
        title: 'Ignis AI Companion',
        description: `**Ignis** reads your project pages to answer questions grounded in your lore. You can choose different personalities in settings (Sage, Spark, Scholar, Shadow). Let's chat.`,
        target: '#ai-drawer',
        placement: 'left',
        padding: 0
      },
      {
        icon: '💬',
        title: 'Task: Ask Ignis a Question',
        description: `Type a question or idea prompt in the chat box at the bottom of the drawer (e.g. 'Give me three ideas') and press **Enter** to send it.`,
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
        title: 'Next: Try Scene Mode',
        description: `Next, let's open **Scene Mode** for co-writing paragraph suggestions. We will automatically open it for you now!`,
        target: '.sidebar-scene-mode-btn',
        placement: 'right',
        onEnter: () => {
          setTimeout(() => {
            const btn = document.querySelector('.sidebar-scene-mode-btn');
            if (btn) btn.click();
            saveTutorialState({ active: true, currentPhase: 10, styleId });
            runPhase10();
          }, 2000);
        }
      }
    ]);
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 10 — Scene Mode Drawer
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase10() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 10) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    const drawerEl = document.querySelector('.scene-mode-drawer');
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
        description: `Click **Generate Scene Draft** to write your first co-authored paragraph. (If you don't have a Gemini API key configured in settings yet, you can skip this step).`,
        target: '#scene-mode-drawer',
        placement: 'left',
        padding: 0,
        actionHint: '🎬 Click "Generate Scene Draft" to co-write',
        checkTask: () => {
          if (document.querySelector('.scene-api-key-msg')) return true; // bypass if no key
          return document.querySelectorAll('.scene-para-text, .scene-para-actions').length > 0;
        }
      },
      {
        icon: '🔺',
        title: 'Next: Open Continuity Engine',
        description: `Now let's head to the **Continuity Engine** background consistency scanner. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          setTimeout(() => {
            document.getElementById('scene-mode-close-btn')?.click();
            saveTutorialState({ active: true, currentPhase: 11, styleId });
            navigate('continuity');
          }, 2000);
        }
      }
    ]);
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 11 — Continuity Engine
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase11() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 11) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🔺',
        title: 'The Continuity Engine',
        description: `The Continuity Engine passively scans your universe for plot conflicts, character age discrepancies, broken links, or timeline issues as you write.`,
        target: null
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
        title: 'Next: Open Settings',
        description: `Great job! Now let's wrap up in **Settings**. We will automatically navigate you there now!`,
        target: null,
        onEnter: () => {
          setTimeout(() => {
            saveTutorialState({ active: true, currentPhase: 12, styleId });
            navigate('settings');
          }, 2000);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 12 — Settings
// ═══════════════════════════════════════════════════════════════════════════════
export async function runPhase12() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 12) return;

  const { styleId, styleConf, terms } = await getStyleInfo();

  setTimeout(() => {
    tutorial.start([
      {
        icon: '⚙️',
        title: 'Forge Settings',
        description: `Settings is organized into tabs where you configure project name, Firebase sync, API keys, and custom visual options. Let's try changing a style.`,
        target: null
      },
      {
        icon: '🎨',
        title: 'Task: Open Visual Settings',
        description: `Click the **Visuals & Themes** (or **Visuals**) tab to customize themes.`,
        target: '[data-tab="visuals"]',
        placement: 'right',
        padding: 4,
        actionHint: '👆 Click the "Visuals" tab button',
        checkTask: () => {
          const tabBtn = document.querySelector('.settings-tab-btn[data-tab="visuals"]');
          return tabBtn && tabBtn.classList.contains('active');
        }
      },
      {
        icon: '🎨',
        title: 'Task: Change Theme or Accent',
        description: `Try customizing Forge's appearance! Click a **Theme Mode** button (like Light, Cyberpunk, or Obsidian) or click a **Highlight Accent Color** preset to change the accent scheme.`,
        target: '.theme-select-btn',
        placement: 'right',
        padding: 8,
        actionHint: '🎨 Change theme or custom accent color',
        onEnter: () => {
          tutorial.initialTheme = localStorage.getItem('forge-theme') || 'dark';
          tutorial.initialAccent = localStorage.getItem('forge-custom-accent') || '';
        },
        checkTask: () => {
          const currentTheme = localStorage.getItem('forge-theme') || 'dark';
          const currentAccent = localStorage.getItem('forge-custom-accent') || '';
          return currentTheme !== tutorial.initialTheme || currentAccent !== tutorial.initialAccent;
        }
      },
      {
        icon: '🔥',
        title: 'Task: Open AI Settings',
        description: `Click the **AI Companion** tab. This is where you configure Ignis's personality (Sage, Spark, Scholar, Shadow) and toggle background scanning.`,
        target: '[data-tab="ai"]',
        placement: 'right',
        padding: 4,
        actionHint: '👆 Click the "AI Companion" tab button',
        checkTask: () => {
          const tabBtn = document.querySelector('.settings-tab-btn[data-tab="ai"]');
          return tabBtn && tabBtn.classList.contains('active');
        }
      },
      {
        icon: '📜',
        title: 'Task: Open Updates Settings',
        description: `Click the **Updates** tab. This checks for new Forge releases and lets you download them in one click.`,
        target: '[data-tab="updates"]',
        placement: 'right',
        padding: 4,
        actionHint: '👆 Click the "Updates" tab button',
        checkTask: () => {
          const tabBtn = document.querySelector('.settings-tab-btn[data-tab="updates"]');
          return tabBtn && tabBtn.classList.contains('active');
        }
      },
      {
        icon: '🔗',
        title: 'Task: Open Broken Links Checker',
        description: `Click the **Broken Links** tab. This scans your project for orphaned references.`,
        target: '[data-tab="links"]',
        placement: 'right',
        padding: 4,
        actionHint: '👆 Click the "Broken Links" tab button',
        checkTask: () => {
          const tabBtn = document.querySelector('.settings-tab-btn[data-tab="links"]');
          return tabBtn && tabBtn.classList.contains('active');
        }
      },
      {
        icon: '🎉',
        title: 'You\'re All Set — Welcome to Forge!',
        description: `You've completed the full Forge tour! Here's a quick recap of everything:<br><br>📂 <strong>Databases</strong> → organize your world entities<br>🎨 <strong>Canvases</strong> → visual relationship maps<br>🎬 <strong>Story Roadmap</strong> → plan your narrative<br>🕸️ <strong>Web of Fate</strong> → see all connections<br>🔥 <strong>Ignis</strong> → AI companion & scene writer<br>🔺 <strong>Continuity Engine</strong> → catch narrative errors<br><br>Now go build your universe. The forge awaits. ⚡`,
        target: null
      }
    ], {
      onFinish: () => saveTutorialState({ active: false, currentPhase: 0 })
    });
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Global Route Hook — auto-resumes tutorial on navigation
// ═══════════════════════════════════════════════════════════════════════════════
window.addEventListener('page-rendered', (e) => {
  const path = e.detail?.path || '';
  const state = getTutorialState();
  if (!state.active) return;

  const phase = state.currentPhase;

  if (phase === 1  && path === 'dashboard')           return runPhase1();
  if (phase === 2  && path.startsWith('schema/'))     return runPhase2();
  if (phase === 3  && path.startsWith('page/'))       return runPhase3();
  if (phase === 4  && path === 'dashboard')           return runPhase4();
  if (phase === 4  && path.startsWith('schema/'))     {
    // They went back to schema view before creating canvas — guide back to dashboard
    setTimeout(() => {
      tutorial.start([{
        icon: '🏠',
        title: 'Head to the Dashboard',
        description: 'Click <strong>Dashboard</strong> in the sidebar — we need to create a Canvas from there.',
        target: '[data-route="dashboard"]',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Dashboard" in the sidebar',
        onTargetClick: () => tutorial.stop(true)
      }]);
    }, 400);
    return;
  }
  if (phase === 5  && path.startsWith('workspace/'))  return runPhase5();
  if (phase === 6  && path === 'story-timeline')      return runPhase6();
  if (phase === 7  && path === 'graph')               return runPhase7();
  if (phase === 8  && path === 'inbox')               return runPhase8();
  if (phase === 10 && path === 'continuity')          {
    // They navigated to continuity — this is fine, resume phase 11
    saveTutorialState({ active: true, currentPhase: 11 });
    return runPhase11();
  }
  if (phase === 11 && path === 'continuity')          return runPhase11();
  if (phase === 12 && path === 'settings')            return runPhase12();

  // Phase 4 special: sidebar shows canvas creation prompt on dashboard
  if (phase === 4  && path === 'dashboard')           return runPhase4();
});
