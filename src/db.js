/* ============================================================
   Forge — Universal Database Layer (IndexedDB via idb)
   A Universal Personal Knowledge System backend.
   ============================================================ */

import { openDB, deleteDB } from 'idb';

const DB_NAME = 'forge-db';
const DB_VERSION = 5;

let dbPromise = null;

export async function resetDatabase() {
  dbPromise = null;
  await deleteDB(DB_NAME);
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v3: Universal Schema
        if (oldVersion < 3) {
          // Drop old stores if they exist to start fresh
          const oldStores = ['characters', 'world', 'story', 'gamedesign', 'tabs', 'nodes', 'activity', 'project', 'images'];
          for (const s of oldStores) {
            if (db.objectStoreNames.contains(s)) {
              db.deleteObjectStore(s);
            }
          }

          // 1. Projects (Workspaces)
          db.createObjectStore('projects', { keyPath: 'id' });

          // 2. Schemas (User-defined Database Templates like "Character", "Weapon")
          const schemaStore = db.createObjectStore('schemas', { keyPath: 'id' });
          schemaStore.createIndex('projectId', 'projectId');

          // 3. Pages (The universal entity/document)
          const pageStore = db.createObjectStore('pages', { keyPath: 'id' });
          pageStore.createIndex('projectId', 'projectId');
          pageStore.createIndex('schemaId', 'schemaId');
          pageStore.createIndex('parentId', 'parentId');

          // 4. Links (Directed Graph Edges between pages)
          const linkStore = db.createObjectStore('links', { keyPath: 'id' });
          linkStore.createIndex('projectId', 'projectId');
          linkStore.createIndex('sourceId', 'sourceId');
          linkStore.createIndex('targetId', 'targetId');

          // 5. Images (Global asset store)
          const imgStore = db.createObjectStore('images', { keyPath: 'id' });
          imgStore.createIndex('projectId', 'projectId');
        }

        // v4: Add Canvas Tabs & Nodes stores (missed in v3 for existing users)
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('tabs')) {
            const tabStore = db.createObjectStore('tabs', { keyPath: 'id' });
            tabStore.createIndex('createdAt', 'createdAt');
          }
          if (!db.objectStoreNames.contains('nodes')) {
            const nodeStore = db.createObjectStore('nodes', { keyPath: 'id' });
            nodeStore.createIndex('tabId', 'tabId');
          }
        }

        // v5: Activity log + tags multiEntry index on pages
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('activity')) {
            const actStore = db.createObjectStore('activity', { keyPath: 'id' });
            actStore.createIndex('projectId', 'projectId');
            actStore.createIndex('timestamp', 'timestamp');
          }
          // Tags multiEntry index — enables getPagesByTag() fast lookup
          // Note: pages store already exists, we just add the index
          // We can't add an index via the transaction in this way for existing stores in some browsers
          // So we'll handle tag filtering in JS instead (see searchPages upgrade)
        }
      },
    }).catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// --- Utility ---
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() {
  return new Date().toISOString();
}

// --- Generic CRUD operations ---
const dbListeners = [];
let isApplyingRemoteChange = false;

// Broadcast Channel for syncing updates across windows (e.g. Quick Capture to main window)
const dbChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('forge-db-channel') : null;

if (dbChannel) {
  dbChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'db-updated') {
      window.dispatchEvent(new CustomEvent('forge-db-updated', { detail: event.data }));
    }
  };
}

export function addDatabaseListener(listener) {
  dbListeners.push(listener);
}

export function setApplyingRemoteChange(value) {
  isApplyingRemoteChange = value;
}

function notifyListeners(action, storeName, id, data) {
  if (isApplyingRemoteChange) return;
  for (const listener of dbListeners) {
    try {
      listener(action, storeName, id, data);
    } catch (err) {
      console.error('Database listener error:', err);
    }
  }

  // Dispatch locally so the current window's components (like the Continuity Monitor) detect updates
  window.dispatchEvent(new CustomEvent('forge-db-updated', {
    detail: { type: 'db-updated', action, storeName, id }
  }));

  // Broadcast the update to other windows
  if (dbChannel) {
    try {
      dbChannel.postMessage({ type: 'db-updated', action, storeName, id });
    } catch (e) {
      console.warn('Failed to broadcast db update:', e);
    }
  }
}

async function getAll(storeName) {
  const db = await getDB();
  return db.getAll(storeName);
}

async function getById(storeName, id) {
  const db = await getDB();
  return db.get(storeName, id);
}

