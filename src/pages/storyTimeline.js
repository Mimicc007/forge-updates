/* ============================================================
   Forge — Story Roadmap (The Forge Chronicle)
   Cinematic, premium game-studio planning board.
   ============================================================ */

import { getActiveProject, getPages, savePage, deletePage, generateId, saveTab, saveNode, getTab, getSchema } from '../db.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { playClickSound, playZapSound } from '../audio.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const LANE_HEIGHT  = 180;
const LANE_PADDING = 50;
const SNAP_GRID_X  = 20;
const CARD_W       = 280;
const CARD_H       = 130;
const SURFACE_W    = 3000;
const SURFACE_H    = LANE_PADDING + LANE_HEIGHT * 3 + 30; // ~620px

const LANES = [
  { id: 0, name: 'Main Plotline',            color: '#f43f5e', icon: '⚔️', desc: 'Core questline & major milestones' },
  { id: 1, name: 'Subplots & Side Quests',   color: '#10b981', icon: '🌿', desc: 'Character arcs & secondary content' },
  { id: 2, name: 'World Events & Backstory', color: '#3b82f6', icon: '🌍', desc: 'Historical context & background lore' }
];

const ACTS = [
  { id: 'act1', name: 'ACT I',     xStart: 0    },
  { id: 'act2', name: 'ACT II',    xStart: 700  },
  { id: 'act3', name: 'ACT III',   xStart: 1400 },
  { id: 'epi',  name: 'EPILOGUE',  xStart: 2100 }
];

