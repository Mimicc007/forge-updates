/* ============================================================
   Forge — Comprehensive Interactive Tutorial System
   A custom-built, animated spotlight onboarding tour that
   covers EVERY feature in Forge, phase by phase.
   ============================================================ */

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
          color: rgba(229,169,59,0.75);
          font-family: var(--font-hud, monospace);
          text-align: center;
          padding: 6px 10px;
          background: rgba(229,169,59,0.06);
          border-radius: 6px;
          border: 1px solid rgba(229,169,59,0.15);
          animation: forge-tut-pulse 2s ease-in-out infinite;
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
    this.isActive = false;
    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';
    setTimeout(() => { this.overlay.style.display = 'none'; }, 350);
    if (!preserveState) {
      saveTutorialState({ active: false, currentPhase: 0 });
    }
  }

  next() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.renderStep();
    } else {
      if (this.onFinish) this.onFinish();
      this.stop();
    }
  }

  prev() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.renderStep();
    }
  }

  renderStep() {
    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    // Update content
    this.popoverIcon.textContent = step.icon || '⚡';
    this.popoverTitle.textContent = step.title;
    this.popoverDesc.innerHTML = step.description;

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

    // Handle requireClickOnTarget steps
    if (step.requireClickOnTarget) {
      this.nextBtn.style.display = 'none';
      this.overlay.style.pointerEvents = 'none'; // let clicks fall through
      this.actionHint.textContent = step.actionHint || '👆 Click the highlighted element to continue';
      this.actionHint.style.display = 'block';
    } else {
      this.nextBtn.style.display = 'block';
      this.overlay.style.pointerEvents = 'auto';
      this.actionHint.style.display = 'none';
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

    if (step.onEnter) step.onEnter();
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
export function startTutorial() {
  saveTutorialState({ active: true, currentPhase: 1 });
  window.location.hash = '#/dashboard';
  setTimeout(() => runPhase1(), 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Dashboard & Navigation Overview
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase1() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 1) return;

  tutorial.start([
    {
      icon: '⚡',
      title: 'Welcome to Forge',
      description: `Forge is your all-in-one creative universe builder — databases, visual canvases, story planning, and AI writing tools all in one place. This tour covers <strong>every feature</strong>. Let's dive in!`,
      target: null
    },
    {
      icon: '🏠',
      title: 'The Dashboard',
      description: `This is your <strong>Dashboard</strong> — your mission control. It shows stats about your universe: total entries, recent edits, and quick-access cards to your most-used databases and canvases.`,
      target: '#dashboard-content',
      placement: 'right',
      padding: 4
    },
    {
      icon: '🗂️',
      title: 'The Sidebar',
      description: `The <strong>Sidebar</strong> is your primary navigation. It shows <em>Overview</em> links at the top, your <em>Databases</em> and <em>Canvases</em> in the middle, and <em>tools</em> (Ignis, Scene Mode, Settings) at the bottom.`,
      target: '#sidebar',
      placement: 'right'
    },
    {
      icon: '↔️',
      title: 'Collapsing the Sidebar',
      description: `Click the <strong>collapse button</strong> (top-right of sidebar) to hide it and give your content more space. Click the Forge logo to expand it again. Your preference is saved automatically.`,
      target: '.sidebar-collapse-btn',
      placement: 'right'
    },
    {
      icon: '🔍',
      title: 'Global Search',
      description: `Press <code>Ctrl + K</code> (or <code>Cmd + K</code> on Mac) at any time to open the <strong>Global Search</strong>. Instantly find any character, location, item, or lore entry across your entire universe.`,
      target: null
    },
    {
      icon: '🗃️',
      title: 'Create a Database',
      description: `Databases store your world's entities — characters, locations, factions, items, and more. Each database has a <strong>Schema</strong> (custom fields) and contains individual <strong>Pages</strong> (entries). Click <strong>New Database</strong> to create your first one!`,
      target: '#new-database-btn',
      placement: 'bottom',
      requireClickOnTarget: true,
      actionHint: '👆 Click "New Database" to continue',
      onTargetClick: () => {
        saveTutorialState({ active: true, currentPhase: 2 });
        tutorial.stop(true);
      }
    }
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Schema View (Database editor)
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase2() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 2) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '📋',
        title: 'Your New Database',
        description: `This is the <strong>Schema View</strong> — the home screen for a database. It lists all entries (pages) and lets you manage the database's structure and settings.`,
        target: null
      },
      {
        icon: '🏷️',
        title: 'Database Name & Icon',
        description: `At the top you'll see your database's <strong>name</strong> and <strong>icon</strong>. Click either to rename or change the icon — choose from hundreds of Lucide icons to identify your database at a glance in the sidebar.`,
        target: '#sv-name-block',
        placement: 'bottom',
        padding: 6
      },
      {
        icon: '🔧',
        title: 'Schema Fields',
        description: `The <strong>Schema</strong> defines the custom fields every entry in this database will have. Click <strong>"+ Add Field"</strong> to add typed fields like text, number, dropdown, date, or image. These appear as structured properties on each entry.`,
        target: '#sv-schema-section',
        placement: 'top',
        padding: 6
      },
      {
        icon: '📄',
        title: 'Create an Entry',
        description: `Click <strong>"+ New Entry"</strong> to create your first page in this database. Each entry becomes a rich-text document with your custom field properties.`,
        target: '#sv-new-btn',
        placement: 'left',
        requireClickOnTarget: true,
        actionHint: '👆 Click "+ New Entry" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 3 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Page / Entry Editor
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase3() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 3) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '✍️',
        title: 'The Page Editor',
        description: `Every entry in Forge is a <strong>Page</strong>. This is the full-featured editor where you document everything about a character, location, item, or any other entity in your world.`,
        target: null
      },
      {
        icon: '🔤',
        title: 'Page Title',
        description: `Click the <strong>title area</strong> at the top to name your entry (e.g. "Kira Voss", "The Sunken Citadel"). The title is auto-saved instantly — no save button needed.`,
        target: '#pv-title',
        placement: 'bottom'
      },
      {
        icon: '🖼️',
        title: 'Cover Image',
        description: `Click <strong>"Add Cover"</strong> to upload a cover image for this entry. Images are stored locally in your project. Hover over the cover to reposition or remove it.`,
        target: '#pv-cover-area',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '🏷️',
        title: 'Tags (Visual Tagging)',
        description: `The <strong>Tags</strong> field uses Forge's Visual Tagging System. Type a tag and press <code>Enter</code> or <code>,</code> to create an interactive chip. Click any chip to remove it. Tags help you filter and group related entries across your universe.`,
        target: '#pv-tags-input',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '📝',
        title: 'Custom Properties',
        description: `The <strong>Properties panel</strong> shows all the schema fields you defined for this database. Fill in the character's age, faction, status, or any other typed property. These fields are searchable and displayable on the Schema View list.`,
        target: '#pv-properties',
        placement: 'bottom',
        padding: 6
      },
      {
        icon: '📖',
        title: 'Rich Text Editor',
        description: `The main body uses a full <strong>Rich Text Editor</strong> (Quill). You can: format text with bold/italic/headings, create bullet lists, embed images inline, add horizontal dividers, and write detailed lore, backstory, or notes here.`,
        target: '#pv-editor-mount',
        placement: 'top',
        padding: 4
      },
      {
        icon: '🔗',
        title: 'Sidebar Entries — Drag to Canvas',
        description: `Here's a power move: expand any database in the sidebar and <strong>drag an entry card directly onto a Canvas tab</strong>. It instantly creates a visual page-link node on that canvas — great for mapping relationships visually!`,
        target: null
      },
      {
        icon: '↩️',
        title: 'Back to the Database',
        description: `When done editing, click the <strong>← Back</strong> button to return to the database list. Your work is already saved. Next we'll explore the visual Canvas workspace!`,
        target: '#pv-back-btn',
        placement: 'bottom',
        requireClickOnTarget: true,
        actionHint: '👆 Click "← Back" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 4 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Dashboard → create Canvas → Workspace
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase4() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 4) return;

  setTimeout(() => {
    // If we're on schema view, guide user back to dashboard first
    const onDashboard = window.location.hash.includes('dashboard') || !window.location.hash.includes('schema');
    if (!onDashboard) {
      // Prompt user to navigate to dashboard
      tutorial.start([
        {
          icon: '🏠',
          title: 'Head Back to Dashboard',
          description: 'Click on <strong>Dashboard</strong> in the sidebar to continue the tour — we\'re going to create a visual Canvas!',
          target: '[data-route="dashboard"]',
          placement: 'right',
          requireClickOnTarget: true,
          actionHint: '👆 Click "Dashboard" in the sidebar',
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
        description: `<strong>Canvases</strong> are infinite visual workspaces where you can freely arrange idea cards, link entries, and map out your universe spatially. They're perfect for relationship maps, plot planning, world layouts, and brainstorming.`,
        target: null
      },
      {
        icon: '➕',
        title: 'Create a Canvas',
        description: `Click <strong>"New Canvas"</strong> to create your first visual workspace. Give it a name like "Character Web" or "Act 1 Map". It will appear in your sidebar under <em>Canvases</em>.`,
        target: '#new-canvas-btn',
        placement: 'bottom',
        requireClickOnTarget: true,
        actionHint: '👆 Click "New Canvas" to continue',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 5 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Workspace (Infinite Canvas)
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase5() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 5) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🗺️',
        title: 'The Infinite Canvas',
        description: `This is your <strong>Workspace</strong> — an infinite, pannable, zoomable canvas. All your visual thinking happens here. You can place nodes anywhere, connect them, and arrange them freely.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '🖱️',
        title: 'Navigating the Canvas',
        description: `<strong>Pan</strong>: Click and drag on empty space (or middle-click drag).<br><strong>Zoom</strong>: Scroll wheel to zoom in/out.<br><strong>Reset View</strong>: Press <code>Home</code> key or use the reset button in the toolbar to fit all nodes in view.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '✏️',
        title: 'Creating Nodes',
        description: `<strong>Right-click</strong> anywhere on the grid to open the context menu. Choose from: <em>Text Node</em>, <em>Sticky Note</em>, <em>Image Node</em>, or <em>Section Divider</em>. Each node can be freely dragged and resized.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '🔗',
        title: 'Page-Link Nodes',
        description: `The most powerful node type is the <strong>Page-Link</strong>. Drag any entry from the sidebar onto the canvas to create a card that links to a full database entry. Hover the card to see a preview of that entry's lore and properties!`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '⚡',
        title: 'Connecting Nodes',
        description: `To connect two nodes, hover any node and look for the <strong>orange connection handle</strong> that appears on its edge. Drag from one handle to another node to create an arrow connection. Double-click a connection to delete it.`,
        target: '.canvas-viewport',
        placement: 'top',
        padding: 0
      },
      {
        icon: '📌',
        title: 'Canvas Toolbar',
        description: `The toolbar at the top has quick buttons for: <strong>fitting the view</strong>, toggling the <strong>mini-map</strong>, changing <strong>background grid style</strong>, and toggling <strong>snap-to-grid</strong>. Explore them all!`,
        target: '.canvas-toolbar',
        placement: 'bottom',
        padding: 6
      },
      {
        icon: '📖',
        title: 'Story Roadmap — Next Stop',
        description: `Next, let's explore the <strong>Story Roadmap</strong> — a cinematic timeline for planning your narrative beats, acts, and story paths. Click <strong>Story Roadmap</strong> in the sidebar.`,
        target: '[data-route="story-timeline"]',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Story Roadmap" in the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 6 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Story Roadmap (Timeline)
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase6() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 6) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🎬',
        title: 'The Story Roadmap',
        description: `The <strong>Story Roadmap</strong> is a cinematic horizontal timeline for planning your entire narrative. Story beats are placed on swim lanes, organized into Acts, and connected with prerequisite arrows.`,
        target: null
      },
      {
        icon: '🏊',
        title: 'Story Lanes',
        description: `There are <strong>3 swim lanes</strong> (horizontal rows):<br>🔴 <strong>Main Plotline</strong> — your primary story<br>🟢 <strong>Subplots & Side Quests</strong> — character arcs and secondary threads<br>🔵 <strong>World Events & Backstory</strong> — lore events and background history`,
        target: '.timeline-lane-headers',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🎭',
        title: 'Acts (Story Structure)',
        description: `The timeline is divided into <strong>Acts</strong> (Act I, Act II, Act III, Epilogue). Each act is a distinct visual band on the canvas. Position beat cards within acts to reflect your story's structure.`,
        target: '.timeline-card-layer',
        placement: 'top',
        padding: 0
      },
      {
        icon: '🃏',
        title: 'Story Beat Cards',
        description: `Each card on the timeline is a <strong>Story Beat</strong>. Double-click any card to open the edit modal where you can set the beat's title, synopsis, which lane it belongs to, and which characters are involved.`,
        target: '.timeline-card-layer',
        placement: 'top',
        padding: 0
      },
      {
        icon: '↔️',
        title: 'Dragging Beats',
        description: `<strong>Drag</strong> any beat card left or right to re-order it chronologically. Beats snap to the grid automatically. Dragging vertically snaps the beat into a different lane.`,
        target: '.timeline-card-layer',
        placement: 'top',
        padding: 0
      },
      {
        icon: '➡️',
        title: 'Prerequisites & Narrative Flow',
        description: `In the beat edit modal, you can set <strong>Prerequisites</strong> — other beats that must happen before this one. Forge draws animated Bezier curves connecting them, giving you a visual dependency map. Double-click any connection line to delete it.`,
        target: '.timeline-connections-svg',
        placement: 'top',
        padding: 0
      },
      {
        icon: '➕',
        title: 'Adding New Beats',
        description: `Click the <strong>"+ Add Beat"</strong> button in the toolbar to create a new story beat. The <strong>"Auto-Align"</strong> button neatly re-spaces all beats in each lane if things get crowded.`,
        target: null
      },
      {
        icon: '🕸️',
        title: 'Web of Fate — Next Stop',
        description: `Next up: the <strong>Web of Fate</strong> — a dynamic graph that visualizes ALL your database entries as interconnected nodes. Click it in the sidebar to continue.`,
        target: '[data-route="graph"]',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Web of Fate" in the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 7 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Web of Fate (Graph View)
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase7() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 7) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🕸️',
        title: 'The Web of Fate',
        description: `The <strong>Web of Fate</strong> automatically renders every page in your project as a node in a force-directed graph. Related entries pull toward each other — giving you a bird's-eye view of your entire universe's structure.`,
        target: null
      },
      {
        icon: '🔵',
        title: 'Nodes & Clusters',
        description: `Each <strong>node</strong> represents one database entry. Nodes are color-coded by database type. Entries that reference each other appear as <strong>connected edges</strong>. Clusters reveal which characters, factions, and locations are most interconnected.`,
        target: '.graph-canvas',
        placement: 'right',
        padding: 0
      },
      {
        icon: '🖱️',
        title: 'Interacting with the Graph',
        description: `<strong>Click</strong> any node to highlight its connections and see a quick info panel.<br><strong>Double-click</strong> a node to open that entry's full page editor.<br><strong>Drag</strong> nodes to manually reposition them — the physics engine re-adapts.`,
        target: '.graph-canvas',
        placement: 'right',
        padding: 0
      },
      {
        icon: '🔍',
        title: 'Graph Search & Filters',
        description: `Use the <strong>search bar</strong> and <strong>database filters</strong> in the graph toolbar to highlight specific entries or hide entire database types. This helps you focus on just characters, or just locations, etc.`,
        target: '.graph-toolbar',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '📬',
        title: 'Inbox — Next Stop',
        description: `Now let's look at the <strong>Inbox</strong> — your notifications center for reminders, AI-generated suggestions, and system alerts. Click <strong>Inbox</strong> in the sidebar.`,
        target: '[data-route="inbox"]',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Inbox" in the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 8 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — Inbox
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase8() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 8) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '📬',
        title: 'The Inbox',
        description: `The <strong>Inbox</strong> is your notification center for Forge. It collects writing reminders, AI suggestions, system notices, and any alerts that Forge sends you while you work.`,
        target: null
      },
      {
        icon: '🔔',
        title: 'Writing Reminders',
        description: `Enable <strong>daily writing reminders</strong> in Settings → Reminders. Forge will notify you at a time you choose to keep your creative momentum going. Missed reminders appear here in your Inbox.`,
        target: null
      },
      {
        icon: '⚡',
        title: 'Ignis Companion — Next Stop',
        description: `Now let's explore <strong>Ignis</strong>, your AI writing companion. Click the <em>⚡ Ignis Companion</em> button at the bottom of the sidebar to open the AI drawer!`,
        target: '.sidebar-ai-toggle-btn',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Ignis Companion" at the bottom of the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 9 });
          tutorial.stop(true);
          // Drawer opens in place — no page-rendered fires, so call directly
          setTimeout(() => runPhase9(), 700);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 9 — Ignis AI Companion Drawer
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase9() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 9) return;

  setTimeout(() => {
    const drawerEl = document.querySelector('.ai-drawer') || document.querySelector('[class*="ai-drawer"]');
    tutorial.start([
      {
        icon: '🔥',
        title: 'Meet Ignis — Your AI Companion',
        description: `<strong>Ignis</strong> is an AI creative partner powered by Google Gemini, fully trained on your universe. Ask it anything about your world, your characters, or your story. Ignis reads your actual database entries to give you grounded, lore-accurate answers.`,
        target: drawerEl || null,
        placement: 'left',
        padding: 0
      },
      {
        icon: '💬',
        title: 'Chatting with Ignis',
        description: `Type any question in the chat box at the bottom of the drawer. Examples:<br>• <em>"What are Kira's motivations?"</em><br>• <em>"Suggest 3 plot twists for Act 2"</em><br>• <em>"Write a short encounter between the Voss siblings"</em>`,
        target: drawerEl || null,
        placement: 'left',
        padding: 0
      },
      {
        icon: '🎨',
        title: 'Ignis Personalities',
        description: `In <strong>Settings → AI Companion</strong>, you can choose Ignis's personality:<br>🔮 <strong>Sage</strong> — wise, analytical<br>⚡ <strong>Spark</strong> — energetic, enthusiastic<br>🌑 <strong>Shadow</strong> — mysterious, dark<br>📖 <strong>Scholar</strong> — precise, academic`,
        target: null
      },
      {
        icon: '⚡',
        title: 'Forge Actions (AI Commands)',
        description: `Ignis can take <strong>direct actions</strong> in your workspace. Type commands like:<br>• <em>"Create a new character named Sora Vane"</em><br>• <em>"Add a tag 'antagonist' to Kira's page"</em><br>Ignis will ask for confirmation before making any changes.`,
        target: null
      },
      {
        icon: '🎬',
        title: 'Scene Mode — Next Stop',
        description: `Beyond chat, Ignis has a dedicated <strong>Scene Mode</strong> for co-writing entire scenes paragraph by paragraph. Click the <em>🎬 Scene Mode</em> button in the sidebar to try it!`,
        target: '.sidebar-scene-mode-btn',
        placement: 'right',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Scene Mode" at the bottom of the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 10 });
          tutorial.stop(true);
          // Scene Mode opens a drawer — no page-rendered fires, so call directly
          setTimeout(() => runPhase10(), 700);
        }
      }
    ]);
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 10 — Scene Mode Drawer
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase10() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 10) return;

  setTimeout(() => {
    const drawerEl = document.querySelector('.scene-mode-drawer');
    tutorial.start([
      {
        icon: '🎬',
        title: 'Ignis Scene Mode',
        description: `<strong>Scene Mode</strong> is a dedicated co-writing panel where you and Ignis collaboratively write a scene, one paragraph at a time. It's great for drafting complex scenes with multiple characters in specific locations.`,
        target: drawerEl || null,
        placement: 'left',
        padding: 0
      },
      {
        icon: '📍',
        title: 'Set the Scene Context',
        description: `Fill in the <strong>context form</strong> at the top of the panel:<br>• <strong>Location</strong> — where is this scene set?<br>• <strong>Characters</strong> — add characters from your DB or type custom names<br>• <strong>Premise</strong> — what just happened? what's the setup?<br>• <strong>Tone</strong> — Dramatic, Tense, Humorous, Mysterious, etc.`,
        target: drawerEl || null,
        placement: 'left',
        padding: 0
      },
      {
        icon: '✍️',
        title: 'Paragraph-by-Paragraph Writing',
        description: `Ignis generates <strong>5 paragraphs</strong> one at a time. Each paragraph has <em>Accept ✓</em> and <em>Reject ✕</em> buttons. If you reject a paragraph, Ignis instantly rewrites just that one. Once you accept one, the next paragraph appears.`,
        target: drawerEl || null,
        placement: 'left',
        padding: 0
      },
      {
        icon: '💬',
        title: 'Bonus: Dialogue & What Ifs',
        description: `After accepting paragraphs, extra buttons appear:<br>• <strong>Generate Dialogue</strong> — 3 exchanges between your scene's characters<br>• <strong>What If?</strong> — 3 alternate outcomes for the scene<br>• <strong>Copy All Accepted</strong> — copy your scene draft to clipboard`,
        target: null
      },
      {
        icon: '🔺',
        title: 'Continuity Engine — Next Stop',
        description: `Next, let's explore the <strong>Continuity Engine</strong> — Ignis's passive background scanner that detects narrative inconsistencies in your world as you write. Close Scene Mode (✕) then click <em>Continuity</em> in the sidebar.`,
        target: null
      }
    ], {
      onFinish: () => {
        saveTutorialState({ active: true, currentPhase: 11 });
        // Navigate to continuity
        import('./router.js').then(m => m.navigate('continuity')).catch(() => {
          window.location.hash = '#/continuity';
        });
      }
    });
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 11 — Continuity Engine
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase11() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 11) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '🔺',
        title: 'The Continuity Engine',
        description: `The <strong>Continuity Engine</strong> is Ignis's passive quality-control scanner. It continuously monitors your world for narrative inconsistencies, broken links, dead-end story threads, and character conflicts.`,
        target: null
      },
      {
        icon: '🚨',
        title: 'Live Continuity Alerts',
        description: `When Ignis detects a new issue while you're writing, a <strong>pop-up alert</strong> appears at the bottom of the screen. Clicking it brings you here to see the full breakdown. The <em>Continuity</em> sidebar item also shows a <strong>live badge</strong> with severity counts (🔴 high / 🟠 medium / 🟡 low).`,
        target: '#sidebar-continuity-item',
        placement: 'right',
        padding: 4
      },
      {
        icon: '📋',
        title: 'Issue Cards',
        description: `Each detected issue is shown as a card with:<br>• <strong>Type</strong> — Location Conflict, Personality Mismatch, Timeline Contradiction, Broken Link, Orphaned Entry, etc.<br>• <strong>Severity</strong> — High 🔴, Medium 🟠, or Low 🟡<br>• <strong>Description</strong> and an AI <strong>Suggestion</strong> on how to fix it<br>• <strong>Linked Pages</strong> — click to jump directly to the affected entry`,
        target: '.ce-issue-list',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🗂️',
        title: 'Filtering Issues',
        description: `Use the <strong>tabs</strong> at the top to filter issues by severity (All / High / Medium / Low) or view your <strong>Resolved</strong> issues archive. Dismissing an issue moves it to Resolved — you can always restore it later.`,
        target: '.ce-tabs',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '🔍',
        title: 'Manual Scan',
        description: `Click <strong>"🔍 Scan Now"</strong> to trigger an immediate full scan of your world. Ignis analyzes all pages, story beats, and canvas connections to find issues. The scan runs automatically in the background as you edit, but you can also trigger it manually any time.`,
        target: '.ce-scan-btn',
        placement: 'bottom',
        padding: 4
      },
      {
        icon: '⚙️',
        title: 'Toggling Continuity Monitoring',
        description: `You can <strong>enable or disable</strong> the Continuity Engine entirely in <em>Settings → AI Companion</em>. When disabled, the Continuity tab disappears from the sidebar and no background scanning occurs.`,
        target: null
      },
      {
        icon: '⚙️',
        title: 'Settings — Final Stop',
        description: `Last stop: <strong>Settings</strong> — where you configure every aspect of Forge. Click the <em>⚙️ Settings</em> item at the bottom of the sidebar.`,
        target: '[data-route="settings"]',
        placement: 'top',
        requireClickOnTarget: true,
        actionHint: '👆 Click "Settings" in the sidebar',
        onTargetClick: () => {
          saveTutorialState({ active: true, currentPhase: 12 });
          tutorial.stop(true);
        }
      }
    ]);
  }, 450);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 12 — Settings
