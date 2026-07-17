/* ============================================================
   Forge — Workspace Canvas: Constants & Pure Helpers
   Extracted from workspace.js (chunk 1 of the maintainability split).
   Everything in this file is pure / state-independent — no
   dependency on the canvasState object.
   ============================================================ */

export const CARD_COLORS = [
  { name: 'Default', hex: '' },
  { name: 'Red', hex: '#f43f5e' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Slate', hex: '#64748b' }
];

export function defaultNodeTypes() {
  return [
    { type: 'richtext',    label: 'Rich Text',        icon: '📝', color: '#c084fc', defaultW: 380, defaultH: 260 },
    { type: 'image',       label: 'Image',             icon: '🖼️', color: '#38bdf8', defaultW: 320, defaultH: 280 },
    { type: 'timeline',   label: 'Timeline Event',     icon: '🕒', color: '#34d399', defaultW: 360, defaultH: 220 },
    { type: 'link',        label: 'Relationship Link',  icon: '🔗', color: '#fb923c', defaultW: 280, defaultH: 180 },
    { type: 'moodboard',  label: 'Mood Board',          icon: '🎨', color: '#a78bfa', defaultW: 420, defaultH: 340 },
    { type: 'quote',       label: 'Quote',              icon: '💬', color: '#06b6d4', defaultW: 320, defaultH: 180 },
    { type: 'pagelink',    label: 'Database Page',     icon: '📄', color: '#14b8a6', defaultW: 340, defaultH: 220 },
    { type: 'statblock',   label: 'Character Codex',   icon: '👤', color: '#e5a93b', defaultW: 300, defaultH: 320 }
  ];
}

export function getDefaultContent(type) {
  switch (type) {
    case 'statblock': return { fields: [{ key: 'Name', value: '' }, { key: 'Age', value: '' }, { key: 'Faction', value: '' }, { key: 'Status', value: '' }] };
    case 'ability': return { name: '', input: '', abilityType: 'Melee', description: '', notes: '' };
    case 'timeline': return { era: '', title: '', description: '' };
    case 'link': return { targetTabId: '', label: '', note: '' };
    case 'moodboard': return { images: [] };
    case 'quote': return { speaker: '', text: '' };
    case 'richtext': return { delta: '' };
    case 'image': return { src: null, caption: '' };
    case 'beatsheet': return { template: 'threeact', beats: [] };
    case 'pagelink': return { pageId: '', title: '', schemaName: '', snippet: '' };
    case 'setup': return { setupType: 'Plant', description: '', payoffNodeId: '' };
    case 'payoff': return { payoffType: 'Resolution', resolution: '' };
    default: return {};
  }
}
