# [ImageAnnot](https://adrianartacho.github.io/imageannot/)

Draw annotations over an image and copy the corresponding LaTeX commands for Adrián Artacho’s [`imageannot.tex`](https://github.com/AdrianArtacho/ltx_snippets/blob/main/ltx/reveal/imageannot.tex) macros. [Open the app](https://adrianartacho.github.io/imageannot/). It runs entirely in your browser.

## Use

1. Open the app, enter a direct image URL, choose an image file, or drop a file onto the image area.
2. Choose a fragment and set its colour, rotation or other options.
3. Drag from one corner to the opposite corner for a box or ellipse. For arrows and rules, drag from the start to the end. For paragraphs, drag the desired text area. For text labels, markers, pins and crosshairs, click the desired position.
4. Each completed annotation generates a LaTeX line and attempts to copy it automatically. Use **Copy LaTeX** to retry or copy the selected output; if clipboard access is unavailable, select the visible code and copy it manually.
5. Set the image path used in Overleaf to generate a complete `\imageannot{...}{...}` block. The browser image URL and the Overleaf path can differ.

Use **Grid** and **Zoom** for precise placement. Select a fragment in the list to adjust its settings, or use **Undo** and **Clear** to remove selections. The output menu switches between the latest fragment, all fragments and the full image block; the **.tex** button downloads the selected output.

The coordinate origin is the image’s **top-left corner**. Both axes run from 0 to 1: `x` increases to the right and `y` increases downward. Image resizing does not change the exported coordinates. Positive LaTeX rotation angles rotate anticlockwise.

### Fragment reference

| Fragment | Gesture | Generated syntax |
| --- | --- | --- |
| Rectangle | Drag bounding box | `\rectfrag[colour][angle]{x1}{y1}{x2}{y2}` |
| Ellipse outline | Drag bounding box | `\ellipsefrag[colour][angle]{x1}{y1}{x2}{y2}` |
| Filled oval | Drag bounding box | `\ovalfrag[colour][angle][opacity]{x1}{y1}{x2}{y2}` |
| Highlight | Drag bounding box | `\highlightfrag[colour]{x1}{y1}{x2}{y2}` |
| Moving highlight | Drag bounding box | `\highlightmove[colour]{x1}{y1}{x2}{y2}` |
| Whiteout | Drag bounding box | `\highlightfrag[whiteout]{x1}{y1}{x2}{y2}` |
| Arrow | Drag start → end | `\arrowfrag[colour]{x1}{y1}{x2}{y2}` |
| Rule with end caps | Drag start → end | `\rulefrag[colour]{x1}{y1}{x2}{y2}` |
| Text | Click centre | `\textfrag[colour]{x}{y}{scale}{text}` |
| Outlined marker | Click centre | `\markerfrag[colour]{x}{y}{label}` |
| Filled marker | Click centre | `\markerfragdark[colour]{x}{y}{label}` |
| Crosshair | Click position | `\crosshair{x}{y}` |
| Paragraph | Drag text area | `\parafrag[font command]{x}{y}{width fraction}{text}` |
| Image pin | Click centre | `\pinfrag[angle]{x}{y}{scale}{image path}` |

Paragraphs use the box’s top-left corner and horizontal span; their height follows the text’s typesetting. Plain text labels escape LaTeX special characters; use the raw LaTeX option for mathematical expressions or formatting.

`highlightmove` is currently an alias of `highlightfrag`. Whiteout uses the final opaque `whiteout` style in the source file. Any fragment-reveal or removal behaviour is handled by your existing LaTeX-to-Reveal workflow; this editor produces the macro commands.

### Link directly to an image

Use `?image=` with a URL-encoded direct image URL. Add `&path=` to supply the image path in your Overleaf project:

```text
https://adrianartacho.github.io/imageannot/?image=https%3A%2F%2Fexample.org%2Fscore.png&path=images%2Fscore.png
```

The URL must resolve to an image the browser can display, rather than a webpage containing an image. Remote hosts may block embedding or require login; downloading the image and dropping it into the app works around those restrictions. Local files cannot be embedded in shareable URLs.

## LaTeX setup

Include your existing macro definitions and their required packages and TikZ libraries:

```latex
\usepackage{graphicx}
\usepackage{tikz}
\usepackage{xparse}
\usetikzlibrary{arrows.meta,calc}
\input{imageannot.tex}
```

A snapshot of the definitions used to build this app is included in [`reference/imageannot.tex`](reference/imageannot.tex); its provenance is recorded in [`SOURCE.md`](SOURCE.md). This editor does not modify the original macro file.

### Preview limits

Coordinates, endpoints, bounding boxes and rotation are calculated from the displayed image. The preview is a drawing aid rather than a TeX renderer: fonts, mathematical text, arbitrary TikZ styles, paragraph wrapping and external pin images can differ from the PDF. Line thickness, rounded corners, arrowheads, rule end caps, text size and pin width use physical TeX units, so their on-screen size is approximate. `\pinfrag` sets image width to `scale × 0.9 cm`; paragraph width is a fraction of `\textwidth`. Check the compiled PDF for final typography and physical sizes.

## Privacy

Images selected from your computer stay in the browser; the app does not upload them or send annotation data to a server. Loading a URL requests that image from its host. Copying writes generated code to your clipboard. Closing or reloading the page may discard the current workspace, so copy your code before leaving.

## Run locally

No installation or build step is required. Serve the repository with Python:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. A local HTTP server is preferable to opening `index.html` directly, especially for clipboard support and JavaScript modules.

Run the coordinate and code-generation tests with Node.js:

```sh
node --test
```

For the optional browser integration checks, install Playwright locally:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser.mjs
```

These checks cover drawing, editing, undo, clipboard fallbacks, export, image loading and mobile layout. The app itself has no runtime dependencies.

## GitHub Pages

GitHub Pages is configured to publish **main** from **/ (root)**. The app is served at:

<https://adrianartacho.github.io/imageannot/>

The app uses relative asset paths and needs no custom build workflow.
