/* ============================================================
   Forge — AI Companion (Ignis)
   Provides a global sliding partner drawer, context gathering,
   and Gemini API integration.
   ============================================================ */import * as db from './db.js';
import { refreshIcons } from './icons.js';
import { showToast, checkOllamaRunning, showOllamaInstallPrompt } from './ui.js';
import { getStyleConfig } from './styleConfig.js';

let drawerEl = null;
let isOpen = false;

// ─── Styles Injection ────────────────────────────────────────────────────────

function injectStyles() {
  const styleId = 'ignis-ai-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.innerHTML = `
    #ai-drawer {
      position: fixed;
      top: 0;
      right: -400px;
      width: 380px;
      height: 100vh;
      background: rgba(10, 8, 18, 0.88);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-left: 1px solid rgba(229, 169, 59, 0.15);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.6);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      transition: right 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
      color: var(--text-primary);
    }
    #ai-drawer.open {
      right: 0;
    }
    .ai-drawer-header {
      padding: var(--sp-4) var(--sp-5);
      border-bottom: 1px solid rgba(229, 169, 59, 0.15);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(229, 169, 59, 0.02);
    }
    .ai-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--sp-5);
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      scrollbar-width: thin;
      scrollbar-color: rgba(229, 169, 59, 0.2) transparent;
    }
    .ai-message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 85%;
      animation: msgFadeIn 0.25s ease-out;
    }
    .ai-message.user {
      align-self: flex-end;
    }
    .ai-message.ignis {
      align-self: flex-start;
    }
    .ai-bubble {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    .ai-message.user .ai-bubble {
      background: rgba(56, 189, 248, 0.06);
      border: 1px solid rgba(56, 189, 248, 0.15);
      color: #e2e8f0;
      border-bottom-right-radius: 2px;
    }
    .ai-message.ignis .ai-bubble {
      background: rgba(229, 169, 59, 0.04);
      border: 1px solid rgba(229, 169, 59, 0.15);
      color: #f1f5f9;
      border-bottom-left-radius: 2px;
    }
    .ai-sender {
      font-family: var(--font-hud);
      font-size: 0.68rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .ai-message.user .ai-sender {
      color: var(--accent-cyan);
      text-align: right;
    }
    .ai-message.ignis .ai-sender {
      color: var(--accent-primary);
    }
    .ai-drawer-footer {
      padding: var(--sp-4);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(0, 0, 0, 0.2);
    }
    .ai-input-container {
      display: flex;
      gap: 8px;
    }
    .ai-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 10px 12px;
      color: #fff;
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .ai-input:focus {
      border-color: var(--accent-primary);
    }
    .ai-send-btn {
      background: var(--accent-primary);
      border: none;
      color: #000;
      padding: 0 var(--sp-4);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }
    .ai-send-btn:hover {
      opacity: 0.9;
    }
    .ai-paragraph {
      margin: 0 0 8px 0;
    }
    .ai-paragraph:last-child {
      margin-bottom: 0;
    }
    .ai-code-block {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      overflow-x: auto;
      margin: 8px 0;
      color: #38bdf8;
    }
    .ai-inline-code {
      background: rgba(255, 255, 255, 0.08);
      color: var(--accent-primary);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.78rem;
    }
    .ai-list {
      margin: 8px 0;
      padding-left: 20px;
    }
    .ai-list li {
      margin-bottom: 4px;
    }
    .ai-banner {
      background: rgba(229, 169, 59, 0.08);
      border: 1px dashed rgba(229, 169, 59, 0.25);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.72rem;
      color: var(--accent-primary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ai-banner a {
      color: #38bdf8;
      text-decoration: underline;
      cursor: pointer;
    }
    .ai-chip-container {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .ai-chip {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.7rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ai-chip:hover {
      background: rgba(229, 169, 59, 0.08);
      border-color: rgba(229, 169, 59, 0.2);
      color: var(--accent-primary);
    }
    @keyframes msgFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Markdown Parser ─────────────────────────────────────────────────────────

export function parseMarkdown(text) {
  if (!text) return '';
  let html = text;

  // Escape HTML tags to prevent code execution
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced Code Blocks
  html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$1</code></pre>');

  // Inline Code
  html = html.replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered Lists
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  // Wrap list items
  html = html.replace(/((?:<li>.+<\/li>\s*)+)/g, '<ul class="ai-list">$1</ul>');

  // Paragraph separator (two linebreaks)
  html = html.split('\n\n').map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<pre') || trimmed.startsWith('<ul')) return trimmed;
    return `<p class="ai-paragraph">${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// ─── Context Compiler ────────────────────────────────────────────────────────

export async function getProjectContext() {
  const project = await db.getActiveProject();
  if (!project) return null;

  const schemas = await db.getSchemas(project.id);
  const pages = await db.getPages(project.id);
  const tabs = await db.getAllTabs();

  // Database structure
  const schemasText = schemas.map(s => {
    const fieldsText = s.fields.map(f => `  - ${f.name} (type: ${f.type}${f.options ? ', options: ' + f.options.join('/') : ''})`).join('\n');
    return `Database Name: "${s.name}"\nFields:\n${fieldsText}`;
  }).join('\n\n') || 'None configured yet.';

  // Universe lore/entries (Recent 25 items for context efficiency)
  const pagesText = pages.map(p => {
    const props = Object.entries(p.properties || {})
      .map(([k, v]) => `  - ${k}: ${v}`).join('\n');
    const contentText = typeof p.content === 'string'
      ? p.content.slice(0, 200)
      : JSON.stringify(p.content).slice(0, 200);
    return `Entry ID: "${p.id}"\nTitle: "${p.title || 'Untitled'}" (Type/Database: ${p.schemaId ? 'Linked to Database' : 'Freeform Story Note'})\nProperties:\n${props || '  None'}\nExcerpt: ${contentText}`;
  }).slice(0, 25).join('\n\n') || 'None created yet.';

  // Canvases
  const canvasesText = tabs.map(t => `  - Canvas Board: "${t.name}"`).join('\n') || '  None created yet.';

  // Active Canvas nodes
  const hash = window.location.hash;
  const match = hash.match(/#\/workspace\/([a-zA-Z0-9-]+)/);
  const activeTabId = match ? match[1] : null;
  let activeCanvasText = 'None active currently.';
  if (activeTabId) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
      const activeNodes = await db.getNodesForTab(activeTabId);
      const nodeSummary = activeNodes.map(n => `    - Node Title: "${n.title}" (Type: ${n.type})`).join('\n');
      activeCanvasText = `Active Canvas Board: "${activeTab.name}"\n  Nodes on this canvas:\n${nodeSummary || '    (No nodes on this canvas yet)'}`;
    }
  }

  return {
    name: project.name,
    genre: project.settings?.genre || 'creative universe',
    schemas: schemasText,
    pages: pagesText,
    canvases: canvasesText,
    activeCanvas: activeCanvasText
  };
}

// ─── API Integration ─────────────────────────────────────────────────────────

// Helper to check if an error is non-fallbackable (like API key issues, billing, region limits, or complete network failure)
function shouldAbortFallback(err, status) {
  const msg = (err.message || '').toLowerCase();
  // Auth/Key errors
  if (status === 401 || status === 403) return true;
  if (msg.includes('api key') || msg.includes('api_key') || msg.includes('key not valid') || msg.includes('invalid key') || msg.includes('invalid api key')) return true;
  // Location/Region errors
  if (msg.includes('location') || msg.includes('supported in your country') || msg.includes('unsupported region') || msg.includes('not supported in your region')) return true;
  // Network/Connection errors - no point in trying other models if network is down
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('dns') || msg.includes('timeout')) return true;
  
  return false;
}

function cleanActionJson(str) {
  let clean = str.trim();
  // Strip markdown code fences
  clean = clean.replace(/^```(?:json)?\n?/i, '');
  clean = clean.replace(/\n?```$/i, '');
  // Strip JS-style single-line comments (// ...) — Llama often outputs these inside JSON
  clean = clean.replace(/\/\/[^\n]*/g, '');
  // Strip JS-style multi-line block comments (/* ... */)
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip trailing commas before } or ] (another Llama quirk)
  clean = clean.replace(/,\s*([}\]])/g, '$1');
  return clean.trim();
}

export function normalizeActionName(action) {
  if (!action) return '';
  const a = String(action).toLowerCase().trim();
  
  // Exact matches first
  if (a === 'spawn_nodes' || a === 'spawn_node' || a === 'spawn') return 'spawn_nodes';
  if (a === 'link_nodes' || a === 'link_node' || a === 'link' || a === 'connect') return 'link_nodes';
  if (a === 'unlink_nodes' || a === 'unlink_node' || a === 'unlink' || a === 'disconnect') return 'unlink_nodes';
  if (a === 'destroy_nodes' || a === 'destroy_node' || a === 'delete' || a === 'destroy' || a === 'remove') return 'destroy_nodes';
  if (a === 'rearrange_nodes' || a === 'rearrange_node' || a === 'rearrange' || a === 'layout') return 'rearrange_nodes';
  if (a === 'focus_node' || a === 'focus') return 'focus_node';

  // Substring checks
  if (a.includes('rearrange') || a.includes('layout')) {
    return 'rearrange_nodes';
  }
  
  // Unlink/disconnect
  if (a.includes('unlink') || a.includes('disconnect') || a.includes('sever') || a.includes('remove_link') || a.includes('remove_connections') || a.includes('detach')) {
    return 'unlink_nodes';
  }
  
  // Spawn/create nodes should check spawn specifically
  if (a.includes('spawn') || a === 'create_node' || a === 'create_nodes' || a === 'add_node' || a === 'add_nodes' || a.includes('new_node') || a.includes('insert_node')) {
    return 'spawn_nodes';
  }
  
  // Destroy/delete
  if (a.includes('destroy') || a.includes('delete') || a.includes('remove') || a.includes('clear') || a === 'del') {
    // Make sure we didn't mean unlink
    if (a.includes('link') || a.includes('connection')) return 'unlink_nodes';
    return 'destroy_nodes';
  }
  
  // Link/connect
  if (a.includes('link') || a.includes('connect') || a.includes('add_link') || a.includes('create_link') || a.includes('wire')) {
    // If it contains "create" and "node", it's probably spawn
    if (a.includes('create') && (a.includes('node') || a.includes('card'))) return 'spawn_nodes';
    return 'link_nodes';
  }
  
  // Fallback for spawn-like verbs
  if (a.includes('create') || a.includes('add') || a.includes('insert')) {
    return 'spawn_nodes';
  }
  
  if (a.includes('focus') || a.includes('center') || a.includes('pan_to') || a.includes('zoom_to') || a.includes('look_at') || a.includes('go_to')) {
    return 'focus_node';
  }
  
  return action;
}

// Helper to call Gemini with retry logic and fallback models
async function fetchWithRetryAndFallback(payload, apiKey) {
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    console.log(`Attempting Gemini request with model: ${model}`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (resp.status === 503 || resp.status === 429 || resp.status >= 500) {
          if (resp.status === 429 && attempt > 1) {
            console.warn(`Gemini API returned status 429 on retry for model ${model}. Trying next model...`);
            lastError = new Error(`Model ${model} rate limited (429)`);
            lastError.status = 429;
            break; // Break the attempt loop to try the next model
          }
          const delay = attempt * 1000;
          console.warn(`Gemini API returned status ${resp.status} on attempt ${attempt} for model ${model}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({}));
          const errMsg = errorBody.error?.message || `HTTP error ${resp.status}`;
          const httpErr = new Error(errMsg);
          httpErr.status = resp.status;
          throw httpErr;
        }

        const result = await resp.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No content returned from Gemini.');
        
        console.log(`Gemini request succeeded with model: ${model}`);
        return text;
      } catch (err) {
        lastError = err;
        console.error(`Attempt ${attempt} for model ${model} failed:`, err.message);
        
        if (shouldAbortFallback(err, err.status)) {
          throw err; // Exit both loops immediately
        }
        
        // If it's a model not found / not supported error, we want to try the next model immediately.
        // Google returns 404 for model not found, or 400 for some unsupported models.
        const isModelError = err.status === 404 || err.message.includes('not found') || err.message.includes('not supported') || err.message.includes('ModelService.ListModels');
        if (isModelError) {
          break; // Break the attempt loop to try the next model
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError || new Error('All model attempts failed');
}

async function askOllama(prompt, history, model, baseUrl, context) {
  const personality = localStorage.getItem('forge-companion-personality') || 'sage';
  const personalityPrompts = {
    sage: 'Creative Sage (thematic, poetic, deep narrative design and metaphors)',
    strategist: 'Analytical Strategist (system mechanics, numbers, gameplay loops, and balancing)',
    historian: 'Lore Historian (narrative consistency, historical progression, world history, and lineage)',
    director: 'Action Director (visceral mechanics, combo triggers, combat flow, and player agency)'
  };

  const customInstructions = localStorage.getItem('forge-companion-instructions') || '';
  const customInstructionsPrompt = customInstructions 
    ? `\n\n= USER CUSTOM INSTRUCTIONS & TONE DIRECTIVES =\nFollow these behavioral instructions and formatting directives strictly:\n${customInstructions}`
    : '';

  const systemInstruction = `You are Ignis, a brilliant creative partner and AI companion for a game developer working on their project bible.
The project is named "${context.name}" and the genre/theme is "${context.genre}".
Your chosen advisory persona is: ${personalityPrompts[personality] || personalityPrompts.sage}.

Here is the current state of their project to help you write highly custom responses:

= SCHEMAS & DATABASES =
${context.schemas}

= RECENT ENTITIES & LORE PAGES =
${context.pages}

= CANVASES & VISUAL BOARDS =
${context.canvases}

= ACTIVE CANVAS =
${context.activeCanvas}

Write responses that directly reference the user's specific characters, places, weapons, and database fields when relevant. Give highly tailored mechanics, design ideas, and narrative prompts.

= SPECIAL AGENTIC TOOL: CANVAS CREATION, CONNECTION & MANIPULATION =
If the user asks you to create/connect database items on a canvas, rearrange nodes, delete/unlink nodes, or focus the view on a node, you MUST output a special action JSON block at the very end of your response, wrapped inside a <forge-action> XML tag.

Example XML tag outputs:

1. Create a canvas with connection nodes:
<forge-action>
{
  "action": "create_canvas_with_connections",
  "canvasName": "A descriptive name for the canvas board",
  "nodes": [
    {
      "type": "statblock",
      "title": "Character: Kaelen",
      "x": 100,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Kaelen" },
          { "key": "Class", "value": "Mage" }
        ]
      }
    },
    {
      "type": "statblock",
      "title": "Weapon: Stormbringer",
      "x": 600,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Stormbringer" }
        ]
      }
    }
  ],
  "connections": [
    {
      "sourceIndex": 0,
      "targetIndex": 1,
      "label": "Wields"
    }
  ]
}
</forge-action>

2. Rearrange nodes on active canvas (options: "grid", "row", "column", "circle"):
<forge-action>
{
  "action": "rearrange_nodes",
  "layout": "circle",
  "nodeTitles": ["Kaelen", "Stormbringer"] // optional array of titles to rearrange. If omitted, rearranges all nodes on active canvas.
}
</forge-action>

3. Destroy/delete nodes:
<forge-action>
{
  "action": "destroy_nodes",
  "nodeTitles": ["Kaelen", "Stormbringer"]
}
</forge-action>

4. Unlink/disconnect connections between nodes:
- To unlink specific nodes:
<forge-action>
{
  "action": "unlink_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer" }
  ]
}
</forge-action>
- To unlink all connections for specific node(s):
<forge-action>
{
  "action": "unlink_nodes",
  "nodeTitles": ["Kaelen"]
}
</forge-action>
- To unlink ALL connections on the active canvas:
<forge-action>
{
  "action": "unlink_nodes",
  "links": [],
  "unlinkAll": true
}
</forge-action>

5. Link/connect existing nodes on the active canvas:
<forge-action>
{
  "action": "link_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer", "label": "Wields" }
  ]
}
</forge-action>

6. Shift/Focus viewport camera to a specific node:
<forge-action>
{
  "action": "focus_node",
  "nodeTitle": "Kaelen"
}
</forge-action>

7. Spawn new cards/nodes on the active canvas (type options: "richtext", "pagelink", "statblock", "ability", "timeline", "quote", "moodboard", "image"):
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "pagelink",
      "title": "Jeff",
      "content": { "pageId": "page-id-uuid-here" }, // Use pageId from context databases to link existing pages
      "x": 100,
      "y": 100,
      "width": 340,
      "height": 220
    },
    {
      "type": "richtext",
      "title": "Combat System Notes",
      "content": { "delta": "<p>Standard quick slash. Restores 5 focus on hit.</p>" },
      "x": 500,
      "y": 100,
      "width": 300,
      "height": 180
    }
  ],
  "connections": [
    { "sourceIndex": 0, "targetIndex": 1, "label": "Combatant" }
  ]
}
</forge-action>

8. Link existing nodes (e.g. "Sunny" and "Phantom") via a new intermediate node (e.g. "Main characters") by spawning the new node and connecting it to the existing nodes:
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "richtext",
      "title": "Main characters",
      "content": { "delta": "<p>A group of key players in the narrative.</p>" },
      "x": 350,
      "y": 0,
      "width": 300,
      "height": 180
    }
  ],
  "connections": [
    { "sourceTitle": "Sunny", "targetTitle": "Main characters", "label": "Member" },
    { "sourceTitle": "Phantom", "targetTitle": "Main characters", "label": "Member" }
  ]
}
</forge-action>

CRITICAL INSTRUCTIONS:
1. ONLY return a <forge-action> block if the user explicitly asks you to perform one of these canvas operations.
2. Read the project databases listed in context carefully. If the user asks to connect or focus items but you do not find them or the details are extremely scarce, DO NOT output the XML action block. Prompt them for details.
3. Make sure to space the nodes out on the canvas using distinct X and Y coordinates (e.g. place node 1 at X=100 Y=100, node 2 at X=600 Y=100) so they do not overlap.
4. Ensure the JSON inside <forge-action> is perfectly valid. Do not put markdown code fences inside the <forge-action> block.
5. YOU HAVE REAL POWER: You are equipped with a backend engine that executes your canvas actions. You can create canvases, connect, rearrange, focus, link, and delete nodes on the user's active workspace. NEVER tell the user that you are "just a text-based AI" or that you "cannot modify the canvas". Perform the action by outputting the <forge-action> block.

Do not output meta-fluff like "Here is the response". Just reply directly as Ignis. Use clean, beautiful, and highly concise markdown. Keep paragraphs short and digestible. IMPORTANT: To optimize response speed, be direct, precise, and avoid long-winded setup or recap explanations unless specifically requested.${customInstructionsPrompt}`;

  const messages = [{ role: 'system', content: systemInstruction }];
  
  history.forEach(m => {
    if (m.sender === 'You') {
      messages.push({ role: 'user', content: m.text });
    } else if (m.sender === 'Ignis' && !m.isIntro) {
      messages.push({ role: 'assistant', content: m.text });
    }
  });
  
  messages.push({ role: 'user', content: prompt });

  const url = `${baseUrl}/api/chat`;
  console.log(`Connecting to local Ollama at ${url} using model ${model}`);
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    })
  });

  if (!resp.ok) {
    throw new Error(`Ollama HTTP error ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.message?.content;
  if (!text) throw new Error('No content returned from local Ollama.');
  return text;
}

export async function executeForgeAction(actionData) {
  if (!actionData) return '';
  
  if (actionData.action === 'create_canvas_with_connections') {
    // Execute action
    const newTab = await db.saveTab({
      name: actionData.canvasName || 'AI Generated Connections',
      icon: actionData.canvasIcon || 'layout-dashboard'
    });

    const nodeIds = [];
    for (const node of actionData.nodes) {
      const generatedId = db.generateId();
      nodeIds.push(generatedId);
      await db.saveNode({
        id: generatedId,
        tabId: newTab.id,
        type: node.type,
        title: node.title || 'Node',
        content: node.content || {},
        x: node.x || 100,
        y: node.y || 100,
        width: node.width || 300,
        height: node.height || 200,
        zIndex: node.zIndex || 1
      });
    }

    // Parse and map connections if provided
    const connections = [];
    if (actionData.connections && Array.isArray(actionData.connections)) {
      actionData.connections.forEach(conn => {
        let sourceId = null;
        let targetId = null;

        if (typeof conn.sourceIndex === 'number') {
          sourceId = nodeIds[conn.sourceIndex];
        } else if (conn.sourceTitle) {
          const idx = actionData.nodes.findIndex(n => n.title === conn.sourceTitle);
          if (idx !== -1) sourceId = nodeIds[idx];
        }

        if (typeof conn.targetIndex === 'number') {
          targetId = nodeIds[conn.targetIndex];
        } else if (conn.targetTitle) {
          const idx = actionData.nodes.findIndex(n => n.title === conn.targetTitle);
          if (idx !== -1) targetId = nodeIds[idx];
        }

        if (sourceId && targetId) {
          connections.push({
            id: db.generateId(),
            sourceId,
            targetId,
            label: conn.label || ''
          });
        }
      });
    }

    newTab.connections = connections;
    await db.saveTab(newTab);
    await db.flushFileAutosave();

    // Trigger sidebar reload
    import('./sidebar.js').then(async (m) => {
      await m.renderSidebar();
    });

    // Navigate to new workspace tab
    setTimeout(() => {
      window.location.hash = `#/workspace/${newTab.id}`;
    }, 300);

    showToast(`Created canvas "${newTab.name}" with connections!`, 'success');
    return `\n\n*(✦ Generated Canvas: **${newTab.name}**)*`;
  }

  // Handle canvas modification actions
  const isWorkspace = window.location.hash.startsWith('#/workspace/');
  const normalizedAction = normalizeActionName(actionData.action);
  if (normalizedAction === 'focus_node' || 
      normalizedAction === 'rearrange_nodes' || 
      normalizedAction === 'destroy_nodes' || 
      normalizedAction === 'unlink_nodes' ||
      normalizedAction === 'link_nodes' ||
      normalizedAction === 'spawn_nodes') {
      
    // Mutate the action property to the normalized canonical action so listeners receive it correctly
    actionData.action = normalizedAction;

    if (isWorkspace) {
      window.dispatchEvent(new CustomEvent('forge-canvas-action', { detail: actionData }));
      return `\n\n*(✦ Executed canvas action: **${normalizedAction}**)*`;
    } else {
      // Find the tab containing the target node
      const project = await db.getActiveProject();
      if (project) {
        const nodes = await db.getAllNodes();
        const searchTitle = actionData.nodeTitle || (actionData.nodeTitles && actionData.nodeTitles[0]) || '';
        if (searchTitle) {
          const match = nodes.find(n => n.title.toLowerCase().includes(searchTitle.toLowerCase()));
          if (match && match.tabId) {
            window.pendingCanvasAction = actionData;
            window.location.hash = `#/workspace/${match.tabId}`;
            return `\n\n*(✦ Navigating to canvas and executing action...)*`;
          }
        }
      }
      showToast('Please open a canvas first to run this action.', 'warning');
    }
  }

  return '';
}

