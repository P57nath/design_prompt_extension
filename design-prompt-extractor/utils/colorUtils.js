(function (global) {
  "use strict";

  if (global.DPEColorUtils) {
    return;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseHexColor(input) {
    const hex = input.replace("#", "").trim();
    if (!/^[\da-f]{3,8}$/i.test(hex)) return null;
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  function parseRgbColor(input) {
    const match = input.match(
      /rgba?\(\s*([+-]?\d+(\.\d+)?)\s*,\s*([+-]?\d+(\.\d+)?)\s*,\s*([+-]?\d+(\.\d+)?)(\s*,\s*([+-]?\d+(\.\d+)?))?\s*\)/i
    );
    if (!match) return null;
    const r = clamp(parseFloat(match[1]), 0, 255);
    const g = clamp(parseFloat(match[3]), 0, 255);
    const b = clamp(parseFloat(match[5]), 0, 255);
    const a = match[8] !== undefined ? clamp(parseFloat(match[8]), 0, 1) : 1;
    return { r, g, b, a };
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
    else if (hp >= 1 && hp < 2) [r1, g1, b1] = [x, c, 0];
    else if (hp >= 2 && hp < 3) [r1, g1, b1] = [0, c, x];
    else if (hp >= 3 && hp < 4) [r1, g1, b1] = [0, x, c];
    else if (hp >= 4 && hp < 5) [r1, g1, b1] = [x, 0, c];
    else if (hp >= 5 && hp <= 6) [r1, g1, b1] = [c, 0, x];
    const m = l - c / 2;
    return {
      r: clamp(Math.round((r1 + m) * 255), 0, 255),
      g: clamp(Math.round((g1 + m) * 255), 0, 255),
      b: clamp(Math.round((b1 + m) * 255), 0, 255)
    };
  }

  function parseHslColor(input) {
    const match = input.match(
      /hsla?\(\s*([+-]?\d+(\.\d+)?)\s*,\s*([+-]?\d+(\.\d+)?)%\s*,\s*([+-]?\d+(\.\d+)?)%(\s*,\s*([+-]?\d+(\.\d+)?))?\s*\)/i
    );
    if (!match) return null;
    const h = ((parseFloat(match[1]) % 360) + 360) % 360;
    const s = clamp(parseFloat(match[3]) / 100, 0, 1);
    const l = clamp(parseFloat(match[5]) / 100, 0, 1);
    const rgb = hslToRgb(h, s, l);
    const a = match[8] !== undefined ? clamp(parseFloat(match[8]), 0, 1) : 1;
    return { ...rgb, a };
  }

  function parseColor(input) {
    if (!input || typeof input !== "string") return null;
    const value = input.trim().toLowerCase();
    if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    if (value.startsWith("#")) return parseHexColor(value);
    if (value.startsWith("rgb")) return parseRgbColor(value);
    if (value.startsWith("hsl")) return parseHslColor(value);
    return null;
  }

  function channelToHex(value) {
    return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
  }

  function rgbaToHex(color) {
    if (!color) return null;
    return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
  }

  function normalizeColor(input) {
    const parsed = parseColor(input);
    if (!parsed || parsed.a < 0.02) return null;
    if (parsed.a >= 0.98) return rgbaToHex(parsed);
    return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${parsed.a.toFixed(2)})`;
  }

  function colorDistance(colorA, colorB) {
    const a = parseColor(colorA);
    const b = parseColor(colorB);
    if (!a || !b) return Infinity;
    return Math.sqrt(Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2));
  }

  function addColor(map, color, weight) {
    const normalized = normalizeColor(color);
    if (!normalized) return;
    const delta = typeof weight === "number" && Number.isFinite(weight) ? weight : 1;
    map.set(normalized, (map.get(normalized) || 0) + delta);
  }

  function groupTopColors(map, options) {
    const opts = options || {};
    const max = typeof opts.max === "number" ? opts.max : 8;
    const mergeThreshold = typeof opts.threshold === "number" ? opts.threshold : 24;
    const sorted = Array.from(map.entries())
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);
    const groups = [];

    sorted.forEach((entry) => {
      let found = null;
      for (let i = 0; i < groups.length; i += 1) {
        if (colorDistance(groups[i].color, entry.color) <= mergeThreshold) {
          found = groups[i];
          break;
        }
      }
      if (found) {
        found.count += entry.count;
      } else {
        groups.push({ ...entry });
      }
    });

    return groups.sort((a, b) => b.count - a.count).slice(0, max);
  }

  function isNeutral(color) {
    const parsed = parseColor(color);
    if (!parsed) return false;
    const spread = Math.max(parsed.r, parsed.g, parsed.b) - Math.min(parsed.r, parsed.g, parsed.b);
    return spread < 22;
  }

  function extractShadowColors(boxShadow) {
    if (!boxShadow || boxShadow === "none") return [];
    const result = [];
    const regex = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[\da-f]{3,8})/gi;
    let match = regex.exec(boxShadow);
    while (match) {
      const normalized = normalizeColor(match[1]);
      if (normalized) result.push(normalized);
      match = regex.exec(boxShadow);
    }
    return result;
  }

  function srgbToLinear(channel) {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function luminance(color) {
    const parsed = parseColor(color);
    if (!parsed) return null;
    return (
      0.2126 * srgbToLinear(parsed.r) +
      0.7152 * srgbToLinear(parsed.g) +
      0.0722 * srgbToLinear(parsed.b)
    );
  }

  function contrastRatio(colorA, colorB) {
    const lumA = luminance(colorA);
    const lumB = luminance(colorB);
    if (lumA === null || lumB === null) return null;
    const brighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (brighter + 0.05) / (darker + 0.05);
  }

  global.DPEColorUtils = {
    parseColor,
    normalizeColor,
    rgbaToHex,
    addColor,
    groupTopColors,
    colorDistance,
    isNeutral,
    extractShadowColors,
    contrastRatio
  };
})(window);
