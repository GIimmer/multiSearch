"use strict";

(() => {
  const CE = window.MultiSearch;
  const state = CE.state;

  let host = null;

  CE.setHost = (el) => { host = el; };

  // ── Visibility ─────────────────────────────────────────────────────
  CE.isVisible = (el) => {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  };

  CE.visibleMarks = (termIndex) => {
    const marks = state.highlights[termIndex];
    if (!marks) return [];
    return marks.filter(CE.isVisible);
  };

  // ── Clear highlights ───────────────────────────────────────────────
  CE.clearHighlightsForTerm = (termIndex) => {
    const marks = state.highlights[termIndex];
    if (!marks) return;
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent);
      parent.replaceChild(text, mark);
      parent.normalize();
    });
    state.highlights[termIndex] = [];
    state.currentIndex[termIndex] = -1;
  };

  CE.clearAllHighlights = () => {
    for (let i = 0; i < state.highlights.length; i++) {
      CE.clearHighlightsForTerm(i);
    }
  };

  // ── Run highlighting ───────────────────────────────────────────────
  CE.runHighlight = () => {
    CE.clearAllHighlights();
    state.highlights = state.terms.map(() => []);
    state.currentIndex = state.terms.map(() => -1);

    state.terms.forEach((term, i) => {
      if (!term.text) return;
      highlightTerm(term.text, i, term.colorIndex);
    });

    if (CE.updateMatchCounts) CE.updateMatchCounts();
  };

  function highlightTerm(term, posIndex, colorIndex) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let regex;
    try {
      regex = new RegExp(escaped, "gi");
    } catch {
      return;
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (host && host.contains(node)) return NodeFilter.FILTER_REJECT;
          const tag = node.parentElement?.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.tagName === "MSEARCH-MARK") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((textNode) => {
      const text = textNode.textContent;
      regex.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      }
      if (matches.length === 0) return;

      const frag = document.createDocumentFragment();
      let lastEnd = 0;

      matches.forEach(({ start, end, text: matchText }) => {
        if (start > lastEnd) {
          frag.appendChild(document.createTextNode(text.slice(lastEnd, start)));
        }
        const mark = document.createElement("msearch-mark");
        mark.setAttribute("data-term", colorIndex);
        mark.textContent = matchText;
        frag.appendChild(mark);
        state.highlights[posIndex].push(mark);
        lastEnd = end;
      });

      if (lastEnd < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastEnd)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────
  CE.navigateTerm = (termIndex, direction) => {
    const marks = state.highlights[termIndex];
    if (!marks || marks.length === 0) return;

    if (state.currentIndex[termIndex] >= 0 && marks[state.currentIndex[termIndex]]) {
      marks[state.currentIndex[termIndex]].classList.remove("msearch-current");
    }

    const start = state.currentIndex[termIndex];
    let next = start;
    let steps = 0;
    do {
      next += direction;
      if (next >= marks.length) next = 0;
      if (next < 0) next = marks.length - 1;
      steps++;
    } while (!CE.isVisible(marks[next]) && steps < marks.length);

    if (steps >= marks.length && !CE.isVisible(marks[next])) return;

    state.currentIndex[termIndex] = next;
    const el = marks[next];
    el.classList.add("msearch-current");
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    if (CE.updateMatchCounts) CE.updateMatchCounts();
  };
})();
