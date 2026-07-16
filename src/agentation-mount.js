/* ============================================================
   agentation-mount.js
   Mounts the Agentation dev toolbar as a React island inside
   the vanilla-JS Forge app. Only active in development mode.
   ============================================================ */

// Only mount in dev — Vite exposes import.meta.env.DEV
if (import.meta.env.DEV) {
  // Dynamically import React + ReactDOM + Agentation so none of this
  // ever ends up in a production bundle.
  Promise.all([
    import('react'),
    import('react-dom/client'),
    import('agentation'),
  ]).then(([{ default: React }, { createRoot }, { Agentation }]) => {
    // Create a dedicated host element outside #app so it never
    // interferes with Forge's own DOM.
    const host = document.createElement('div');
    host.id = 'agentation-root';
    // Ensure it floats above everything else
    host.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;';
    document.body.appendChild(host);

    // Mount the React component into the isolated host
    const root = createRoot(host);
    root.render(React.createElement(Agentation));

    console.log('[Forge] 🎨 Agentation toolbar mounted (dev only)');
  }).catch((err) => {
    console.warn('[Forge] Agentation failed to load:', err);
  });
}