async function put(storeName, data) {
  const db = await getDB();
  const result = await db.put(storeName, data);
  notifyListeners('save', storeName, data.id, data);
  triggerFileAutosave();
  return result;
}

async function deleteById(storeName, id) {
  const db = await getDB();
  const result = await db.delete(storeName, id);
  notifyListeners('delete', storeName, id, null);
  triggerFileAutosave(true); // Immediate save on delete!
  return result;
}

async function getAllByIndex(storeName, indexName, value) {
  const db = await getDB();
  return db.getAllFromIndex(storeName, indexName, value);
}

// ==========================================
// Projects
// ==========================================

export async function getActiveProject() {
  // If in desktop (Electron) and no project path is set, we have no active project
  if (window.electronAPI && !localStorage.getItem('forge-active-project-path')) {
    return null;
  }

  const projects = await getAll('projects');
  if (projects.length > 0) {
    const project = projects[0];
    syncSettingsFromProject(project);
    return project;
  }
  
  // Create default project if none exists
  const defaultProj = {
    id: generateId(),
    name: 'My Game Universe',
    createdAt: now(),
    updatedAt: now(),
    settings: {
      genre: 'Action RPG',
      theme: 'Dark Fantasy'
    }
  };
  await put('projects', defaultProj);
  syncSettingsFromProject(defaultProj);
  return defaultProj;
}

export async function saveProject(project) {
  project.updatedAt = now();
  return put('projects', project);
}

// Sync settings stored in the project settings object into localStorage.
// If the project doesn't have a setting but localStorage does, we copy it to the project.
export function syncSettingsFromProject(project) {
  if (!project) return;
  if (!project.settings) project.settings = {};

  const keys = [
    'forge-theme',
    'forge-custom-accent',
    'forge-companion-enabled',
    'forge-companion-personality',
    'forge-companion-instructions',
    'forge-gemini-key',
    'forge-gemini-model',
    'forge-ai-provider',
    'forge-ollama-model',
    'forge-ollama-url',
    'forge-reminders-enabled',
    'forge-reminder-time',
    'forge-sfx-enabled'
  ];

  let needsSave = false;
  for (const key of keys) {
    if (project.settings[key] !== undefined) {
      localStorage.setItem(key, project.settings[key]);
    } else {
      const localVal = localStorage.getItem(key);
      if (localVal !== null) {
        project.settings[key] = localVal;
        needsSave = true;
      }
    }
  }

  if (needsSave) {
    saveProject(project);
  }
}

export async function saveProjectSetting(key, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }

  const db = await getDB();
  const projects = await db.getAll('projects');
  if (projects.length > 0) {
    const project = projects[0];
    if (!project.settings) project.settings = {};
    if (value === null || value === undefined) {
      delete project.settings[key];
    } else {
      project.settings[key] = value;
    }
    project.updatedAt = now();
    await db.put('projects', project);
    triggerFileAutosave();
  }
}

export async function saveProjectSettings(settingsObj) {
  for (const [key, value] of Object.entries(settingsObj)) {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }

  const db = await getDB();
  const projects = await db.getAll('projects');
  if (projects.length > 0) {
    const project = projects[0];
    if (!project.settings) project.settings = {};
    for (const [key, value] of Object.entries(settingsObj)) {
      if (value === null || value === undefined) {
        delete project.settings[key];
      } else {
        project.settings[key] = value;
      }
    }
    project.updatedAt = now();
    await db.put('projects', project);
    triggerFileAutosave();
  }
}


// ==========================================
// Schemas (Databases / Templates)
// ==========================================

export async function getSchemas(projectId) {
  return getAllByIndex('schemas', 'projectId', projectId);
}

export async function getSchema(id) {
  return getById('schemas', id);
}

export async function saveSchema(schema) {
  if (!schema.id) schema.id = generateId();
  if (!schema.createdAt) schema.createdAt = now();
  schema.updatedAt = now();
  // Ensure fields array exists
  if (!schema.fields) schema.fields = [];
  await put('schemas', schema);
  return schema;
}

export async function deleteSchema(id) {
  // Option: also delete all pages belonging to this schema? 
  // For safety, let's just delete the schema. Pages will become standard pages.
  return deleteById('schemas', id);
}

// ==========================================
// Pages (Documents / Entities)
// ==========================================

export async function getPages(projectId) {
  return getAllByIndex('pages', 'projectId', projectId);
}

export async function getPagesBySchema(schemaId) {
  return getAllByIndex('pages', 'schemaId', schemaId);
}

