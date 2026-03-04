"use strict";

(() => {
  const CE = window.MultiSearch;

  // ── Keyboard shortcut ──────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "s") {
      CE.togglePanel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && CE.state.panelVisible) {
      CE.dismissPanel();
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ── Toolbar icon (via background.js message) ───────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle-panel") {
      CE.togglePanel();
    }
  });

  // ── Bootstrap ──────────────────────────────────────────────────────
  CE.initPanel().then(() => {
    CE.state.ready = true;
    CE.loadState(() => {
      CE.showPanel();
    });
  });
})();