// ─── Style Injection ─────────────────────────────────────────────────────────
function injectStyles() {
  const styleId = 'story-timeline-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ── Page shell ── */
    .stc-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-deepest, #070b14);
      position: relative;
      overflow: hidden;
      font-family: var(--font-body, 'Space Grotesk', 'Inter', sans-serif);
    }

    /* ── Toolbar ── */
    .stc-toolbar {
      flex-shrink: 0;
      padding: 0 var(--sp-6, 24px);
      height: 62px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 8, 18, 0.92);
      border-bottom: 1px solid rgba(229, 169, 59, 0.12);
      backdrop-filter: blur(12px);
      z-index: 20;
      position: relative;
    }
    .stc-toolbar::after {
      content: '';
      position: absolute;
      bottom: -1px; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(229,169,59,0.35) 30%, rgba(229,169,59,0.35) 70%, transparent);
    }
    .stc-toolbar-left { display: flex; flex-direction: column; gap: 1px; }
    .stc-toolbar-title {
      font-size: 1.1rem;
      font-weight: 700;
      font-family: var(--font-heading, 'Inter');
      color: #fff;
      letter-spacing: 0.03em;
    }
    .stc-toolbar-subtitle { font-size: 0.68rem; color: rgba(229,169,59,0.55); letter-spacing: 0.07em; text-transform: uppercase; }
    .stc-toolbar-right { display: flex; align-items: center; gap: 10px; }

    .stc-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .stc-search {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: #fff;
      font-size: 0.78rem;
      padding: 5px 28px 5px 10px;
      width: 160px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .stc-search:focus {
      border-color: rgba(229,169,59,0.4);
      box-shadow: 0 0 0 2px rgba(229,169,59,0.08);
    }
    .stc-search-clear {
      position: absolute;
      right: 6px;
      background: none;
      border: none;
      color: rgba(255,255,255,0.35);
      font-size: 0.8rem;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      display: none;
    }
    .stc-search-clear:hover { color: #fff; }
    .stc-search-badge {
      font-size: 0.65rem;
      font-family: var(--font-hud, monospace);
      color: rgba(229,169,59,0.8);
      background: rgba(229,169,59,0.08);
      border: 1px solid rgba(229,169,59,0.2);
      border-radius: 12px;
      padding: 2px 7px;
      white-space: nowrap;
      display: none;
    }
    .stc-empty-state {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      z-index: 5;
    }
    .stc-empty-state-icon { font-size: 2rem; margin-bottom: 8px; }
    .stc-empty-state-text { font-size: 0.8rem; color: rgba(255,255,255,0.3); font-family: var(--font-hud); }

    .stc-btn {
      display: inline-flex; align-items: center; gap: 5px;
      border: none; border-radius: 6px;
      font-size: 0.75rem; font-weight: 600;
      padding: 6px 14px; cursor: pointer;
      transition: transform 0.1s, box-shadow 0.15s, filter 0.15s;
      letter-spacing: 0.03em;
    }
    .stc-btn:active { transform: scale(0.96); }
    .stc-btn-primary {
      background: linear-gradient(135deg, #e5a93b, #c97d20);
      color: #0a0812;
    }
    .stc-btn-primary:hover { filter: brightness(1.12); box-shadow: 0 0 12px rgba(229,169,59,0.4); }
    .stc-btn-secondary {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.8);
    }
    .stc-btn-secondary:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.18); }

    /* ── Board scroll container ── */
    .stc-board-scroll {
      flex: 1;
      overflow: auto;
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: rgba(229,169,59,0.2) transparent;
    }
    .stc-board-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .stc-board-scroll::-webkit-scrollbar-thumb { background: rgba(229,169,59,0.18); border-radius: 3px; }

    /* ── Board inner (holds sidebar + surface) ── */
    .stc-board-inner {
      display: flex;
      min-width: ${SURFACE_W + 200}px;
      height: ${SURFACE_H}px;
      transition: height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    /* ── Lane sidebar ── */
    .stc-lane-sidebar {
      width: 200px;
      flex-shrink: 0;
      position: sticky;
      left: 0;
      z-index: 10;
      background: rgba(8, 6, 18, 0.95);
      backdrop-filter: blur(16px);
      border-right: 1px solid rgba(255,255,255,0.05);
      display: flex;
      flex-direction: column;
      padding-top: ${LANE_PADDING}px;
      box-sizing: border-box;
    }
    .stc-lane-header {
      height: ${LANE_HEIGHT}px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 16px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      transition: height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.3s ease, opacity 0.3s ease;
    }
    .stc-lane-header.focused {
      background: rgba(255, 255, 255, 0.02);
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.01);
    }
    .stc-lane-header.unfocused {
      opacity: 0.45;
    }
    .stc-lane-header.unfocused:hover {
      opacity: 0.8;
      background: rgba(255, 255, 255, 0.015);
    }

    /* ── Surface ── */
    .stc-surface {
      width: ${SURFACE_W}px;
      height: ${SURFACE_H}px;
      position: relative;
      flex-shrink: 0;
      overflow: hidden;
      transition: height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    /* ── Act bands ── */
    .stc-act-band {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 700px;
      pointer-events: none;
    }
    .stc-act-label {
      position: absolute;
      top: 8px;
      left: 16px;
      font-size: 0.6rem;
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(229,169,59,0.18);
      text-transform: uppercase;
      font-family: var(--font-hud, monospace);
      pointer-events: none;
      user-select: none;
    }
    .stc-act-divider {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      right: 0;
      background: linear-gradient(to bottom, transparent, rgba(229,169,59,0.2) 20%, rgba(229,169,59,0.2) 80%, transparent);
      pointer-events: none;
    }

    /* ── Lane rows on surface ── */
    .stc-lane-row {
      position: absolute;
      left: 0;
      right: 0;
      height: ${LANE_HEIGHT}px;
      pointer-events: none;
      box-sizing: border-box;
      border-bottom: 1px solid rgba(255,255,255,0.025);
      transition: height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    /* ── Cards layer ── */
    .stc-card-layer {
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
    }

    /* ── Beat card ── */
    .stc-card {
      position: absolute;
      width: ${CARD_W}px;
      height: ${CARD_H}px;
      /* vvd-style: very dark glass with inset border instead of CSS border */
      background: rgba(7, 11, 20, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      padding: 10px 12px;
      box-sizing: border-box;
      cursor: grab;
      pointer-events: auto;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 5px;
      /* card-wake: start slightly desaturated, wake on hover */
      filter: brightness(0.75) saturate(0.5);
      transition:
        box-shadow 0.3s ease,
        border-color 0.3s ease,
        transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
        filter 0.35s ease,
        width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
        height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
        top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
        left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      animation: stc-card-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .stc-card:active { cursor: grabbing; transform: scale(1.02); }
    .stc-card:hover {
      filter: brightness(1) saturate(1);
      border-color: rgba(255, 255, 255, 0.14);
      box-shadow:
        0 8px 32px rgba(0,0,0,0.5),
        0 0 16px var(--card-glow, rgba(229,169,59,0.25)),
        inset 0 0 0 1px rgba(255,255,255,0.10);
      transform: translateY(-1px);
    }
    .stc-card.stc-card-dragging {
      z-index: 999;
      cursor: grabbing;
      opacity: 0.94;
      filter: brightness(1) saturate(1);
      transform: rotate(0.6deg) scale(1.04);
      box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 24px var(--card-glow, rgba(229,169,59,0.3));
      transition: none !important;
    }
    .stc-card.stc-card-compact {
      width: 140px !important;
      height: 38px !important;
      padding: 4px 10px !important;
      border-radius: 20px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 2px !important;
      overflow: hidden !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
      background: rgba(10, 8, 18, 0.92) !important;
    }
    .stc-card.stc-card-compact .stc-card-body,
    .stc-card.stc-card-compact .stc-card-footer,
    .stc-card.stc-card-compact .stc-card-header {
      display: none !important;
    }
    @keyframes stc-card-enter {
      from { opacity: 0; transform: translateY(16px) scale(0.96); filter: blur(4px); }
      to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
    }
    .stc-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stc-card-title {
      flex: 1;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--font-heading, 'Space Grotesk', 'Inter');
      letter-spacing: -0.01em;
    }
    .stc-card-edit-btn {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.3);
      cursor: pointer;
      font-size: 0.7rem;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color 0.15s, background 0.15s;
      pointer-events: auto;
    }
    .stc-card-edit-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .stc-card-body {
      flex: 1;
      font-size: 0.68rem;
      color: rgba(255,255,255,0.50);
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      letter-spacing: 0.01em;
    }
    .stc-card-footer {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      min-height: 20px;
    }
    .stc-avatar {
      width: 18px; height: 18px;
      border-radius: 50%;
      font-size: 0.5rem;
      font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      flex-shrink: 0;
      text-transform: uppercase;
    }
    .stc-prereq-badge {
      font-size: 0.55rem;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(229,169,59,0.12);
      border: 1px solid rgba(229,169,59,0.2);
      color: rgba(229,169,59,0.8);
    }

    /* ── SVG connections ── */
    .stc-svg-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      z-index: 2;
    }
    @keyframes stc-flow {
      from { stroke-dashoffset: 60; }
      to   { stroke-dashoffset: 0; }
    }
    .stc-conn-path {
      fill: none;
      stroke: rgba(229, 169, 59, 0.2);
      stroke-width: 1.5;
      stroke-dasharray: 6 4;
      animation: stc-flow 1.8s linear infinite;
      pointer-events: stroke;
      cursor: pointer;
      transition: stroke 0.2s, stroke-width 0.2s;
    }
    .stc-conn-path:hover {
      stroke: rgba(229, 169, 59, 0.85);
      stroke-width: 2.5;
    }

    /* ── Mini-map strip ── */
    .stc-minimap {
      flex-shrink: 0;
      height: 52px;
      background: rgba(8, 6, 18, 0.96);
      border-top: 1px solid rgba(255,255,255,0.04);
      position: relative;
      overflow: hidden;
      z-index: 15;
    }
    .stc-minimap-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .stc-minimap-viewport {
      position: absolute;
      top: 0; bottom: 0;
      background: rgba(229,169,59,0.06);
      border: 1px solid rgba(229,169,59,0.2);
      pointer-events: none;
      transition: left 0.05s;
    }

    /* ── Context menu ── */
    .stc-ctx-menu {
      position: fixed;
      background: rgba(14, 12, 24, 0.97);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px;
      z-index: 99999;
      min-width: 160px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      animation: stc-ctx-in 0.12s ease both;
    }
    @keyframes stc-ctx-in {
      from { opacity: 0; transform: scale(0.93) translateY(-4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .stc-ctx-item {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px;
      border-radius: 5px;
      font-size: 0.75rem;
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      transition: background 0.12s;
    }
    .stc-ctx-item:hover { background: rgba(255,255,255,0.07); color: #fff; }
    .stc-ctx-item.danger { color: #f87171; }
    .stc-ctx-item.danger:hover { background: rgba(248,113,113,0.1); }
    .stc-ctx-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0; }

    /* ── Edit Modal ── */
    .stc-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(4px);
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: stc-fade-in 0.2s ease;
    }
    @keyframes stc-fade-in { from { opacity: 0; } to { opacity: 1; } }
    .stc-modal {
      width: 100%;
      max-width: 520px;
      background: rgba(12, 10, 22, 0.98);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: stc-modal-in 0.25s cubic-bezier(0.22,1,0.36,1) both;
    }
    @keyframes stc-modal-in {
      from { opacity: 0; transform: scale(0.94) translateY(16px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .stc-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .stc-modal-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      font-family: var(--font-heading, 'Inter');
    }
    .stc-modal-close {
      background: none; border: none;
      color: rgba(255,255,255,0.35);
      font-size: 1rem; cursor: pointer;
      padding: 2px 6px; border-radius: 4px;
      transition: color 0.15s, background 0.15s;
    }
    .stc-modal-close:hover { color: #fff; background: rgba(255,255,255,0.07); }
    .stc-modal-body {
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      max-height: 60vh;
    }
    .stc-modal-field { display: flex; flex-direction: column; gap: 5px; }
    .stc-modal-label {
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: rgba(255,255,255,0.4);
    }
    .stc-modal-input, .stc-modal-select, .stc-modal-textarea {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 7px;
      color: #fff;
      font-size: 0.82rem;
      padding: 8px 12px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      width: 100%;
      box-sizing: border-box;
      font-family: inherit;
    }
    .stc-modal-input:focus, .stc-modal-select:focus, .stc-modal-textarea:focus {
      border-color: rgba(229,169,59,0.45);
      box-shadow: 0 0 0 3px rgba(229,169,59,0.08);
    }
    .stc-modal-textarea { height: 80px; resize: vertical; }
    .stc-modal-select option { background: #0e0c18; }
    .stc-checklist {
      max-height: 110px;
      overflow-y: auto;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 7px;
      padding: 8px;
      background: rgba(0,0,0,0.25);
      display: flex; flex-direction: column; gap: 3px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .stc-check-label {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.73rem;
      color: rgba(255,255,255,0.65);
      cursor: pointer;
      padding: 3px 4px;
      border-radius: 4px;
      transition: background 0.12s, color 0.12s;
    }
    .stc-check-label:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .stc-check-empty {
      font-size: 0.68rem;
      color: rgba(255,255,255,0.25);
      font-style: italic;
    }
    .stc-modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 22px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .stc-btn-delete {
      background: rgba(244,63,94,0.1);
      border: 1px solid rgba(244,63,94,0.3);
      color: #f87171;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .stc-btn-delete:hover { background: rgba(244,63,94,0.2); border-color: rgba(244,63,94,0.5); }

    /* ── Keyframes: lane row glow pulse ── */
    @keyframes stc-glow-pulse {
      0%, 100% { opacity: 0.03; }
      50%       { opacity: 0.06; }
    }
  `;
  document.head.appendChild(style);
}

// ─── State ───────────────────────────────────────────────────────────────────
let timelineState = {
  project:     null,
  beats:       [],
  allPages:    [],
  surface:     null,
  sidebar:     null,
  svg:         null,
  cardLayer:   null,
  searchQuery: '',
  boardScroll: null,
  focusedLane: null,
  collapsedActs: {},
  expandedCardId: null,
  justSavedId: null
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getActName(beat) {
  const f1 = beat.properties?.f1 || 'Act I';
  if (f1.includes('Act III')) return 'ACT III';
  if (f1.includes('Act II')) return 'ACT II';
  if (f1.includes('Act I')) return 'ACT I';
  if (f1.includes('Epilogue')) return 'EPILOGUE';
  return 'ACT I';
}

function getActFromX(x) {
  if (x < 700) return 'ACT I';
  if (x < 1400) return 'ACT II';
  if (x < 2100) return 'ACT III';
  return 'EPILOGUE';
}

function getActDefaultFieldVal(actName) {
  if (actName === 'ACT I') return 'Act I';
  if (actName === 'ACT II') return 'Act II - Ascent';
  if (actName === 'ACT III') return 'Act III';
  if (actName === 'EPILOGUE') return 'Epilogue';
  return 'Act I';
}

function getRenderX(x, collapsed) {
  if (!collapsed) return x;
  const w1 = collapsed['ACT I'] ? 80 : 700;
  const w2 = collapsed['ACT II'] ? 80 : 700;
  const w3 = collapsed['ACT III'] ? 80 : 700;

  const actStarts = {
    'ACT I': 0,
    'ACT II': w1,
    'ACT III': w1 + w2,
    'EPILOGUE': w1 + w2 + w3
  };

  if (x < 700) {
    if (collapsed['ACT I']) return -9999;
    return x;
  } else if (x < 1400) {
    if (collapsed['ACT II']) return -9999;
    return actStarts['ACT II'] + (x - 700);
  } else if (x < 2100) {
    if (collapsed['ACT III']) return -9999;
    return actStarts['ACT III'] + (x - 1400);
  } else {
    if (collapsed['EPILOGUE']) return -9999;
    return actStarts['EPILOGUE'] + (x - 2100);
  }
}

function getLogicalX(renderX, collapsed) {
  if (!collapsed) return renderX;
  const w1 = collapsed['ACT I'] ? 80 : 700;
  const w2 = collapsed['ACT II'] ? 80 : 700;
  const w3 = collapsed['ACT III'] ? 80 : 700;

  const actStarts = {
    'ACT I': 0,
    'ACT II': w1,
    'ACT III': w1 + w2,
    'EPILOGUE': w1 + w2 + w3
  };

  if (!collapsed['EPILOGUE'] && renderX >= actStarts['EPILOGUE']) {
    return 2100 + (renderX - actStarts['EPILOGUE']);
  } else if (!collapsed['ACT III'] && renderX >= actStarts['ACT III']) {
    return 1400 + (renderX - actStarts['ACT III']);
  } else if (!collapsed['ACT II'] && renderX >= actStarts['ACT II']) {
    return 700 + (renderX - actStarts['ACT II']);
  } else {
    return renderX;
  }
}

function extractPlainText(content) {
  if (!content) return '';
  try {
    const delta = typeof content === 'string' ? JSON.parse(content) : content;
    if (delta && Array.isArray(delta.ops)) {
      return delta.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('').trim();
    }
  } catch (_) {}
  return String(content).trim();
}

function getLaneHeight(laneId) {
  if (timelineState.focusedLane === null || timelineState.focusedLane === undefined) {
    return 180;
  }
  return timelineState.focusedLane === laneId ? 380 : 110;
}

function getLaneY(laneId) {
  let y = LANE_PADDING;
  for (let i = 0; i < laneId; i++) {
    y += getLaneHeight(i);
  }
  return y;
}

function getSurfaceHeight() {
  if (timelineState.focusedLane === null || timelineState.focusedLane === undefined) {
    return LANE_PADDING + 180 * 3 + 30; // 620
  }
  return LANE_PADDING + 380 + 110 * 2 + 30; // 680
}

function getLaneFromY(y) {
  const y0 = getLaneY(0);
  const h0 = getLaneHeight(0);
  const y1 = getLaneY(1);
  const h1 = getLaneHeight(1);

  if (y < y0 + h0) return 0;
  if (y < y1 + h1) return 1;
  return 2;
}

function getCardVisualGeometry(beat) {
  const cardEl = timelineState.cardLayer ? timelineState.cardLayer.querySelector(`[data-beat-id="${beat.id}"]`) : null;
  const laneId = beat.properties.lane;
  const isLaneFocused = timelineState.focusedLane === laneId;
  const isExpanded = timelineState.expandedCardId === beat.id;

  let w = 140;
  let h = 38;
  if (isExpanded) {
    w = CARD_W;
    h = CARD_H;
  }

  if (cardEl) {
    const x = parseFloat(cardEl.style.left) || 0;
    const y = parseFloat(cardEl.style.top) || 0;
    return { x, y, h, w };
  }

  const rx = getRenderX(beat.properties.x, timelineState.collapsedActs);
  let x = rx;
  let y = 0;

  if (isLaneFocused) {
    const yOffset = beat.properties.yOffset || 0;
    y = getLaneY(laneId) + yOffset;
  } else {
    const laneH = getLaneHeight(laneId);
    y = getLaneY(laneId) + (laneH - h) / 2;
  }

  return { x, y, h, w };
}

function refreshBoard() {
  if (!timelineState.surface || !timelineState.sidebar) return;

  const boardInnerEl = timelineState.surface.parentElement;
  if (!boardInnerEl) return;

  // Batch all DOM mutations in a single animation frame to prevent paint flicker
  requestAnimationFrame(() => {
    if (!timelineState.sidebar || !timelineState.surface) return;

    // Re-build sidebar
    const oldSidebar = timelineState.sidebar;
    const newSidebar = buildLaneSidebar();
    timelineState.sidebar = newSidebar;
    boardInnerEl.replaceChild(newSidebar, oldSidebar);

    // Re-build surface
    const oldSurface = timelineState.surface;
    const newSurface = buildSurface();
    timelineState.surface = newSurface;
    boardInnerEl.replaceChild(newSurface, oldSurface);

    // Set minWidth and height of boardInner
    const col = timelineState.collapsedActs || {};
    const w1 = col['ACT I'] ? 80 : 700;
    const w2 = col['ACT II'] ? 80 : 700;
    const w3 = col['ACT III'] ? 80 : 700;
    const w4 = col['EPILOGUE'] ? 80 : 900;
    boardInnerEl.style.minWidth = `${w1 + w2 + w3 + w4 + 240}px`;
    boardInnerEl.style.height = `${getSurfaceHeight()}px`;

    renderBeats();
    drawConnections();
    updateMinimap();
  });
}

function getInitials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Deterministic avatar bg from string
function avatarColor(str) {
  const palette = ['#f43f5e','#10b981','#3b82f6','#8b5cf6','#f59e0b','#06b6d4','#ec4899'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ─── Main Entry Point ────────────────────────────────────────────────────────
export async function renderStoryTimeline(container) {
  injectStyles();
  container.innerHTML = '';

  const project = await getActiveProject();
  if (!project) {
    container.innerHTML = '<div class="empty-state"><p>No active project loaded.</p></div>';
    return;
  }

  timelineState.project = project;

  // Load collapsed acts state
  const collapsedKey = `forge-timeline-collapsed-${project.id}`;
  try {
    const saved = localStorage.getItem(collapsedKey);
    timelineState.collapsedActs = saved ? JSON.parse(saved) : {
      'ACT I': false,
      'ACT II': false,
      'ACT III': false,
      'EPILOGUE': false
    };
  } catch (e) {
    timelineState.collapsedActs = {
      'ACT I': false,
      'ACT II': false,
      'ACT III': false,
      'EPILOGUE': false
    };
  }

  // Load focused lane state
  const focusedLaneKey = `forge-timeline-focused-lane-${project.id}`;
  const savedFocusedLane = localStorage.getItem(focusedLaneKey);
  timelineState.focusedLane = savedFocusedLane !== null && savedFocusedLane !== '' ? parseInt(savedFocusedLane) : null;

  await loadTimelineData();

  const page = document.createElement('div');
  page.className = 'stc-page';

  // ── Toolbar
  page.appendChild(buildToolbar());

  // ── Board scroll
  const boardScroll = document.createElement('div');
  boardScroll.className = 'stc-board-scroll';
  timelineState.boardScroll = boardScroll;

  // ── Board inner (sidebar + surface)
  const boardInner = document.createElement('div');
  boardInner.className = 'stc-board-inner';

  // Lane sidebar
  const sidebar = buildLaneSidebar();
  timelineState.sidebar = sidebar;
  boardInner.appendChild(sidebar);

  // Surface
  const surface = buildSurface();
  timelineState.surface = surface;
  boardInner.appendChild(surface);

  // Set minWidth and height of boardInner based on act collapse widths
  const col = timelineState.collapsedActs || {};
  const w1 = col['ACT I'] ? 80 : 700;
  const w2 = col['ACT II'] ? 80 : 700;
  const w3 = col['ACT III'] ? 80 : 700;
  const w4 = col['EPILOGUE'] ? 80 : 900;
  boardInner.style.minWidth = `${w1 + w2 + w3 + w4 + 240}px`;
  boardInner.style.height = `${getSurfaceHeight()}px`;

  boardScroll.appendChild(boardInner);
  page.appendChild(boardScroll);

  // ── Mini-map strip
  const minimap = buildMinimap();
  page.appendChild(minimap);

  container.appendChild(page);

  // Render beats & connections
  renderBeats();
  drawConnections();
  updateMinimap();

  // Update minimap on scroll
  boardScroll.addEventListener('scroll', () => {
    updateMinimap();
  });

  const onDbUpdated = async (e) => {
    const detail = e.detail;
    if (detail && detail.storeName === 'pages') {
      if (container.querySelector('.stc-card-dragging')) return;
      if (timelineState.justSavedId) {
        timelineState.justSavedId = null;
        return;
      }
      await loadTimelineData();
      renderBeats();
      drawConnections();
      updateMinimap();
    }
  };

  window.addEventListener('forge-db-updated', onDbUpdated);
  container._cleanup = () => {
    window.removeEventListener('forge-db-updated', onDbUpdated);
  };
}

// ─── Data ────────────────────────────────────────────────────────────────────
async function loadTimelineData() {
  const pages = await getPages(timelineState.project.id);
  timelineState.allPages = pages;
  // Include pages that are story beats OR belong to the chapters schema
  // (mirrors the logic in graphView.js and pageView.js)
  timelineState.beats = pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema');

  const initKey = `forge-timeline-init-${timelineState.project.id}`;
  if (timelineState.beats.length === 0 && !localStorage.getItem(initKey)) {
    localStorage.setItem(initKey, 'true');
    const styleId = timelineState.project?.settings?.style || 'story';
    
    // Only seed sample nodes for Story Writer projects
    if (styleId === 'story') {
      const storySchemaId = 'story-chapters-schema';
      const defaultStoryProps = {
        f1: 'Act I',
        f2: 'Draft',
        f3: 0,
        f4: '',
        f5: '',
        f6: ''
      };

      const samples = [
        {
          id: generateId(),
          projectId: timelineState.project.id,
          title: 'The Spark',
          content: 'The protagonist discovers an ancient artifact in the ruins, attracting unwanted attention from the kingdom.',
          isStoryBeat: true,
          schemaId: storySchemaId,
          properties: { lane: 0, x: 80, prerequisites: [], characters: [], ...defaultStoryProps }
        },
        {
          id: generateId(),
          projectId: timelineState.project.id,
          title: 'Kingdom Pursuit',
          content: 'Guards raid the village. The protagonist must escape into the dark forest before dawn.',
          isStoryBeat: true,
          schemaId: storySchemaId,
          properties: { lane: 0, x: 440, prerequisites: [], characters: [], ...defaultStoryProps }
        },
        {
          id: generateId(),
          projectId: timelineState.project.id,
          title: 'Meeting the Mentor',
          content: 'Deep in the forest, they encounter an exiled scholar who knows the artifact\'s secrets and agrees to help.',
          isStoryBeat: true,
          schemaId: storySchemaId,
          properties: { lane: 1, x: 800, prerequisites: [], characters: [], ...defaultStoryProps }
        }
      ];
      samples[1].properties.prerequisites.push(samples[0].id);
      samples[2].properties.prerequisites.push(samples[1].id);
      for (const s of samples) await savePage(s);
      timelineState.beats = samples;
      timelineState.allPages = await getPages(timelineState.project.id);
    }
  } else {
    localStorage.setItem(initKey, 'true');
  }

  // Two-way sync: Update beat logical coordinate X with database Act choice (properties.f1)
  const isStory = timelineState.project?.settings?.style === 'story';
  if (isStory) {
    let updatedCount = 0;
    for (const b of timelineState.beats) {
      const currentAct = getActName(b);
      const expectedAct = getActFromX(b.properties.x);
      if (currentAct !== expectedAct) {
        if (currentAct === 'ACT I') b.properties.x = 80;
        else if (currentAct === 'ACT II') b.properties.x = 780;
        else if (currentAct === 'ACT III') b.properties.x = 1480;
        else if (currentAct === 'EPILOGUE') b.properties.x = 2180;
        await savePage(b);
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      const pages = await getPages(timelineState.project.id);
      timelineState.allPages = pages;
      timelineState.beats = pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema');
    }
  }
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
function buildToolbar() {
  const tb = document.createElement('div');
  tb.className = 'stc-toolbar';

  const left = document.createElement('div');
  left.className = 'stc-toolbar-left';
  left.innerHTML = `
    <span class="stc-toolbar-title">✦ Story Roadmap</span>
    <span class="stc-toolbar-subtitle">The Forge Chronicle — Plot lines, acts &amp; prerequisites</span>
  `;

  const right = document.createElement('div');
  right.className = 'stc-toolbar-right';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'stc-search-wrap';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'stc-search';
  search.placeholder = '🔍 Filter beats…';
  search.value = timelineState.searchQuery;

  const searchClear = document.createElement('button');
  searchClear.className = 'stc-search-clear';
  searchClear.textContent = '×';
  searchClear.title = 'Clear search';
  searchClear.addEventListener('click', () => {
    search.value = '';
    timelineState.searchQuery = '';
    searchClear.style.display = 'none';
    searchBadge.style.display = 'none';
    renderBeats();
    drawConnections();
    updateMinimap();
  });

  const searchBadge = document.createElement('span');
  searchBadge.className = 'stc-search-badge';

  search.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    timelineState.searchQuery = q;
    searchClear.style.display = q ? 'block' : 'none';
    const matchCount = timelineState.beats.filter(b =>
      !q || (b.title || '').toLowerCase().includes(q) ||
      extractPlainText(b.content).toLowerCase().includes(q)
    ).length;
    if (q) {
      searchBadge.textContent = `${matchCount} beat${matchCount !== 1 ? 's' : ''}`;
      searchBadge.style.display = 'inline';
    } else {
      searchBadge.style.display = 'none';
    }
    renderBeats();
    drawConnections();
    updateMinimap();
  });

  // Restore clear button state if there's already a query
  if (timelineState.searchQuery) {
    searchClear.style.display = 'block';
    searchBadge.style.display = 'inline';
  }

  searchWrap.append(search, searchClear);

  const alignBtn = document.createElement('button');
  alignBtn.className = 'stc-btn stc-btn-secondary';
  alignBtn.innerHTML = '⚡ Auto-Align';
  alignBtn.title = 'Align all beats chronologically';
  alignBtn.addEventListener('click', autoAlignBeats);

  const addBtn = document.createElement('button');
  addBtn.className = 'stc-btn stc-btn-primary';
  addBtn.innerHTML = '+ Add Beat';
  addBtn.addEventListener('click', createNewBeat);

  right.append(searchWrap, searchBadge, alignBtn, addBtn);
  tb.append(left, right);
  return tb;
}

// ─── Lane Sidebar ─────────────────────────────────────────────────────────────
function buildLaneSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'stc-lane-sidebar';

  LANES.forEach(lane => {
    const hdr = document.createElement('div');
    const isFocused = timelineState.focusedLane === lane.id;
    hdr.className = 'stc-lane-header' + (isFocused ? ' focused' : '') + (timelineState.focusedLane !== null && !isFocused ? ' unfocused' : '');
    hdr.style.cssText = `border-left: 3px solid ${lane.color}; height: ${getLaneHeight(lane.id)}px; cursor: pointer;`;

    const glowBg = document.createElement('div');
    glowBg.className = 'stc-lane-glow';
    glowBg.style.cssText = `background: linear-gradient(to right, ${lane.color}, transparent); animation: stc-glow-pulse 4s ease-in-out infinite;`;

    if (isFocused) {
      hdr.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom: 2px;">
          <span class="stc-lane-header-icon" style="font-size:1.3rem; margin-bottom:0;">${lane.icon}</span>
          <span style="font-size:0.55rem; text-transform:uppercase; letter-spacing:0.08em; background:${lane.color}25; color:${lane.color}; padding:2px 6px; border-radius:12px; font-weight:700; border: 1px solid ${lane.color}40;">Active Lane</span>
        </div>
        <span class="stc-lane-header-name" style="color:${lane.color}; font-size:0.75rem; font-weight:800; margin-top:2px;">${lane.name}</span>
        <span class="stc-lane-header-desc" style="color:rgba(255,255,255,0.5); font-size:0.58rem; margin-top:4px; line-height:1.35;">${lane.desc}</span>
        <div style="margin-top:auto; font-size:0.55rem; color:${lane.color}; font-weight:600; display:flex; align-items:center; gap:4px; opacity:0.85;">
          <span>⛶ Click to collapse lane</span>
        </div>
      `;
    } else if (timelineState.focusedLane !== null) {
      hdr.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="stc-lane-header-icon" style="font-size:0.95rem; margin-bottom:0; opacity:0.6;">${lane.icon}</span>
          <span class="stc-lane-header-name" style="color:rgba(255,255,255,0.45); font-size:0.62rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lane.name}</span>
        </div>
        <div style="margin-top:4px; font-size:0.52rem; color:rgba(255,255,255,0.25);">Click to expand</div>
      `;
    } else {
      hdr.innerHTML = `
        <span class="stc-lane-header-icon">${lane.icon}</span>
        <span class="stc-lane-header-name" style="color:${lane.color};">${lane.name}</span>
        <span class="stc-lane-header-desc">${lane.desc}</span>
      `;
    }

    hdr.appendChild(glowBg);

    hdr.addEventListener('click', () => {
      if (timelineState.focusedLane === lane.id) {
        timelineState.focusedLane = null;
      } else {
        timelineState.focusedLane = lane.id;
      }
      localStorage.setItem(`forge-timeline-focused-lane-${timelineState.project.id}`, timelineState.focusedLane !== null ? timelineState.focusedLane : '');
      refreshBoard();
    });

    sidebar.appendChild(hdr);
  });

  return sidebar;
}

// ─── Surface ──────────────────────────────────────────────────────────────────
function buildSurface() {
  const surface = document.createElement('div');
  surface.className = 'stc-surface';
  surface.style.height = `${getSurfaceHeight()}px`;

  const collapsed = timelineState.collapsedActs || {};
  const w1 = collapsed['ACT I'] ? 80 : 700;
  const w2 = collapsed['ACT II'] ? 80 : 700;
  const w3 = collapsed['ACT III'] ? 80 : 700;
  const w4 = collapsed['EPILOGUE'] ? 80 : 900;
  const currentSurfaceW = w1 + w2 + w3 + w4;
  surface.style.width = `${currentSurfaceW}px`;

  const actStarts = {
    'ACT I': 0,
    'ACT II': w1,
    'ACT III': w1 + w2,
    'EPILOGUE': w1 + w2 + w3
  };
  const actWidths = {
    'ACT I': w1,
    'ACT II': w2,
    'ACT III': w3,
    'EPILOGUE': w4
  };

  const boardInner = timelineState.surface ? timelineState.surface.parentElement : null;
  if (boardInner) {
    boardInner.style.minWidth = `${currentSurfaceW + 240}px`;
    boardInner.style.height = `${getSurfaceHeight()}px`;
  }

  // ── Act bands
  ACTS.forEach((act, i) => {
    const actName = act.name;
    const isCollapsed = collapsed[actName];

    const band = document.createElement('div');
    band.className = 'stc-act-band';
    if (isCollapsed) {
      band.style.background = 'rgba(255,255,255,0.015)';
      band.style.borderRight = '1px dashed rgba(255,255,255,0.05)';
    }
    band.style.left = `${actStarts[actName]}px`;
    band.style.width = `${actWidths[actName]}px`;

    // Subtle gradient tones
    const tones = [
      'rgba(229,169,59,0.018)',
      'rgba(139,92,246,0.015)',
      'rgba(16,185,129,0.015)',
      'rgba(59,130,246,0.018)'
    ];
    if (!isCollapsed) {
      band.style.background = `linear-gradient(to bottom, ${tones[i]}, transparent 40%, transparent 60%, ${tones[i]})`;
    }

    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: 8px;
      left: 16px;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(229,169,59,0.5);
      text-transform: uppercase;
      font-family: var(--font-hud, monospace);
      cursor: pointer;
      pointer-events: auto;
      user-select: none;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color 0.15s;
    `;
    // Beat count badge for collapsed acts
    const beatsInAct = timelineState.beats.filter(b => {
      const actN = getActName(b);
      return actN === actName;
    }).length;
    const countPill = isCollapsed && beatsInAct > 0
      ? ` <span style="font-size:0.5rem; background:rgba(229,169,59,0.15); color:rgba(229,169,59,0.8); border:1px solid rgba(229,169,59,0.25); border-radius:10px; padding:1px 5px; margin-left:4px; font-weight:700;">${beatsInAct}</span>`
      : '';
    label.innerHTML = `<span>${isCollapsed ? '➕' : '➖'}</span> <span>${act.name}${countPill}</span>`;

    if (isCollapsed) {
      label.style.transform = 'rotate(90deg)';
      label.style.transformOrigin = 'left top';
      label.style.left = '35px';
      label.style.top = '50px';
      label.style.whiteSpace = 'nowrap';
    }

    label.addEventListener('mouseenter', () => { label.style.color = '#e5a93b'; });
    label.addEventListener('mouseleave', () => { label.style.color = 'rgba(229,169,59,0.5)'; });

    label.addEventListener('click', (e) => {
      e.stopPropagation();
      timelineState.collapsedActs[actName] = !isCollapsed;
      const collapsedKey = `forge-timeline-collapsed-${timelineState.project.id}`;
      localStorage.setItem(collapsedKey, JSON.stringify(timelineState.collapsedActs));
      refreshBoard();
    });

    band.appendChild(label);

    if (i > 0) {
      const divider = document.createElement('div');
      divider.className = 'stc-act-divider';
      divider.style.left = '0';
      divider.style.right = 'auto';
      band.appendChild(divider);
    }

    surface.appendChild(band);
  });

  // ── Lane rows
  LANES.forEach(lane => {
    const row = document.createElement('div');
    row.className = 'stc-lane-row';
    row.style.top = `${getLaneY(lane.id)}px`;
    row.style.height = `${getLaneHeight(lane.id)}px`;
    row.style.width = `${currentSurfaceW}px`;
    row.style.borderLeft = `2px solid ${lane.color}18`;
    row.style.background = `linear-gradient(to right, ${lane.color}08, transparent 300px)`;
    surface.appendChild(row);
  });

  // ── SVG layer
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'stc-svg-layer');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:2;';
  surface.appendChild(svg);
  timelineState.svg = svg;

  // ── Card layer
  const cardLayer = document.createElement('div');
  cardLayer.className = 'stc-card-layer';
  surface.appendChild(cardLayer);
  timelineState.cardLayer = cardLayer;

  // Background clicks collapse expanded cards
  surface.addEventListener('click', (e) => {
    if (e.target === surface || e.target.classList.contains('stc-lane-row') || e.target.classList.contains('stc-act-band') || e.target.classList.contains('stc-act-divider')) {
      if (timelineState.expandedCardId !== null) {
        timelineState.expandedCardId = null;
        renderBeats();
        drawConnections();
        updateMinimap();
      }
    }
  });

  return surface;
}

// ─── Beat Canvas Integration ──────────────────────────────────────────────────

async function openBeatCanvas(beat) {
  let tabId = beat.properties?.canvasTabId;
  let tabExists = false;

  if (tabId) {
    try {
      const tab = await getTab(tabId);
      if (tab) tabExists = true;
    } catch (_) {
      showToast('Rebuilding canvas for this beat…', 'info');
    }
  }

  if (!tabId || !tabExists) {
    // Create a new canvas tab for this beat
    const tab = await saveTab({
      name: beat.title || 'Untitled Beat',
      icon: 'layout-dashboard',
      beatId: beat.id,   // back-reference for future use
    });
    tabId = tab.id;

    // Seed the canvas with initial nodes
    await seedBeatCanvas(tabId, beat);

    // Persist the canvasTabId back to the beat
    if (!beat.properties) beat.properties = {};
    beat.properties.canvasTabId = tabId;
    await savePage(beat);

    showToast('Canvas created for this beat', 'success');
  }

  playZapSound?.();
  navigate('workspace/' + tabId);
}

async function seedBeatCanvas(tabId, beat) {
  const CARD_W = 380;
  const detailsNodeId = generateId();
  const connections = [];

  // Node 1: Beat info richtext card
  const beatContent = beat.title
    ? `<h2>${beat.title}</h2><p>${esc(extractPlainText(beat.content)) || 'No synopsis yet.'}</p>`
    : `<p>No synopsis yet.</p>`;

  await saveNode({
    id: detailsNodeId,
    tabId,
    type: 'richtext',
    isBeatDetails: true,
    x: 80,
    y: 80,
    w: CARD_W,
    h: 200,
    width: CARD_W,
    height: 200,
    color: '',
    label: beat.title || 'Beat Notes',
    content: beatContent,
  });

  // characters can be an array OR a comma-string depending on how the beat was saved
  const rawChars = beat.properties?.characters;
  const charIds = Array.isArray(rawChars)
    ? rawChars
    : (typeof rawChars === 'string' ? rawChars.split(',').map(s => s.trim()).filter(Boolean) : []);

  let offsetX = 80;
  let offsetY = 320;
  let prevCharNodeId = null;

  for (const charId of charIds.slice(0, 8)) {
    const charNodeId = generateId();
    let charTitle = charId;
    let nodeType = 'pagelink';
    let nodeWidth = 280;
    let nodeHeight = 160;

    try {
      const charPages = timelineState.allPages || [];
      const found = charPages.find(p => p.id === charId);
      if (found) {
        charTitle = found.title || charId;
        let isMap = false;
        const mapIds = ['dnd-maps-schema', 'story-maps-schema', 'story-locs-schema', 'locations'];
        if (mapIds.includes(found.schemaId)) {
          isMap = true;
        } else if (found.schemaId) {
          const schema = await getSchema(found.schemaId);
          if (schema && mapIds.includes(schema.templateId)) {
            isMap = true;
          }
        }
        if (isMap) {
          nodeType = 'map';
          nodeWidth = 500;
          nodeHeight = 400;
        }
      }
    } catch (_) {}

    await saveNode({
      id: charNodeId,
      tabId,
      type: nodeType,
      x: offsetX,
      y: offsetY,
      w: nodeWidth,
      h: nodeHeight,
      width: nodeWidth,
      height: nodeHeight,
      color: '',
      content: { pageId: charId },
      title: charTitle,
    });

    // Create automatic connection linking synopsis details node to character card
    connections.push({
      id: generateId(),
      sourceId: detailsNodeId,
      targetId: charNodeId
    });

    // Link character cards together sequentially
    if (prevCharNodeId) {
      connections.push({
        id: generateId(),
        sourceId: prevCharNodeId,
        targetId: charNodeId
      });
    }

    prevCharNodeId = charNodeId;

    offsetX += 300;
    if (offsetX > 980) {
      offsetX = 80;
      offsetY += 200;
    }
  }

  // Save connections back to the tab
  const tab = await getTab(tabId);
  if (tab) {
    tab.connections = connections;
    await saveTab(tab);
  }
}

// ─── Render Beats ─────────────────────────────────────────────────────────────
function renderBeats() {
  // Remove any existing empty state
  timelineState.surface?.querySelector('.stc-empty-state')?.remove();

  const q = timelineState.searchQuery;

  const visible = timelineState.beats.filter(b => {
    if (!q) return true;
    return (b.title || '').toLowerCase().includes(q) || extractPlainText(b.content).toLowerCase().includes(q);
  });

  // Empty-state overlay when search finds nothing
  if (q && visible.length === 0 && timelineState.surface) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'stc-empty-state';
    emptyEl.innerHTML = `
      <div class="stc-empty-state-icon">🔍</div>
      <div class="stc-empty-state-text">No beats match "${q}"</div>
    `;
    timelineState.surface.appendChild(emptyEl);
  }

  // Get all existing card elements mapped by beat ID for reconciliation
  const existingCards = {};
  timelineState.cardLayer.querySelectorAll('.stc-card').forEach(card => {
    const bid = card.dataset.beatId;
    if (bid) existingCards[bid] = card;
  });

  const processedIds = new Set();

  visible.forEach((beat, i) => {
    const rx = getRenderX(beat.properties.x, timelineState.collapsedActs);
    if (rx < 0) return; // Skip rendering (hidden/collapsed)

    processedIds.add(beat.id);
    const lane = LANES.find(l => l.id === beat.properties.lane) || LANES[0];
    const geom = getCardVisualGeometry(beat);

    let card = existingCards[beat.id];
    let isNew = false;

    if (!card) {
      card = document.createElement('div');
      card.className = 'stc-card';
      card.dataset.beatId = beat.id;
      isNew = true;
    }

    // Update style properties in-place
    card.style.left = `${geom.x}px`;
    card.style.top = `${geom.y}px`;
    
    // Toggle compact mode class
    const isCompact = geom.h === 38;
    if (isCompact) {
      card.classList.add('stc-card-compact');
    } else {
      card.classList.remove('stc-card-compact');
    }

    card.style.borderLeft = `4px solid ${lane.color}`;
    card.style.setProperty('--card-glow', `${lane.color}4d`);
    card.style.animationDelay = `${i * 0.04}s`;

    // Only rebuild inner HTML if something changed or it's a new card
    const charIds = beat.properties.characters || [];
    const prereqCount = (beat.properties.prerequisites || []).length;
    const plainText = extractPlainText(beat.content || 'No synopsis.');
    const fingerprint = `${beat.title}|${plainText}|${charIds.join(',')}|${prereqCount}|${isCompact}`;

    if (isNew || card.dataset.fingerprint !== fingerprint) {
      card.dataset.fingerprint = fingerprint;

      // Build footer
      let footerHTML = '';
      charIds.slice(0, 5).forEach(cid => {
        const page = timelineState.allPages.find(p => p.id === cid);
        if (page) {
          const initials = getInitials(page.title);
          const bg = avatarColor(cid);
          if (page.coverImage) {
            footerHTML += `<span class="stc-avatar stc-avatar-link" data-page-id="${cid}" style="background-image:url('${page.coverImage}'); background-size:cover; background-position:center; cursor:pointer;" title="Open: ${esc(page.title)}"></span>`;
          } else {
            footerHTML += `<span class="stc-avatar stc-avatar-link" data-page-id="${cid}" style="background:${bg}; cursor:pointer;" title="Open: ${esc(page.title)}">${esc(initials)}</span>`;
          }
        }
      });
      if (charIds.length > 5) {
        footerHTML += `<span class="stc-avatar" style="background:rgba(255,255,255,0.1);">+${charIds.length - 5}</span>`;
      }
      if (prereqCount > 0) {
        footerHTML += `<span class="stc-prereq-badge" title="Prerequisites">⟶ ${prereqCount}</span>`;
      }

      if (isCompact) {
        card.innerHTML = `
          <span style="font-size: 0.8rem; margin-right: 4px; display: inline-block; vertical-align: middle;">${lane.icon}</span>
          <span class="stc-card-title" style="font-size: 0.65rem; text-align: center; display: inline-block; vertical-align: middle; margin: 0;" title="${esc(beat.title)}">${esc(beat.title)}</span>
        `;
      } else {
        card.innerHTML = `
          <div class="stc-card-header">
            <span class="stc-card-title" title="${esc(beat.title)}">${esc(beat.title)}</span>
            <div style="display:flex;gap:3px;align-items:center;">
              <button class="stc-card-canvas-btn" title="Open beat canvas" tabindex="-1" style="background:transparent;border:none;cursor:pointer;padding:2px 4px;border-radius:4px;font-size:12px;line-height:1;opacity:0.6;transition:opacity 0.15s,background 0.15s;" onmouseenter="this.style.opacity='1';this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.opacity='0.6';this.style.background='transparent'">🎨</button>
            </div>
          </div>
          <div class="stc-card-body">${esc(plainText)}</div>
          <div class="stc-card-footer">${footerHTML}</div>
        `;

        card.querySelector('.stc-card-canvas-btn').addEventListener('click', e => {
          e.stopPropagation();
          openBeatCanvas(beat);
        });

        // Avatar chip clicks → navigate to that page
        card.querySelectorAll('.stc-avatar-link').forEach(chip => {
          chip.addEventListener('click', e => {
            e.stopPropagation();
            navigate(`page/${chip.dataset.pageId}`);
          });
        });
      }
    }

    if (isNew) {
      // Hover glow
      card.addEventListener('mouseenter', () => {
        card.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 14px ${lane.color}30, inset 0 0 0 1px ${lane.color}20`;
        card.style.borderColor = `${lane.color}80`;
      });
      card.addEventListener('mouseleave', () => {
        if (!card.classList.contains('stc-card-dragging')) {
          card.style.boxShadow = '';
          card.style.borderColor = 'rgba(255,255,255,0.07)';
          card.style.borderLeft = `4px solid ${lane.color}`;
        }
      });

      card.addEventListener('dblclick', () => openBeatCanvas(beat));

      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContextMenu(e, beat, card, lane);
      });

      setupCardDrag(card, beat);
      timelineState.cardLayer.appendChild(card);
    }
  });

  // Remove cards that are no longer visible
  for (const bid in existingCards) {
    if (!processedIds.has(bid)) {
      existingCards[bid].remove();
    }
  }
}

// ─── Drag ────────────────────────────────────────────────────────────────────
function setupCardDrag(card, beat) {
  let isDown = false;
  let hasMoved = false;
  let startBeatX, startBeatY;
  let clientStartX, clientStartY;
  let clickTimeout = null;
  let lastClickTime = 0;
  let prevFocusedLane = null; // lane focus before drag started

  const onMouseDown = e => {
    if (e.target.closest('button') || e.target.closest('.stc-avatar')) return;
    if (e.button !== 0) return;
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    isDown = true;
    hasMoved = false;
    prevFocusedLane = timelineState.focusedLane; // snapshot before drag
    startBeatX = getRenderX(beat.properties.x, timelineState.collapsedActs);
    startBeatY = parseFloat(card.style.top) || 0;
    clientStartX = e.clientX;
    clientStartY = e.clientY;
    e.preventDefault();
  };

  const onMouseMove = e => {
    if (!isDown) return;
    const dx = e.clientX - clientStartX;
    const dy = e.clientY - clientStartY;

    if (!hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      hasMoved = true;
      card.classList.add('stc-card-dragging');
      card.style.zIndex = '999';
    }

    if (hasMoved) {
      let newRenderX = Math.max(10, Math.round((startBeatX + dx) / SNAP_GRID_X) * SNAP_GRID_X);
      const newY = startBeatY + dy;

      const tempLane = getLaneFromY(newY);
      beat.properties.lane = tempLane;

      card.style.left = `${newRenderX}px`;
      card.style.top  = `${newY}px`;

      beat.properties.x = getLogicalX(newRenderX, timelineState.collapsedActs);

      const lane = LANES[tempLane] || LANES[0];
      card.style.borderLeft = `4px solid ${lane.color}`;

      drawConnections();
      updateMinimap();
    }
  };

  const onMouseUp = async () => {
    if (!isDown) return;
    isDown = false;

    if (hasMoved) {
      card.classList.remove('stc-card-dragging');
      card.style.zIndex = '';

      const finalY  = parseFloat(card.style.top) || 0;
      const laneIdx = getLaneFromY(finalY);
      beat.properties.lane = laneIdx;

      // Capture laneY BEFORE updating focusedLane so relativeY is
      // computed against the current (pre-focus-change) lane geometry.
      // finalY was recorded with the old geometry, so this keeps them in sync.
      const laneY = getLaneY(laneIdx);
      const relativeY = finalY - laneY;

      // Auto-focus the destination lane
      timelineState.focusedLane = laneIdx;
      localStorage.setItem(`forge-timeline-focused-lane-${timelineState.project.id}`, timelineState.focusedLane !== null ? timelineState.focusedLane : '');

      const isExpanded = timelineState.expandedCardId === beat.id;

      // Snapped Y coordinate constraint
      const maxOffset = isExpanded ? (380 - CARD_H) : (380 - 38);
      const snappedY = Math.max(0, Math.min(maxOffset, Math.round(relativeY / 10) * 10));
      beat.properties.yOffset = snappedY;
      card.style.top = `${laneY + snappedY}px`;

      let finalRenderX = parseFloat(card.style.left) || 80;
      finalRenderX = Math.max(10, Math.round(finalRenderX / SNAP_GRID_X) * SNAP_GRID_X);

      const finalLogicalX = getLogicalX(finalRenderX, timelineState.collapsedActs);
      beat.properties.x = finalLogicalX;

      card.style.left = `${finalRenderX}px`;

      const lane = LANES.find(l => l.id === laneIdx) || LANES[0];
      card.style.borderLeft = `4px solid ${lane.color}`;

      // Two-way sync: Dragging to a new Act updates f1 (Act dropdown)
      const isStory = timelineState.project?.settings?.style === 'story';
      if (isStory) {
        const newAct = getActFromX(finalLogicalX);
        const currentAct = getActName(beat);
        if (newAct !== currentAct) {
          beat.properties.f1 = getActDefaultFieldVal(newAct);
        }
      }

      // Disabled overlap nudging to keep cards exactly where dropped and prevent page blinking
      // nudgeLaneOverlaps(laneIdx, beat.id);

      timelineState.justSavedId = beat.id;
      await savePage(beat);
      playClickSound();

      const focusLaneChanged = prevFocusedLane !== timelineState.focusedLane;

      if (focusLaneChanged) {
        // Lane focus changed → heights need rebuilding; full board refresh required
        refreshBoard();
      } else {
        // Same lane or same focus → card is already positioned correctly in-place.
        // Just redraw connections and minimap to avoid flicker.
        drawConnections();
        updateMinimap();
      }
    } else {
      const now = Date.now();
      if (now - lastClickTime < 200) {
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
      } else {
        lastClickTime = now;
        clickTimeout = setTimeout(() => {
          clickTimeout = null;
          if (timelineState.expandedCardId === beat.id) {
            timelineState.expandedCardId = null;
          } else {
            timelineState.expandedCardId = beat.id;
          }
          renderBeats();
          drawConnections();
          updateMinimap();
        }, 200);
      }
    }
  };

  card.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

// ─── SVG Connections ──────────────────────────────────────────────────────────
function drawConnections() {
  const svg = timelineState.svg;
  if (!svg) return;
  svg.innerHTML = '';

  // Defs: arrow markers
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="stc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(229,169,59,0.4)"/>
    </marker>
    <marker id="stc-arrow-hover" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(229,169,59,0.9)"/>
    </marker>
  `;
  svg.appendChild(defs);

  const collapsed = timelineState.collapsedActs || {};

  // getActRenderMidX: returns the horizontal mid-point of a collapsed act's column (80px wide).
  // Computed by summing prior acts' actual render widths, then adding 40 (half of 80px).
  const getActRenderMidX = (act) => {
    const w1 = collapsed['ACT I']    ? 80 : 700;
    const w2 = collapsed['ACT II']   ? 80 : 700;
    const w3 = collapsed['ACT III']  ? 80 : 700;
    if (act === 'ACT I')    return 0  + 40;        // starts at 0
    if (act === 'ACT II')   return w1 + 40;
    if (act === 'ACT III')  return w1 + w2 + 40;
    return w1 + w2 + w3 + 40;                      // EPILOGUE
  };

  timelineState.beats.forEach(beat => {
    (beat.properties.prerequisites || []).forEach(preId => {
      const source = timelineState.beats.find(b => b.id === preId);
      if (!source) return;

      const actName1 = getActName(source);
      const actName2 = getActName(beat);
      const collapsed1 = collapsed[actName1];
      const collapsed2 = collapsed[actName2];

      // If both acts are collapsed, hide the link line entirely
      if (collapsed1 && collapsed2) return;

      const geom1 = getCardVisualGeometry(source);
      const geom2 = getCardVisualGeometry(beat);

      let x1, y1, x2, y2;

      if (collapsed1) {
        // Source act is collapsed: anchor line to the center of the collapsed column
        x1 = getActRenderMidX(actName1);
        y1 = getLaneY(source.properties.lane) + getLaneHeight(source.properties.lane) / 2;
      } else {
        x1 = geom1.x + geom1.w;
        y1 = geom1.y + geom1.h / 2;
      }

      if (collapsed2) {
        // Target act is collapsed: anchor line to the center of the collapsed column
        x2 = getActRenderMidX(actName2);
        y2 = getLaneY(beat.properties.lane) + getLaneHeight(beat.properties.lane) / 2;
      } else {
        x2 = geom2.x;
        y2 = geom2.y + geom2.h / 2;
      }

      const dx = x2 - x1;
      const cp = Math.max(60, Math.abs(dx) * 0.45);
      const cx1 = x1 + cp, cy1 = y1;
      const cx2 = x2 - cp, cy2 = y2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.className.baseVal = 'stc-conn-path';
      path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);
      path.setAttribute('marker-end', 'url(#stc-arrow)');
      path.style.pointerEvents = 'stroke';

      path.addEventListener('mouseenter', () => {
        path.setAttribute('marker-end', 'url(#stc-arrow-hover)');
      });
      path.addEventListener('mouseleave', () => {
        path.setAttribute('marker-end', 'url(#stc-arrow)');
      });
      path.addEventListener('dblclick', e => {
        e.stopPropagation();
        // 1a: 2-step pill confirm — no window.confirm()
        const existing = document.querySelector('.stc-link-confirm-pill');
        if (existing) { existing.remove(); return; }
        const pill = document.createElement('div');
        pill.className = 'stc-link-confirm-pill';
        pill.style.cssText = `position:fixed; left:${e.clientX + 10}px; top:${e.clientY - 10}px; background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); border-radius:20px; padding:5px 12px; font-size:0.72rem; color:#f87171; font-family:var(--font-hud,monospace); z-index:99999; cursor:pointer; backdrop-filter:blur(8px); white-space:nowrap; animation:stc-ctx-in 0.12s ease both;`;
        pill.textContent = '⚠ Remove link? Click to confirm';
        document.body.appendChild(pill);
        const cleanup = () => pill.remove();
        const confirmTimer = setTimeout(cleanup, 2500);
        pill.addEventListener('click', async () => {
          clearTimeout(confirmTimer);
          cleanup();
          beat.properties.prerequisites = (beat.properties.prerequisites || []).filter(id => id !== source.id);
          await savePage(beat);
          drawConnections();
          playZapSound();
        });
        setTimeout(() => document.addEventListener('click', cleanup, { once: true }), 50);
      });

      svg.appendChild(path);
    });
  });
}

// ─── Mini-map ─────────────────────────────────────────────────────────────────
function buildMinimap() {
  const mm = document.createElement('div');
  mm.className = 'stc-minimap';
  mm.id = 'stc-minimap';

  const canvas = document.createElement('canvas');
  canvas.className = 'stc-minimap-canvas';
  canvas.id = 'stc-minimap-canvas';
  mm.appendChild(canvas);

  const vp = document.createElement('div');
  vp.className = 'stc-minimap-viewport';
  vp.id = 'stc-minimap-viewport';
  mm.appendChild(vp);

  // 1d: Click-to-scroll on minimap
  let mmDragging = false;
  const scrollToMmX = (clientX) => {
    const scroll = timelineState.boardScroll;
    if (!scroll) return;
    const rect = mm.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const collapsed = timelineState.collapsedActs || {};
    const w1 = collapsed['ACT I'] ? 80 : 700;
    const w2 = collapsed['ACT II'] ? 80 : 700;
    const w3 = collapsed['ACT III'] ? 80 : 700;
    const w4 = collapsed['EPILOGUE'] ? 80 : 900;
    const totalW = w1 + w2 + w3 + w4 + 240;
    scroll.scrollLeft = ratio * (totalW - scroll.clientWidth);
  };
  mm.addEventListener('mousedown', (e) => { mmDragging = true; scrollToMmX(e.clientX); });
  mm.addEventListener('mousemove', (e) => { if (mmDragging) scrollToMmX(e.clientX); });
  window.addEventListener('mouseup', () => { mmDragging = false; });

  return mm;
}

// 1e: Nudge overlapping cards within a focused lane after drop
function nudgeLaneOverlaps(laneIdx, droppedBeatId) {
  if (timelineState.focusedLane !== laneIdx) return;
  const beatsInLane = timelineState.beats
    .filter(b => b.properties.lane === laneIdx)
    .sort((a, b) => (a.properties.yOffset || 0) - (b.properties.yOffset || 0));

  const isExpanded = (b) => timelineState.expandedCardId === b.id;
  const cardH = (b) => isExpanded(b) ? CARD_H : 38;
  const gap = 12;

  let cursor = 0;
  for (const b of beatsInLane) {
    const currentY = b.properties.yOffset || 0;
    if (currentY < cursor) {
      b.properties.yOffset = cursor;
      // Save async quietly (don't block)
      savePage(b).catch(() => {});
      // Update card DOM position if visible
      const cardEl = timelineState.cardLayer?.querySelector(`[data-beat-id="${b.id}"]`);
      if (cardEl) {
        const laneY = getLaneY(laneIdx);
        cardEl.style.top = `${laneY + cursor}px`;
      }
    }
    cursor = Math.max(cursor, (b.properties.yOffset || 0)) + cardH(b) + gap;
  }
}

function updateMinimap() {
  const canvas  = document.getElementById('stc-minimap-canvas');
  const vp      = document.getElementById('stc-minimap-viewport');
  const scroll  = timelineState.boardScroll;
  if (!canvas || !vp || !scroll) return;

  const collapsed = timelineState.collapsedActs || {};
  const w1 = collapsed['ACT I'] ? 80 : 700;
  const w2 = collapsed['ACT II'] ? 80 : 700;
  const w3 = collapsed['ACT III'] ? 80 : 700;
  const w4 = collapsed['EPILOGUE'] ? 80 : 900;
  const currentSurfaceW = w1 + w2 + w3 + w4;

  const mmEl    = canvas.parentElement;
  const mmW     = mmEl.clientWidth;
  const mmH     = mmEl.clientHeight;
  canvas.width  = mmW;
  canvas.height = mmH;

  const ctx     = canvas.getContext('2d');
  const scaleX  = mmW / (currentSurfaceW + 240);  // +240 for sidebar
  const scaleY  = mmH / getSurfaceHeight();

  ctx.clearRect(0, 0, mmW, mmH);

  // Lane tints
  LANES.forEach(lane => {
    ctx.fillStyle = `${lane.color}12`;
    const ly = getLaneY(lane.id) * scaleY;
    ctx.fillRect(0, ly, mmW, getLaneHeight(lane.id) * scaleY);
  });

  // Beat dots
  const q = timelineState.searchQuery;
  timelineState.beats.forEach(beat => {
    const rx = getRenderX(beat.properties.x, collapsed);
    if (rx < 0) return; // Skip if collapsed/hidden

    const lane = LANES.find(l => l.id === beat.properties.lane) || LANES[0];
    const visible = !q || (beat.title || '').toLowerCase().includes(q) || extractPlainText(beat.content).toLowerCase().includes(q);

    const dotX = (rx + 240) * scaleX;
    const geom = getCardVisualGeometry(beat);
    const dotY = (geom.y + geom.h / 2) * scaleY;

    ctx.beginPath();
    ctx.arc(dotX, dotY, visible ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = visible ? lane.color : `${lane.color}40`;
    ctx.fill();
  });

  // Viewport indicator
  const scrollLeft = scroll.scrollLeft;
  const scrollTop  = scroll.scrollTop;
  const vpW        = scroll.clientWidth;
  const vpH        = scroll.clientHeight;

  const vpLeft = scrollLeft * scaleX;
  const vpRight = (scrollLeft + vpW) * scaleX;
  vp.style.left  = `${vpLeft}px`;
  vp.style.width = `${vpRight - vpLeft}px`;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function openContextMenu(e, beat, card, lane) {
  document.querySelectorAll('.stc-ctx-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'stc-ctx-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top  = `${e.clientY}px`;

  const items = [
    { label: '✏️ Edit',            action: () => openEditModal(beat) },
    { label: '📋 Duplicate',       action: () => duplicateBeat(beat) },
    { divider: true },
    { label: '🔗 Add Prerequisite', action: () => openEditModal(beat) },
    { divider: true },
    { label: '🗑 Delete',           action: () => deleteBeat(beat), danger: true }
  ];

  items.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'stc-ctx-divider';
      menu.appendChild(d);
      return;
    }
    const el = document.createElement('div');
    el.className = 'stc-ctx-item' + (item.danger ? ' danger' : '');
    el.textContent = item.label;
    el.addEventListener('click', () => {
      menu.remove();
      item.action();
    });
    menu.appendChild(el);
  });

  document.body.appendChild(menu);

  const dismissMenu = () => menu.remove();
  setTimeout(() => {
    document.addEventListener('click', dismissMenu, { once: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.remove(); }, { once: true });
  }, 0);
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function openEditModal(beat) {
  document.querySelector('.stc-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'stc-modal-overlay';

  const otherBeats = timelineState.beats.filter(b => b.id !== beat.id);
  const charPages  = timelineState.allPages.filter(p => p.schemaId && p.schemaId !== beat.schemaId && !p.isStoryBeat);

  const prereqsHTML = otherBeats.length
    ? otherBeats.map(ob => {
        const checked = (beat.properties.prerequisites || []).includes(ob.id) ? 'checked' : '';
        return `<label class="stc-check-label">
          <input type="checkbox" data-beat-id="${ob.id}" ${checked} style="accent-color:#e5a93b;">
          ${esc(ob.title)}
        </label>`;
      }).join('')
    : `<span class="stc-check-empty">No other beats yet.</span>`;

  const charsHTML = charPages.length
    ? charPages.map(cp => {
        const checked = (beat.properties.characters || []).includes(cp.id) ? 'checked' : '';
        const imgHTML = cp.coverImage
          ? `<img src="${cp.coverImage}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;margin:0 4px;display:inline-block;vertical-align:middle;border:1px solid rgba(255,255,255,0.1);">`
          : '';
        return `<label class="stc-check-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" data-char-id="${cp.id}" ${checked} style="accent-color:#e5a93b;">
          ${imgHTML}
          <span>${esc(cp.title || 'Unnamed')}</span>
        </label>`;
      }).join('')
    : `<span class="stc-check-empty">No characters or entities found.</span>`;

  const modal = document.createElement('div');
  modal.className = 'stc-modal';
  modal.innerHTML = `
    <div class="stc-modal-header">
      <span class="stc-modal-title">Edit Story Beat</span>
      <button class="stc-modal-close" title="Close">✕</button>
    </div>
    <div class="stc-modal-body">
      <div class="stc-modal-field">
        <label class="stc-modal-label">Title</label>
        <input class="stc-modal-input" id="stc-edit-title" value="${esc(beat.title)}" placeholder="Beat title…">
      </div>
      <div class="stc-modal-field">
        <label class="stc-modal-label">Plot Lane</label>
        <select class="stc-modal-select" id="stc-edit-lane">
          ${LANES.map(l => `<option value="${l.id}" ${l.id === beat.properties.lane ? 'selected' : ''}>${l.icon} ${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="stc-modal-field">
        <label class="stc-modal-label">Synopsis / Description</label>
        <textarea class="stc-modal-textarea" id="stc-edit-content">${esc(extractPlainText(beat.content || ''))}</textarea>
      </div>
      <div class="stc-modal-field">
        <label class="stc-modal-label">Prerequisites</label>
        <div class="stc-checklist" id="stc-prereqs">${prereqsHTML}</div>
      </div>
      <div class="stc-modal-field">
        <label class="stc-modal-label">Linked Entries</label>
        <div class="stc-checklist" id="stc-chars">${charsHTML}</div>
      </div>
    </div>
    <div class="stc-modal-footer">
      <button class="stc-btn-delete" id="stc-edit-delete">🗑 Delete Beat</button>
      <div style="display:flex;gap:8px;">
        <button class="stc-btn stc-btn-secondary stc-modal-cancel">Cancel</button>
        <button class="stc-btn stc-btn-primary" id="stc-edit-save">Save Changes</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Keyboard close
  const closeEditModal = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = e => { if (e.key === 'Escape') closeEditModal(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });

  modal.querySelector('.stc-modal-close').addEventListener('click', () => closeEditModal());
  modal.querySelector('.stc-modal-cancel').addEventListener('click', () => closeEditModal());

  // 1a: 2-step delete confirm — no window.confirm()
  const deleteBtn = modal.querySelector('#stc-edit-delete');
  let deleteConfirmPending = false;
  let deleteResetTimer = null;
  deleteBtn.addEventListener('click', async () => {
    if (!deleteConfirmPending) {
      deleteConfirmPending = true;
      deleteBtn.textContent = '⚠ Confirm Delete?';
      deleteBtn.style.background = 'rgba(244,63,94,0.25)';
      deleteBtn.style.borderColor = 'rgba(244,63,94,0.6)';
      deleteResetTimer = setTimeout(() => {
        deleteConfirmPending = false;
        deleteBtn.textContent = '🗑 Delete Beat';
        deleteBtn.style.background = '';
        deleteBtn.style.borderColor = '';
      }, 2000);
    } else {
      clearTimeout(deleteResetTimer);
      await deleteBeat(beat);
      closeEditModal();
    }
  });

  modal.querySelector('#stc-edit-save').addEventListener('click', async () => {
    beat.title   = modal.querySelector('#stc-edit-title').value.trim() || 'Untitled Beat';
    const newContent = modal.querySelector('#stc-edit-content').value;
    if (newContent !== extractPlainText(beat.content)) {
      beat.content = newContent;
    }
    
    const newLane = parseInt(modal.querySelector('#stc-edit-lane').value);
    if (newLane !== beat.properties.lane) {
      beat.properties.lane = newLane;
      beat.properties.yOffset = 0; // reset yOffset on lane change from modal
    }

    const prereqIds = [];
    modal.querySelectorAll('#stc-prereqs input:checked').forEach(cb => prereqIds.push(cb.dataset.beatId));
    beat.properties.prerequisites = prereqIds;

    const charIds = [];
    modal.querySelectorAll('#stc-chars input:checked').forEach(cb => charIds.push(cb.dataset.charId));
    beat.properties.characters = charIds;

    // Snap to new lane
    beat.properties.x = beat.properties.x; // keep existing X

    await savePage(beat);
    closeEditModal();
    await loadTimelineData();
    renderBeats();
    drawConnections();
    updateMinimap();
    playClickSound();
    showToast('Beat saved!', 'success');
  });

  // Focus title
  setTimeout(() => modal.querySelector('#stc-edit-title')?.focus(), 60);
}

// ─── Actions ──────────────────────────────────────────────────────────────────
async function createNewBeat() {
  let maxX = 80;
  timelineState.beats.filter(b => b.properties.lane === 0).forEach(b => {
    if (b.properties.x > maxX) maxX = b.properties.x;
  });

  const styleId = timelineState.project?.settings?.style || 'story';
  const storySchemaId = styleId === 'story' ? 'story-chapters-schema' : undefined;
  const defaultStoryProps = styleId === 'story' ? {
    f1: 'Act I',
    f2: 'Draft',
    f3: 0,
    f4: '',
    f5: '',
    f6: ''
  } : {};

  const newBeat = {
    id: generateId(),
    projectId: timelineState.project.id,
    title: 'New Story Beat',
    content: 'Briefly describe this narrative beat…',
    isStoryBeat: true,
    schemaId: storySchemaId,
    properties: { lane: 0, x: maxX + 320, prerequisites: [], characters: [], ...defaultStoryProps }
  };

  await savePage(newBeat);
  timelineState.beats.push(newBeat);
  renderBeats();
  drawConnections();
  updateMinimap();
  playClickSound();
  showToast('Story beat created!', 'success');

  // Scroll to the new card
  const scroll = timelineState.boardScroll;
  if (scroll) {
    setTimeout(() => {
      scroll.scrollTo({ left: newBeat.properties.x, behavior: 'smooth' });
    }, 100);
  }
}

async function duplicateBeat(beat) {
  const dupe = {
    id: generateId(),
    projectId: timelineState.project.id,
    title: beat.title + ' (Copy)',
    content: beat.content,
    isStoryBeat: true,
    schemaId: beat.schemaId,
    properties: {
      lane: beat.properties.lane,
      x: beat.properties.x + 320,
      prerequisites: [...(beat.properties.prerequisites || [])],
      characters: [...(beat.properties.characters || [])],
      // Copy schema properties if they exist
      f1: beat.properties.f1 || 'Act I',
      f2: beat.properties.f2 || 'Draft',
      f3: beat.properties.f3 || 0,
      f4: beat.properties.f4 || '',
      f5: beat.properties.f5 || '',
      f6: beat.properties.f6 || ''
    }
  };
  await savePage(dupe);
  timelineState.beats.push(dupe);
  renderBeats();
  drawConnections();
  updateMinimap();
  playClickSound();
  showToast('Beat duplicated!', 'success');
}

async function deleteBeat(beat) {
  await deletePage(beat.id);
  timelineState.beats = timelineState.beats.filter(b => b.id !== beat.id);

  // Clean prereq references
  for (const other of timelineState.beats) {
    if ((other.properties.prerequisites || []).includes(beat.id)) {
      other.properties.prerequisites = other.properties.prerequisites.filter(id => id !== beat.id);
      await savePage(other);
    }
  }

  renderBeats();
  drawConnections();
  updateMinimap();
  playClickSound();
  showToast('Beat deleted.', 'info');
}

async function autoAlignBeats() {
  for (let l = 0; l < 3; l++) {
    const laneBeats = timelineState.beats
      .filter(b => b.properties.lane === l)
      .sort((a, b) => a.properties.x - b.properties.x);

    let curX = 80;
    for (const b of laneBeats) {
      b.properties.x = curX;
      await savePage(b);
      curX += CARD_W + 60;
    }
  }

  renderBeats();
  drawConnections();
  updateMinimap();
  playClickSound();
  showToast('Roadmap aligned!', 'success');
}
