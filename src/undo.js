/* ============================================================
   Forge V2.0 — Undo/Redo Manager
   Lightweight event-sourcing undo stack for page edits.
   ============================================================ */

const MAX_STACK = 50;

class UndoManager {
  constructor() {
    this.undoStack = []; // Array of snapshot objects
    this.redoStack = [];
    this.paused = false;
  }

  // Push a snapshot onto the undo stack
  // snapshot: { pageId, title, content, properties }
  push(snapshot) {
    if (this.paused) return;
    this.undoStack.push({
      ...snapshot,
      capturedAt: Date.now()
    });
    // Trim to max
    if (this.undoStack.length > MAX_STACK) {
      this.undoStack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
  }

  // Get the snapshot to restore on Ctrl+Z
  undo() {
    if (this.undoStack.length === 0) return null;
    const snapshot = this.undoStack.pop();
    this.redoStack.push(snapshot);
    return snapshot;
  }

  // Get the snapshot to restore on Ctrl+Shift+Z
  redo() {
    if (this.redoStack.length === 0) return null;
    const snapshot = this.redoStack.pop();
    this.undoStack.push(snapshot);
    return snapshot;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  // Temporarily pause recording (e.g. during undo/redo application)
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  // Clear stacks (e.g. on page navigation)
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.paused = false;
  }
}

// Singleton instance
export const undoManager = new UndoManager();

// Keyboard binding helper (call once during app init)
export function initUndoKeyboard(getActivePage, savePageFn) {
  document.addEventListener('keydown', async (e) => {
    // Only trigger when NOT in an input/textarea/select
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isEditable = document.activeElement?.isContentEditable;
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable) return;

    const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
    const isRedo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey));

    if (isUndo && undoManager.canUndo()) {
      e.preventDefault();
      const snapshot = undoManager.undo();
      if (snapshot && savePageFn) {
        undoManager.pause();
        await savePageFn(snapshot);
        undoManager.resume();
        window.dispatchEvent(new CustomEvent('forge-undo', { detail: snapshot }));
      }
    } else if (isRedo && undoManager.canRedo()) {
      e.preventDefault();
      const snapshot = undoManager.redo();
      if (snapshot && savePageFn) {
        undoManager.pause();
        await savePageFn(snapshot);
        undoManager.resume();
        window.dispatchEvent(new CustomEvent('forge-redo', { detail: snapshot }));
      }
    }
  });
}