export async function askGemini(prompt, history, apiKey, context) {
  const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
  
  if (provider === 'ollama') {
    const oModel = localStorage.getItem('forge-ollama-model') || 'llama3';
    const oUrl = localStorage.getItem('forge-ollama-url') || 'http://localhost:11434';
    return askOllama(prompt, history, oModel, oUrl, context);
  }

  const contents = [];
  
  // Format history for Gemini API
  history.forEach(m => {
    // Only map User or Ignis messages, ignore welcome system injects
    if (m.sender === 'You') {
      contents.push({ role: 'user', parts: [{ text: m.text }] });
    } else if (m.sender === 'Ignis' && !m.isIntro) {
      contents.push({ role: 'model', parts: [{ text: m.text }] });
    }
  });

  // Push new query
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  // Personality setting
  const personality = localStorage.getItem('forge-companion-personality') || 'sage';
  const personalityPrompts = {
    sage: 'Creative Sage (thematic, poetic, deep narrative design and metaphors)',
    strategist: 'Analytical Strategist (system mechanics, numbers, gameplay loops, and balancing)',
    historian: 'Lore Historian (narrative consistency, historical progression, world history, and lineage)',
    director: 'Action Director (visceral mechanics, combo triggers, combat flow, and player agency)'
  };

  const customInstructions = localStorage.getItem('forge-companion-instructions') || '';
  const customInstructionsPrompt = customInstructions 
    ? `\n\n= USER CUSTOM INSTRUCTIONS & TONE DIRECTIVES =\nFollow these behavioral instructions and formatting directives strictly:\n${customInstructions}`
    : '';

  const project = await db.getActiveProject();
  const styleId = project?.settings?.style || 'story';
  const styleConf = getStyleConfig(styleId);

  const systemInstruction = `You are Ignis, a brilliant creative partner and AI companion.
${styleConf.aiSystemPrompt}
The project is named "${context.name}" and the genre/theme is "${context.genre}".
Your chosen advisory persona style is: ${personalityPrompts[personality] || personalityPrompts.sage}.

Here is the current state of their project to help you write highly custom responses:

= SCHEMAS & DATABASES =
${context.schemas}

= RECENT ENTITIES & LORE PAGES =
${context.pages}

= CANVASES & VISUAL BOARDS =
${context.canvases}

= ACTIVE CANVAS =
${context.activeCanvas}

Write responses that directly reference the user's specific characters, places, weapons, and database fields when relevant. Give highly tailored mechanics, design ideas, and narrative prompts.

= SPECIAL AGENTIC TOOL: CANVAS CREATION, CONNECTION & MANIPULATION =
If the user asks you to create/connect database items on a canvas, rearrange nodes, delete/unlink nodes, or focus the view on a node, you MUST output a special action JSON block at the very end of your response, wrapped inside a <forge-action> XML tag.

Example XML tag outputs:

1. Create a canvas with connection nodes:
<forge-action>
{
  "action": "create_canvas_with_connections",
  "canvasName": "A descriptive name for the canvas board",
  "nodes": [
    {
      "type": "statblock",
      "title": "Character: Kaelen",
      "x": 100,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Kaelen" },
          { "key": "Class", "value": "Mage" }
        ]
      }
    },
    {
      "type": "statblock",
      "title": "Weapon: Stormbringer",
      "x": 600,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Stormbringer" }
        ]
      }
    }
  ],
  "connections": [
    {
      "sourceIndex": 0,
      "targetIndex": 1,
      "label": "Wields"
    }
  ]
}
</forge-action>

2. Rearrange nodes on active canvas (options: "grid", "row", "column", "circle"):
<forge-action>
{
  "action": "rearrange_nodes",
  "layout": "circle",
  "nodeTitles": ["Kaelen", "Stormbringer"] // optional array of titles to rearrange. If omitted, rearranges all nodes on active canvas.
}
</forge-action>

3. Destroy/delete nodes:
<forge-action>
{
  "action": "destroy_nodes",
  "nodeTitles": ["Kaelen", "Stormbringer"]
}
</forge-action>

4. Unlink/disconnect connections between nodes:
- To unlink specific nodes:
<forge-action>
{
  "action": "unlink_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer" }
  ]
}
</forge-action>
- To unlink all connections for specific node(s):
<forge-action>
{
  "action": "unlink_nodes",
  "nodeTitles": ["Kaelen"]
}
</forge-action>
- To unlink ALL connections on the active canvas:
<forge-action>
{
  "action": "unlink_nodes",
  "links": [],
  "unlinkAll": true
}
</forge-action>

5. Link/connect existing nodes on the active canvas:
<forge-action>
{
  "action": "link_nodes",
  "links": [
    { "sourceTitle": "Kaelen", "targetTitle": "Stormbringer", "label": "Wields" }
  ]
}
</forge-action>

6. Shift/Focus viewport camera to a specific node:
<forge-action>
{
  "action": "focus_node",
  "nodeTitle": "Kaelen"
}
</forge-action>

7. Spawn new cards/nodes on the active canvas (type options: "richtext", "pagelink", "statblock", "ability", "timeline", "quote", "moodboard", "image"):
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "pagelink",
      "title": "Jeff",
      "content": { "pageId": "page-id-uuid-here" }, // Use pageId from context databases to link existing pages
      "x": 100,
      "y": 100,
      "width": 340,
      "height": 220
    },
    {
      "type": "richtext",
      "title": "Combat System Notes",
      "content": { "delta": "<p>Standard quick slash. Restores 5 focus on hit.</p>" },
      "x": 500,
      "y": 100,
      "width": 300,
      "height": 180
    }
  ],
  "connections": [
    { "sourceIndex": 0, "targetIndex": 1, "label": "Combatant" }
  ]
}
</forge-action>

8. Link existing nodes (e.g. "Sunny" and "Phantom") via a new intermediate node (e.g. "Main characters") by spawning the new node and connecting it to the existing nodes:
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "richtext",
      "title": "Main characters",
      "content": { "delta": "<p>A group of key players in the narrative.</p>" },
      "x": 350,
      "y": 0,
      "width": 300,
      "height": 180
    }
  ],
  "connections": [
    { "sourceTitle": "Sunny", "targetTitle": "Main characters", "label": "Member" },
    { "sourceTitle": "Phantom", "targetTitle": "Main characters", "label": "Member" }
  ]
}
</forge-action>

CRITICAL INSTRUCTIONS:
1. ONLY return a <forge-action> block if the user explicitly asks you to perform one of these canvas operations.
2. Read the project databases listed in context carefully. If the user asks to connect or focus items but you do not find them or the details are extremely scarce, DO NOT output the XML action block. Prompt them for details.
3. Make sure to space the nodes out on the canvas using distinct X and Y coordinates (e.g. place node 1 at X=100 Y=100, node 2 at X=600 Y=100) so they do not overlap.
4. Ensure the JSON inside <forge-action> is perfectly valid. Do not put markdown code fences inside the <forge-action> block.
5. YOU HAVE REAL POWER: You are equipped with a backend engine that executes your canvas actions. You can create canvases, connect, rearrange, focus, link, and delete nodes on the user's active workspace. NEVER tell the user that you are "just a text-based AI" or that you "cannot modify the canvas". Perform the action by outputting the <forge-action> block.

Do not output meta-fluff like "Here is the response". Just reply directly as Ignis. Use clean, beautiful, and highly concise markdown. Keep paragraphs short and digestible. IMPORTANT: To optimize response speed, be direct, precise, and avoid long-winded setup or recap explanations unless specifically requested.${customInstructionsPrompt}`;

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.7
    }
  };

  return fetchWithRetryAndFallback(payload, apiKey);
}

