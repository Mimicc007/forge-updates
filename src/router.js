import { flushFileAutosave } from './db.js';

const routes = {};
let currentRoute = null;
let beforeNavigateHook = null;

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function setBeforeNavigate(hook) {
  beforeNavigateHook = hook;
}

export function navigate(path) {
  window.location.hash = '#/' + path;
}

export function getCurrentRoute() {
  return currentRoute;
}

function parseHash() {
  const hash = window.location.hash.slice(2) || 'dashboard';
  return hash;
}

function findRoute(path) {
  // Exact match
  if (routes[path]) return { handler: routes[path], params: {} };

  // Pattern match (e.g., "characters/:id")
  for (const [pattern, handler] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, params };
  }

  return null;
}

async function handleRoute() {
  const path = parseHash();

  // Flush any pending database autosave before navigating
  try {
    await flushFileAutosave();
  } catch (err) {
    console.error('Error flushing autosave during navigation:', err);
  }

  if (beforeNavigateHook) {
    const shouldContinue = await beforeNavigateHook(path, currentRoute);
    if (shouldContinue === false) return;
  }

  const match = findRoute(path);
  const container = document.getElementById('page-container');

  if (!container) return;

  // Fade out
  container.style.opacity = '0';
  container.style.transform = 'translateY(12px)';

  await new Promise(r => setTimeout(r, 150));

  if (match) {
    currentRoute = path;
    
    // Clean up page-specific active classes
    container.classList.remove('canvas-page-active');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.classList.remove('canvas-page-active');
    
    if (container._cleanup) {
      try { container._cleanup(); } catch (e) { console.error('Error in page cleanup:', e); }
      container._cleanup = null;
    }
    
    // Reset any inline style attributes applied by individual pages
    container.removeAttribute('style');
    
    // Check if there is an active dragging element inside the container.
    // If so, we hide the old wrapper offscreen without changing its DOM hierarchy
    // to prevent Chromium from cancelling the drag operation.
    const activeDrag = container.querySelector('[data-dragging="true"]');
    if (activeDrag) {
      const oldWrapper = container.querySelector('.page-wrapper');
      if (oldWrapper) {
        oldWrapper.classList.remove('page-wrapper');
        oldWrapper.style.position = 'fixed';
        oldWrapper.style.top = '-9999px';
        oldWrapper.style.left = '-9999px';
        oldWrapper.style.pointerEvents = 'none';

        const cleanUpDrag = () => {
          oldWrapper.remove();
          window.removeEventListener('dragend', cleanUpDrag);
        };
        window.addEventListener('dragend', cleanUpDrag);
      }
    } else {
      container.innerHTML = '';
    }

    // Create a new wrapper for the page
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.style.width = '100%';
    pageWrapper.style.height = '100%';
    container.appendChild(pageWrapper);

    // Proxy classes and styles from pageWrapper to container
    const observer = new MutationObserver(() => {
      const classes = Array.from(pageWrapper.classList).filter(c => c !== 'page-wrapper');
      container.className = classes.join(' ');
      container.style.cssText = pageWrapper.style.cssText;
    });
    observer.observe(pageWrapper, { attributes: true, attributeFilter: ['class', 'style'] });

    await match.handler(pageWrapper, match.params);

    if (pageWrapper._cleanup) {
      container._cleanup = pageWrapper._cleanup;
    }
  } else {
    currentRoute = path;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2 class="empty-state-title">Page Not Found</h2>
        <p class="empty-state-text">The page you're looking for doesn't exist.</p>
        <button class="btn btn-primary" onclick="window.location.hash='#/dashboard'">Go Home</button>
      </div>
    `;
  }

  // Fade in
  requestAnimationFrame(() => {
    container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
  });

  // Update sidebar active state
  updateSidebarActive(path);

  setTimeout(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
    // Dispatch event so tutorial and other systems can hook into page load
    window.dispatchEvent(new CustomEvent('page-rendered', { detail: { path, match } }));
  }, 50);
}

function updateSidebarActive(path) {
  const basePath = path.split('/')[0];
  document.querySelectorAll('.nav-item').forEach(item => {
    const itemPath = item.dataset.route;
    if (itemPath === basePath) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  // Initial route
  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  } else {
    handleRoute();
  }
}

export async function refreshCurrentRoute() {
  await handleRoute();
}
