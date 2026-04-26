(function (global) {
  "use strict";

  if (global.DPEDomUtils) {
    return;
  }

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "META",
    "LINK",
    "TITLE",
    "HEAD",
    "SVG",
    "PATH",
    "DEFS",
    "G",
    "MASK",
    "CLIPPATH",
    "CANVAS"
  ]);

  function safeRect(element) {
    try {
      return element.getBoundingClientRect();
    } catch (_error) {
      return null;
    }
  }

  function isWithinViewport(rect, viewportWidth, viewportHeight, leeway) {
    const pad = typeof leeway === "number" ? leeway : 120;
    const w = viewportWidth || window.innerWidth;
    const h = viewportHeight || window.innerHeight;
    if (!rect) return false;
    if (rect.width < 1 || rect.height < 1) return false;
    return !(
      rect.bottom < -pad ||
      rect.top > h + pad ||
      rect.right < -pad ||
      rect.left > w + pad
    );
  }

  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") < 0.05) return false;
    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
    const rect = safeRect(element);
    if (!rect || rect.width < 1 || rect.height < 1) return false;
    return true;
  }

  function isAnalyzableElement(element) {
    if (!element || !element.tagName) return false;
    if (SKIP_TAGS.has(element.tagName.toUpperCase())) return false;
    if (!isElementVisible(element)) return false;
    return true;
  }

  function classHint(element) {
    if (!element || !element.classList || element.classList.length === 0) return "";
    return Array.from(element.classList).slice(0, 4).join(".");
  }

  function semanticPriority(element) {
    const tag = element.tagName.toLowerCase();
    if (["header", "nav", "main", "section", "article", "footer", "aside"].includes(tag)) return 55;
    if (/^h[1-6]$/.test(tag)) return 52;
    if (["button", "input", "textarea", "select", "form", "table"].includes(tag)) return 48;
    if (["a", "p", "ul", "ol", "li"].includes(tag)) return 35;
    if (tag === "div") return 12;
    return 6;
  }

  function toPxNumber(value) {
    if (!value || value === "normal" || value === "auto") return null;
    const match = String(value).match(/([+-]?\d+(\.\d+)?)px/i);
    return match ? parseFloat(match[1]) : null;
  }

  function round(value, precision) {
    const p = typeof precision === "number" ? precision : 2;
    const factor = Math.pow(10, p);
    return Math.round(value * factor) / factor;
  }

  function compactSpacing(top, right, bottom, left) {
    if (top === right && right === bottom && bottom === left) return String(top);
    if (top === bottom && right === left) return `${top} ${right}`;
    if (right === left) return `${top} ${right} ${bottom}`;
    return `${top} ${right} ${bottom} ${left}`;
  }

  function parseBoxValues(shorthand) {
    if (!shorthand || typeof shorthand !== "string") return ["0px", "0px", "0px", "0px"];
    const parts = shorthand.trim().split(/\s+/);
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    return [parts[0], parts[1], parts[2], parts[3]];
  }

  function topEntries(map, limit, minCount) {
    const min = typeof minCount === "number" ? minCount : 1;
    const max = typeof limit === "number" ? limit : 8;
    return Array.from(map.entries())
      .filter(([, count]) => count >= min)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([value, count]) => ({ value, count: round(count, 2) }));
  }

  function uniquePush(list, item, signature, max) {
    const key = signature || JSON.stringify(item);
    const limit = typeof max === "number" ? max : 6;
    if (!list.some((entry) => entry.__sig === key)) {
      const wrapped = { ...item, __sig: key };
      list.push(wrapped);
    }
    if (list.length > limit) {
      list.length = limit;
    }
  }

  function cleanSamples(list) {
    return list.map((entry) => {
      const next = { ...entry };
      delete next.__sig;
      return next;
    });
  }

  function median(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  }

  global.DPEDomUtils = {
    SKIP_TAGS,
    safeRect,
    isWithinViewport,
    isElementVisible,
    isAnalyzableElement,
    classHint,
    semanticPriority,
    toPxNumber,
    round,
    compactSpacing,
    parseBoxValues,
    topEntries,
    uniquePush,
    cleanSamples,
    median
  };
})(window);
