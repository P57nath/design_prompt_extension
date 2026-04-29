(function () {
  "use strict";

  if (window.__DPE_CONTENT_SCRIPT_READY__) {
    return;
  }
  window.__DPE_CONTENT_SCRIPT_READY__ = true;

  const colorUtils = window.DPEColorUtils;
  const domUtils = window.DPEDomUtils;

  if (!colorUtils || !domUtils) {
    console.error("Design Prompt Extractor utils are missing.");
    return;
  }

  const MAX_ANALYZED_ELEMENTS = 700;
  const PRIORITY_SELECTOR = [
    "header",
    "nav",
    "main",
    "section",
    "article",
    "aside",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "form",
    "input",
    "textarea",
    "select",
    "table",
    "[role='button']",
    "[role='navigation']",
    "[class*='card']",
    "[class*='hero']",
    "[class*='feature']",
    "[class*='pricing']",
    "[class*='testimonial']",
    "[class*='sidebar']",
    "[class*='search']"
  ].join(",");

  function increment(map, key, amount) {
    if (!key) return;
    const delta = typeof amount === "number" ? amount : 1;
    map.set(key, (map.get(key) || 0) + delta);
  }

  function trimFontFamily(value) {
    if (!value) return "";
    return value
      .split(",")
      .slice(0, 2)
      .join(",")
      .replace(/["']/g, "")
      .trim();
  }

  function isMeaningfulColor(value) {
    return !!colorUtils.normalizeColor(value);
  }

  function toNumber(value) {
    if (typeof value !== "string") return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  function createComponentStore() {
    return {
      count: 0,
      samples: [],
      patterns: new Map()
    };
  }

  function finalizeComponentStore(store) {
    return {
      count: store.count,
      samples: domUtils.cleanSamples(store.samples),
      repeatedPatterns: domUtils.topEntries(store.patterns, 3)
    };
  }

  function recordComponent(store, element, style, rect, extra) {
    if (!store || !element || !style || !rect) return;
    store.count += 1;
    const backgroundColor = colorUtils.normalizeColor(style.backgroundColor) || "transparent";
    const textColor = colorUtils.normalizeColor(style.color) || "inherit";
    const borderColor = colorUtils.normalizeColor(style.borderTopColor) || "transparent";
    const border = `${style.borderTopWidth} ${style.borderTopStyle} ${borderColor}`;
    const padding = domUtils.compactSpacing(
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft
    );
    const sample = {
      tag: element.tagName.toLowerCase(),
      classHint: domUtils.classHint(element),
      shape: style.borderRadius,
      color: backgroundColor,
      textColor,
      border,
      shadow: style.boxShadow === "none" ? "none" : style.boxShadow,
      padding,
      typography: `${style.fontSize} / ${style.fontWeight} / ${trimFontFamily(style.fontFamily)}`,
      layout: style.display,
      approxSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ...extra
    };
    const signature = [
      sample.tag,
      sample.shape,
      sample.color,
      sample.border,
      sample.shadow,
      sample.padding,
      sample.typography,
      sample.layout
    ].join("|");
    increment(store.patterns, signature, 1);
    domUtils.uniquePush(store.samples, sample, signature, 5);
  }

  function getTextSnippet(element) {
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.slice(0, 80);
  }

  function isButtonLike(element, tag, role, className) {
    if (tag === "button") return true;
    if (role === "button" || role === "menuitem") return true;
    if (tag === "a" && /(btn|button|cta|action|primary)/.test(className)) return true;
    return false;
  }

  function isCardLike(element, style, rect, className) {
    if (/(card|tile|panel|feature|pricing|plan|testimonial|product)/.test(className)) return true;
    const hasShape = style.borderRadius !== "0px" || style.boxShadow !== "none";
    const hasBoundary = style.borderTopStyle !== "none" || style.boxShadow !== "none";
    const area = rect.width * rect.height;
    return hasShape && hasBoundary && area > 4000 && area < 450000;
  }

  function likelyHero(element, tag, rect, viewportHeight) {
    if (!["section", "header", "main", "div"].includes(tag)) return false;
    if (rect.top > viewportHeight * 0.55 || rect.height < viewportHeight * 0.2) return false;
    const heading = element.querySelector("h1, h2");
    if (!heading) return false;
    const cta = element.querySelector("button, a[href], [role='button']");
    return !!cta;
  }

  function likelyFeatureSection(element, tag) {
    if (!["section", "article", "div"].includes(tag)) return false;
    const className = (element.className || "").toString().toLowerCase();
    if (/(feature|benefit|services|capability)/.test(className)) return true;
    let cardChildren = 0;
    const children = element.children || [];
    for (let i = 0; i < children.length; i += 1) {
      const childClass = (children[i].className || "").toString().toLowerCase();
      if (/(card|feature|tile|benefit)/.test(childClass)) cardChildren += 1;
    }
    return cardChildren >= 3;
  }

  function likelyModal(style, rect, viewportWidth, viewportHeight, className) {
    if (/(modal|dialog|popup|overlay)/.test(className)) return true;
    if (style.position !== "fixed") return false;
    const centeredX = rect.left > viewportWidth * 0.1 && rect.right < viewportWidth * 0.9;
    const centeredY = rect.top > viewportHeight * 0.05 && rect.bottom < viewportHeight * 0.95;
    return centeredX && centeredY && rect.width > viewportWidth * 0.3 && rect.height > viewportHeight * 0.2;
  }

  function likelySidebar(tag, style, rect, viewportWidth, viewportHeight, className) {
    if (tag === "aside") return true;
    if (/(sidebar|drawer|sidenav)/.test(className)) return true;
    if (style.position === "fixed" || style.position === "sticky") {
      const onLeftOrRight = rect.left < viewportWidth * 0.2 || rect.right > viewportWidth * 0.8;
      if (onLeftOrRight && rect.height > viewportHeight * 0.45) return true;
    }
    return false;
  }

  function likelyBadge(style, rect, className, tag) {
    if (!["span", "div", "a"].includes(tag)) return false;
    if (/(badge|tag|chip|label|pill)/.test(className)) return true;
    const radius = domUtils.toPxNumber(style.borderRadius) || 0;
    const compact = rect.width < 220 && rect.height < 54;
    return radius >= 10 && compact && style.display !== "block";
  }

  function likelySearchBar(tag, element, className) {
    if (tag === "input") {
      const type = (element.getAttribute("type") || "").toLowerCase();
      if (type === "search") return true;
      const placeholder = (element.getAttribute("placeholder") || "").toLowerCase();
      if (placeholder.includes("search")) return true;
    }
    return /(search)/.test(className);
  }

  function likelyProductCard(element, className, textSnippet) {
    if (/(product|item|shop|catalog)/.test(className)) return true;
    const pricePattern = /(\$|usd|eur|gbp|৳|€|£)\s?\d+/i;
    const hasImage = !!element.querySelector("img");
    return hasImage && pricePattern.test(textSnippet);
  }

  function likelyPricingCard(className, textSnippet) {
    if (/(pricing|plan|tier|subscription)/.test(className)) return true;
    return /per month|\/month|annual|starter|pro|enterprise/i.test(textSnippet);
  }

  function likelyTestimonial(className, textSnippet) {
    if (/(testimonial|review|client|quote)/.test(className)) return true;
    return /(“|\"|customer|trusted by|what people say)/i.test(textSnippet);
  }

  function createHeadingStore() {
    return {
      h1: { counts: new Map(), samples: new Map() },
      h2: { counts: new Map(), samples: new Map() },
      h3: { counts: new Map(), samples: new Map() },
      h4: { counts: new Map(), samples: new Map() },
      h5: { counts: new Map(), samples: new Map() },
      h6: { counts: new Map(), samples: new Map() }
    };
  }

  function recordHeadingStyle(headingStore, tag, style) {
    const level = tag.toLowerCase();
    if (!headingStore[level]) return;
    const sample = {
      fontFamily: trimFontFamily(style.fontFamily),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform
    };
    const signature = Object.values(sample).join("|");
    increment(headingStore[level].counts, signature, 1);
    headingStore[level].samples.set(signature, sample);
  }

  function finalizeHeadingStore(headingStore) {
    const output = {};
    Object.keys(headingStore).forEach((key) => {
      const top = domUtils.topEntries(headingStore[key].counts, 1)[0];
      output[key] = top ? headingStore[key].samples.get(top.value) : null;
    });
    return output;
  }

  function collectCandidateElements() {
    if (!document.body) {
      return { candidates: [], totalRaw: 0, priorityCount: 0 };
    }

    const seen = new Set();
    const candidates = [];

    function pushCandidate(element, bonus) {
      if (!element || seen.has(element)) return;
      if (!domUtils.isAnalyzableElement(element)) return;
      seen.add(element);
      candidates.push({
        element,
        score: domUtils.semanticPriority(element) + (bonus || 0)
      });
    }

    const priority = Array.from(document.querySelectorAll(PRIORITY_SELECTOR));
    priority.forEach((el) => pushCandidate(el, 40));

    const all = Array.from(document.body.querySelectorAll("*"));
    const stride = all.length > 12000 ? Math.ceil(all.length / 4000) : all.length > 5000 ? 2 : 1;
    for (let i = 0; i < all.length; i += stride) {
      pushCandidate(all[i], 0);
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      candidates: candidates.slice(0, MAX_ANALYZED_ELEMENTS).map((entry) => entry.element),
      totalRaw: all.length,
      priorityCount: priority.length
    };
  }

  function layoutNotesFromSemanticCounts(semanticCounts) {
    const notes = [];
    if (semanticCounts.header > 0) notes.push("Explicit header region detected.");
    if (semanticCounts.nav > 0) notes.push("Navigation structure present.");
    if (semanticCounts.main > 0) notes.push("Main content container detected.");
    if (semanticCounts.section > 2) notes.push("Multi-section page flow.");
    if (semanticCounts.footer > 0) notes.push("Footer region detected.");
    if (notes.length === 0) notes.push("Layout is mostly div-driven with minimal semantic tags.");
    return notes;
  }

  function detectHeaderLayout() {
    const header = document.querySelector("header");
    if (!header || !domUtils.isElementVisible(header)) {
      return "No explicit visible <header> block detected.";
    }
    const style = window.getComputedStyle(header);
    const links = header.querySelectorAll("a").length;
    const actions = header.querySelectorAll("button,[role='button']").length;
    const hasBrand = !!header.querySelector("img,[class*='logo'],[id*='logo'],svg");
    const parts = [];
    parts.push(`Header display: ${style.display}.`);
    parts.push(`Approx ${links} links and ${actions} actions.`);
    parts.push(hasBrand ? "Brand area likely present." : "No obvious brand mark detected.");
    return parts.join(" ");
  }

  function detectFooterLayout() {
    const footer = document.querySelector("footer");
    if (!footer || !domUtils.isElementVisible(footer)) {
      return "No explicit visible <footer> block detected.";
    }
    const links = footer.querySelectorAll("a").length;
    const columns = footer.querySelectorAll("section,ul,nav,div").length;
    const style = window.getComputedStyle(footer);
    return `Footer display: ${style.display}. Contains around ${links} links and ${columns} grouped blocks.`;
  }

  function selectPaletteRoles(colorSummary) {
    const backgrounds = colorSummary.dominantBackgrounds || [];
    const text = colorSummary.textColors || [];
    const buttons = colorSummary.buttonColors || [];
    const links = colorSummary.linkColors || [];
    const borders = colorSummary.borderColors || [];

    const background = (backgrounds[0] && backgrounds[0].color) || "#FFFFFF";
    const surface = (backgrounds[1] && backgrounds[1].color) || "#F8FAFC";
    const textPrimary = (text[0] && text[0].color) || "#0F172A";
    const textSecondary = (text[1] && text[1].color) || textPrimary;
    const primary = (buttons[0] && buttons[0].color) || (links[0] && links[0].color) || "#2563EB";
    const secondary =
      (buttons[1] && buttons[1].color) || (links[1] && links[1].color) || (backgrounds[2] && backgrounds[2].color) || primary;
    const accent = (links[0] && links[0].color) || (buttons[1] && buttons[1].color) || primary;
    const border = (borders[0] && borders[0].color) || "#D1D5DB";

    return {
      primary,
      secondary,
      accent,
      background,
      surface,
      textPrimary,
      textSecondary,
      border
    };
  }

  function deriveStyleTags(context) {
    const tags = [];
    const modeIsDark = context.isDarkMode;
    const cards = context.components.cards.count;
    const tables = context.components.tables.count;
    const sidebars = context.components.sidebars.count;
    const heroes = context.components.heroSections.count;
    const products = context.components.productCards.count;
    const pricings = context.components.pricingCards.count;
    const testimonials = context.components.testimonials.count;
    const heavyShadows = context.shadowUsage > 18;
    const largeRadius = context.radiusMedian && context.radiusMedian >= 12;
    const fontTop = (context.fontFamilies[0] && context.fontFamilies[0].value) || "";

    if (modeIsDark) tags.push("dark mode");
    if (products >= 2) tags.push("e-commerce");
    if (tables >= 1 && sidebars >= 1) tags.push("SaaS dashboard");
    if (heroes >= 1 && pricings + testimonials >= 1) tags.push("landing page");
    if (cards > 8 && !products) tags.push("corporate");
    if (/serif/i.test(fontTop)) tags.push("editorial");
    if (largeRadius && heavyShadows) tags.push("modern soft UI");
    if (!tags.length && heroes >= 1) tags.push("modern professional");
    if (!tags.length) tags.push("minimal");

    return Array.from(new Set(tags));
  }

  function normalizeText(value) {
    if (!value || typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim();
  }

  function isLikelyVisibleForCopy(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") < 0.05) return false;
    const rect = domUtils.safeRect(element);
    return !!rect && rect.width > 2 && rect.height > 2;
  }

  function readElementTextBlocks(element, maxChars) {
    const limit = Math.max(400, maxChars || 6000);
    const blocks = Array.from(element.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,figcaption"));
    const lines = [];
    for (let i = 0; i < blocks.length; i += 1) {
      const node = blocks[i];
      if (!isLikelyVisibleForCopy(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      if (!text || text.length < 2) continue;
      if (lines.length && lines[lines.length - 1] === text) continue;
      lines.push(text);
      if (lines.join("\n").length >= limit) break;
    }
    let combined = lines.join("\n");
    if (!combined) {
      combined = normalizeText(element.innerText || element.textContent || "");
    }
    return combined.slice(0, limit);
  }

  function uniqueTextList(items, maxItems) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = normalizeText(items[i]);
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function labelFromElement(element) {
    const tag = element.tagName.toLowerCase();
    const id = normalizeText(element.id || "");
    const cls = normalizeText((element.className || "").toString().replace(/\s+/g, "."));
    if (id) return `${tag}#${id}`;
    if (cls) return `${tag}.${cls.split(".").slice(0, 3).join(".")}`;
    return tag;
  }

  function extractPageContentBlueprint() {
    const metaDescEl = document.querySelector("meta[name='description']");
    const metaDescription = metaDescEl ? normalizeText(metaDescEl.getAttribute("content") || "") : "";

    const navRaw = Array.from(document.querySelectorAll("header a, nav a, [role='navigation'] a"))
      .filter(isLikelyVisibleForCopy)
      .map((a) => normalizeText(a.innerText || a.textContent || ""));
    const navItems = uniqueTextList(navRaw, 40);

    const ctaRaw = Array.from(
      document.querySelectorAll("button, [role='button'], a[class*='btn'], a[class*='cta'], input[type='submit'], input[type='button']")
    ).map((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "input") return normalizeText(el.value || "");
      return normalizeText(el.innerText || el.textContent || "");
    });
    const ctaTexts = uniqueTextList(ctaRaw, 60);

    const sectionCandidates = Array.from(
      document.querySelectorAll(
        "main, main > section, section, article, [role='main'], [role='region'], [class*='section'], [class*='hero'], [class*='feature'], [class*='pricing'], [class*='testimonial'], footer"
      )
    ).filter(isLikelyVisibleForCopy);

    const selected = [];
    const selectedSet = new Set();
    for (let i = 0; i < sectionCandidates.length; i += 1) {
      const el = sectionCandidates[i];
      if (selected.length >= 24) break;
      let skip = false;
      let parent = el.parentElement;
      while (parent) {
        if (selectedSet.has(parent)) {
          skip = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (skip) continue;
      selected.push(el);
      selectedSet.add(el);
    }

    const sections = [];
    let totalChars = 0;
    for (let i = 0; i < selected.length; i += 1) {
      const el = selected[i];
      const headingEl = el.querySelector("h1,h2,h3,h4");
      const heading = headingEl ? normalizeText(headingEl.innerText || headingEl.textContent || "") : "";
      const text = readElementTextBlocks(el, 7000);
      if (!text || text.length < 30) continue;
      const snippet = text.length > 320 ? `${text.slice(0, 320)}...` : text;
      sections.push({
        index: sections.length + 1,
        label: labelFromElement(el),
        heading: heading || `Section ${sections.length + 1}`,
        text,
        snippet
      });
      totalChars += text.length;
      if (totalChars >= 42000) break;
    }

    return {
      pageTitle: normalizeText(document.title || ""),
      metaDescription,
      navItems,
      ctaTexts,
      sections,
      totals: {
        sectionCount: sections.length,
        navCount: navItems.length,
        ctaCount: ctaTexts.length,
        copiedTextChars: totalChars
      },
      mode: "high_fidelity_visible_text_copy",
      note:
        "High-fidelity content copy includes visible text and section structure. Review and rewrite as needed to avoid proprietary duplication."
    };
  }

  function analyzePage(settings) {
    if (!document.body) {
      throw new Error("No body found on this page.");
    }
    const opts = settings || {};

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportArea = Math.max(1, viewportWidth * viewportHeight);

    const source = collectCandidateElements();
    const candidates = source.candidates;

    const bgColors = new Map();
    const textColors = new Map();
    const buttonColors = new Map();
    const linkColors = new Map();
    const borderColors = new Map();
    const shadowColors = new Map();

    const fontFamilies = new Map();
    const fontSizes = new Map();
    const fontWeights = new Map();
    const lineHeights = new Map();
    const letterSpacings = new Map();
    const textAlignments = new Map();

    const displays = new Map();
    const flexDirections = new Map();
    const gridTemplates = new Map();
    const maxWidths = new Map();
    const sectionSpacing = new Map();
    const paddingPatterns = new Map();
    const marginPatterns = new Map();
    const borderRadii = new Map();
    const boxShadows = new Map();
    const imageFits = new Map();
    const imageRadii = new Map();
    const semanticCounts = {
      header: 0,
      nav: 0,
      main: 0,
      section: 0,
      article: 0,
      aside: 0,
      footer: 0
    };

    const headingStore = createHeadingStore();
    const componentStores = {
      navigation: createComponentStore(),
      buttons: createComponentStore(),
      cards: createComponentStore(),
      forms: createComponentStore(),
      inputs: createComponentStore(),
      tables: createComponentStore(),
      searchBars: createComponentStore(),
      modals: createComponentStore(),
      productCards: createComponentStore(),
      pricingCards: createComponentStore(),
      testimonials: createComponentStore(),
      heroSections: createComponentStore(),
      featureSections: createComponentStore(),
      footers: createComponentStore(),
      sidebars: createComponentStore(),
      badges: createComponentStore()
    };

    let analyzedCount = 0;
    let skippedOffscreen = 0;
    let focusableCount = 0;
    let focusPossiblySuppressed = 0;
    const radiusNumbers = [];
    const fontSizesPx = [];
    const headingSizes = [];
    const bodySizes = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const element = candidates[i];
      const rect = domUtils.safeRect(element);
      if (!rect || !domUtils.isWithinViewport(rect, viewportWidth, viewportHeight, 180)) {
        skippedOffscreen += 1;
        continue;
      }

      analyzedCount += 1;
      const style = window.getComputedStyle(element);
      const tag = element.tagName.toLowerCase();
      const role = (element.getAttribute("role") || "").toLowerCase();
      const className = (element.className || "").toString().toLowerCase();
      const snippet = getTextSnippet(element);

      const areaWeight = Math.min(8, Math.max(1, (rect.width * rect.height) / (viewportArea / 10)));

      if (semanticCounts[tag] !== undefined) semanticCounts[tag] += 1;

      if (isMeaningfulColor(style.backgroundColor) && rect.width * rect.height > 400) {
        colorUtils.addColor(bgColors, style.backgroundColor, areaWeight);
      }
      if (isMeaningfulColor(style.color)) {
        colorUtils.addColor(textColors, style.color, 1);
      }
      if (isMeaningfulColor(style.borderTopColor) && style.borderTopStyle !== "none") {
        colorUtils.addColor(borderColors, style.borderTopColor, 0.8);
      }
      if (style.boxShadow && style.boxShadow !== "none") {
        increment(boxShadows, style.boxShadow, 1);
        const shadowPalette = colorUtils.extractShadowColors(style.boxShadow);
        for (let s = 0; s < shadowPalette.length; s += 1) {
          colorUtils.addColor(shadowColors, shadowPalette[s], 0.5);
        }
      }

      increment(fontFamilies, trimFontFamily(style.fontFamily), 1);
      increment(fontSizes, style.fontSize, 1);
      increment(fontWeights, style.fontWeight, 1);
      increment(lineHeights, style.lineHeight, 1);
      increment(letterSpacings, style.letterSpacing, 1);
      increment(textAlignments, style.textAlign, 1);
      increment(displays, style.display, 1);

      if (style.display.indexOf("flex") !== -1) {
        increment(flexDirections, style.flexDirection || "row", 1);
      }
      if (style.display.indexOf("grid") !== -1 && style.gridTemplateColumns && style.gridTemplateColumns !== "none") {
        increment(gridTemplates, style.gridTemplateColumns, 1);
      }
      if (style.maxWidth && style.maxWidth !== "none" && style.maxWidth !== "0px") {
        increment(maxWidths, style.maxWidth, 1);
      }

      const padding = domUtils.compactSpacing(
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft
      );
      const margin = domUtils.compactSpacing(
        style.marginTop,
        style.marginRight,
        style.marginBottom,
        style.marginLeft
      );
      increment(paddingPatterns, padding, 1);
      increment(marginPatterns, margin, 1);
      increment(borderRadii, style.borderRadius, 1);

      const radius = domUtils.toPxNumber(style.borderRadius);
      if (radius !== null) radiusNumbers.push(radius);
      const sizePx = domUtils.toPxNumber(style.fontSize);
      if (sizePx !== null) fontSizesPx.push(sizePx);

      if (/^h[1-6]$/.test(tag)) {
        recordHeadingStyle(headingStore, tag, style);
        if (sizePx !== null) headingSizes.push(sizePx);
      }
      if (["p", "li", "span", "small"].includes(tag) && sizePx !== null) {
        bodySizes.push(sizePx);
      }

      if (["section", "article", "main"].includes(tag)) {
        const padTop = domUtils.toPxNumber(style.paddingTop) || 0;
        const padBottom = domUtils.toPxNumber(style.paddingBottom) || 0;
        const marTop = domUtils.toPxNumber(style.marginTop) || 0;
        const marBottom = domUtils.toPxNumber(style.marginBottom) || 0;
        const total = Math.round(padTop + padBottom + marTop + marBottom);
        if (total > 0) {
          increment(sectionSpacing, `${total}px total vertical spacing`, 1);
        }
      }

      const isLink = tag === "a";
      const isButton = isButtonLike(element, tag, role, className);
      const isInput = tag === "input" || tag === "textarea" || tag === "select";
      const isForm = tag === "form";
      const isTable = tag === "table";
      const isNav = tag === "nav" || role === "navigation" || (tag === "header" && element.querySelectorAll("a").length >= 3);
      const isCard = isCardLike(element, style, rect, className);
      const isHero = likelyHero(element, tag, rect, viewportHeight);
      const isFeature = likelyFeatureSection(element, tag);
      const isModal = likelyModal(style, rect, viewportWidth, viewportHeight, className);
      const isSidebar = likelySidebar(tag, style, rect, viewportWidth, viewportHeight, className);
      const isBadge = likelyBadge(style, rect, className, tag);
      const isSearch = likelySearchBar(tag, element, className);
      const isProduct = isCard && likelyProductCard(element, className, snippet);
      const isPricing = isCard && likelyPricingCard(className, snippet);
      const isTestimonial = isCard && likelyTestimonial(className, snippet);

      if (isLink && isMeaningfulColor(style.color)) {
        colorUtils.addColor(linkColors, style.color, 1);
      }
      if (isButton) {
        colorUtils.addColor(buttonColors, style.backgroundColor, 2.5);
        if (isMeaningfulColor(style.borderTopColor)) colorUtils.addColor(borderColors, style.borderTopColor, 1.2);
        recordComponent(componentStores.buttons, element, style, rect, {
          layoutBehavior: style.display,
          hoverHint: "Hover states inferred from class names/CSS only in v1."
        });
      }
      if (isCard) {
        recordComponent(componentStores.cards, element, style, rect, {
          hierarchyRole: "Container card/panel"
        });
      }
      if (isInput) {
        recordComponent(componentStores.inputs, element, style, rect, {
          fieldType: (element.getAttribute("type") || tag).toLowerCase()
        });
      }
      if (isForm) {
        recordComponent(componentStores.forms, element, style, rect, {
          fieldCount: element.querySelectorAll("input,textarea,select").length
        });
      }
      if (isTable) {
        recordComponent(componentStores.tables, element, style, rect, {
          columns: element.querySelectorAll("thead th, tr:first-child th, tr:first-child td").length
        });
      }
      if (isNav) {
        recordComponent(componentStores.navigation, element, style, rect, {
          linkCount: element.querySelectorAll("a").length
        });
      }
      if (tag === "footer") {
        recordComponent(componentStores.footers, element, style, rect, {
          linkCount: element.querySelectorAll("a").length
        });
      }
      if (isHero) {
        recordComponent(componentStores.heroSections, element, style, rect, {
          hasPrimaryHeading: !!element.querySelector("h1"),
          hasCTA: !!element.querySelector("button,a,[role='button']")
        });
      }
      if (isFeature) {
        recordComponent(componentStores.featureSections, element, style, rect, {
          childBlocks: element.children.length
        });
      }
      if (isModal) {
        recordComponent(componentStores.modals, element, style, rect, {
          position: style.position
        });
      }
      if (isSidebar) {
        recordComponent(componentStores.sidebars, element, style, rect, {
          position: style.position
        });
      }
      if (isBadge) {
        recordComponent(componentStores.badges, element, style, rect, {
          textSnippet: snippet
        });
      }
      if (isSearch) {
        recordComponent(componentStores.searchBars, element, style, rect, {
          textSnippet: snippet
        });
      }
      if (isProduct) {
        recordComponent(componentStores.productCards, element, style, rect, {
          hasImage: !!element.querySelector("img")
        });
      }
      if (isPricing) {
        recordComponent(componentStores.pricingCards, element, style, rect, {
          textSnippet: snippet
        });
      }
      if (isTestimonial) {
        recordComponent(componentStores.testimonials, element, style, rect, {
          textSnippet: snippet
        });
      }

      if (tag === "img") {
        increment(imageFits, style.objectFit || "fill", 1);
        increment(imageRadii, style.borderRadius || "0px", 1);
      }

      const isFocusable = ["a", "button", "input", "textarea", "select"].includes(tag) || element.hasAttribute("tabindex");
      if (isFocusable) {
        focusableCount += 1;
        if (style.outlineStyle === "none" && style.boxShadow === "none") {
          focusPossiblySuppressed += 1;
        }
      }
    }

    const dominantBackgrounds = colorUtils.groupTopColors(bgColors, { max: 8, threshold: 26 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Page canvas, sections, or surfaces"
    }));
    const dominantText = colorUtils.groupTopColors(textColors, { max: 8, threshold: 22 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Body copy and labels"
    }));
    const dominantButtons = colorUtils.groupTopColors(buttonColors, { max: 6, threshold: 22 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Buttons / CTAs"
    }));
    const dominantLinks = colorUtils.groupTopColors(linkColors, { max: 6, threshold: 20 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Interactive links"
    }));
    const dominantBorders = colorUtils.groupTopColors(borderColors, { max: 6, threshold: 20 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Borders and separators"
    }));
    const dominantShadows = colorUtils.groupTopColors(shadowColors, { max: 6, threshold: 20 }).map((entry) => ({
      color: entry.color,
      count: domUtils.round(entry.count, 2),
      usage: "Shadow tint"
    }));

    const colorSummary = {
      dominantBackgrounds,
      textColors: dominantText,
      buttonColors: dominantButtons,
      linkColors: dominantLinks,
      borderColors: dominantBorders,
      shadowColors: dominantShadows
    };
    colorSummary.paletteRoles = selectPaletteRoles(colorSummary);

    const headings = finalizeHeadingStore(headingStore);
    const bodyMedian = domUtils.median(bodySizes);
    const headingMedian = domUtils.median(headingSizes);
    const sizeScale = domUtils.topEntries(fontSizes, 8).map((entry) => entry.value);

    const typographySummary = {
      fontFamilies: domUtils.topEntries(fontFamilies, 8),
      headingStyles: headings,
      bodyText: {
        medianSizePx: bodyMedian ? domUtils.round(bodyMedian, 2) : null,
        commonLineHeights: domUtils.topEntries(lineHeights, 5),
        commonLetterSpacing: domUtils.topEntries(letterSpacings, 5),
        alignments: domUtils.topEntries(textAlignments, 5)
      },
      buttonText: domUtils.topEntries(fontWeights, 5),
      approximateScale: sizeScale,
      fontWeightPatterns: domUtils.topEntries(fontWeights, 8)
    };

    const displayUsage = domUtils.topEntries(displays, 6);
    const layoutDensity =
      analyzedCount > 460 ? "high-density interface" : analyzedCount > 260 ? "balanced density" : "spacious layout";

    const layoutSummary = {
      overallStructure: layoutNotesFromSemanticCounts(semanticCounts),
      semanticTagCounts: semanticCounts,
      maxWidthContainers: domUtils.topEntries(maxWidths, 8),
      sectionSpacingPatterns: domUtils.topEntries(sectionSpacing, 8),
      gridUsage: domUtils.topEntries(gridTemplates, 6),
      flexUsage: domUtils.topEntries(flexDirections, 6),
      displayUsage,
      headerLayout: detectHeaderLayout(),
      footerLayout: detectFooterLayout(),
      visualHierarchyNotes: [],
      alignmentPatterns: domUtils.topEntries(textAlignments, 6),
      componentDensity: layoutDensity
    };

    if (headingMedian && bodyMedian) {
      if (headingMedian - bodyMedian >= 12) {
        layoutSummary.visualHierarchyNotes.push("Strong heading-to-body size contrast.");
      } else {
        layoutSummary.visualHierarchyNotes.push("Moderate heading-to-body contrast.");
      }
    } else {
      layoutSummary.visualHierarchyNotes.push("Limited heading/body signal; hierarchy estimated from structure.");
    }

    if (componentStores.heroSections.count > 0) {
      layoutSummary.visualHierarchyNotes.push("Hero-like area detected near top viewport.");
    }
    if (componentStores.cards.count >= 6) {
      layoutSummary.visualHierarchyNotes.push("Card/panel repetition indicates modular content grouping.");
    }

    const componentsSummary = {};
    Object.keys(componentStores).forEach((key) => {
      componentsSummary[key] = finalizeComponentStore(componentStores[key]);
    });

    const primaryBg = colorSummary.paletteRoles.background;
    const primaryText = colorSummary.paletteRoles.textPrimary;
    const contrast = colorUtils.contrastRatio(primaryBg, primaryText);
    const whiteContrast = colorUtils.contrastRatio(primaryBg, "#FFFFFF") || 0;
    const blackContrast = colorUtils.contrastRatio(primaryBg, "#000000") || 0;
    const isDarkMode = whiteContrast > blackContrast;

    const accessibilityNotes = [];
    if (contrast !== null) {
      accessibilityNotes.push(`Estimated body contrast ratio: ${domUtils.round(contrast, 2)}:1.`);
      if (contrast < 4.5) {
        accessibilityNotes.push("Primary text/background contrast may be below WCAG AA for normal text.");
      }
    }
    if (fontSizesPx.length > 0) {
      const minFont = Math.min.apply(null, fontSizesPx);
      if (minFont < 12) {
        accessibilityNotes.push("Very small text elements detected (<12px).");
      }
    }
    if (focusableCount > 0) {
      const ratio = focusPossiblySuppressed / focusableCount;
      if (ratio > 0.5) {
        accessibilityNotes.push("Many focusable controls appear to suppress default focus outlines.");
      } else {
        accessibilityNotes.push("Focusable controls present; verify visible focus styles across interactive states.");
      }
    }

    const responsiveObservations = [];
    const viewportLabel = viewportWidth < 768 ? "mobile" : viewportWidth < 1024 ? "tablet" : "desktop";
    responsiveObservations.push(`Current capture viewport: ${viewportWidth}x${viewportHeight} (${viewportLabel}).`);
    if (layoutSummary.gridUsage.length > 0) {
      responsiveObservations.push("Grid layouts are present; column collapse behavior should be preserved on smaller screens.");
    }
    if (layoutSummary.flexUsage.length > 0) {
      responsiveObservations.push("Flex layouts are common for alignment and navigation.");
    }
    if (componentsSummary.sidebars.count > 0) {
      responsiveObservations.push("Sidebar patterns detected; convert to drawer/off-canvas on mobile.");
    }

    const responsiveSuggestions = [
      "Maintain consistent spacing scale while reducing section padding on narrow viewports.",
      "Shift multi-column card groups toward 2 columns (tablet) and 1 column (mobile).",
      "Keep navigation tappable with larger hit targets and clear focus states.",
      "Allow CTA buttons to expand full width on mobile when space is constrained."
    ];

    const styleTags = deriveStyleTags({
      isDarkMode,
      components: componentsSummary,
      shadowUsage: domUtils.topEntries(boxShadows, 100).reduce((acc, entry) => acc + entry.count, 0),
      radiusMedian: domUtils.median(radiusNumbers),
      fontFamilies: typographySummary.fontFamilies
    });

    const analysis = {
      meta: {
        url: location.href,
        title: document.title || "",
        generatedAt: new Date().toISOString(),
        viewport: {
          width: viewportWidth,
          height: viewportHeight
        },
        sampleCount: analyzedCount,
        rawDomCount: source.totalRaw
      },
      sampling: {
        priorityCandidates: source.priorityCount,
        analyzedElements: analyzedCount,
        skippedOffscreen,
        maxAnalyzedLimit: MAX_ANALYZED_ELEMENTS,
        strategy:
          "Visible-first semantic sampling with scoring, viewport filtering, and repeated-pattern summarization."
      },
      styleClassification: {
        tags: styleTags,
        tone: styleTags.join(", ")
      },
      colors: colorSummary,
      typography: typographySummary,
      layout: layoutSummary,
      components: componentsSummary,
      spacingAndSizing: {
        paddingPatterns: domUtils.topEntries(paddingPatterns, 8),
        marginPatterns: domUtils.topEntries(marginPatterns, 8),
        fontSizeScalePx: sizeScale
      },
      shapesAndEffects: {
        borderRadiusPatterns: domUtils.topEntries(borderRadii, 8),
        shadowPatterns: domUtils.topEntries(boxShadows, 8),
        borderColorPatterns: dominantBorders
      },
      imagery: {
        imageCount: document.querySelectorAll("img").length,
        visibleImageCount: domUtils.topEntries(imageFits, 100).reduce((acc, entry) => acc + entry.count, 0),
        objectFitPatterns: domUtils.topEntries(imageFits, 6),
        imageRadiusPatterns: domUtils.topEntries(imageRadii, 6)
      },
      responsive: {
        observations: responsiveObservations,
        suggestions: responsiveSuggestions
      },
      accessibility: {
        notes: accessibilityNotes,
        estimatedContrastRatio: contrast ? domUtils.round(contrast, 2) : null
      },
      safety: {
        note:
          "This output describes style patterns only. It does not extract proprietary copy, logos, or image assets."
      }
    };

    if (opts.includePageContentCopy !== false) {
      analysis.contentBlueprint = extractPageContentBlueprint();
    } else {
      analysis.contentBlueprint = {
        mode: "disabled",
        note: "Content copy extraction was disabled in settings."
      };
    }

    return analysis;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getDocumentHeight() {
    const body = document.body;
    const html = document.documentElement;
    if (!body || !html) return window.innerHeight;
    return Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight
    );
  }

  function buildCaptureOffsets(docHeight, viewportHeight, options) {
    const opts = options || {};
    const overlapRatio = clamp(typeof opts.overlapRatio === "number" ? opts.overlapRatio : 0.16, 0, 0.6);
    const maxShots = clamp(typeof opts.maxShots === "number" ? opts.maxShots : 14, 2, 30);
    const step = Math.max(80, Math.floor(viewportHeight * (1 - overlapRatio)));
    const maxStart = Math.max(0, docHeight - viewportHeight);
    const offsets = [0];
    for (let y = step; y < maxStart; y += step) {
      offsets.push(y);
    }
    if (maxStart > 0) offsets.push(maxStart);

    const unique = Array.from(new Set(offsets.map((v) => Math.max(0, Math.round(v)))));
    if (unique.length <= maxShots) return unique;

    const sampled = [];
    for (let i = 0; i < maxShots; i += 1) {
      const index = Math.round((i * (unique.length - 1)) / (maxShots - 1));
      sampled.push(unique[index]);
    }
    return Array.from(new Set(sampled));
  }

  function ensureCaptureState() {
    if (!window.__DPE_CAPTURE_STATE__) {
      window.__DPE_CAPTURE_STATE__ = {
        originalX: 0,
        originalY: 0,
        htmlScrollBehavior: "",
        bodyScrollBehavior: "",
        prepared: false
      };
    }
    return window.__DPE_CAPTURE_STATE__;
  }

  function scrollToPosition(top) {
    return new Promise((resolve) => {
      window.scrollTo({ top: Math.max(0, Math.round(top)), left: 0, behavior: "auto" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(window.scrollY || window.pageYOffset || 0));
      });
    });
  }

  async function prepareFullPageCapture(options) {
    const state = ensureCaptureState();
    const html = document.documentElement;
    const body = document.body;
    state.originalX = window.scrollX || window.pageXOffset || 0;
    state.originalY = window.scrollY || window.pageYOffset || 0;
    state.htmlScrollBehavior = html && html.style ? html.style.scrollBehavior : "";
    state.bodyScrollBehavior = body && body.style ? body.style.scrollBehavior : "";
    if (html && html.style) html.style.scrollBehavior = "auto";
    if (body && body.style) body.style.scrollBehavior = "auto";

    const docHeight = getDocumentHeight();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const offsets = buildCaptureOffsets(docHeight, viewportHeight, options);
    state.prepared = true;

    await scrollToPosition(0);

    return {
      docHeight,
      viewportHeight,
      viewportWidth,
      devicePixelRatio: window.devicePixelRatio || 1,
      offsets
    };
  }

  async function restoreFullPageCapture() {
    const state = ensureCaptureState();
    const html = document.documentElement;
    const body = document.body;
    if (html && html.style) html.style.scrollBehavior = state.htmlScrollBehavior || "";
    if (body && body.style) body.style.scrollBehavior = state.bodyScrollBehavior || "";
    await scrollToPosition(state.originalY || 0);
    state.prepared = false;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }
    if (message.type === "ANALYZE_PAGE") {
      try {
        const analysis = analyzePage(message.settings || {});
        window.__DPE_LAST_ANALYSIS__ = analysis;
        sendResponse({ ok: true, analysis });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : "Unknown analysis error."
        });
      }
      return true;
    }
    if (message.type === "GET_LAST_ANALYSIS") {
      sendResponse({
        ok: !!window.__DPE_LAST_ANALYSIS__,
        analysis: window.__DPE_LAST_ANALYSIS__ || null
      });
      return true;
    }
    if (message.type === "PREPARE_FULLPAGE_CAPTURE") {
      prepareFullPageCapture(message.options || {})
        .then((capturePlan) => sendResponse({ ok: true, capturePlan }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : "Could not prepare full-page capture."
          })
        );
      return true;
    }
    if (message.type === "SCROLL_TO_CAPTURE_OFFSET") {
      scrollToPosition(message.offset || 0)
        .then((positionY) => sendResponse({ ok: true, positionY }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : "Could not scroll to capture offset."
          })
        );
      return true;
    }
    if (message.type === "RESTORE_CAPTURE_SCROLL") {
      restoreFullPageCapture()
        .then(() => sendResponse({ ok: true }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error && error.message ? error.message : "Could not restore original scroll position."
          })
        );
      return true;
    }
    return false;
  });
})();