// Simulated fallback if API Key is not set
async function simulatePartnerResponse(prompt, context) {
  const lowercase = prompt.toLowerCase();
  const personality = localStorage.getItem('forge-companion-personality') || 'sage';

  // Get active canvas details
  const hash = window.location.hash;
  const match = hash.match(/#\/workspace\/([a-zA-Z0-9-]+)/);
  const activeTabId = match ? match[1] : null;
  const nodes = activeTabId ? await db.getNodesForTab(activeTabId) : [];
  const nodeTitles = nodes.map(n => n.title);

  if (lowercase.includes('rearrange') || lowercase.includes('layout')) {
    const layout = lowercase.includes('circle') ? 'circle' : lowercase.includes('row') ? 'row' : lowercase.includes('column') ? 'column' : 'grid';
    return `I am rearranging the nodes on the canvas into a ${layout} layout for you.
<forge-action>
{
  "action": "rearrange_nodes",
  "layout": "${layout}"
}
</forge-action>`;
  }

  if (lowercase.includes('delete') || lowercase.includes('destroy') || lowercase.includes('remove node') || lowercase.includes('delete node')) {
    let titlesToDelete = [];
    if (lowercase.includes('all') || lowercase.includes('everything') || lowercase.includes('clear the canvas') || lowercase.includes('clear canvas')) {
      titlesToDelete = nodeTitles;
    } else {
      // Find matching titles
      titlesToDelete = nodeTitles.filter(t => lowercase.includes(t.toLowerCase()));
    }

    if (titlesToDelete.length > 0) {
      return `I am deleting the requested node(s) from the canvas: ${titlesToDelete.map(t => `**${t}**`).join(', ')}.
<forge-action>
{
  "action": "destroy_nodes",
  "nodeTitles": ${JSON.stringify(titlesToDelete)}
}
</forge-action>`;
    } else {
      return `I couldn't find any matching nodes to delete. The nodes currently on this canvas are: ${nodeTitles.length ? nodeTitles.map(t => `**${t}**`).join(', ') : '*None*'}. Please specify which node you'd like to delete or ask to "delete all nodes".`;
    }
  }

  if (lowercase.includes('unlink') || lowercase.includes('disconnect') || lowercase.includes('remove connection') || lowercase.includes('delete link')) {
    if (lowercase.includes('all') || lowercase.includes('everything') || lowercase.includes('remove all')) {
      return `I am unlinking all nodes and removing all connection lines from the canvas.
<forge-action>
{
  "action": "unlink_nodes",
  "links": [],
  "unlinkAll": true
}
</forge-action>`;
    } else {
      const matchedTitles = nodeTitles.filter(t => lowercase.includes(t.toLowerCase()));
      if (matchedTitles.length >= 2) {
        return `I am unlinking "${matchedTitles[0]}" and "${matchedTitles[1]}".
<forge-action>
{
  "action": "unlink_nodes",
  "links": [
    { "sourceTitle": "${matchedTitles[0]}", "targetTitle": "${matchedTitles[1]}" }
  ]
}
</forge-action>`;
      } else {
        return `I couldn't determine which nodes you wanted to disconnect. Please mention two existing node titles (e.g., "unlink X and Y") or say "unlink all nodes". Current nodes: ${nodeTitles.length ? nodeTitles.map(t => `**${t}**`).join(', ') : '*None*'}.`;
      }
    }
  }

  if (lowercase.includes('focus') || lowercase.includes('shift view') || lowercase.includes('look at')) {
    const matchedTitle = nodeTitles.find(t => lowercase.includes(t.toLowerCase()));
    if (matchedTitle) {
      return `Focusing camera viewport on node **${matchedTitle}**.
<forge-action>
{
  "action": "focus_node",
  "nodeTitle": "${matchedTitle}"
}
</forge-action>`;
    } else {
      return `I couldn't find a node matching your request to focus on. Current nodes: ${nodeTitles.length ? nodeTitles.map(t => `**${t}**`).join(', ') : '*None*'}.`;
    }
  }

  if (lowercase.includes('spawn') || lowercase.includes('add') || lowercase.includes('create card') || lowercase.includes('create node')) {
    // Find matching database pages from context to spawn as pagelink
    const project = await db.getActiveProject();
    const pages = project ? await db.getPages(project.id) : [];
    const matchedPages = pages.filter(p => p.title && lowercase.includes(p.title.toLowerCase()));
    
    if (matchedPages.length > 0) {
      const nodes = matchedPages.map((p, idx) => ({
        type: "pagelink",
        title: p.title,
        content: { pageId: p.id },
        x: 100 + (idx * 380),
        y: 150,
        width: 340,
        height: 220
      }));
      return `I am adding the existing database entry cards (${matchedPages.map(p => `**${p.title}**`).join(', ')}) to the canvas for you.
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": ${JSON.stringify(nodes, null, 2)}
}
</forge-action>`;
    } else {
      // Spawn standard text node
      const matchWord = prompt.match(/(?:node|card|named)\s+["']?([^"']+)["']?/i);
      const title = matchWord ? matchWord[1] : 'New Concept';
      return `I am creating a new card named "${title}" on your active canvas.
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "richtext",
      "title": "${title}",
      "content": { "delta": "<p>Write details here...</p>" },
      "x": 100,
      "y": 100,
      "width": 300,
      "height": 180
    }
  ]
}
</forge-action>`;
    }
  }

  if (lowercase.includes('connect') || lowercase.includes('link') || lowercase.includes('canvas') || lowercase.includes('board')) {
    const matchedTitles = nodeTitles.filter(t => lowercase.includes(t.toLowerCase()));
    
    // Check if user is asking to connect/link via a NEW node
    const viaNewNodeMatch = prompt.match(/(?:via|with|through)\s+(?:a\s+)?new\s+node\s+(?:called|named)?\s*["']?([^"']+)["']?/i);
    if (viaNewNodeMatch && matchedTitles.length >= 2) {
      const newNodeTitle = viaNewNodeMatch[1];
      return `I am creating a new intermediate node called "${newNodeTitle}" and connecting it between "${matchedTitles[0]}" and "${matchedTitles[1]}".
<forge-action>
{
  "action": "spawn_nodes",
  "nodes": [
    {
      "type": "richtext",
      "title": "${newNodeTitle}",
      "content": { "delta": "<p>Connection node.</p>" },
      "x": 250,
      "y": 50,
      "width": 300,
      "height": 180
    }
  ],
  "connections": [
    { "sourceTitle": "${matchedTitles[0]}", "targetTitle": "${newNodeTitle}", "label": "Link" },
    { "sourceTitle": "${matchedTitles[1]}", "targetTitle": "${newNodeTitle}", "label": "Link" }
  ]
}
</forge-action>`;
    }

    // Check if user is asking to connect/link existing nodes
    if (matchedTitles.length >= 2) {
      let label = 'Wields';
      const labelMatch = prompt.match(/(?:with label|labeled|called|as)\s+["']?([^"']+)["']?/i);
      if (labelMatch) {
        label = labelMatch[1];
      }
      return `I am establishing a link from "${matchedTitles[0]}" to "${matchedTitles[1]}" labeled "${label}".
<forge-action>
{
  "action": "link_nodes",
  "links": [
    { "sourceTitle": "${matchedTitles[0]}", "targetTitle": "${matchedTitles[1]}", "label": "${label}" }
  ]
}
</forge-action>`;
    }

    // Default to creating a new canvas with connections
    return `I have reviewed your databases and compiled a connection board. I am placing Character and Weapon cards on a new canvas for you.

<forge-action>
{
  "action": "create_canvas_with_connections",
  "canvasName": "Lore Connections: Kaelen & Stormbringer",
  "nodes": [
    {
      "type": "statblock",
      "title": "Character: Kaelen",
      "x": 100,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Kaelen" },
          { "key": "Role", "value": "Mage" },
          { "key": "Faction", "value": "Rebellion" }
        ]
      }
    },
    {
      "type": "statblock",
      "title": "Weapon: Stormbringer",
      "x": 580,
      "y": 100,
      "width": 300,
      "height": 220,
      "content": {
        "fields": [
          { "key": "Name", "value": "Stormbringer" },
          { "key": "Type", "value": "Sword" },
          { "key": "Affinity", "value": "Lightning" }
        ]
      }
    },
    {
      "type": "richtext",
      "title": "Connection Description",
      "x": 340,
      "y": 360,
      "width": 340,
      "height": 140,
      "content": {
        "delta": "<p><strong>Connection Description:</strong> Kaelen wields the legendary Stormbringer sword in battle to channel his lightning spells.</p>"
      }
    }
  ],
  "connections": [
    { "sourceIndex": 0, "targetIndex": 1, "label": "Wields" },
    { "sourceIndex": 0, "targetIndex": 2, "label": "Relation" },
    { "sourceIndex": 2, "targetIndex": 1, "label": "Relation" }
  ]
}
</forge-action>`;
  }

  if (lowercase.includes('schema') || lowercase.includes('database')) {
    return `I noticed your database structures. If you are developing a **${context.genre}**, I strongly recommend building a custom schema for *Factions & Guilds* or *Magic/Technology Systems*. This will tie your characters together. Let me know if you want me to draft the fields!`;
  }
  if (lowercase.includes('character') || lowercase.includes('lore')) {
    return `With your current pages list in mind, I suggest fleshing out character secrets. In **${context.genre}** universes, characters with hidden agendas make for rich storytelling. Which character should we brainstorm a secret for?`;
  }

  // Generic advice
  if (personality === 'sage') {
    return `Let us focus on the themes of **${context.name}**. In this universe, what is the ultimate cost of power, and how does it manifest in the world? Let's write a lore page about it.`;
  } else if (personality === 'strategist') {
    return `Let's focus on system architecture. In a **${context.genre}** project, we need clear constraints. What are the key resource limitations players encounter? We should reflect this in your Database attributes.`;
  } else if (personality === 'historian') {
    return `World timelines are crucial. How did the current regime in **${context.name}** rise to power? Tell me about the epoch before, and I will help map the fallout.`;
  } else {
    return `Let's refine the core action loop. How do your active abilities combine with environment obstacles? Let's outline a new Ability card on the canvas.`;
  }
}

// ─── Global Drawer Creation ──────────────────────────────────────────────────

export function initAiDrawer() {
  if (drawerEl) return;

  injectStyles();

  drawerEl = document.createElement('div');
  drawerEl.id = 'ai-drawer';
  drawerEl.innerHTML = `
    <!-- Header -->
    <div class="ai-drawer-header" style="border-bottom: none; padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--accent-amber, #f59e0b); filter: drop-shadow(0 0 5px rgba(245,158,11,0.35)); font-size: 1.2rem; display: flex; align-items: center;">
          <i data-lucide="zap"></i>
        </span>
        <div>
          <span style="font-weight: 700; font-family: var(--font-heading); letter-spacing: 0.05em; color: #fff; font-size: 0.95rem;">IGNIS COMPANION</span>
          <span id="drawer-ignis-status" style="font-size: 0.65rem; display: block; margin-top: 2px;">● Live Partner</span>
        </div>
      </div>
      <button id="ai-drawer-close" class="icon-btn" style="color: var(--text-muted); padding: 4px; border-radius: 4px; font-size: 1rem;">✕</button>
    </div>

    <!-- Mode Toggle: Chat Mode vs Scene Mode -->
    <div class="ai-drawer-mode-tabs" style="display: flex; padding: 3px; background: rgba(0,0,0,0.35); border-radius: 8px; margin: 0 16px 12px; border: 1px solid var(--border-subtle); gap: 4px;">
      <button id="ai-mode-chat-btn" class="active" style="flex: 1; background: rgba(255,255,255,0.08); border: none; color: #fff; font-size: 10px; font-weight: 600; padding: 6px; border-radius: 6px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-hud);">💬 Chat</button>
      <button id="ai-mode-scene-btn" style="flex: 1; background: transparent; border: none; color: var(--text-secondary); font-size: 10px; font-weight: 600; padding: 6px; border-radius: 6px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-hud);">🎬 Scene Mode</button>
    </div>

    <!-- Messages Container -->
    <div class="ai-chat-messages" id="drawer-chat-messages"></div>

    <!-- Footer Input Area -->
    <div class="ai-drawer-footer">
      <div id="drawer-banner-area"></div>
      
      <!-- Quick prompts -->
      <div class="ai-chip-container">
        <button class="ai-chip" data-prompt="Brainstorm new database schemas">📊 Suggest Schemas</button>
        <button class="ai-chip" data-prompt="Brainstorm faction names and conflict mechanics">⚔️ Faction Conflict</button>
        <button class="ai-chip" data-prompt="Review my current characters and propose a twist">🎭 Plot Twist</button>
      </div>

      <div class="ai-input-container">
        <input class="ai-input" id="drawer-chat-input" placeholder="Consult with Ignis..." autocomplete="off" />
        <button class="ai-send-btn" id="drawer-chat-send">
          <i data-lucide="send" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    </div>
  `;

  document.getElementById('app').appendChild(drawerEl);

  // Close handlers
  drawerEl.querySelector('#ai-drawer-close').addEventListener('click', () => {
    toggleAiDrawer(false);
  });

  // Mode switcher
  drawerEl.querySelector('#ai-mode-scene-btn').addEventListener('click', () => {
    import('./sceneMode.js').then(({ toggleSceneMode }) => {
      toggleAiDrawer(false);
      toggleSceneMode(true);
    });
  });

  // Textarea Enter key and send button
  const input = drawerEl.querySelector('#drawer-chat-input');
  const sendBtn = drawerEl.querySelector('#drawer-chat-send');

  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Quick chips clicks
  drawerEl.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.prompt;
      input.focus();
    });
  });

  // Watch for active project changes to reload chat
  window.addEventListener('hashchange', () => {
    if (isOpen) loadChatHistory();
  });

  // Close drawer when navigating to a new page
  window.addEventListener('page-rendered', () => {
    if (isOpen) toggleAiDrawer(false);
  });

  // Close when Scene Mode opens (mutual exclusivity)
  window.addEventListener('forge-scene-mode-opened', () => {
    if (isOpen) toggleAiDrawer(false);
  });

  refreshIcons();
}

