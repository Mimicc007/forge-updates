/* ============================================================
   Forge — Continuity Monitor
   Passive background service that watches DB saves and uses
   Ignis to detect timeline, personality, and plot contradictions.

   AI scanning works with:
     - Google Gemini (if forge-gemini-key is set)
     - Local Ollama/Llama (if forge-ai-provider === 'ollama')
   
   If no AI is configured, lightweight rule-based heuristics
   run instead: orphaned pages, broken [[wiki links]], dead-end
   story beats.

   Fires CustomEvent 'forge-continuity-issues-found' when issues
   are detected so the sidebar can show a notification badge.
   ============================================================ */

import { getActiveProject, getPages, getSchemas, getAllTabs, getAllNodes } from './db.js';

// ─── State ──────────────────────────────────────────────────────────────────

let scanDebounceTimer = null;
let isScanning = false;
let lastScanHash = '';

const DEBOUNCE_MS = 15000; // wait 15s after last save before scanning
const STORAGE_KEY = 'forge-continuity-issues';
const RESOLVED_KEY = 'forge-continuity-resolved';
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // re-scan every 5 minutes

// ─── Public API ─────────────────────────────────────────────────────────────

export function initContinuityMonitor() {
  // Listen for DB saves
  if (window._continuityDbHandler) {
    window.removeEventListener('forge-db-updated', window._continuityDbHandler);
  }

  window._continuityDbHandler = (e) => {
    // Only trigger on page or schema saves — not canvas node saves (too frequent)
    if (e.detail && (e.detail.storeName === 'pages' || e.detail.storeName === 'schemas')) {
      scheduleScan();
    }
  };

  window.addEventListener('forge-db-updated', window._continuityDbHandler);

  // Run an initial scan after 8 seconds on boot (non-blocking)
  setTimeout(() => runContinuityScan(true), 8000);

  // Periodic re-scan every 5 minutes
  setInterval(() => runContinuityScan(true), SCAN_INTERVAL_MS);
}

export async function runContinuityScan(silent = true) {
  if (isScanning) return;

  // Only run in the active/visible window to prevent duplicate scans across multiple tabs/windows
  if (document.visibilityState === 'hidden') {
    return;
  }

  const continuityEnabled = localStorage.getItem('forge-continuity-enabled') !== 'false';
  if (!continuityEnabled) {
    // Clear out any old issues if disabled
    localStorage.removeItem('forge-continuity-issues');
    window.dispatchEvent(new CustomEvent('forge-continuity-cleared'));
    return;
  }

  const apiKey = localStorage.getItem('forge-gemini-key') || '';
  const aiProvider = localStorage.getItem('forge-ai-provider') || 'gemini';

  // Determine if an AI provider is available:
  //   - Gemini: needs an apiKey
  //   - Ollama/Llama: works locally, no key needed — askGemini() routes to it automatically
  const hasAI = (aiProvider === 'ollama') || (aiProvider === 'gemini' && !!apiKey);

  isScanning = true;

  try {
    const project = await getActiveProject();
    if (!project) { isScanning = false; return; }

    const pages = await getPages(project.id);
    const schemas = await getSchemas(project.id);

    // Build a quick hash to avoid redundant scans on unchanged data
    const contentHash = pages.map(p => p.id + (p.updatedAt || '')).join('|');
    const lastScanHash = localStorage.getItem('forge-continuity-last-scan-hash');
    if (contentHash === lastScanHash) {
      isScanning = false;
      return;
    }

    let issues = [];

    if (hasAI && pages.length >= 3) {
      // Full AI-powered scan (Gemini or Ollama/Llama)
      const worldContext = buildWorldContext(project, schemas, pages);
      issues = await performAiScan(worldContext, project, apiKey);
    } else {
      // Lightweight rule-based heuristics (no AI required)
      issues = performRuleBasedScan(pages);
    }

    // Always run static structural plot hole checks for story style preset
    const styleId = project.settings?.style || 'story';
    if (styleId === 'story') {
      try {
        const allNodes = await getAllNodes();
        const tabs = await getAllTabs();
        const plotHoles = checkPlotHoles(pages, schemas, tabs, allNodes);
        issues = issues.concat(plotHoles);
      } catch (err) {
        console.error('[ContinuityMonitor] Static plot hole check failed:', err);
      }
    }

    localStorage.setItem('forge-continuity-last-scan-hash', contentHash);

    // Record last scan time
    localStorage.setItem('forge-continuity-last-scan', new Date().toISOString());

    // Merge with existing resolved set — remove any issues that are already dismissed
    const resolved = getResolvedIssues();
    const resolvedKeys = new Set(resolved.map(i => i.type + '::' + i.description.slice(0, 60)));
    issues = issues.filter(i => !resolvedKeys.has(i.type + '::' + i.description.slice(0, 60)));

    // Detect genuinely new issues
    const existing = getContinuityIssues();
    const existingKeys = new Set(existing.map(i => i.type + '::' + i.description.slice(0, 60)));
    const newIssues = issues.filter(i => !existingKeys.has(i.type + '::' + i.description.slice(0, 60)));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));

    if (issues.length > 0) {
      window.dispatchEvent(new CustomEvent('forge-continuity-issues-found', {
        detail: { issues, newCount: newIssues.length }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('forge-continuity-cleared'));
    }

  } catch (err) {
    console.warn('[ContinuityMonitor] Scan failed:', err);
  } finally {
    isScanning = false;
  }
}