export async function getPage(id) {
  return getById('pages', id);
}

async function updatePageLinks(page) {
  const db = await getDB();
  
  // 1. Delete existing links from this page
  const txDelete = db.transaction('links', 'readwrite');
  const sourceIndex = txDelete.store.index('sourceId');
  const keys = await sourceIndex.getAllKeys(page.id);
  for (const key of keys) {
    await txDelete.store.delete(key);
    notifyListeners('delete', 'links', key, null);
  }
  await txDelete.done;

  // 2. Scan content and properties for links
  let projId = page.projectId;
  if (!projId) {
    const activeProj = await getActiveProject();
    if (activeProj) {
      projId = activeProj.id;
      page.projectId = projId;
    }
  }

  const targetIds = new Set();
  const allPages = projId ? await db.getAllFromIndex('pages', 'projectId', projId) : [];
  const pageTitleMap = new Map();
  allPages.forEach(p => {
    if (p.id !== page.id && p.title) {
      pageTitleMap.set(p.title.trim().toLowerCase(), p.id);
    }
  });

  const contentStr = page.content || '';
  
  // Parse wiki links [[Page Title]]
  const bracketRegex = /\[\[(.*?)\]\]/g;
  let match;
  while ((match = bracketRegex.exec(contentStr)) !== null) {
    const title = match[1].trim().toLowerCase();
    const targetId = pageTitleMap.get(title);
    if (targetId) {
      targetIds.add(targetId);
    }
  }

  // Parse Quill delta links
  if (contentStr.startsWith('{')) {
    try {
      const delta = JSON.parse(contentStr);
      if (delta.ops) {
        delta.ops.forEach(op => {
          if (op.attributes && op.attributes.link) {
            const href = op.attributes.link;
            const pageIdMatch = href.match(/#\/page\/([a-zA-Z0-9]+)/);
            if (pageIdMatch && pageIdMatch[1] !== page.id) {
              targetIds.add(pageIdMatch[1]);
            }
          }
        });
      }
    } catch (_) {}
  }

  // Parse properties values for page ID references
  if (page.properties) {
    const pageIds = new Set(allPages.map(p => p.id));
    for (const val of Object.values(page.properties)) {
      if (typeof val === 'string' && val !== page.id && pageIds.has(val)) {
        targetIds.add(val);
      }
    }
  }

  // 3. Save new links
  if (targetIds.size > 0) {
    const txSave = db.transaction('links', 'readwrite');
    for (const targetId of targetIds) {
      const link = {
        id: generateId(),
        projectId: page.projectId,
        sourceId: page.id,
        targetId
      };
      await txSave.store.put(link);
      notifyListeners('save', 'links', link.id, link);
    }
    await txSave.done;
  }
}

export async function savePage(page) {
  if (!page.id) page.id = generateId();
  if (!page.createdAt) page.createdAt = now();
  page.updatedAt = now();
  
  // Enforce schema compliance
  if (!page.properties) page.properties = {};
  if (!page.content) page.content = '';
  
  // Ensure page has projectId BEFORE saving!
  if (!page.projectId) {
    const activeProj = await getActiveProject();
    if (activeProj) {
      page.projectId = activeProj.id;
    }
  }

  const isNew = !page.createdAt || page.createdAt === page.updatedAt;
  await put('pages', page);
  
  try {
    await updatePageLinks(page);
  } catch (err) {
    console.error('Failed to update page links:', err);
  }

  // Log activity (non-blocking)
  logActivity(
    page.projectId,
    isNew ? 'created' : 'edited',
    page.id,
    page.title,
    page.schemaId
  ).catch(() => {});
  
  return page; // Return the full object, not just the key
}

export async function deletePage(id) {
  // Cleanup links involving this page
  const db = await getDB();
  const tx = db.transaction('links', 'readwrite');
  
  // Delete where sourceId = id
  const fromSource = await tx.store.index('sourceId').getAllKeys(id);
  for (const key of fromSource) {
    await tx.store.delete(key);
    notifyListeners('delete', 'links', key, null);
  }
  
  // Delete where targetId = id
  const fromTarget = await tx.store.index('targetId').getAllKeys(id);
  for (const key of fromTarget) {
    await tx.store.delete(key);
    notifyListeners('delete', 'links', key, null);
  }
  
  await tx.done;

  const page = await getById('pages', id);
  if (page) {
    logActivity(
      page.projectId,
      'deleted',
      page.id,
      page.title,
      page.schemaId
    ).catch(() => {});
  }
  return deleteById('pages', id);
}

// ==========================================
// Links (Relationships / Graph Edges)
// ==========================================

export async function getLinks(projectId) {
  return getAllByIndex('links', 'projectId', projectId);
}

export async function getBacklinks(pageId) {
  const db = await getDB();
  return db.getAllFromIndex('links', 'targetId', pageId);
}

export async function getForwardLinks(pageId) {
  const db = await getDB();
  return db.getAllFromIndex('links', 'sourceId', pageId);
}

export async function saveLink(link) {
  if (!link.id) link.id = generateId();
  return put('links', link);
}

export async function deleteLink(id) {
  return deleteById('links', id);
}

// ==========================================
// Search & Global
// ==========================================

export async function searchPages(projectId, query, options = {}) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  const { schemaId, limit = 20, includeContent = true } = options;
  
  const pages = await getPages(projectId);
  const scored = [];
  
  for (const p of pages) {
    if (schemaId && p.schemaId !== schemaId) continue;
    
    let score = 0;
    const title = (p.title || '').toLowerCase();
    
    // Title match scores highest
    if (title === q) score += 10;
    else if (title.startsWith(q)) score += 6;
    else if (title.includes(q)) score += 3;
    
    // Content match
    if (includeContent && p.content) {
      let contentText = p.content;
      // Strip Quill delta JSON to plain text
      if (contentText.startsWith('{')) {
        try {
          const delta = JSON.parse(contentText);
          if (delta.ops) {
            contentText = delta.ops
              .filter(op => typeof op.insert === 'string')
              .map(op => op.insert)
              .join('');
          }
        } catch (_) {}
      }
      // Strip HTML tags
      contentText = contentText.replace(/<[^>]+>/g, ' ').toLowerCase();
      if (contentText.includes(q)) score += 1;
    }
    
    // Tag match
    if (p.tags && Array.isArray(p.tags)) {
      if (p.tags.some(t => t.toLowerCase().includes(q))) score += 2;
    }
    
    // Properties match
    if (p.properties) {
      for (const val of Object.values(p.properties)) {
        if (typeof val === 'string' && val.toLowerCase().includes(q)) {
          score += 1;
          break;
        }
      }
    }
    
    if (score > 0) scored.push({ ...p, _score: score });
  }
  
  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...p }) => p);
}

