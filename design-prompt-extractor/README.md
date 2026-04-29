# Design Prompt Extractor (Chrome Extension)

`Design Prompt Extractor` is a Manifest V3 Chrome extension that analyzes the visible design system of the current webpage and generates a reusable, copyright-safe design prompt for AI webpage generation tools.

It supports high-fidelity design replication workflows for **authorized/owned content only**.

## Project Structure

```text
design-prompt-extractor/
  manifest.json
  popup.html
  popup.css
  popup.js
  contentScript.js
  background.js
  utils/
    colorUtils.js
    domUtils.js
    promptBuilder.js
    screenshotUtils.js
  icons/
    icon16.png
    icon48.png
    icon128.png
  README.md
```

## Features

- Popup UI with:
  - Analyze Current Page
  - Generate Design Prompt
  - Copy Prompt
  - Download Prompt as `.txt`
  - Status feedback and error handling
  - Settings toggles:
    - Include colors
    - Include typography
    - Include layout
    - Include component details
    - Include responsive suggestions
    - Include screenshot-based visual analysis
    - Use multi-screenshot stitched full-page analysis
    - Include page text + section copy in prompt
    - Output style: concise / detailed / expert-level
- Visible-DOM analysis strategy:
  - Prioritized semantic sampling
  - Viewport filtering (`getBoundingClientRect`)
  - Hidden/off-screen exclusion
  - Repeated pattern summarization
- Screenshot-based visual analysis strategy:
  - Captures either current viewport or multi-screenshot stitched full-page view locally
  - Runs pixel-level analysis in extension context (no server/API)
  - Extracts dominant pixel palette, brightness, contrast, saturation, whitespace, and composition emphasis
- Extracted design signals:
  - Color roles and grouped palettes
  - Typography scales and heading/body patterns
  - Layout structure and section rhythm
  - Component categories (buttons, cards, forms, tables, nav, hero, etc.)
  - Shape/shadow patterns
  - Current-viewport responsive observations
  - Basic accessibility notes
  - Screenshot-driven visual cues (tone, density, whitespace, contrast, emphasis zone)
  - Optional high-fidelity content blueprint (visible section text copy + nav/CTA labels)
- Prompt generation:
  - Structured reusable prompt sections (1-12)
  - Copyright-safe wording
  - AI-tool compatible output for GPT/Gemini/Claude/Cursor/Codex/v0/Bolt/Lovable/etc.

## Installation (Load Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the folder: `design-prompt-extractor/`.
5. Pin the extension from the Chrome toolbar if desired.

## How to Use

1. Open any regular `http/https` webpage.
2. Click the extension icon.
3. Optional: configure settings in the popup.
4. Click **Analyze Current Page**.
5. Click **Generate Design Prompt**.
6. Use **Copy Prompt** or **Download .txt**.

## How Analysis Works (v1)

The extension injects utility scripts + a content script into the active tab only when analysis is requested, then optionally performs local screenshot analysis from the popup.

### Sampling strategy

- Prioritizes semantic and UI-relevant elements (`header`, `nav`, `main`, `section`, headings, links, buttons, inputs, forms, tables, card-like containers).
- Skips hidden/non-visual nodes (`script`, `style`, SVG internals, off-screen/zero-size elements).
- Uses `window.getComputedStyle()` and `getBoundingClientRect()` for visual metrics.
- Limits element count and summarizes repeated component patterns to avoid noisy output.

### Screenshot strategy

- Captures the active viewport with `chrome.tabs.captureVisibleTab`.
- Optional full-page mode:
  - Builds a scroll capture plan in content script
  - Scrolls the page in overlapping steps
  - Captures multiple viewport screenshots
  - Stitches them into one full-page composite
- Downscales and samples pixels for fast local processing.
- Computes:
  - dominant screenshot colors
  - brightness range and tone (light/dark)
  - colorfulness (muted/balanced/vibrant)
  - whitespace ratio
  - visual density (edge/complexity signal)
  - top/middle/bottom composition emphasis
- Stores only summary metrics in memory for prompt generation.

### Data extracted

