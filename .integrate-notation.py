"""One-time integration helper; removed before releasing this feature."""
from pathlib import Path
root = Path('.')
def once(s, a, b):
    if s.count(a) != 1:
        raise RuntimeError(f'Expected one integration anchor: {a[:80]!r}; found {s.count(a)}')
    return s.replace(a, b, 1)

p=root/'app.js';s=p.read_text()
s=once(s,"import { TOOLS, makeAnnotation, generateLine, generateBlock, pointFromClient } from './core.js';", "import { TOOLS, makeAnnotation, generateLine, generateBlock, pointFromClient } from './core.js';\nimport { INSERTIONS, insertNotation, previewNotation } from './notation.js';")
s=once(s,"  $('font-size-input').value = (options.fontSize || '\\\\normalsize').replace(/^\\\\/, '');", "  $('font-size-input').value = (options.fontSize || '\\\\normalsize').replace(/^\\\\/, '');\n  updateNotationPreview();")
marker='function renderShape(annotation, draft = false) {'
helper=r'''// The notation renderer escapes user input and emits only its own fixed markup.
// Do not assign annotation.text directly to innerHTML.
function updateNotationPreview() {
  const rendered = previewNotation($('text-input').value, $('raw-latex').checked);
  $('notation-preview').innerHTML = rendered.html || '<span class="notation-empty">Label preview</span>';
  $('notation-warning').textContent = rendered.warnings.join(' ');
  $('notation-warning').hidden = rendered.warnings.length === 0;
}

// Measure formatted labels rather than raw command length (e.g. \msup{7}).
// Cache geometry so moving the pointer does not repeatedly measure every label.
const labelMetrics = new Map();
function richLabel(annotation, { x, y, fontSize, color, bold = false, width = null }) {
  const rendered = previewNotation(annotation.text, annotation.rawLatex);
  const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  div.className = 'notation-render annotation-label';
  div.style.fontSize = `${fontSize}px`;
  div.style.fontWeight = bold ? '700' : '400';
  div.style.color = color;
  div.style.textAlign = width === null ? 'center' : 'left';
  div.style.width = width === null ? 'max-content' : `${width}px`;
  div.innerHTML = rendered.html;
  const key = JSON.stringify([annotation.text, annotation.rawLatex, fontSize, bold, width]);
  let size = labelMetrics.get(key);
  if (!size) {
    div.style.position = 'fixed'; div.style.left = '-100000px'; div.style.top = '0';
    div.style.visibility = 'hidden';
    document.body.append(div);
    const bounds = div.getBoundingClientRect();
    size = { width: Math.max(1, Math.ceil(bounds.width)), height: Math.max(1, Math.ceil(bounds.height)) };
    div.remove();
    div.style.position = ''; div.style.left = ''; div.style.top = ''; div.style.visibility = '';
    if (labelMetrics.size >= 200) labelMetrics.clear();
    labelMetrics.set(key, size);
  }
  const foreign = svgElement('foreignObject', {
    x: width === null ? x - size.width / 2 : x,
    y: width === null ? y - size.height / 2 : y,
    width: size.width, height: size.height,
    class: 'annotation-rich-label',
  });
  foreign.append(div);
  return { element: foreign, ...size };
}

'''
s=once(s,marker,helper+marker)
a=s.index("    case 'markerfrag':",s.index(marker));b=s.index("    case 'crosshair':",a)
s=s[:a]+r'''    case 'markerfrag':
    case 'markerfragdark': {
      const label = richLabel(annotation, { x, y, fontSize: 15 * scale, bold: true,
        color: annotation.tool === 'markerfragdark' ? 'white' : color });
      const radius = Math.max(13 * scale, Math.hypot(label.width, label.height) / 2 + 3 * scale);
      group.append(svgElement('circle', { cx: x, cy: y, r: radius,
        fill: annotation.tool === 'markerfragdark' ? color : 'white', stroke: color, 'stroke-width': stroke }));
      shape = label.element;
      break;
    }
    case 'textfrag':
      shape = richLabel(annotation, { x, y, color, fontSize: 20 * scale * annotation.scale }).element;
      break;
    case 'parafrag': {
      const sizes = { tiny: .5, scriptsize: .7, footnotesize: .8, small: .9,
        normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 };
      const name = String(annotation.fontSize).replace(/^\\/, '');
      const label = richLabel(annotation, { x, y, color: '#1b2e45',
        fontSize: 17 * scale * (sizes[name] || 1), width: annotation.width * width });
      group.append(svgElement('rect', { x, y, width: annotation.width * width, height: Math.max(boxHeight, label.height),
        fill: 'white', 'fill-opacity': .65, stroke: '#667b91', 'stroke-dasharray': `${4 * scale} ${4 * scale}`, 'stroke-width': scale }));
      shape = label.element;
      break;
    }
'''+s[b:]
s=once(s,"  state.annotations.forEach((annotation) => overlay.append(renderShape(annotation)));", """  state.annotations.forEach((annotation) => {
    // Live typing previews the selected label without creating an undo entry
    // on each keystroke. The normal change/blur handler commits the edit.
    const shown = annotation.id === state.selected && tool(annotation.tool).supportsText
      ? { ...annotation, text: $('text-input').value, rawLatex: $('raw-latex').checked } : annotation;
    overlay.append(renderShape(shown));
  });""")
