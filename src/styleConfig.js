/* ============================================================
   Forge — Style DNA Configurations
   Defines terminology, icons, accents, templates, AI personas,
   canvas guides, node types, connection styles, and custom
   continuity engine rules for each style preset.
   ============================================================ */

// ─── Shared Base Node Types ───────────────────────────────────────────────────

const BASE_NODES = [
  { type: 'richtext',   label: 'Rich Text',       icon: '📝', color: '#c084fc', defaultW: 380, defaultH: 260 },
  { type: 'image',      label: 'Image',            icon: '🖼️', color: '#38bdf8', defaultW: 320, defaultH: 280 },
  { type: 'timeline',   label: 'Timeline Event',   icon: '🕒', color: '#34d399', defaultW: 360, defaultH: 220 },
  { type: 'link',       label: 'Relationship Link', icon: '🔗', color: '#fb923c', defaultW: 280, defaultH: 180 },
  { type: 'moodboard',  label: 'Mood Board',       icon: '🎨', color: '#a78bfa', defaultW: 420, defaultH: 340 },
  { type: 'quote',      label: 'Quote',            icon: '💬', color: '#06b6d4', defaultW: 320, defaultH: 180 },
  { type: 'pagelink',   label: 'Database Page',    icon: '📄', color: '#14b8a6', defaultW: 340, defaultH: 220 },
  { type: 'map',        label: 'Interactive Map',   icon: '🗺️', color: '#10b981', defaultW: 500, defaultH: 400 },
];

// ─── Canvas Guide Renderers ──────────────────────────────────────────────────

function renderStoryGuides(surface) {
  const ACT_BOUNDARIES = [
    { x: 1200, label: 'ACT I ⟶ ACT II', sublabel: 'Rising Tension' },
    { x: 2400, label: 'ACT II ⟶ ACT III', sublabel: 'Climax Threshold' },
  ];

  ACT_BANDS.forEach(band => {
    const bg = document.createElement('div');
    bg.className = 'canvas-guide story-act-band';
    bg.style.cssText = `
      position: absolute;
      left: ${band.x}px;
      top: -2000px;
      width: ${band.w}px;
      height: 8000px;
      background: ${band.bg};
      pointer-events: none;
      z-index: 0;
    `;
    surface.appendChild(bg);

    const actLabel = document.createElement('div');
    actLabel.className = 'canvas-guide story-act-label';
    actLabel.textContent = band.name;
    actLabel.style.cssText = `
      position: absolute;
      left: ${band.x + 20}px;
      top: 30px;
      font-size: 11px;
      font-family: var(--font-heading);
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(229, 169, 59, 0.25);
      text-transform: uppercase;
      pointer-events: none;
      z-index: 1;
    `;
    surface.appendChild(actLabel);
  });

  ACT_BOUNDARIES.forEach(act => {
    const line = document.createElement('div');
    line.className = 'canvas-guide story-act-divider';
    line.style.cssText = `
      position: absolute;
      left: ${act.x}px;
      top: -2000px;
      width: 2px;
      height: 8000px;
      background: linear-gradient(to bottom,
        transparent 0%,
        rgba(229, 169, 59, 0.08) 10%,
        rgba(229, 169, 59, 0.25) 30%,
        rgba(229, 169, 59, 0.25) 70%,
        rgba(229, 169, 59, 0.08) 90%,
        transparent 100%
      );
      pointer-events: none;
      z-index: 2;
    `;

    const label = document.createElement('div');
    label.className = 'canvas-guide story-act-divider-label';
    label.innerHTML = `<span>${act.label}</span><br><span style="font-size:8px;opacity:0.6;">${act.sublabel}</span>`;
    label.style.cssText = `
      position: absolute;
      top: 180px;
      left: 10px;
      transform: rotate(90deg);
      transform-origin: left top;
      font-size: 9px;
      font-family: var(--font-heading);
      color: rgba(229, 169, 59, 0.4);
      letter-spacing: 0.15em;
      white-space: nowrap;
      pointer-events: none;
      text-transform: uppercase;
    `;
    line.appendChild(label);
    surface.appendChild(line);
  });
}