/** Force an immediate scan, bypassing debounce and content hash cache. */
export async function forceRescan() {
  localStorage.removeItem('forge-continuity-last-scan-hash'); // bust the cache
  if (scanDebounceTimer) {
    clearTimeout(scanDebounceTimer);
    scanDebounceTimer = null;
  }
  await runContinuityScan(false);
}

export function getContinuityIssues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getResolvedIssues() {
  try {
    const raw = localStorage.getItem(RESOLVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Move an active issue to the resolved/dismissed list. */
export function dismissIssue(issueId) {
  const active = getContinuityIssues();
  const resolved = getResolvedIssues();

  const idx = active.findIndex(i => i.id === issueId);
  if (idx === -1) return;

  const [issue] = active.splice(idx, 1);
  issue.resolvedAt = new Date().toISOString();
  resolved.unshift(issue);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved));

  if (active.length > 0) {
    window.dispatchEvent(new CustomEvent('forge-continuity-issues-found', {
      detail: { issues: active, newCount: 0 }
    }));
  } else {
    window.dispatchEvent(new CustomEvent('forge-continuity-cleared'));
  }
}

/** Move a resolved issue back to the active list. */
export function restoreIssue(issueId) {
  const active = getContinuityIssues();
  const resolved = getResolvedIssues();

  const idx = resolved.findIndex(i => i.id === issueId);
  if (idx === -1) return;

  const [issue] = resolved.splice(idx, 1);
  delete issue.resolvedAt;
  active.unshift(issue);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  localStorage.setItem(RESOLVED_KEY, JSON.stringify(resolved));

  window.dispatchEvent(new CustomEvent('forge-continuity-issues-found', {
    detail: { issues: active, newCount: 1 }
  }));
}

export function clearContinuityIssues() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('forge-continuity-cleared'));
}

// ─── Internal ────────────────────────────────────────────────────────────────

function scheduleScan() {
  if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    runContinuityScan(true);
  }, DEBOUNCE_MS);
}

function buildWorldContext(project, schemas, pages) {
  const schemaNames = schemas.map(s => s.name).join(', ');
  const pagesSample = pages.slice(0, 30);

  const pagesText = pagesSample.map(p => {
    let excerpt = '';
    if (p.content) {
      try {
        const delta = JSON.parse(p.content);
        if (delta && Array.isArray(delta.ops)) {
          excerpt = delta.ops
            .filter(op => typeof op.insert === 'string')
            .map(op => op.insert)
            .join('')
            .slice(0, 300);
        }
      } catch {
        excerpt = String(p.content).slice(0, 300);
      }
    }

    const props = p.properties ? Object.entries(p.properties)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `  ${k}: ${String(v).slice(0, 80)}`)
      .join('\n') : '';

    return `--- ${p.title || 'Untitled'} [ID: ${p.id}] ---\n${props ? props + '\n' : ''}${excerpt ? 'Content: ' + excerpt : ''}`;
  }).join('\n\n');

  return `Project: "${project.name}" (Genre: ${project.settings?.genre || 'Unknown'})
Databases: ${schemaNames}
Total entries: ${pages.length}

ENTRIES:
${pagesText}`;
}

// ─── AI Scan (Gemini or Ollama/Llama) ────────────────────────────────────────