- Colors:
  - Dominant backgrounds, text, button/link, border, shadow colors
  - Grouping of similar colors
  - Palette role inference (primary/secondary/accent/background/surface/text/border)
- Typography:
  - Font families, sizes, weights, line-height, letter spacing, alignment patterns
  - Heading style sampling and body size estimates
- Layout:
  - Semantic structure signals
  - Grid/flex usage
  - Max-width patterns and section spacing rhythms
  - Header/footer notes and density heuristics
- Components:
  - Navigation bars, buttons, cards, forms, inputs, tables, search bars, modals, product/pricing/testimonial cards, hero/feature sections, sidebars, badges
- Additional:
  - Shape and effect patterns (radius, borders, shadows)
  - Image treatment signals
  - Current viewport responsive observations
  - Accessibility hints
  - Screenshot visual cues (if enabled)
  - Content blueprint block with copied visible section text (if enabled)

## Privacy and Safety Notes

- Analysis is local in-browser.
- No login required.
- No paid API required.
- No external data transfer by v1.
- Intended for style/system inspiration only.
- Use only with content you own or are authorized to reproduce.
- Prompt output explicitly recommends:
  - similar design language
  - original content/assets
  - no proprietary text/logo/image copying
  - manual review of copied text before reuse

## Minimum Permissions Used

- `activeTab`: analyze current active tab on user action.
- `scripting`: inject analysis scripts when requested.
- `storage`: persist popup settings.

No broad host permissions are declared.

## Example Generated Prompt (Shortened)

```text
Title:
Reusable Web Design Prompt

1. Overall Design Direction
Create a webpage with a similar design language to the analyzed page, not a direct copy...

3. Color Palette
- Primary: #0F7FAE used for primary CTAs...
- Secondary: #26A088 used for supporting actions...
- Background: #F8FAFC ...

5. Layout Structure
Use a responsive centered container, clear section rhythm, modular card grouping...

12. Instructions for AI Webpage Generator
Create a webpage with a comparable style system, use placeholder content and original assets, and do not copy proprietary text/logos/images.
```

## Testing Checklist

1. Load unpacked extension without manifest errors.
2. Open a normal website (not `chrome://` pages).
3. Click **Analyze Current Page** and verify success status.
4. If full-page stitch is enabled, confirm status mentions full-page stitched analysis with segment count.
5. Click **Generate Design Prompt** and verify prompt content appears.
6. Click **Copy Prompt** and paste result elsewhere.
7. Click **Download .txt** and verify file contents.
8. Toggle settings and reopen popup to confirm persistence.

## Debugging Tips

- If the extension does nothing:
  - Confirm page URL is `http://` or `https://`.
  - Open extension popup console (right-click popup -> Inspect).
  - Check for script injection errors.
- If analysis fails:
  - Reload the webpage and retry.
  - Some pages with strict CSP or highly dynamic rendering may reduce available signals.
  - If screenshot analysis fails on a restricted page, DOM analysis still runs and prompt generation remains available.
- If prompt is empty:
  - Run Analyze first.
  - Verify `contentScript.js` and utility files exist in extension root.
- If updates are not reflected:
  - Go to `chrome://extensions`, click **Reload** for this extension.

## Known Limitations (v1)

- Analyzes visible/current DOM styles only.
- Full-page stitched capture can include repeated sticky headers/nav areas due overlap stitching.
- Very long pages are sampled with a shot limit, so stitched analysis is representative rather than perfect pixel-complete.
- Copied content blueprint is based on visible/rendered section text and may include repetitive boilerplate; review before production use.
- Interactive/hidden states may not be fully captured.
- Intended for authorized/owned webpages and content replication workflows.
- Does not extract copyrighted logos/images/text.
- Canvas-heavy or highly dynamic apps may provide limited style signals.
- Responsive guidance is based mainly on the current viewport snapshot.

## Future Improvements

- AI-assisted prompt refinement
- Export as JSON design tokens
- Export Tailwind config scaffold
- Export CSS variable themes
- Multi-viewport analysis pass
- Figma plugin integration
- Component-level screenshot tagging
- Compare multiple webpages and synthesize merged style prompt
- Local LLM integration for offline prompt refinement