// ═══════════════════════════════════════════════════════════════════════════════
export function runPhase12() {
  const state = getTutorialState();
  if (!state.active || state.currentPhase !== 12) return;

  setTimeout(() => {
    tutorial.start([
      {
        icon: '⚙️',
        title: 'Forge Control Center',
        description: `The <strong>Settings</strong> page is organized into tabs. Each tab controls a different area of the app. Let's walk through the most important ones.`,
        target: null
      },
      {
        icon: '📁',
        title: 'General / Project Settings',
        description: `The <strong>General</strong> tab lets you rename your universe and set its genre (e.g. "Sci-Fi RPG"). This information is used by Ignis as context when answering questions about your world.`,
        target: '[data-tab="project"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🎨',
        title: 'Visuals & Themes',
        description: `In <strong>Visuals & Themes</strong>, choose between:<br>• <strong>Dark Mode</strong> (default, deep space)<br>• <strong>Light Mode</strong> (clean paper white)<br>• <strong>Cosmic Mode</strong> (deep purple)<br>• <strong>Custom Accent Color</strong> — change Forge's entire color scheme to any hex color you like.`,
        target: '[data-tab="visuals"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '💾',
        title: 'Storage & Sync',
        description: `The <strong>Storage & Sync</strong> tab shows where your project data is stored. Forge stores data locally by default (IndexedDB). You can also connect <strong>Firebase</strong> for cloud sync — great for working across multiple machines.`,
        target: '[data-tab="storage"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔔',
        title: 'Writing Reminders',
        description: `Under <strong>Reminders</strong>, enable a daily notification to keep yourself writing consistently. Set the time you want to be reminded, and Forge will send a system notification every day at that time — even when the app is minimized.`,
        target: '[data-tab="notifications"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔥',
        title: 'AI Companion Settings',
        description: `The <strong>AI Companion</strong> tab is where you:<br>• Paste your <strong>Google Gemini API key</strong> to unlock Ignis<br>• Choose Ignis's <strong>personality</strong> (Sage, Spark, Shadow, Scholar)<br>• Toggle the <strong>Continuity Engine</strong> on/off`,
        target: '[data-tab="ai"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '📜',
        title: 'Updates',
        description: `The <strong>Updates</strong> tab shows your current app version and checks for new Forge releases. When an update is available, a dot badge appears on the Settings sidebar item. Click "Download & Install" here to update the app in one click.`,
        target: '[data-tab="updates"]',
        placement: 'right',
        padding: 4
      },
      {
        icon: '🔗',
        title: 'Broken Links Checker',
        description: `The <strong>Broken Links</strong> tab scans your entire project for database entries that reference deleted or missing pages. Fix orphaned references quickly before they cause Continuity Engine alerts.`,
        target: '[data-tab="links"]',
        placement: 'right',
        padding: 4
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
