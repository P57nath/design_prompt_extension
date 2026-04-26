# Design Prompt Extractor (Chrome Extension)

`Design Prompt Extractor` is a Manifest V3 Chrome extension that analyzes the visible design system of the current webpage and generates a reusable, copyright-safe design prompt for AI webpage generation tools.

It focuses on **style analysis only** (layout, color, typography, component patterns) and avoids cloning proprietary text, logos, images, or brand assets.

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
    - Output style: concise / detailed / expert-level
- Visible-DOM analysis strategy:
  - Prioritized semantic sampling
  - Viewport filtering (`getBoundingClientRect`)
  - Hidden/off-screen exclusion
  - Repeated pattern summarization
- Extracted design signals:
  - Color roles and grouped palettes
  - Typography scales and heading/body patterns
  - Layout structure and section rhythm
  - Component categories (buttons, cards, forms, tables, nav, hero, etc.)
  - Shape/shadow patterns
  - Current-viewport responsive observations
  - Basic accessibility notes
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

The extension injects utility scripts + a content script into the active tab only when analysis is requested.

### Sampling strategy

- Prioritizes semantic and UI-relevant elements (`header`, `nav`, `main`, `section`, headings, links, buttons, inputs, forms, tables, card-like containers).
- Skips hidden/non-visual nodes (`script`, `style`, SVG internals, off-screen/zero-size elements).
- Uses `window.getComputedStyle()` and `getBoundingClientRect()` for visual metrics.
- Limits element count and summarizes repeated component patterns to avoid noisy output.

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

## Privacy and Safety Notes

- Analysis is local in-browser.
- No login required.
- No paid API required.
- No external data transfer by v1.
- Intended for style/system inspiration only.
- Not intended to clone copyrighted content.
- Prompt output explicitly recommends:
  - similar design language
  - original content/assets
  - no proprietary text/logo/image copying

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
4. Click **Generate Design Prompt** and verify prompt content appears.
5. Click **Copy Prompt** and paste result elsewhere.
6. Click **Download .txt** and verify file contents.
7. Toggle settings and reopen popup to confirm persistence.

## Debugging Tips

- If the extension does nothing:
  - Confirm page URL is `http://` or `https://`.
  - Open extension popup console (right-click popup -> Inspect).
  - Check for script injection errors.
- If analysis fails:
  - Reload the webpage and retry.
  - Some pages with strict CSP or highly dynamic rendering may reduce available signals.
- If prompt is empty:
  - Run Analyze first.
  - Verify `contentScript.js` and utility files exist in extension root.
- If updates are not reflected:
  - Go to `chrome://extensions`, click **Reload** for this extension.

## Known Limitations (v1)

- Analyzes visible/current DOM styles only.
- Interactive/hidden states may not be fully captured.
- Does not clone any webpage.
- Does not extract copyrighted logos/images/text.
- Canvas-heavy or highly dynamic apps may provide limited style signals.
- Responsive guidance is based mainly on the current viewport snapshot.

## Future Improvements

- Screenshot-based visual analysis
- AI-assisted prompt refinement
- Export as JSON design tokens
- Export Tailwind config scaffold
- Export CSS variable themes
- Multi-viewport analysis pass
- Figma plugin integration
- Component-level screenshot tagging
- Compare multiple webpages and synthesize merged style prompt
- Local LLM integration for offline prompt refinement