async function performAiScan(worldContext, project, apiKey) {
  const { askGemini } = await import('./ai.js');
  const { getStyleConfig } = await import('./styleConfig.js');

  const styleId = project.settings?.style || 'story';
  const styleConf = getStyleConfig(styleId);
  const rules = styleConf.getContinuityRules();

  const rulesDescription = rules.map((r, i) => `${i + 1}. ${r.type}: ${r.label}`).join('\n');
  const allowedTypes = rules.map(r => r.type).join(', ');

  const scanPrompt = `You are a continuity editor analyzing a project called "${project.name}".

Carefully read all the entries below and identify any of the following issues:
${rulesDescription}

Return ONLY a valid JSON array. No markdown, no explanation, just raw JSON.
If no issues are found, return exactly: []

Each issue object must have:
- "type": one of the allowed types: ${allowedTypes}
- "severity": "high" | "medium" | "low"  
- "description": a clear, specific 1-2 sentence description of the issue
- "pageIds": array of relevant page ID strings (from the [ID: ...] tags in the entries)
- "suggestion": a brief 1-sentence suggestion on how to resolve it

Entries to analyze:
${worldContext}`;

  const response = await askGemini(scanPrompt, [], apiKey, {
    name: project.name,
    genre: project.settings?.genre || '',
    schemas: '',
    pages: '',
    canvases: '',
    activeCanvas: ''
  });

  let cleaned = response.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) return [];

  const jsonStr = cleaned.slice(arrayStart, arrayEnd + 1);
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(issue =>
    issue &&
    typeof issue.type === 'string' &&
    typeof issue.description === 'string' &&
    Array.isArray(issue.pageIds)
  ).map(issue => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: issue.type || 'UNKNOWN',
    severity: issue.severity || 'medium',
    description: issue.description || '',
    pageIds: issue.pageIds || [],
    suggestion: issue.suggestion || '',
    detectedAt: new Date().toISOString()
  }));
}

// ─── Rule-based Heuristics (no AI required) ──────────────────────────────────

function performRuleBasedScan(pages) {
  const issues = [];
  const now = new Date().toISOString();

  // Build a title→id lookup map
  const titleMap = new Map(pages.map(p => [
    (p.title || '').toLowerCase().trim(),
    p.id
  ]));

  // Build a set of all page IDs referenced in any other page's content
  const referencedIds = new Set();
  const referencedTitles = new Set();

  pages.forEach(p => {
    let text = '';
    if (p.content) {
      try {
        const delta = JSON.parse(p.content);
        if (delta && Array.isArray(delta.ops)) {
          text = delta.ops.filter(op => typeof op.insert === 'string').map(op => op.insert).join('');
        }
      } catch {
        text = String(p.content);
      }
    }

    // Check for [[wiki-style links]] in content
    const wikiLinks = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].toLowerCase().trim());
    wikiLinks.forEach(linked => {
      referencedTitles.add(linked);
      const targetId = titleMap.get(linked);
      if (targetId) {
        referencedIds.add(targetId);
      } else {
        // Broken link
        issues.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + 'bl',
          type: 'BROKEN_LINK',
          severity: 'medium',
          description: `A [[${linked}]] link in "${p.title || 'Untitled'}" references a page that doesn't exist.`,
          pageIds: [p.id],
          suggestion: `Create a page titled "${linked}" or fix the link name.`,
          detectedAt: now
        });
      }
    });

    // Also count any inline page references (for the orphan check)
    if (p.linkedPageIds && Array.isArray(p.linkedPageIds)) {
      p.linkedPageIds.forEach(id => referencedIds.add(id));
    }
  });

  // Orphaned pages: exist but are never linked from anywhere
  pages.forEach(p => {
    // Skip story beats and system pages
    if (p.isStoryBeat || p.schemaId === 'story-chapters-schema') return;
    if (!p.title || p.title.trim() === '') return;

    const titleLower = (p.title || '').toLowerCase().trim();
    const isReferenced = referencedIds.has(p.id) || referencedTitles.has(titleLower);

    if (!isReferenced) {
      issues.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + 'op',
        type: 'ORPHANED_PAGE',
        severity: 'low',
        description: `"${p.title}" exists but is never referenced by any other entry.`,
        pageIds: [p.id],
        suggestion: 'Link to this entry from a related page, or consider merging it.',
        detectedAt: now
      });
    }
  });

  // Dead-end story beats: beats with no successors (no other beat lists this as a prerequisite)
  const beats = pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema');
  if (beats.length > 1) {
    const beatIdsUsedAsPrereqs = new Set(
      beats.flatMap(b => b.properties?.prerequisites || [])
    );
    beats.forEach(beat => {
      if (!beatIdsUsedAsPrereqs.has(beat.id)) {
        // This beat has no successor — it's a dead end (but only flag if it's not the last beat in the story)
        const hasPrereqs = (beat.properties?.prerequisites || []).length > 0;
        if (hasPrereqs) {
          // Only flag if it has predecessors (meaning it's mid-story, not just an endpoint)
          issues.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + 'db',
            type: 'DEAD_END_BEAT',
            severity: 'low',
            description: `Story beat "${beat.title || 'Untitled'}" has predecessors but no successor — it may be an unresolved thread.`,
            pageIds: [beat.id],
            suggestion: 'Connect this beat to a following story beat, or mark it as an ending.',
            detectedAt: now
          });
        }
      }
    });
  }

  return issues;
}