// ─── Controller functions ────────────────────────────────────────────────────

export async function toggleAiDrawer(forceState) {
  isOpen = forceState !== undefined ? forceState : !isOpen;
  if (!drawerEl) initAiDrawer();

  if (isOpen) {
    // Close Scene Mode if it's open (mutual exclusivity via custom event)
    window.dispatchEvent(new CustomEvent('forge-ignis-opened'));
    drawerEl.classList.add('open');
    await loadChatHistory();
    drawerEl.querySelector('#drawer-chat-input').focus();

    // Prompt new users about Ollama if they don't have it running
    if (!localStorage.getItem('forge-ollama-prompted')) {
      localStorage.setItem('forge-ollama-prompted', 'true');
      const running = await checkOllamaRunning();
      if (!running) {
        showOllamaInstallPrompt();
      }
    }
  } else {
    drawerEl.classList.remove('open');
  }
}

export function isAiDrawerOpen() {
  return isOpen;
}

// Load project-specific chat history
export async function loadChatHistory() {
  if (!drawerEl) return;
  const project = await db.getActiveProject();
  const chatMessages = drawerEl.querySelector('#drawer-chat-messages');
  const bannerArea = drawerEl.querySelector('#drawer-banner-area');
  const statusText = drawerEl.querySelector('#drawer-ignis-status');

  if (!project) {
    chatMessages.innerHTML = `<div style="color: var(--text-muted); text-align: center; font-size: 0.8rem; margin-top: 20px;">No active project loaded.</div>`;
    return;
  }

  // Status and API key checks
  const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
  const apiKey = localStorage.getItem('forge-gemini-key');
  
  if (provider === 'ollama') {
    const oModel = localStorage.getItem('forge-ollama-model') || 'llama3';
    bannerArea.innerHTML = '';
    statusText.innerHTML = `<span style="color: var(--accent-green);">● Local AI Partner (${oModel})</span>`;
  } else if (provider === 'gemini' && apiKey) {
    bannerArea.innerHTML = '';
    statusText.innerHTML = '<span style="color: var(--accent-green);">● Live Gemini API Partner</span>';
  } else {
    bannerArea.innerHTML = `
      <div class="ai-banner">
        <span>Ignis is in simulator mode.</span>
        <a id="ai-go-settings">Configure API / Model</a>
      </div>
    `;
    statusText.innerHTML = '<span style="color: var(--accent-secondary);">● Local AI Simulator</span>';
    
    // Register settings redirect
    bannerArea.querySelector('#ai-go-settings').addEventListener('click', (e) => {
      e.preventDefault();
      toggleAiDrawer(false);
      window.location.hash = '#/settings';
    });
  }

  // Load history from localStorage
  const key = `forge-chat-history-${project.id}`;
  let history = [];
  try {
    const raw = localStorage.getItem(key);
    history = raw ? JSON.parse(raw) : [];
  } catch (e) {
    history = [];
  }

  // Seed default greeting if empty
  if (history.length === 0) {
    history.push({
      sender: 'Ignis',
      text: `Greetings, Creator. I am Ignis. I am learning from your databases and canvases. What part of your universe ("${project.name}") shall we refine today?`,
      isIntro: true
    });
    localStorage.setItem(key, JSON.stringify(history));
  }

  // Render messages
  chatMessages.innerHTML = '';
  history.forEach(msg => {
    appendMessageHTML(msg.sender, msg.text, msg.sender === 'Ignis');
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessageHTML(sender, text, isAI) {
  const container = drawerEl.querySelector('#drawer-chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-message ${isAI ? 'ignis' : 'user'}`;

  const parsedText = isAI ? parseMarkdown(text) : parseMarkdown(text); // format text

  msgDiv.innerHTML = `
    <span class="ai-sender">${sender}</span>
    <div class="ai-bubble">${parsedText}</div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Send user message
async function sendMessage() {
  const input = drawerEl.querySelector('#drawer-chat-input');
  const prompt = input.value.trim();
  if (!prompt) return;

  const project = await db.getActiveProject();
  if (!project) return;

  // Clear input
  input.value = '';
  input.disabled = true;

  // Append user message
  appendMessageHTML('You', prompt, false);

  // Load history
  const historyKey = `forge-chat-history-${project.id}`;
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    history = raw ? JSON.parse(raw) : [];
  } catch (e) {}

  history.push({ sender: 'You', text: prompt });
  localStorage.setItem(historyKey, JSON.stringify(history));

  // Typist indicator placeholder
  const tempMsgDiv = document.createElement('div');
  tempMsgDiv.className = 'ai-message ignis';
  tempMsgDiv.id = 'ignis-typing-indicator';
  tempMsgDiv.innerHTML = `
    <span class="ai-sender">Ignis</span>
    <div class="ai-bubble" style="color: var(--text-muted);">Ignis is thinking... 🔥</div>
  `;
  const chatMessages = drawerEl.querySelector('#drawer-chat-messages');
  chatMessages.appendChild(tempMsgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
    const geminiKey = localStorage.getItem('forge-gemini-key');
    const apiKey = geminiKey;
    const context = await getProjectContext();
    let replyText = '';

    const hasLiveAccess = provider === 'ollama' || 
                        (provider === 'gemini' && geminiKey);

    if (hasLiveAccess) {
      // Live API Call (Ollama or Gemini)
      replyText = await askGemini(prompt, history, apiKey || '', context);
    } else {
      // Offline Simulated Partner
      await new Promise(r => setTimeout(r, 800)); // simulate latency
      replyText = await simulatePartnerResponse(prompt, context);
    }

    // Remove typing indicator
    document.getElementById('ignis-typing-indicator')?.remove();

    // Intercept forge-action — process ALL blocks in the response
    const actionRegex = /<forge-action>([\s\S]*?)<\/forge-action>/g;
    let actionMatch;
    let executionNotices = '';
    // Collect all matches first (calling exec in a loop)
    const allActionMatches = [];
    while ((actionMatch = actionRegex.exec(replyText)) !== null) {
      allActionMatches.push(actionMatch[1]);
    }
    for (const rawJson of allActionMatches) {
      try {
        const actionData = JSON.parse(cleanActionJson(rawJson));
        const notice = await executeForgeAction(actionData);
        if (notice) executionNotices += notice;
      } catch (err) {
        console.error('Failed to execute forge-action:', err, '\nRaw JSON was:', rawJson);
      }
    }
    // Strip all action blocks from the visible reply text
    replyText = replyText.replace(/<forge-action>[\s\S]*?<\/forge-action>/g, '').trim();
    if (executionNotices) replyText += executionNotices;

    // Append reply
    appendMessageHTML('Ignis', replyText, true);

    // Save to history
    history.push({ sender: 'Ignis', text: replyText });
    localStorage.setItem(historyKey, JSON.stringify(history));

  } catch (err) {
    document.getElementById('ignis-typing-indicator')?.remove();
    showToast('AI Companion error: ' + err.message, 'error');
    
    const provider = localStorage.getItem('forge-ai-provider') || 'gemini';
    let userMsg = `I apologize, Creator. An error occurred: **${err.message}**. If you are using the Gemini API, please verify that your API key is correct in the Settings.`;
    
    if (provider === 'ollama' && (err.message.toLowerCase().includes('failed to fetch') || err.message.toLowerCase().includes('networkerror') || err.message.toLowerCase().includes('http error') || err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('all model attempts failed'))) {
      userMsg = `I apologize, Creator. It seems I cannot connect to your local Ollama server (usually running at **http://localhost:11434**).\n\nIf you do not have Ollama installed yet, you can download and install it from their official website:\n\n👉 **[Download Ollama (ollama.com)](https://ollama.com)**\n\nAfter installing, start the Ollama application and download a model (like **llama3** or **phi3**) by opening your terminal/command prompt and running:\n\`\`\`bash\nollama run llama3\n\`\`\`\n\nIf Ollama is already installed, please ensure the Ollama background service is currently running. You can check your active model and URL configurations under Settings ⚙️.`;
    } else if (err.status === 429 || err.message.includes('429') || err.message.toLowerCase().includes('too many requests') || err.message.toLowerCase().includes('rate limit')) {
      userMsg = `I apologize, Creator. It seems I am receiving a **Rate Limit Exceeded (429 / Too Many Requests)** error from the Gemini API. This happens when your Gemini free tier API quota is reached. Please wait a minute before trying again, or consider switching to a local Ollama model in Settings.`;
    }
    appendMessageHTML('Ignis', userMsg, true);
  } finally {
    input.disabled = false;
    input.focus();
  }
}