anchor="$('undo-button').addEventListener('click', () => {"
ui='''INSERTIONS.forEach((action) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'notation-button';
  button.dataset.notation = action.id;
  button.textContent = action.label; button.title = action.title;
  button.setAttribute('aria-label', action.title);
  button.addEventListener('pointerdown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const input = $('text-input');
    // Commit any preceding typing first, so Undo can remove just the insertion.
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const edit = insertNotation(input.value, input.selectionStart, input.selectionEnd,
      action.id, $('raw-latex').checked);
    input.value = edit.text; $('raw-latex').checked = true;
    updateNotationPreview();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    renderOverlay();
    input.focus({ preventScroll: true });
    input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
  $('notation-toolbar').append(button);
});
$('text-input').addEventListener('input', () => { updateNotationPreview(); renderOverlay(); });
$('text-input').addEventListener('change', updateNotationPreview);
$('raw-latex').addEventListener('change', () => { updateNotationPreview(); renderOverlay(); });

'''
s=once(s,anchor,ui+anchor)
p.write_text(s)
p=root/'index.html';s=p.read_text()
old='<div class="field" data-field="text"><label for="text-input">Label text</label><textarea id="text-input" rows="2" placeholder="e.g. First subject" spellcheck="true"></textarea><label class="check-control compact-check" for="raw-latex"><input id="raw-latex" type="checkbox"><span>Text contains LaTeX</span></label></div>'
new=r'''<div class="field" data-field="text">
              <label for="text-input">Label text</label>
              <textarea id="text-input" rows="3" placeholder="e.g. V\msup{7}" spellcheck="false" aria-describedby="notation-hint"></textarea>
              <div id="notation-toolbar" class="notation-toolbar" role="group" aria-label="Insert music notation"></div>
              <label class="check-control compact-check" for="raw-latex"><input id="raw-latex" type="checkbox"><span>Text contains LaTeX</span></label>
              <p id="notation-hint" class="field-hint">Select text to format it, or place the cursor to insert a symbol. Buttons enable LaTeX mode.</p>
              <div class="notation-preview-box"><span class="notation-preview-title">Label preview</span><div id="notation-preview" class="notation-render" aria-label="Formatted label preview"></div></div>
              <p id="notation-warning" class="notation-warning" role="status" hidden></p>
              <details class="notation-help"><summary>Notation &amp; Overleaf setup</summary>
                <p>Use text-mode commands, without <code>$...$</code>. The canvas and exported LaTeX use the same labels. Stack figures with <code>V\msupsub{6}{4}</code>; use <code>ii\msup{\mhalfdim 7}</code> for a raised half-diminished seventh.</p>
                <p>In Overleaf, load <a href="https://github.com/AdrianArtacho/ltx_snippets/blob/main/ltx/reveal/musicnotation.tex" target="_blank" rel="noopener noreferrer">musicnotation.tex</a> after your existing <code>prefix.tex</code> and <code>imageannot.tex</code> imports:</p>
                <pre><code>\input{META/ltx/reveal/musicnotation.tex}</code></pre>
                <p>Use your actual project path. The updated scriptum and handout builders already load their copy. <a href="https://github.com/AdrianArtacho/format-exchange/blob/main/docs/music-notation.md" target="_blank" rel="noopener noreferrer">Full pipeline guide ↗</a></p>
                <p>Unsupported commands stay literal in the preview and unchanged in export. This is not a general TeX renderer; final font metrics may differ.</p>
              </details>
            </div>'''
