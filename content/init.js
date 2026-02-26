"use strict";

(() => {
  const CE = window.MultiSearch;

  // ── Keyboard shortcut ──────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
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
    CE.loadState(() => {
      CE.showPanel();
    });
  });
})();