function checkPlotHoles(pages, schemas, tabs, allNodes) {
  const issues = [];
  const now = new Date().toISOString();
  const generateIssueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. TIMELINE PRE-REQUISITE ORDER CONFLICT
  const beats = pages.filter(p => p.isStoryBeat === true || p.schemaId === 'story-chapters-schema').sort((a, b) => (a.properties?.x || 0) - (b.properties?.x || 0));
  const beatIndexMap = new Map();
  beats.forEach((b, idx) => beatIndexMap.set(b.id, idx));

  beats.forEach((beat, idx) => {
    const prereqs = beat.properties?.prerequisites || [];
    prereqs.forEach(preId => {
      const preIdx = beatIndexMap.get(preId);
      if (preIdx !== undefined && preIdx >= idx) {
        const preBeat = beats[preIdx];
        issues.push({
          id: generateIssueId() + 'pr',
          type: 'BROKEN_PREREQ',
          severity: 'high',
          description: `Timeline Prerequisite Conflict: "${beat.title || 'Untitled'}" requires "${preBeat.title || 'Untitled'}" to happen first, but "${preBeat.title || 'Untitled'}" is placed after it on the timeline.`,
          pageIds: [beat.id, preId],
          suggestion: `Rearrange the beats on the roadmap timeline so "${preBeat.title || 'Untitled'}" comes before "${beat.title || 'Untitled'}", or remove the prerequisite.`,
          detectedAt: now
        });
      }
    });
  });

  // 2. UNRESOLVED SETUP NODE
  const setupNodes = allNodes.filter(n => n.type === 'setup');
  const payoffNodes = allNodes.filter(n => n.type === 'payoff');

  // Build connection lookups
  const nodeConnections = new Map();
  tabs.forEach(t => {
    const conns = t.connections || [];
    conns.forEach(c => {
      if (!nodeConnections.has(c.sourceId)) nodeConnections.set(c.sourceId, []);
      if (!nodeConnections.has(c.targetId)) nodeConnections.set(c.targetId, []);
      nodeConnections.get(c.sourceId).push(c.targetId);
      nodeConnections.get(c.targetId).push(c.sourceId);
    });
  });

  const tabBeatMap = new Map();
  tabs.forEach(t => { if (t.beatId) tabBeatMap.set(t.id, t.beatId); });

  setupNodes.forEach(setup => {
    let resolvedPayoffId = setup.content?.payoffNodeId || '';
    if (!resolvedPayoffId) {
      const connectedNodeIds = nodeConnections.get(setup.id) || [];
      const connectedPayoff = payoffNodes.find(p => connectedNodeIds.includes(p.id));
      if (connectedPayoff) {
        resolvedPayoffId = connectedPayoff.id;
      }
    }

    const hasPayoff = payoffNodes.some(p => p.id === resolvedPayoffId);
    if (!hasPayoff) {
      const beatId = tabBeatMap.get(setup.tabId);
      const beat = pages.find(p => p.id === beatId);
      const hostName = beat ? `"${beat.title}"` : 'a canvas tab';

      issues.push({
        id: generateIssueId() + 'us',
        type: 'DEAD_END_THREAD',
        severity: 'medium',
        description: `Unresolved Setup: "${setup.title || 'Setup Node'}" (type: ${setup.content?.setupType || 'Plant'}) in ${hostName} has no linked payoff or resolution.`,
        pageIds: beatId ? [beatId] : [],
        suggestion: `Link this setup to a Payoff Node on a canvas, or create a Payoff Node and draw a connection line to resolve the narrative question.`,
        detectedAt: now
      });
    }
  });

  // 3. EMPTY CHARACTER PROFILE MOTIVATION
  const characters = pages.filter(p => p.schemaId === 'story-chars-schema');
  characters.forEach(char => {
    const content = char.content || '';
    let plainText = content;
    if (content.startsWith('{')) {
      try {
        const delta = JSON.parse(content);
        if (delta.ops) {
          plainText = delta.ops.filter(op => typeof op.insert === 'string').map(op => op.insert).join('');
        }
      } catch (_) {}
    }
    const cleanText = plainText.replace(/\s+/g, ' ').trim();
    
    const motivationsProp = char.properties?.motivations || '';
    const hasMotivationText = motivationsProp.trim().length > 10 || cleanText.length > 30;

    if (!hasMotivationText) {
      issues.push({
        id: generateIssueId() + 'em',
        type: 'EMPTY_MOTIVATION',
        severity: 'low',
        description: `Empty Motivation: The character profile for "${char.title || 'Untitled'}" is missing motivations, goals, or backstory details.`,
        pageIds: [char.id],
        suggestion: `Open "${char.title || 'Untitled'}" and write motivations and backstory details to flesh out the character's narrative arc.`,
        detectedAt: now
      });
    }
  });

  // 4. ACT II CHARACTER ABSENCE GAP
  const act1Beats = beats.filter(b => b.properties?.f1 === 'Act I');
  const act2Beats = beats.filter(b => typeof b.properties?.f1 === 'string' && b.properties.f1.startsWith('Act II'));
  const act3Beats = beats.filter(b => b.properties?.f1 === 'Act III');

  const charActPresence = new Map();
  characters.forEach(c => charActPresence.set(c.id, { act1: false, act2: false, act3: false }));

  const checkPresenceInBeats = (beatList, actKey) => {
    beatList.forEach(beat => {
      const roadmapChars = beat.properties?.characters || [];
      roadmapChars.forEach(cid => {
        if (charActPresence.has(cid)) charActPresence.get(cid)[actKey] = true;
      });

      const tab = tabs.find(t => t.beatId === beat.id);
      if (tab) {
        const nodes = allNodes.filter(n => n.tabId === tab.id);
        nodes.forEach(n => {
          if ((n.type === 'pagelink' || n.type === 'statblock') && n.content?.pageId) {
            const cid = n.content.pageId;
            if (charActPresence.has(cid)) charActPresence.get(cid)[actKey] = true;
          }
        });
      }
    });
  };

  checkPresenceInBeats(act1Beats, 'act1');
  checkPresenceInBeats(act2Beats, 'act2');
  checkPresenceInBeats(act3Beats, 'act3');

  charActPresence.forEach((presence, cid) => {
    if (presence.act1 && presence.act3 && !presence.act2) {
      const char = characters.find(c => c.id === cid);
      if (char) {
        issues.push({
          id: generateIssueId() + 'ag',
          type: 'ABSENCE_GAP',
          severity: 'medium',
          description: `Act II Absence Gap: Character "${char.title || 'Untitled'}" is active in Act I and Act III, but completely absent from all Act II beats.`,
          pageIds: [char.id],
          suggestion: `Add "${char.title || 'Untitled'}" to one or more Act II chapters, or explain their absence in the lore.`,
          detectedAt: now
        });
      }
    }
  });

  // 5. CHARACTER ACTIVE IN TWO SIMULTANEOUS BEATS
  const xGroups = new Map();
  beats.forEach(beat => {
    const x = beat.properties?.x || 0;
    if (!xGroups.has(x)) xGroups.set(x, []);
    xGroups.get(x).push(beat);
  });

  xGroups.forEach((groupBeats, x) => {
    if (groupBeats.length <= 1) return;

    const charActiveBeats = new Map();
    groupBeats.forEach(beat => {
      const activeChars = new Set();
      
      const roadmapChars = beat.properties?.characters || [];
      roadmapChars.forEach(cid => activeChars.add(cid));

      const tab = tabs.find(t => t.beatId === beat.id);
      if (tab) {
        const nodes = allNodes.filter(n => n.tabId === tab.id);
        nodes.forEach(n => {
          if ((n.type === 'pagelink' || n.type === 'statblock') && n.content?.pageId) {
            activeChars.add(n.content.pageId);
          }
        });
      }

      activeChars.forEach(cid => {
        if (!charActiveBeats.has(cid)) charActiveBeats.set(cid, []);
        charActiveBeats.get(cid).push(beat);
      });
    });

    charActiveBeats.forEach((activeList, cid) => {
      if (activeList.length >= 2) {
        const char = characters.find(c => c.id === cid);
        if (char) {
          const beatNames = activeList.map(b => `"${b.title || 'Untitled'}"`).join(' and ');
          issues.push({
            id: generateIssueId() + 'sb',
            type: 'SIMULTANEOUS_BEAT',
            severity: 'high',
            description: `Simultaneous Appearance: "${char.title || 'Untitled'}" is active in two parallel story beats occurring at the same time: ${beatNames}.`,
            pageIds: [char.id, ...activeList.map(b => b.id)],
            suggestion: `Remove "${char.title || 'Untitled'}" from one of the parallel beats, or adjust timeline positions so they do not occur simultaneously.`,
            detectedAt: now
          });
        }
      }
    });
  });

  return issues;
}