// ==========================================
// Activity Log (V5)
// ==========================================

const MAX_ACTIVITY_ENTRIES = 200;

export async function logActivity(projectId, action, pageId, pageTitle, schemaId = null) {
  try {
    const db = await getDB();
    const entry = {
      id: generateId(),
      projectId,
      action, // 'created' | 'edited' | 'deleted'
      pageId,
      pageTitle: pageTitle || 'Untitled',
      schemaId: schemaId || null,
      timestamp: new Date().toISOString()
    };
    await db.put('activity', entry);
    
    // Prune to MAX_ACTIVITY_ENTRIES
    const allEntries = await db.getAllFromIndex('activity', 'projectId', projectId);
    if (allEntries.length > MAX_ACTIVITY_ENTRIES) {
      const sorted = allEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const toDelete = sorted.slice(0, allEntries.length - MAX_ACTIVITY_ENTRIES);
      const tx = db.transaction('activity', 'readwrite');
      for (const e of toDelete) tx.store.delete(e.id);
      await tx.done;
    }
  } catch (err) {
    // Non-fatal: activity log failure should not break saves
    console.warn('Failed to log activity:', err);
  }
}

export async function getRecentActivity(projectId, limit = 20) {
  try {
    const db = await getDB();
    const entries = await db.getAllFromIndex('activity', 'projectId', projectId);
    return entries
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  } catch (err) {
    return [];
  }
}

export async function getPagesByTag(projectId, tag) {
  const pages = await getPages(projectId);
  const t = tag.toLowerCase();
  return pages.filter(p => 
    p.tags && Array.isArray(p.tags) && p.tags.some(pt => pt.toLowerCase() === t)
  );
}

// ==========================================
// Canvas Workspaces (Tabs & Nodes)
// ==========================================

export async function getAllTabs() {
  const db = await getDB();
  return db.getAllFromIndex('tabs', 'createdAt');
}

export async function getTab(id) {
  return getById('tabs', id);
}

export async function saveTab(tab) {
  tab.updatedAt = now();
  if (!tab.createdAt) tab.createdAt = now();
  if (!tab.id) tab.id = generateId();
  await put('tabs', tab);
  return tab;
}

