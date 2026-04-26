(function (global) {
  "use strict";

  if (global.DPEPromptBuilder) {
    return;
  }

  const DEFAULT_SETTINGS = {
    includeColors: true,
    includeTypography: true,
    includeLayout: true,
    includeComponents: true,
    includeResponsive: true,
    outputStyle: "detailed"
  };

  function pickTop(entries, limit) {
    if (!Array.isArray(entries)) return [];
    return entries.slice(0, typeof limit === "number" ? limit : 5);
  }

  function valueOr(entries, fallback) {
    if (!Array.isArray(entries) || entries.length === 0) return fallback;
    return entries[0].value || entries[0].color || fallback;
  }

  function colorOr(obj, key, fallback) {
    if (!obj || typeof obj !== "object") return fallback;
    return obj[key] || fallback;
  }

  function colorLines(colors, maxLines) {
    return pickTop(colors, maxLines).map((entry) => `- ${entry.color} (${entry.usage || "common usage"})`);
  }

  function entryLines(entries, maxLines) {
    return pickTop(entries, maxLines).map((entry) => `- ${entry.value} (frequency: ${entry.count})`);
  }

  function componentSummaryLine(label, component, maxSamples) {
    if (!component || !component.count) return `- ${label}: not prominent in the visible viewport.`;
    const first = Array.isArray(component.samples) ? component.samples.slice(0, maxSamples || 1) : [];
    if (!first.length) return `- ${label}: ${component.count} visible instance(s).`;
    const sample = first[0];
    return [
      `- ${label}: ${component.count} visible instance(s).`,
      `Shape ${sample.shape || "n/a"}, color ${sample.color || "n/a"}, border ${sample.border || "n/a"}, shadow ${sample.shadow || "none"}, padding ${sample.padding || "n/a"}, typography ${sample.typography || "n/a"}.`
    ].join(" ");
  }

  function styleLevel(config) {
    if (config.outputStyle === "concise") return "concise";
    if (config.outputStyle === "expert") return "expert";
    return "detailed";
  }

  function buildPrompt(analysis, settings) {
    if (!analysis) {
      return "No analysis data available. Analyze a page first.";
    }

    const config = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const level = styleLevel(config);

    const paletteRoles = (analysis.colors && analysis.colors.paletteRoles) || {};
    const styleTags = (analysis.styleClassification && analysis.styleClassification.tags) || ["modern professional"];
    const tone = (analysis.styleClassification && analysis.styleClassification.tone) || styleTags.join(", ");
    const layoutDensity = (analysis.layout && analysis.layout.componentDensity) || "balanced density";
    const headingStyles = (analysis.typography && analysis.typography.headingStyles) || {};
    const h1 = headingStyles.h1 || {};
    const bodyMedian = analysis.typography && analysis.typography.bodyText ? analysis.typography.bodyText.medianSizePx : null;

    const sections = [];
    sections.push("Title:\nReusable Web Design Prompt");

    sections.push(
      [
        "1. Overall Design Direction",
        `Create a webpage with a similar design language to the analyzed page, not a direct copy. Aim for a ${styleTags.join(", ")} direction with ${layoutDensity}.`,
        "Use placeholder copy, original illustrations/photos/icons, and a distinct brand identity."
      ].join("\n")
    );

    sections.push(
      [
        "2. Visual Style",
        `Overall tone: ${tone}.`,
        level === "expert"
          ? "Preserve clear visual hierarchy, component consistency, and modern spacing rhythm while avoiding proprietary identity cues."
          : "Preserve visual hierarchy, card/button consistency, and coherent spacing without copying proprietary assets."
      ].join("\n")
    );

    if (config.includeColors) {
      const colorBlock = [
        "3. Color Palette",
        `- Primary: ${colorOr(paletteRoles, "primary", "#2563EB")} used for primary CTAs and key highlights.`,
        `- Secondary: ${colorOr(paletteRoles, "secondary", "#0EA5E9")} used for supporting actions.`,
        `- Accent: ${colorOr(paletteRoles, "accent", "#14B8A6")} used for links and interactive emphasis.`,
        `- Background: ${colorOr(paletteRoles, "background", "#FFFFFF")} for page canvas.`,
        `- Surface: ${colorOr(paletteRoles, "surface", "#F8FAFC")} for cards/panels.`,
        `- Text primary: ${colorOr(paletteRoles, "textPrimary", "#111827")} for headings and key labels.`,
        `- Text secondary: ${colorOr(paletteRoles, "textSecondary", "#4B5563")} for body/supporting copy.`,
        `- Border: ${colorOr(paletteRoles, "border", "#D1D5DB")} for subtle dividers.`,
        "Common background colors:",
        ...colorLines((analysis.colors && analysis.colors.dominantBackgrounds) || [], level === "concise" ? 3 : 6),
        "Common CTA/link colors:",
        ...colorLines(
          [((analysis.colors && analysis.colors.buttonColors) || [])[0], ...((analysis.colors && analysis.colors.linkColors) || [])].filter(Boolean),
          level === "concise" ? 2 : 4
        )
      ];
      sections.push(colorBlock.join("\n"));
    }

    if (config.includeTypography) {
      const families = entryLines((analysis.typography && analysis.typography.fontFamilies) || [], level === "concise" ? 3 : 6);
      const scale = (analysis.typography && analysis.typography.approximateScale) || [];
      const typoBlock = [
        "4. Typography System",
        `Use a clean type system similar to: ${(families.length ? families.map((line) => line.replace("- ", "")).join("; ") : "modern sans-serif stack")}.`,
        `Heading reference (H1): ${h1.fontSize || "40px"} size, ${h1.fontWeight || "700"} weight, ${h1.lineHeight || "1.2"} line-height.`,
        `Body reference: around ${bodyMedian || 16}px with comfortable line-height and readable contrast.`,
        `Approximate scale observed: ${scale.length ? scale.join(", ") : "12px, 14px, 16px, 20px, 28px, 36px"}.`,
        "Keep typographic hierarchy distinct across headline, body, nav, and button labels."
      ];
      sections.push(typoBlock.join("\n"));
    }

    if (config.includeLayout) {
      const structure = (analysis.layout && analysis.layout.overallStructure) || [];
      const maxWidths = entryLines((analysis.layout && analysis.layout.maxWidthContainers) || [], 4);
      const gridUsage = entryLines((analysis.layout && analysis.layout.gridUsage) || [], 3);
      const flexUsage = entryLines((analysis.layout && analysis.layout.flexUsage) || [], 3);
      const layoutBlock = [
        "5. Layout Structure",
        "Use a responsive, centered container strategy with clear section separation and strong content flow.",
        "Detected structure hints:",
        ...(structure.length ? structure.map((line) => `- ${line}`) : ["- Semantic structure is limited; use clear header/main/section/footer blocks."]),
        "Max-width patterns:",
        ...(maxWidths.length ? maxWidths : ["- ~1100px to 1280px centered content width"]),
        "Grid usage patterns:",
        ...(gridUsage.length ? gridUsage : ["- Use 2-4 columns on desktop, collapse progressively"]),
        "Flex usage patterns:",
        ...(flexUsage.length ? flexUsage : ["- Flex row for nav/action clusters; column stacking on smaller screens"]),
        `Header layout note: ${(analysis.layout && analysis.layout.headerLayout) || "Use left brand placeholder + right nav/actions."}`,
        `Footer layout note: ${(analysis.layout && analysis.layout.footerLayout) || "Use multi-column footer with utility links."}`
      ];
      sections.push(layoutBlock.join("\n"));
    }

    if (config.includeComponents) {
      const components = analysis.components || {};
      const componentBlock = [
        "6. Component Design",
        componentSummaryLine("Navigation bars", components.navigation, 1),
        componentSummaryLine("Buttons", components.buttons, 1),
        componentSummaryLine("Cards/containers", components.cards, 1),
        componentSummaryLine("Forms", components.forms, 1),
        componentSummaryLine("Inputs", components.inputs, 1),
        componentSummaryLine("Tables", components.tables, 1),
        componentSummaryLine("Hero sections", components.heroSections, 1),
        componentSummaryLine("Feature sections", components.featureSections, 1),
        componentSummaryLine("Footers", components.footers, 1),
        componentSummaryLine("Sidebars", components.sidebars, 1),
        componentSummaryLine("Badges/chips", components.badges, 1),
        "For hover/focus states, create clear visual feedback with contrast-safe transitions."
      ];
      sections.push(componentBlock.join("\n"));
    }

    const spacing = analysis.spacingAndSizing || {};
    sections.push(
      [
        "7. Spacing and Sizing",
        "Apply a consistent spacing scale and keep section rhythm predictable.",
        "Common padding patterns:",
        ...entryLines(spacing.paddingPatterns || [], level === "concise" ? 3 : 6),
        "Common margin patterns:",
        ...entryLines(spacing.marginPatterns || [], level === "concise" ? 3 : 6),
        `Component density target: ${layoutDensity}.`
      ].join("\n")
    );

    const shapes = analysis.shapesAndEffects || {};
    sections.push(
      [
        "8. Shape, Borders, and Shadows",
        "Use rounded corners and subtle elevation patterns consistently across interactive and surface components.",
        "Border radius patterns:",
        ...entryLines(shapes.borderRadiusPatterns || [], level === "concise" ? 3 : 6),
        "Shadow patterns:",
        ...entryLines(shapes.shadowPatterns || [], level === "concise" ? 2 : 5),
        "Border color tendencies:",
        ...colorLines(shapes.borderColorPatterns || [], level === "concise" ? 2 : 4)
      ].join("\n")
    );

    const imagery = analysis.imagery || {};
    sections.push(
      [
        "9. Imagery/Icon Style",
        "Use original imagery and icons with a consistent treatment style.",
        `Visible image count (approx): ${imagery.visibleImageCount || 0}.`,
        "Image fit patterns:",
        ...entryLines(imagery.objectFitPatterns || [], 4),
        "Image corner-radius patterns:",
        ...entryLines(imagery.imageRadiusPatterns || [], 4),
        "If no imagery data is strong, use clean, high-quality placeholders aligned to the same visual tone."
      ].join("\n")
    );

    if (config.includeResponsive) {
      sections.push(
        [
          "10. Responsive Behavior",
          "Preserve the same design language across desktop, tablet, and mobile layouts.",
          ...((analysis.responsive && analysis.responsive.observations) || []).map((item) => `- ${item}`),
          ...((analysis.responsive && analysis.responsive.suggestions) || []).map((item) => `- ${item}`)
        ].join("\n")
      );
    }

    sections.push(
      [
        "11. Accessibility Notes",
        ...((analysis.accessibility && analysis.accessibility.notes) || [
          "Maintain WCAG-friendly color contrast.",
          "Provide visible focus states and keyboard navigation."
        ]).map((item) => `- ${item}`),
        "- Use semantic HTML landmarks and accessible labels/alt text placeholders.",
        "- Ensure interactive targets are touch-friendly and text scales responsibly."
      ].join("\n")
    );

    const aiInstructions = [
      "12. Instructions for AI Webpage Generator",
      "Create a webpage with a comparable layout structure and style system, not a direct clone.",
      "Use this color and typography system as guidance while keeping branding original.",
      "Use placeholder content and original assets.",
      "Do not copy proprietary text, logos, illustrations, photographs, or brand identity elements.",
      "Keep sections modular and reusable so the output can be adapted to different products/domains."
    ];
    if (level === "expert") {
      aiInstructions.push("Return semantic HTML, structured CSS variables/design tokens, and reusable component patterns.");
      aiInstructions.push("Provide desktop/tablet/mobile breakpoints and include keyboard/focus accessibility support.");
    }
    sections.push(aiInstructions.join("\n"));

    return sections.join("\n\n");
  }

  global.DPEPromptBuilder = {
    buildPrompt
  };
})(window);
