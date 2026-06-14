/* ============================================================
   Forge — Multi-Document Tab System
   Manages tabs, state persistence, scroll caching, and title synchronization.
   ============================================================ */

import { navigate } from './router.js';

let tabs = [];
let activeTabId = null;

// Default tab if none exists
const DEFAULT_TAB_ROUTE = 'dashboard';
const DEFAULT_TAB_TITLE = 'Dashboard';

export function initTabs() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Insert tab container at the top of main content if not already there
  let container = document.getElementById('workspace-tabs-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'workspace-tabs-container';
    
    // Notion-style top tab bar structure
    container.innerHTML = `
      <div class="tabs-scroll-area">
        <div id="workspace-tabs" class="workspace-tabs-list"></div>
      </div>
      <button class="new-tab-btn" id="new-tab-btn" title="Open new tab (Ctrl+T)">+</button>
    `;
    
    mainContent.insertBefore(container, mainContent.firstChild);
    
    // Add event listener for the "+" button
    document.getElementById('new-tab-btn')?.addEventListener('click', () => {
      openNewTab(DEFAULT_TAB_ROUTE, DEFAULT_TAB_TITLE);
    });
  }

  // Bind Keyboard Shortcut Ctrl+T for new tab
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      openNewTab(DEFAULT_TAB_ROUTE, DEFAULT_TAB_TITLE);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      // Close active tab
      e.preventDefault();
      if (activeTabId) {
        closeTab(activeTabId);
      }
    }
  });

  // Load tabs from localStorage
  loadTabsFromStorage();

  // Render
  renderTabsUI();
}

function loadTabsFromStorage() {
  try {
    const saved = localStorage.getItem('forge-workspace-tabs');
    const savedActive = localStorage.getItem('forge-workspace-active-tab-id');
    
    if (saved) {
      tabs = JSON.parse(saved);
    }
    
    if (savedActive) {
      activeTabId = savedActive;
    }
  } catch (err) {
    console.error('Failed to load tabs from storage', err);
  }

  // Ensure we have at least one tab
  if (tabs.length === 0) {
    const initialRoute = window.location.hash.slice(2) || DEFAULT_TAB_ROUTE;
    const initialTitle = getFriendlyTitleForRoute(initialRoute);
    const newTab = {
      id: generateTabId(),
      route: initialRoute,
      title: initialTitle,
      scrollPosition: 0
    };
    tabs.push(newTab);
    activeTabId = newTab.id;
    saveTabsToStorage();
  }
}

function saveTabsToStorage() {
  localStorage.setItem('forge-workspace-tabs', JSON.stringify(tabs));
  localStorage.setItem('forge-workspace-active-tab-id', activeTabId);
}

function generateTabId() {
  return 'tab-' + Math.random().toString(36).substr(2, 9);
}

function getFriendlyTitleForRoute(route) {
  if (!route || route === 'dashboard') return 'Dashboard';
  const parts = route.split('/');
  const base = parts[0];
  
  const labels = {
    characters: 'Characters',
    world: 'World Lore',
    story: 'Story Timeline',
    gamedesign: 'Game Design',
    gallery: 'Art Gallery',
    relationshipMap: 'Relationships'
  };
  
  let label = labels[base] || base.charAt(0).toUpperCase() + base.slice(1);
  if (parts.length > 1 && parts[1] === 'new') {
    label = 'New ' + (base === 'gamedesign' ? 'Design' : label.slice(0, -1));
  } else if (parts.length > 1) {
    label = label + ' (Loading...)';
  }
  return label;
}

export function renderTabsUI() {
  const tabsList = document.getElementById('workspace-tabs');
  if (!tabsList) return;

  tabsList.innerHTML = '';

  tabs.forEach(tab => {
    const isActive = tab.id === activeTabId;
    const tabEl = document.createElement('div');
    tabEl.className = `workspace-tab ${isActive ? 'active' : ''}`;
    tabEl.dataset.tabId = tab.id;
    
    // Visual layout for tab
    tabEl.innerHTML = `
      <span class="tab-title-text" title="${escapeTabHtml(tab.title)}">${escapeTabHtml(tab.title)}</span>
      <span class="tab-close-icon" title="Close tab">✕</span>
    `;

    // Click handler to select tab
    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close-icon')) {
        e.stopPropagation();
        closeTab(tab.id);
      } else {
        selectTab(tab.id);
      }
    });

    // Support middle click to close tab
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) { // Middle click
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    tabsList.appendChild(tabEl);
  });

  // Keep active tab in view in scroll bar
  const activeEl = tabsList.querySelector('.workspace-tab.active');
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

export function selectTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Cache current scroll position of the active tab before switching
  cacheCurrentScroll();

  activeTabId = tabId;
  saveTabsToStorage();
  renderTabsUI();

  // Navigate to hash
  navigate(tab.route);

  // Restore scroll position after a slight delay for page rendering
  setTimeout(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollTop = tab.scrollPosition || 0;
    }
  }, 100);
}

export function openNewTab(route = DEFAULT_TAB_ROUTE, title = DEFAULT_TAB_TITLE) {
  // Cache current scroll
  cacheCurrentScroll();

  const newTab = {
    id: generateTabId(),
    route: route,
    title: title || getFriendlyTitleForRoute(route),
    scrollPosition: 0
  };
  
  tabs.push(newTab);
  activeTabId = newTab.id;
  saveTabsToStorage();
  renderTabsUI();
  
  navigate(route);
  
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
}

export function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  tabs.splice(index, 1);

  // If we closed the active tab, pick a new one
  if (tabId === activeTabId) {
    if (tabs.length > 0) {
      // Pick previous tab, or first if index was 0
      const nextActiveIndex = Math.max(0, index - 1);
      activeTabId = tabs[nextActiveIndex].id;
    } else {
      // Reset to default
      const newTab = {
        id: generateTabId(),
        route: DEFAULT_TAB_ROUTE,
        title: DEFAULT_TAB_TITLE,
        scrollPosition: 0
      };
      tabs.push(newTab);
      activeTabId = newTab.id;
    }
  }

  saveTabsToStorage();
  renderTabsUI();
  
  // Navigate to active tab's route
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    navigate(activeTab.route);
    setTimeout(() => {
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.scrollTop = activeTab.scrollPosition || 0;
      }
    }, 100);
  }
}

export function updateActiveTab(route) {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    // If route has changed, update it
    if (activeTab.route !== route) {
      activeTab.route = route;
      // Temporarily set a friendly loading title if we don't have custom override yet
      activeTab.title = getFriendlyTitleForRoute(route);
      saveTabsToStorage();
      renderTabsUI();
    }
  } else {
    // Edge case: no active tab. Set up one.
    const newTab = {
      id: generateTabId(),
      route: route,
      title: getFriendlyTitleForRoute(route),
      scrollPosition: 0
    };
    tabs.push(newTab);
    activeTabId = newTab.id;
    saveTabsToStorage();
    renderTabsUI();
  }
}

export function setTabTitle(title) {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && title) {
    activeTab.title = title;
    saveTabsToStorage();
    renderTabsUI();
  }
}

// Make globally accessible for easy page integration
window.setTabTitle = setTabTitle;

export function cacheCurrentScroll() {
  const mainContent = document.getElementById('main-content');
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (mainContent && activeTab) {
    // The top tab bar container is 40px, don't count it if possible, but standard scrollTop is fine
    activeTab.scrollPosition = mainContent.scrollTop;
    saveTabsToStorage();
  }
}

function escapeTabHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