export async function deleteTab(id) {
  const nodes = await getNodesForTab(id);
  const db = await getDB();
  const tx = db.transaction('nodes', 'readwrite');
  for (const node of nodes) {
    tx.store.delete(node.id);
  }
  await tx.done;
  return deleteById('tabs', id);
}

export async function getAllNodes() {
  const db = await getDB();
  return db.getAll('nodes');
}

export async function getNodesForTab(tabId) {
  const db = await getDB();
  return db.getAllFromIndex('nodes', 'tabId', tabId);
}

export async function getNode(id) {
  return getById('nodes', id);
}

export async function saveNode(node) {
  node.updatedAt = now();
  if (!node.createdAt) node.createdAt = now();
  if (!node.id) node.id = generateId();
  return put('nodes', node);
}

export async function deleteNode(id) {
  return deleteById('nodes', id);
}

// Export / Import (V3 universal format + Canvas)
export async function exportUniversalData() {
  const db = await getDB();
  return {
    version: DB_VERSION,
    exportedAt: now(),
    projects: await db.getAll('projects'),
    schemas: await db.getAll('schemas'),
    pages: await db.getAll('pages'),
    links: await db.getAll('links'),
    images: await db.getAll('images'),
    tabs: await db.getAll('tabs'),
    nodes: await db.getAll('nodes'),
    activity: await db.getAll('activity')
  };
}

export async function importUniversalData(data) {
  await clearDatabase();
  const db = await getDB();
  const stores = ['projects', 'schemas', 'pages', 'links', 'images', 'tabs', 'nodes', 'activity'];
  for (const storeName of stores) {
    if (data[storeName]) {
      const tx = db.transaction(storeName, 'readwrite');
      for (const item of data[storeName]) {
        tx.store.put(item);
      }
      await tx.done;
    }
  }
}

export async function clearDatabase() {
  const db = await getDB();
  const stores = ['projects', 'schemas', 'pages', 'links', 'images', 'tabs', 'nodes', 'activity'];
  const tx = db.transaction(stores, 'readwrite');
  for (const storeName of stores) {
    tx.objectStore(storeName).clear();
  }
  await tx.done;
}

let saveToFileTimeout = null;
let pendingSavePromise = null;

async function executeSave(filePath) {
  try {
    const data = await exportUniversalData();
    await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log('Project file saved to:', filePath);
  } catch (err) {
    console.error('Save to file failed:', err);
  } finally {
    pendingSavePromise = null;
  }
}

export function triggerFileAutosave(immediate = false) {
  const filePath = localStorage.getItem('forge-active-project-path');
  if (!filePath || !window.electronAPI) return;
  
  clearTimeout(saveToFileTimeout);
  if (immediate) {
    pendingSavePromise = executeSave(filePath);
  } else {
    saveToFileTimeout = setTimeout(() => {
      pendingSavePromise = executeSave(filePath);
    }, 1500); // 1.5s debounce
  }
}

export async function flushFileAutosave() {
  const filePath = localStorage.getItem('forge-active-project-path');
  if (!filePath || !window.electronAPI) return;
  
  if (saveToFileTimeout) {
    clearTimeout(saveToFileTimeout);
    saveToFileTimeout = null;
    pendingSavePromise = executeSave(filePath);
  }
  
  if (pendingSavePromise) {
    await pendingSavePromise;
  }
}

export async function initActiveProject() {
  const filePath = localStorage.getItem('forge-active-project-path');
  if (!filePath || !window.electronAPI) {
    return null;
  }
  try {
    const dataStr = await window.electronAPI.readFile(filePath);
    const data = JSON.parse(dataStr);
    await importUniversalData(data);
    return await getActiveProject();
  } catch (err) {
    console.error('Failed to auto-load project file:', err);
    localStorage.removeItem('forge-active-project-path');
    return null;
  }
}

export async function closeProject() {
  await flushFileAutosave(); // Flush first to prevent writing empty data
  localStorage.removeItem('forge-active-project-path');
  await clearDatabase();
}

export function getRecentProjects() {
  try {
    const raw = localStorage.getItem('forge-recent-projects');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function addRecentProject(filePath, projectName) {
  const recents = getRecentProjects();
  const filtered = recents.filter(r => r.path !== filePath);
  filtered.unshift({
    name: projectName || 'Unnamed Project',
    path: filePath,
    lastOpened: new Date().toISOString()
  });
  localStorage.setItem('forge-recent-projects', JSON.stringify(filtered.slice(0, 5)));
}
