(function (global) {
  "use strict";

  if (global.DPEScreenshotUtils) {
    return;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toHex(value) {
    return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  }

  function rgbToHex(r, g, b) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function quantizeChannel(channel) {
    const bucket = 16;
    return clamp(Math.round(channel / bucket) * bucket, 0, 255);
  }

  function luminance(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function saturation(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    if (max === min) return 0;
    const lightness = (max + min) / 2;
    const delta = max - min;
    return delta / (1 - Math.abs(2 * lightness - 1));
  }

  function topColors(colorMap, sampleCount, limit) {
    const entries = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit || 8);
    return entries.map(([color, count]) => ({
      color,
      count,
      percent: sampleCount ? Math.round((count / sampleCount) * 1000) / 10 : 0
    }));
  }

  function describeLevel(value, thresholds, labels) {
    if (value < thresholds[0]) return labels[0];
    if (value < thresholds[1]) return labels[1];
    return labels[2];
  }

  function summarizeZone(zone) {
    const count = zone.count || 1;
    return {
      avgBrightness: Math.round((zone.brightnessSum / count) * 1000) / 1000,
      avgSaturation: Math.round((zone.saturationSum / count) * 1000) / 1000,
      edgeSignal: Math.round((zone.edgeSum / count) * 1000) / 1000
    };
  }

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode screenshot image."));
      image.src = dataUrl;
    });
  }

  async function analyzeScreenshotDataUrl(dataUrl, options) {
    if (!dataUrl || typeof dataUrl !== "string") {
      throw new Error("Screenshot image data is missing.");
    }

    const opts = options || {};
    const maxDimension = typeof opts.maxDimension === "number" ? opts.maxDimension : 320;
    const sampleStride = typeof opts.sampleStride === "number" ? opts.sampleStride : 2;

    const image = await loadImage(dataUrl);
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(40, Math.round(image.width * ratio));
    const height = Math.max(40, Math.round(image.height * ratio));

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas context is unavailable for screenshot analysis.");
    }

    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const colorMap = new Map();
    let sampleCount = 0;
    let brightnessSum = 0;
    let saturationSum = 0;
    let minBrightness = 1;
    let maxBrightness = 0;
    let nearWhite = 0;
    let nearBlack = 0;
    let edgeSum = 0;
    let edgeSamples = 0;

    const zones = [
      { count: 0, brightnessSum: 0, saturationSum: 0, edgeSum: 0 },
      { count: 0, brightnessSum: 0, saturationSum: 0, edgeSum: 0 },
      { count: 0, brightnessSum: 0, saturationSum: 0, edgeSum: 0 }
    ];

    function pixelIndex(x, y) {
      return (y * width + x) * 4;
    }

    for (let y = 0; y < height; y += sampleStride) {
      const zoneIndex = y < height / 3 ? 0 : y < (height * 2) / 3 ? 1 : 2;
      for (let x = 0; x < width; x += sampleStride) {
        const index = pixelIndex(x, y);
        const alpha = pixels[index + 3] / 255;
        if (alpha < 0.1) continue;

        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const lum = luminance(r, g, b);
        const sat = saturation(r, g, b);
        const qColor = rgbToHex(quantizeChannel(r), quantizeChannel(g), quantizeChannel(b));

        colorMap.set(qColor, (colorMap.get(qColor) || 0) + 1);

        sampleCount += 1;
        brightnessSum += lum;
        saturationSum += sat;
        minBrightness = Math.min(minBrightness, lum);
        maxBrightness = Math.max(maxBrightness, lum);
        if (lum > 0.93 && sat < 0.12) nearWhite += 1;
        if (lum < 0.1) nearBlack += 1;

        zones[zoneIndex].count += 1;
        zones[zoneIndex].brightnessSum += lum;
        zones[zoneIndex].saturationSum += sat;

        if (x + sampleStride < width) {
          const rightIndex = pixelIndex(x + sampleStride, y);
          const diff =
            Math.abs(r - pixels[rightIndex]) +
            Math.abs(g - pixels[rightIndex + 1]) +
            Math.abs(b - pixels[rightIndex + 2]);
          edgeSum += diff / (255 * 3);
          zones[zoneIndex].edgeSum += diff / (255 * 3);
          edgeSamples += 1;
        }
        if (y + sampleStride < height) {
          const bottomIndex = pixelIndex(x, y + sampleStride);
          const diff =
            Math.abs(r - pixels[bottomIndex]) +
            Math.abs(g - pixels[bottomIndex + 1]) +
            Math.abs(b - pixels[bottomIndex + 2]);
          edgeSum += diff / (255 * 3);
          zones[zoneIndex].edgeSum += diff / (255 * 3);
          edgeSamples += 1;
        }
      }
    }

    if (!sampleCount) {
      throw new Error("No visible pixel data was sampled from screenshot.");
    }

    const avgBrightness = brightnessSum / sampleCount;
    const avgSaturation = saturationSum / sampleCount;
    const brightnessRange = maxBrightness - minBrightness;
    const edgeScore = edgeSamples ? edgeSum / edgeSamples : 0;
    const whiteRatio = nearWhite / sampleCount;
    const blackRatio = nearBlack / sampleCount;

    const tone = avgBrightness < 0.45 ? "dark" : "light";
    const colorfulness = describeLevel(avgSaturation, [0.16, 0.34], ["muted", "balanced", "vibrant"]);
    const complexity = describeLevel(edgeScore, [0.09, 0.2], ["minimal", "moderate", "busy"]);
    const whitespace = describeLevel(whiteRatio, [0.2, 0.45], ["low", "medium", "high"]);
    const contrast = describeLevel(brightnessRange, [0.3, 0.55], ["soft", "medium", "high"]);
    const gradientLikelihood = brightnessRange > 0.4 && edgeScore < 0.12 ? "likely" : "low";

    const zoneSummaries = zones.map(summarizeZone);
    const zoneNames = ["top", "middle", "bottom"];
    let emphasisZoneIndex = 0;
    for (let i = 1; i < zoneSummaries.length; i += 1) {
      if (zoneSummaries[i].edgeSignal > zoneSummaries[emphasisZoneIndex].edgeSignal) {
        emphasisZoneIndex = i;
      }
    }

    const dominantPalette = topColors(colorMap, sampleCount, 8);
    const notes = [
      `Screenshot tone appears ${tone} with ${contrast} contrast.`,
      `Visual complexity is ${complexity} and whitespace is ${whitespace}.`,
      `Colorfulness is ${colorfulness}; gradient likelihood is ${gradientLikelihood}.`,
      `Most visually active zone: ${zoneNames[emphasisZoneIndex]}.`
    ];

    const mode = opts.mode || "single_viewport";
    return {
      available: true,
      mode,
      image: {
        originalWidth: image.width,
        originalHeight: image.height,
        analyzedWidth: width,
        analyzedHeight: height,
        sampledPixels: sampleCount
      },
      palette: dominantPalette,
      brightness: {
        average: Math.round(avgBrightness * 1000) / 1000,
        min: Math.round(minBrightness * 1000) / 1000,
        max: Math.round(maxBrightness * 1000) / 1000,
        range: Math.round(brightnessRange * 1000) / 1000,
        contrastLabel: contrast
      },
      saturation: {
        average: Math.round(avgSaturation * 1000) / 1000,
        label: colorfulness
      },
      density: {
        edgeScore: Math.round(edgeScore * 1000) / 1000,
        label: complexity
      },
      whitespace: {
        ratio: Math.round(whiteRatio * 1000) / 1000,
        label: whitespace
      },
      darkPixelsRatio: Math.round(blackRatio * 1000) / 1000,
      tone,
      gradientLikelihood,
      composition: {
        top: zoneSummaries[0],
        middle: zoneSummaries[1],
        bottom: zoneSummaries[2],
        emphasisZone: zoneNames[emphasisZoneIndex]
      },
      notes
    };
  }

  async function stitchAndAnalyzeScreenshots(segments, options) {
    if (!Array.isArray(segments) || !segments.length) {
      throw new Error("No screenshot segments were supplied for stitching.");
    }
    const opts = options || {};
    const docHeight = Math.max(1, Math.round(opts.docHeight || opts.viewportHeight || 1));
    const viewportHeight = Math.max(1, Math.round(opts.viewportHeight || 1));

    const loaded = [];
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (!seg || typeof seg.dataUrl !== "string") continue;
      const image = await loadImage(seg.dataUrl);
      loaded.push({
        offset: Math.max(0, Math.round(seg.offset || 0)),
        image
      });
    }
    if (!loaded.length) {
      throw new Error("Loaded screenshot segments are empty.");
    }

    const baseWidth = loaded[0].image.width;
    const baseHeight = loaded[0].image.height;
    const scale = baseHeight / viewportHeight;
    const rawStitchedHeight = Math.max(baseHeight, Math.round(docHeight * scale));
    const maxStitchedHeight = Math.max(1200, Math.round(opts.maxStitchedHeight || 14000));
    const maxStitchedWidth = Math.max(320, Math.round(opts.maxStitchedWidth || 2000));
    const fitRatio = Math.min(1, maxStitchedHeight / rawStitchedHeight, maxStitchedWidth / baseWidth);
    const stitchedWidth = Math.max(1, Math.round(baseWidth * fitRatio));
    const stitchedHeight = Math.max(1, Math.round(rawStitchedHeight * fitRatio));

    const canvas = createCanvas(stitchedWidth, stitchedHeight);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context is unavailable for stitching.");
    }

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, stitchedWidth, stitchedHeight);

    const sorted = loaded.sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < sorted.length; i += 1) {
      const item = sorted[i];
      const isFirst = i === 0;
      const isLast = i === sorted.length - 1;
      const cropTop = isFirst ? 0 : Math.round(baseHeight * 0.12);
      const cropBottom = isLast ? 0 : Math.round(baseHeight * 0.05);
      const sourceHeight = Math.max(1, baseHeight - cropTop - cropBottom);
      const rawY = item.offset * scale + cropTop;
      const destY = Math.max(0, Math.round(rawY * fitRatio));
      const destHeight = Math.max(1, Math.round(sourceHeight * fitRatio));
      context.drawImage(
        item.image,
        0,
        cropTop,
        item.image.width,
        sourceHeight,
        0,
        destY,
        stitchedWidth,
        destHeight
      );
    }

    const stitchedDataUrl = canvas.toDataURL("image/png");
    const analysis = await analyzeScreenshotDataUrl(stitchedDataUrl, {
      mode: "full_page_stitched",
      maxDimension: 420,
      sampleStride: 2
    });

    analysis.capture = {
      segments: sorted.length,
      sourceViewport: {
        width: opts.viewportWidth || null,
        height: viewportHeight,
        devicePixelRatio: opts.devicePixelRatio || null
      },
      fullPageHeightCssPx: docHeight,
      stitchedImagePx: {
        width: stitchedWidth,
        height: stitchedHeight
      }
    };
    analysis.notes.unshift(`Full-page stitched analysis from ${sorted.length} viewport screenshots.`);

    return analysis;
  }

  global.DPEScreenshotUtils = {
    analyzeScreenshotDataUrl,
    stitchAndAnalyzeScreenshots
  };
})(window);