s=once(s,old,new)
s=once(s,'<option value="Large">Larger · \\Large</option>', '<option value="Large">Larger · \\Large</option><option value="LARGE">Very large · \\LARGE</option><option value="huge">Huge · \\huge</option><option value="Huge">Largest · \\Huge</option>')
s=s.replace('href="./styles.css"','href="./styles.css?v=music-notation-1"').replace('src="./app.js"','src="./app.js?v=music-notation-1"')
p.write_text(s)
p=root/'styles.css';p.write_text(p.read_text()+'''
/* Portable music-analysis labels: same text-mode vocabulary as the exporters. */
.notation-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.notation-button{min-width:32px;min-height:32px;padding:4px 8px;border:1px solid #d9dee7;border-radius:5px;background:#f6f8fc;color:var(--ink);font:16px Georgia,serif}
.notation-button:hover{background:var(--light-blue);border-color:var(--blue)}
.notation-button[data-notation=textbf]{font-weight:bold}
.notation-button[data-notation=textit]{font-style:italic}
.notation-button[data-notation=underline]{text-decoration:underline}
.notation-preview-box{margin-top:10px;padding:9px;border:1px solid var(--line);border-radius:7px;background:#fafbfe;overflow-wrap:anywhere}
.notation-preview-title{display:block;margin-bottom:6px;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
.notation-render{font:20px/1.5 Georgia,'Times New Roman',serif;white-space:pre-wrap;overflow-wrap:anywhere;font-synthesis:weight style}
.notation-render sup,.notation-render sub{font-size:.72em;line-height:0;position:static}
.notation-render sup{vertical-align:super}.notation-render sub{vertical-align:sub}
.notation-render .music-supsub{display:inline-grid;grid-template-rows:1fr 1fr;vertical-align:middle;font-size:.72em;line-height:1;text-align:left;margin-left:.04em;white-space:nowrap}
.notation-render .music-degree{position:relative;display:inline-block;white-space:nowrap;padding-top:.25em}
.notation-render .music-hat{position:absolute;left:0;right:0;top:-.1em;text-align:center;line-height:1;font-size:.85em}
.notation-render code{font-size:1em;white-space:pre-wrap}
.notation-empty{color:var(--muted);font:12px/1.5 system-ui,sans-serif}
.notation-warning{font-size:11px;line-height:1.5;margin-top:6px;color:#8e4811;overflow-wrap:anywhere}
.notation-help{font-size:11px;line-height:1.5;color:var(--muted);margin-top:9px;overflow-wrap:anywhere}
.notation-help summary{cursor:pointer;font-weight:600;color:var(--ink)}
.notation-help p{margin-top:8px}.notation-help pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0;padding:7px;background:#f2f5fa;border-radius:5px}
.annotation-label{padding:4px;min-height:1.5em;pointer-events:none}
.annotation-rich-label{pointer-events:none;overflow:visible}
@media(max-width:680px){.inspector-section:has(#notation-toolbar:not([hidden])){min-width:0}.notation-button{min-width:30px;padding:4px 6px}.notation-help{font-size:10px}}
''')
p=root/'package.json';s=p.read_text().replace('node --test tests/core.test.js','node --test');p.write_text(s)