const ACT_BANDS = [
  { name: 'ACT I', x: -3000, w: 3000 + 1200, bg: 'rgba(229, 169, 59, 0.012)' },
  { name: 'ACT II', x: 1200, w: 1200, bg: 'rgba(229, 169, 59, 0.023)' },
  { name: 'ACT III', x: 2400, w: 5600, bg: 'rgba(229, 169, 59, 0.012)' },
];

function renderDndGuides(surface) {
  // Hex territory grid overlay
  const HEX_SIZE = 80; // px per hex cell
  const GRID_W = 8000;
  const GRID_H = 8000;
  const OFFSET_X = -4000;
  const OFFSET_Y = -4000;

  // SVG hex grid
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'canvas-guide dnd-hex-grid');
  svg.style.cssText = `
    position: absolute;
    left: ${OFFSET_X}px;
    top: ${OFFSET_Y}px;
    width: ${GRID_W}px;
    height: ${GRID_H}px;
    pointer-events: none;
    z-index: 0;
  `;

  const r = HEX_SIZE;
  const hexW = r * Math.sqrt(3);
  const hexH = r * 2;
  const colStep = hexW;
  const rowStep = hexH * 0.75;

  const cols = Math.ceil(GRID_W / colStep) + 2;
  const rows = Math.ceil(GRID_H / rowStep) + 2;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const offsetX = (row % 2 !== 0) ? hexW / 2 : 0;
      const cx = col * colStep + offsetX + hexW / 2;
      const cy = row * rowStep + r;
      const points = hexPoints(cx, cy, r * 0.95).join(' ');

      const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hex.setAttribute('points', points);
      hex.setAttribute('fill', 'none');
      hex.setAttribute('stroke', 'rgba(139, 92, 246, 0.08)');
      hex.setAttribute('stroke-width', '1');
      svg.appendChild(hex);
    }
  }

  surface.appendChild(svg);

  // Territory quadrant labels
  const territories = [
    { label: '⚔️ NORTHERN REACH', x: 200, y: -100 },
    { label: '🏰 WESTERN KEEP', x: -800, y: 200 },
    { label: '🌲 EASTERN WILDS', x: 1200, y: 200 },
    { label: '🔥 SOUTHERN RUINS', x: 200, y: 700 },
  ];

  territories.forEach(t => {
    const label = document.createElement('div');
    label.className = 'canvas-guide dnd-territory-label';
    label.textContent = t.label;
    label.style.cssText = `
      position: absolute;
      left: ${t.x}px;
      top: ${t.y}px;
      font-size: 10px;
      font-family: var(--font-heading);
      font-weight: 700;
      letter-spacing: 0.18em;
      color: rgba(139, 92, 246, 0.22);
      text-transform: uppercase;
      pointer-events: none;
      z-index: 2;
      white-space: nowrap;
    `;
    surface.appendChild(label);
  });
}

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    pts.push(`${cx + r * Math.cos(angleRad)},${cy + r * Math.sin(angleRad)}`);
  }
  return pts;
}

