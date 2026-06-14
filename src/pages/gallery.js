/* ============================================================
   Forge — Gallery Page
   Unified image gallery pulling from all uploaded images.
   ============================================================ */

import {
  getAllImages,
  saveImage,
  deleteImage,
  getAllCharacters,
  getAllWorldEntries,
  getAllGameDesignEntries,
} from '../db.js';
import {
  showToast,
  showConfirm,
  showLightbox,
  createImageUploadZone,
  fileToDataURL,
  escapeHtml,
} from '../ui.js';

export async function renderGallery(container) {
  let activeFilter = 'all';

  async function loadData() {
    const [images, characters, worldEntries, gdEntries] = await Promise.all([
      getAllImages(),
      getAllCharacters(),
      getAllWorldEntries(),
      getAllGameDesignEntries(),
    ]);

    // Build lookup maps for entities to display their names in the hover overlay
    const charMap = Object.fromEntries(characters.map(c => [c.id, c]));
    const worldMap = Object.fromEntries(worldEntries.map(w => [w.id, w]));
    const gdMap = Object.fromEntries(gdEntries.map(g => [g.id, g]));

    return { images, charMap, worldMap, gdMap };
  }

  async function render() {
    const { images, charMap, worldMap, gdMap } = await loadData();

    // Filter images
    const filteredImages = images.filter(img => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'uncategorized') {
        return img.entityType !== 'character' && img.entityType !== 'world' && img.entityType !== 'gamedesign';
      }
      return img.entityType === activeFilter;
    });

    // Sort images: newest first
    filteredImages.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-row">
          <div>
            <h1 class="page-title">Gallery</h1>
            <p class="page-subtitle">All your concept art in one place</p>
          </div>
        </div>
      </div>

      <!-- Upload Zone -->
      <div class="detail-section mb-6">
        <h3 class="detail-section-title">📤 Upload New Art</h3>
        <div id="gallery-upload-zone"></div>
      </div>

      <!-- Filters -->
      <div class="tabs" id="gallery-tabs">
        <button class="tab ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${images.length})</button>
        <button class="tab ${activeFilter === 'character' ? 'active' : ''}" data-filter="character">Characters (${images.filter(i => i.entityType === 'character').length})</button>
        <button class="tab ${activeFilter === 'world' ? 'active' : ''}" data-filter="world">World (${images.filter(i => i.entityType === 'world').length})</button>
        <button class="tab ${activeFilter === 'gamedesign' ? 'active' : ''}" data-filter="gamedesign">Game Design (${images.filter(i => i.entityType === 'gamedesign').length})</button>
        <button class="tab ${activeFilter === 'uncategorized' ? 'active' : ''}" data-filter="uncategorized">Uncategorized (${images.filter(i => i.entityType !== 'character' && i.entityType !== 'world' && i.entityType !== 'gamedesign').length})</button>
      </div>

      <!-- Image Grid -->
      <div id="gallery-content">
        ${filteredImages.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">🎨</div>
            <h2 class="empty-state-title">No images found</h2>
            <p class="empty-state-text">Drag & drop some images or change your filter.</p>
          </div>
        ` : `
          <div class="image-gallery-grid">
            ${filteredImages.map(img => {
              let entityName = '';
              let entityTypeLabel = '';

              if (img.entityType === 'character') {
                const char = charMap[img.entityId];
                entityName = char ? char.name : 'Unknown Character';
                entityTypeLabel = 'Character';
              } else if (img.entityType === 'world') {
                const w = worldMap[img.entityId];
                entityName = w ? w.name : 'Unknown World Entry';
                entityTypeLabel = `World (${w ? w.category.charAt(0).toUpperCase() + w.category.slice(1) : 'Entry'})`;
              } else if (img.entityType === 'gamedesign') {
                const g = gdMap[img.entityId];
                entityName = g ? (g.name || g.title) : 'Unknown Design Entry';
                entityTypeLabel = `Game Design (${g ? g.category.charAt(0).toUpperCase() + g.category.slice(1) : 'Entry'})`;
              } else {
                entityName = img.name || 'Uncategorized Upload';
                entityTypeLabel = 'Uncategorized';
              }

              return `
                <div class="image-gallery-item" data-img-id="${img.id}">
                  <img src="${img.data}" alt="${escapeHtml(img.name || 'Concept Art')}" loading="lazy" />
                  <div class="image-overlay">
                    <div style="display:flex; flex-direction:column; gap:2px; flex:1; overflow:hidden;">
                      <span style="color:#fff; font-size:var(--fs-sm); font-weight:var(--fw-semibold); text-shadow:0 1px 4px rgba(0,0,0,0.8);" class="truncate">
                        ${escapeHtml(entityName)}
                      </span>
                      <span style="color:var(--text-secondary); font-size:var(--fs-xs); text-shadow:0 1px 2px rgba(0,0,0,0.8);" class="truncate">
                        ${escapeHtml(entityTypeLabel)}
                      </span>
                    </div>
                    <div class="image-actions" style="margin-left: var(--sp-2);">
                      <button class="btn btn-icon btn-danger btn-sm img-delete-btn" data-img-id="${img.id}" style="width:24px; height:24px; padding:0; font-size:var(--fs-xs);" title="Delete Image">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // ── Setup Image Upload Zone ──
    const uploadZone = createImageUploadZone(async (files) => {
      let uploadCount = 0;
      for (const file of files) {
        const dataUrl = await fileToDataURL(file);
        await saveImage({
          entityType: 'gallery',
          entityId: 'gallery',
          name: file.name,
          data: dataUrl,
        });
        uploadCount++;
      }
      if (uploadCount > 0) {
        showToast(`Successfully uploaded ${uploadCount} uncategorized image(s)`, 'success');
        render();
      }
    });
    container.querySelector('#gallery-upload-zone').appendChild(uploadZone);

    // ── Filter Click Handlers ──
    container.querySelectorAll('#gallery-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeFilter = tab.dataset.filter;
        render();
      });
    });

    // ── Grid Interaction Events ──
    container.querySelectorAll('.image-gallery-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Prevent lightbox from triggering if delete action is clicked
        if (e.target.closest('.img-delete-btn')) return;

        const imgId = item.dataset.imgId;
        const img = images.find(i => i.id === imgId);
        if (img) showLightbox(img.data);
      });
    });

    // ── Delete Image Buttons ──
    container.querySelectorAll('.img-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imgId = btn.dataset.imgId;
        const confirmed = await showConfirm(
          'Delete Image',
          'Are you sure you want to permanently delete this image? If it is linked as a portrait or concept art for a character/lore entry, that link will be broken.'
        );
        if (confirmed) {
          await deleteImage(imgId);
          showToast('Image deleted successfully', 'success');
          render();
        }
      });
    });
  }

  await render();
}