p=root/'README.md';s=p.read_text()
s=s.replace('use the raw LaTeX option for mathematical expressions or formatting.', 'use **Text contains LaTeX** for portable notation or existing raw LaTeX.')
s=s.replace('### Link directly to an image',r'''### Music-analysis labels

The Text, Paragraph, Outlined marker and Filled marker tools now have a
**notation toolbar** and a **live label preview**. Select text to wrap it in
superscript/subscript, stacked figures, a scale-degree hat, bold, italic or
underlining. With no selection, a button inserts an editable placeholder.
Accidentals and chord symbols insert at the cursor and terminate with `{}`
so the next letters cannot accidentally become part of a command name.

| Source in the label field | Preview |
| --- | --- |
| `V\msup{7}` | V with raised 7 |
| `C\msub{4}` | C with lowered 4 |
| `V\msupsub{6}{4}` | 6 above 4 in one column beside V |
| `F\msharp`, `\mflat{}VII`, `A\mnatural` | Sharp, flat, natural |
| `\mdegree{3}` | Scale degree with a hat |
| `vii\msup{\mdim 7}` | Raised diminished symbol and 7 |
| `ii\msup{\mhalfdim 7}` | Raised half-diminished symbol and 7 |
| `V\msup{\maug}`, `4\mto{}3` | Augmented plus and motion arrow |
| `\textbf{V\msup{\msharp 5}}` | Nested bold and raised sharp-5 |

The standard `\textsuperscript` / `\textsubscript` names also preview.
These are the **same text-mode commands** used by the updated
[`format-exchange` pipeline](https://github.com/AdrianArtacho/format-exchange/blob/main/docs/music-notation.md).
Do not put them inside `$...$`.

Buttons enable **Text contains LaTeX** automatically; existing plain text is
escaped once when switching via a button. When typing/pasting commands by
hand, check that box yourself. With it unchecked, commands are deliberately
literal text, not notation. Unknown commands or unfinished braces produce a
preview warning, but remain unchanged in export. No full TeX interpreter or
HTML supplied in a label is executed.

The canvas renders formatted text for **all four label types**. Marker circles
fit the rendered label rather than the length of its LaTeX source. Paragraph
font-size selection affects the preview. Typing previews immediately; leaving
the field applies the edit to the annotation and its generated code. Toolbar
insertions apply immediately and can be undone. Copy, `.tex` download and full
block export retain the original commands, never the preview HTML.

**Overleaf:** copy the shared
[`musicnotation.tex`](https://github.com/AdrianArtacho/ltx_snippets/blob/main/ltx/reveal/musicnotation.tex)
into your project and load it after your existing `prefix.tex` and
`imageannot.tex` imports, before `\begin{document}`. For the usual layout:

```latex
\input{META/ltx/reveal/musicnotation.tex}
```

Use your actual path if different. The updated scriptum and handout builders
already load their bundled definitions; using this helper does not synchronize
Overleaf or update other repositories automatically.

### Link directly to an image''')
s=s.replace('fonts, mathematical text, arbitrary TikZ styles, paragraph wrapping and external pin images can differ from the PDF.', 'fonts, unsupported mathematics, arbitrary TikZ styles, paragraph wrapping and external pin images can differ from the PDF. The portable notation subset above is rendered, but bare `^`, `_`, general `$...$` math, double accidentals and microtonal symbols are not interpreted.')
s=s.replace('node tests/browser.mjs\n','node tests/browser.mjs\nnode tests/notation.browser.mjs\n')
s=s.replace('These checks cover drawing, editing, undo, clipboard fallbacks, export, image loading and mobile layout.', 'These checks cover drawing, editing, undo, clipboard fallbacks, export, image loading and mobile layout, plus selection-based notation insertion, live nested previews, both marker styles, paragraphs, unchanged LaTeX export and safe handling of malformed or HTML-like input. Notation browser checks save desktop and mobile screenshots in `test-results/`.')
p.write_text(s)
print('Integrated notation toolbar, label renderer, documentation and test command.')