function renderGamedevGuides(surface) {
  // X axis
  const xAxis = document.createElement('div');
  xAxis.className = 'canvas-guide gamedev-axis-x';
  xAxis.style.cssText = `
    position: absolute;
    left: -4000px;
    top: 0px;
    width: 12000px;
    height: 1px;
    background: linear-gradient(to right,
      transparent 0%,
      rgba(6, 182, 212, 0.15) 10%,
      rgba(6, 182, 212, 0.4) 40%,
      rgba(6, 182, 212, 0.4) 60%,
      rgba(6, 182, 212, 0.15) 90%,
      transparent 100%
    );
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.3);
    pointer-events: none;
    z-index: 2;
  `;

  // Y axis
  const yAxis = document.createElement('div');
  yAxis.className = 'canvas-guide gamedev-axis-y';
  yAxis.style.cssText = `
    position: absolute;
    left: 0px;
    top: -4000px;
    width: 1px;
    height: 12000px;
    background: linear-gradient(to bottom,
      transparent 0%,
      rgba(6, 182, 212, 0.15) 10%,
      rgba(6, 182, 212, 0.4) 40%,
      rgba(6, 182, 212, 0.4) 60%,
      rgba(6, 182, 212, 0.15) 90%,
      transparent 100%
    );
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.3);
    pointer-events: none;
    z-index: 2;
  `;

  // Origin label
  const originLabel = document.createElement('div');
  originLabel.className = 'canvas-guide gamedev-origin-label';
  originLabel.textContent = '⊕ ORIGIN (0, 0)';
  originLabel.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 9px;
    font-family: var(--font-mono, monospace);
    color: rgba(6, 182, 212, 0.55);
    letter-spacing: 0.08em;
    pointer-events: none;
    z-index: 3;
  `;

  // Tick marks + labels on X axis (every 200px)
  const TICK_SPACING = 200;
  const TICK_COUNT = 20;
  for (let i = -TICK_COUNT; i <= TICK_COUNT; i++) {
    if (i === 0) continue;
    const tick = document.createElement('div');
    tick.className = 'canvas-guide gamedev-tick';
    tick.style.cssText = `
      position: absolute;
      left: ${i * TICK_SPACING}px;
      top: -6px;
      width: 1px;
      height: 12px;
      background: rgba(6, 182, 212, 0.3);
      pointer-events: none;
      z-index: 3;
    `;
    surface.appendChild(tick);

    if (i % 2 === 0) {
      const tickLabel = document.createElement('div');
      tickLabel.className = 'canvas-guide gamedev-tick-label';
      tickLabel.textContent = `${i * TICK_SPACING}`;
      tickLabel.style.cssText = `
        position: absolute;
        left: ${i * TICK_SPACING - 16}px;
        top: 10px;
        font-size: 8px;
        font-family: var(--font-mono, monospace);
        color: rgba(6, 182, 212, 0.3);
        pointer-events: none;
        z-index: 3;
        width: 32px;
        text-align: center;
      `;
      surface.appendChild(tickLabel);
    }
  }

  // Y-axis ticks
  for (let i = -TICK_COUNT; i <= TICK_COUNT; i++) {
    if (i === 0) continue;
    const tick = document.createElement('div');
    tick.className = 'canvas-guide gamedev-tick';
    tick.style.cssText = `
      position: absolute;
      left: -6px;
      top: ${i * TICK_SPACING}px;
      width: 12px;
      height: 1px;
      background: rgba(6, 182, 212, 0.3);
      pointer-events: none;
      z-index: 3;
    `;
    surface.appendChild(tick);

    if (i % 2 === 0) {
      const tickLabel = document.createElement('div');
      tickLabel.className = 'canvas-guide gamedev-tick-label';
      tickLabel.textContent = `${i * TICK_SPACING}`;
      tickLabel.style.cssText = `
        position: absolute;
        left: -42px;
        top: ${i * TICK_SPACING - 6}px;
        font-size: 8px;
        font-family: var(--font-mono, monospace);
        color: rgba(6, 182, 212, 0.3);
        pointer-events: none;
        z-index: 3;
        width: 36px;
        text-align: right;
      `;
      surface.appendChild(tickLabel);
    }
  }

  surface.appendChild(xAxis);
  surface.appendChild(yAxis);
  surface.appendChild(originLabel);
}

// ─── Style Definitions ────────────────────────────────────────────────────────

export const STYLES = {
  story: {
    id: 'story',
    name: 'Story Writer',
    icon: 'book-open',
    accent: '#e5a93b',
    glow: 'rgba(229, 169, 59, 0.35)',
    desc: 'For novelists, screenwriters, and narrative designers.',

    // ── Style Provider Methods ─────────────────────────────────────────────
    getNodeTypes: () => [
      ...BASE_NODES,
      { type: 'statblock', label: 'Character Codex', icon: '👤', color: '#e5a93b', defaultW: 300, defaultH: 320, hideFromToolbar: true },
    ],
    renderGuides: (surface) => renderStoryGuides(surface),
    canvasPanel: {
      buttonId: 'canvas-pacing-tracker-btn',
      buttonLabel: '📈 Act Pacing',
      buttonTitle: 'View live scene pacing by act',
      toggleFn: 'togglePacingTracker',
    },
    beatBtnLabel: '📖 → Beat',
    beatBtnTitle: 'Convert this canvas into a Story Roadmap beat',
    connectionColor: 'rgba(229, 169, 59, 0.7)',
    connectionHoverColor: '#e5a93b',
    connectionDash: 'none',

    // ── Terminology ────────────────────────────────────────────────────────
    terms: {
      dashboardTitle: 'Story Hub',
      sidebarTitle: 'Plot Codex',
      roadmap: 'Plot Timeline',
      fate: 'Fate Web',
      characters: 'Characters',
      locations: 'Locations & Lore',
      items: 'Artifacts',
      pagesLabel: 'Story Codex',
      pagePlaceholder: 'Start writing your story or log characters...',
      pagesSection: 'Prose & Lore'
    },

    // ── Schemas ────────────────────────────────────────────────────────────
    getSchemas: (projectId) => [
      {
        id: 'story-chars-schema',
        projectId,
        name: 'Characters',
        icon: 'users',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Role/Class', type: 'select', options: ['Protagonist', 'Antagonist', 'Deuteragonist', 'Mentor', 'Supporting NPC'] },
          { id: 'f2', name: 'Faction/House', type: 'text' },
          { id: 'f3', name: 'Status', type: 'select', options: ['Alive', 'Deceased', 'Missing', 'Exiled'] },
          { id: 'f4', name: 'Tags', type: 'tags' }
        ]
      },
      {
        id: 'story-locs-schema',
        projectId,
        name: 'Locations & Lore',
        icon: 'map',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Region/Kingdom', type: 'text' },
          { id: 'f2', name: 'Danger Level', type: 'select', options: ['Safe Haven', 'Unsettled', 'Hostile Territory', 'Forbidden Zone'] },
          { id: 'f3', name: 'Tags', type: 'tags' }
        ]
      },
      {
        id: 'story-chapters-schema',
        projectId,
        name: 'Chapters & Scenes',
        icon: 'book-open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Act', type: 'select', options: ['Act I', 'Act II - Ascent', 'Act II - Descent', 'Act III', 'Epilogue'] },
          { id: 'f2', name: 'Status', type: 'select', options: ['Draft', 'Outline', 'In Progress', 'Completed'] },
          { id: 'f3', name: 'Word Count', type: 'number' }
        ]
      }
    ],

    aiSystemPrompt: `You are Ignis, a brilliant Creative Sage and Lore Historian writing partner. Focus on vivid prose, show-don't-tell, descriptive writing, structural pacing, character arcs, and narrative tension. Avoid dry or technical formats. Speak with a warm, literary, wise persona.`,

    getContinuityRules: () => [
      { type: 'LOCATION_CONFLICT', label: 'Location Conflict', icon: '📍', color: '#f97316' },
      { type: 'PERSONALITY_MISMATCH', label: 'Personality Mismatch', icon: '🎭', color: '#a78bfa' },
      { type: 'TIMELINE_CONTRADICTION', label: 'Timeline Contradiction', icon: '⏱️', color: '#f43f5e' },
      { type: 'DEAD_END_THREAD', label: 'Dead-end Thread', icon: '🕳️', color: '#facc15' },
      { type: 'ORPHANED_PAGE', label: 'Orphaned Page', icon: '👻', color: '#64748b' }
    ]
  },

  dnd: {
    id: 'dnd',
    name: 'D&D Campaign Planner',
    icon: 'shield',
    accent: '#8b5cf6',
    glow: 'rgba(167, 139, 250, 0.35)',
    desc: 'For TTRPG Game Masters building lore, sessions, and statblocks.',

    // ── Style Provider Methods ─────────────────────────────────────────────
    getNodeTypes: () => [
      ...BASE_NODES,
      { type: 'statblock',  label: 'D&D Stat Block',    icon: '🛡️', color: '#8b5cf6', defaultW: 340, defaultH: 450 },
      { type: 'encounter',  label: 'Encounter Builder',  icon: '⚔️', color: '#f43f5e', defaultW: 360, defaultH: 360 },
    ],
    renderGuides: (surface) => renderDndGuides(surface),
    canvasPanel: {
      buttonId: 'canvas-dice-tray-btn',
      buttonLabel: '🎲 Dice Tray',
      buttonTitle: 'Open interactive dice roller',
      toggleFn: 'toggleDiceTray',
    },
    beatBtnLabel: '🗺️ → Campaign Map',
    beatBtnTitle: 'Convert this canvas into a Campaign Map location',
    connectionColor: 'rgba(139, 92, 246, 0.65)',
    connectionHoverColor: '#8b5cf6',
    connectionDash: 'none',

    // ── Terminology ────────────────────────────────────────────────────────
    terms: {
      dashboardTitle: 'Campaign Codex',
      sidebarTitle: 'Campaign Ledger',
      roadmap: 'Campaign Map',
      fate: 'Fate Web',
      characters: 'NPC Codex',
      locations: 'Regions & Dungeons',
      items: 'Loot & Artifacts',
      pagesLabel: 'Campaign Codex',
      pagePlaceholder: 'Begin campaign planning, record encounters or NPCs...',
      pagesSection: 'Campaign Lore & NPCs'
    },

    // ── Schemas ────────────────────────────────────────────────────────────
    getSchemas: (projectId) => [
      {
        id: 'dnd-sessions-schema',
        projectId,
        name: 'Campaign Sessions',
        icon: 'scroll',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Session Number', type: 'number' },
          { id: 'f2', name: 'Date Scheduled', type: 'text' },
          { id: 'f3', name: 'Status', type: 'select', options: ['Prep Needed', 'Ready to Play', 'Completed', 'Hiatus'] },
          { id: 'f4', name: 'Main Objective', type: 'text' }
        ]
      },
      {
        id: 'dnd-npcs-schema',
        projectId,
        name: 'NPC Codex',
        icon: 'users',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Alignment', type: 'select', options: ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'] },
          { id: 'f2', name: 'Affiliation', type: 'text' },
          { id: 'f3', name: 'Condition', type: 'select', options: ['Healthy', 'Dead/Exiled', 'Captured', 'Transformed'] },
          { id: 'f4', name: 'Challenge Rating (CR)', type: 'select', options: ['1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '8', '10', '12', '15', '20+'] }
        ]
      },
      {
        id: 'dnd-monsters-schema',
        projectId,
        name: 'Monsters & Statblocks',
        icon: 'skull',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Creature Type', type: 'select', options: ['Aberration', 'Beast', 'Celestial', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Undead'] },
          { id: 'f2', name: 'Armor Class (AC)', type: 'number' },
          { id: 'f3', name: 'Hit Points (HP)', type: 'number' },
          { id: 'f4', name: 'CR Rating', type: 'text' }
        ]
      },
      {
        id: 'dnd-loot-schema',
        projectId,
        name: 'Loot & Spells',
        icon: 'wand',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Rarity', type: 'select', options: ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'] },
          { id: 'f2', name: 'Attunement', type: 'select', options: ['Required', 'Not Required'] },
          { id: 'f3', name: 'Item/Spell Type', type: 'text' }
        ]
      },
      {
        id: 'dnd-maps-schema',
        projectId,
        name: 'Locations, Lore & Maps',
        icon: 'map',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Type', type: 'select', options: ['City', 'Dungeon', 'Wilderness', 'Region', 'POI', 'Landmark', 'Hidden Area'] },
          { id: 'f2', name: 'Status', type: 'select', options: ['Active', 'Ruins', 'Destroyed', 'Unknown', 'Locked'] },
          { id: 'f3', name: 'Region', type: 'text' },
          { id: 'f4', name: 'Map Scale (ft/grid)', type: 'number' },
          { id: 'f5', name: 'Grid Type', type: 'select', options: ['None', '5ft Square', '10ft Square', '5ft Hex', '10ft Hex'] },
          { id: 'f6', name: 'Tags', type: 'tags' }
        ]
      }
    ],

    aiSystemPrompt: `You are Ignis, an experienced Dungeon Master's Assistant. Focus on campaign hooks, room descriptions, monster behavior, encounter balance, loot generation, and D&D 5e mechanics. Speak with a dramatic, mysterious, epic narrator persona.`,

    getContinuityRules: () => [
      { type: 'MISSING_CR_ALIGNMENT', label: 'CR/AC Alignment Mismatch', icon: '🎯', color: '#f43f5e' },
      { type: 'DEAD_NPC_IN_PREP', label: 'Dead NPC in Active Prep', icon: '💀', color: '#facc15' },
      { type: 'TIMELINE_CONTRADICTION', label: 'Timeline Contradiction', icon: '⏱️', color: '#f43f5e' },
      { type: 'ORPHANED_PAGE', label: 'Orphaned Campaign Entry', icon: '👻', color: '#64748b' }
    ]
  },

  gamedev: {
    id: 'gamedev',
    name: 'Game Dev Companion',
    icon: 'gamepad-2',
    accent: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.35)',
    desc: 'For programmers and designers mapping mechanics, balancing systems, and level flows.',

    // ── Style Provider Methods ─────────────────────────────────────────────
    getNodeTypes: () => [
      ...BASE_NODES,
      { type: 'flowchart',   label: 'Behavior Node',    icon: '⚙️', color: '#06b6d4', defaultW: 280, defaultH: 200 },
      { type: 'progression', label: 'Progression Calc', icon: '📈', color: '#10b981', defaultW: 360, defaultH: 340 },
    ],
    renderGuides: (surface) => renderGamedevGuides(surface),
    canvasPanel: {
      buttonId: 'canvas-math-solver-btn',
      buttonLabel: '📊 XP Solver',
      buttonTitle: 'Open progression math helper',
      toggleFn: 'toggleMathSolver',
    },
    beatBtnLabel: '⚙️ → Level Flow',
    beatBtnTitle: 'Convert this canvas into a Level Flow blueprint',
    connectionColor: 'rgba(6, 182, 212, 0.65)',
    connectionHoverColor: '#06b6d4',
    connectionDash: '8 3',

    // ── Terminology ────────────────────────────────────────────────────────
    terms: {
      dashboardTitle: 'Project Docs',
      sidebarTitle: 'Game Bible',
      roadmap: 'Level Flow',
      fate: 'System Web',
      characters: 'Unit Profiles',
      locations: 'Levels & Zones',
      items: 'Items & Specs',
      pagesLabel: 'Game Bible',
      pagePlaceholder: 'Document mechanics, level flows, progression, and controls...',
      pagesSection: 'Systems Docs & Units'
    },

    // ── Schemas ────────────────────────────────────────────────────────────
    getSchemas: (projectId) => [
      {
        id: 'gamedev-mechanics-schema',
        projectId,
        name: 'Game Mechanics',
        icon: 'settings-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'System Category', type: 'select', options: ['Combat', 'Traversal', 'UI/UX', 'Economy', 'AI', 'Networking'] },
          { id: 'f2', name: 'Priority', type: 'select', options: ['P0 - Critical', 'P1 - Core', 'P2 - Secondary', 'P3 - Polish'] },
          { id: 'f3', name: 'Status', type: 'select', options: ['Spec/Idea', 'In Prototyping', 'Implemented', 'Polished'] }
        ]
      },
      {
        id: 'gamedev-units-schema',
        projectId,
        name: 'Unit & Class Profiles',
        icon: 'swords',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Archetype', type: 'select', options: ['Tank', 'DPS', 'Healer/Support', 'All-Rounder', 'Specialist'] },
          { id: 'f2', name: 'Resource Type', type: 'select', options: ['Mana', 'Stamina', 'Energy', 'Rage', 'Cooldown-Only'] },
          { id: 'f3', name: 'Base HP', type: 'number' }
        ]
      },
      {
        id: 'gamedev-levels-schema',
        projectId,
        name: 'Level Map & Flow',
        icon: 'map-pin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fields: [
          { id: 'f1', name: 'Level/Zone', type: 'text' },
          { id: 'f2', name: 'Difficulty Rating', type: 'select', options: ['Tutorial', 'Easy', 'Normal', 'Hard', 'Expert'] },
          { id: 'f3', name: 'Target Completion Time', type: 'text' }
        ]
      }
    ],

    aiSystemPrompt: `You are Ignis, a Senior Gameplay Systems Designer. Focus on mechanics breakdown, balance calculations, game feel, UI flows, behavior trees, and level design dynamics. Speak in a structured, analytical, precise, design-focused persona.`,

    getContinuityRules: () => [
      { type: 'BROKEN_PREREQ', label: 'Broken Skill Prerequisite', icon: '🎛️', color: '#f43f5e' },
      { type: 'INPUT_CONFLICT', label: 'Input Command Conflict', icon: '🎮', color: '#facc15' },
      { type: 'TIMELINE_CONTRADICTION', label: 'Timeline Contradiction', icon: '⏱️', color: '#f43f5e' },
      { type: 'ORPHANED_PAGE', label: 'Orphaned System Spec', icon: '👻', color: '#64748b' }
    ]
  }
};

export function getStyleConfig(styleId) {
  return STYLES[styleId] || STYLES.story;
}
