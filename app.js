import { TOOLS, makeAnnotation, generateLine, generateBlock, pointFromClient } from './core.js';
import { INSERTIONS, insertNotation, previewNotation } from './notation.js';

const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const state = {
  annotations: [], selected: null, nextId: 1, undo: [], drag: null,
  image: null, objectUrl: null, remoteUrl: '', loadToken: 0, resizeFrame: 0,
};
const tool = (id = $('tool-select').value) => TOOLS.find((item) => item.id === id);
const chosen = () => state.annotations.find((item) => item.id === state.selected);
const precision = () => Number($('precision-select').value);

$('tool-select').replaceChildren();
TOOLS.forEach((item) => {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = item.label;
  $('tool-select').append(option);
});

function announce(message, tone = 'info') {
  $('status').textContent = message;
  $('status').dataset.tone = tone;
}

function snapshot() {
  state.undo.push({ annotations: state.annotations.map((item) => ({ ...item })), selected: state.selected });
  if (state.undo.length > 100) state.undo.shift();
}

function readOptions() {
  return {
    color: $('color-input').value.trim() || tool().defaultColor,
    rotation: Number($('rotation-input').value),
    opacity: Number($('opacity-input').value),
    text: $('text-input').value,
    rawLatex: $('raw-latex').checked,
    scale: Number($('scale-input').value),
    width: Number($('width-input').value),
    pinPath: $('pin-path-input').value.trim(),
    fontSize: $('font-size-input').value,
  };
}

function validOptions() {
  const options = readOptions();
  if (tool().id === 'pinfrag' && !options.pinPath) {
    announce('Enter the path of the pin image in your Overleaf project.', 'error');
    return false;
  }
  // A color is a single TikZ color expression, never a list of drawing options.
  if (tool().id !== 'whiteout' && !/^[a-zA-Z][a-zA-Z0-9! ._-]*$/.test(options.color)) {
    announce('Use a TikZ color name or mix, for example red or blue!40!white.', 'error');
    return false;
  }
  const activeFields = [...document.querySelectorAll('[data-field]')].filter((field) => !field.hidden);
  for (const field of activeFields) {
    const input = field.querySelector('input[type="number"]');
    if (input && (!input.value.trim() || !input.checkValidity() || !Number.isFinite(Number(input.value)))) {
      announce(`Check the ${field.querySelector('label')?.textContent || 'numeric'} value.`, 'error');
      return false;
    }
  }
  return true;
}

function updateInspector(annotation = null) {
  const active = tool(annotation?.tool);
  const id = active.id;
  const fields = {
    color: !['whiteout', 'crosshair', 'pinfrag', 'parafrag'].includes(id),
    rotation: ['rectfrag', 'ellipsefrag', 'ovalfrag', 'pinfrag'].includes(id),
    opacity: id === 'ovalfrag',
    text: ['textfrag', 'markerfrag', 'markerfragdark', 'parafrag'].includes(id),
    scale: ['textfrag', 'pinfrag'].includes(id),
    width: id === 'parafrag',
    pinPath: id === 'pinfrag',
    fontSize: id === 'parafrag',
  };
  document.querySelectorAll('[data-field]').forEach((field) => { field.hidden = !fields[field.dataset.field]; });
  const options = annotation || makeAnnotation(id, { x: 0, y: 0 }, { x: .3, y: .2 });
  $('color-input').value = options.color || active.defaultColor || 'red';
  $('rotation-input').value = options.rotation ?? 0;
  $('opacity-input').value = options.opacity ?? .2;
  $('text-input').value = options.text ?? 'Label';
  $('raw-latex').checked = Boolean(options.rawLatex);
  $('scale-input').value = options.scale ?? 1;
  $('width-input').value = options.width ?? .3;
  $('pin-path-input').value = options.pinPath || 'pin.png';
  $('font-size-input').value = (options.fontSize || '\\normalsize').replace(/^\\/, '');
  updateNotationPreview();
  $('tool-help').textContent = id === 'parafrag'
    ? 'Drag a box: the upper-left corner places the paragraph; its width sets the text width. Height is determined by your text in LaTeX.'
    : id === 'whiteout'
      ? 'Drag a box to cover the image with opaque white. Use Reveal fragment wrappers in your document to control when it disappears.'
      : active.kind === 'point'
        ? 'Click the image to place this annotation. Adjust its settings here.'
        : active.kind === 'line'
          ? 'Drag from the start of the line to its end. Direction is preserved.'
          : 'Drag from one corner to the opposite corner. You can draw in either direction.';
}

function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

// TikZ's base colors are not all identical to CSS named colors.
const colors = {
  red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], cyan: [0, 255, 255],
  magenta: [255, 0, 255], yellow: [255, 255, 0], black: [0, 0, 0], white: [255, 255, 255],
  gray: [128, 128, 128], darkgray: [64, 64, 64], lightgray: [191, 191, 191],
  orange: [255, 128, 0], violet: [128, 0, 128], purple: [191, 0, 64],
  brown: [191, 128, 64], olive: [128, 128, 0], lime: [191, 255, 0],
  pink: [255, 191, 191], teal: [0, 128, 128],
};

function previewColor(expression) {
  const parts = String(expression || 'red').trim().toLowerCase().split('!');
  let rgb = colors[parts[0]];
  if (!rgb) return '#cf3156';
  for (let i = 1; i < parts.length; i += 2) {
    const amount = Math.max(0, Math.min(100, Number(parts[i]))) / 100;
    const other = colors[parts[i + 1] || 'white'];
    if (!Number.isFinite(amount) || !other) return '#cf3156';
    rgb = rgb.map((channel, n) => Math.round(channel * amount + other[n] * (1 - amount)));
  }
  return `rgb(${rgb.join(',')})`;
}

// The notation renderer escapes user input and emits only its own fixed markup.
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

function renderShape(annotation, draft = false) {
  const width = state.image.width;
  const height = state.image.height;
  const x = annotation.x1 * width, y = annotation.y1 * height;
  const x2 = annotation.x2 * width, y2 = annotation.y2 * height;
  const boxWidth = x2 - x, boxHeight = y2 - y;
  const color = previewColor(annotation.color);
  const scale = Math.max(1, width / 900);
  const stroke = 2 * scale;
  const group = svgElement('g', { class: 'annotation-shape', 'data-id': annotation.id || 'draft' });
  const shapeStyle = { fill: 'none', stroke: color, 'stroke-width': stroke };
  let shape;
  switch (annotation.tool) {
    case 'rectfrag':
      shape = svgElement('rect', { x, y, width: boxWidth, height: boxHeight, rx: 4 * scale, ...shapeStyle });
      break;
    case 'ellipsefrag':
    case 'ovalfrag':
      shape = svgElement('ellipse', { cx: (x + x2) / 2, cy: (y + y2) / 2, rx: boxWidth / 2, ry: boxHeight / 2,
        ...shapeStyle, ...(annotation.tool === 'ovalfrag' ? { fill: color, stroke: 'none', 'fill-opacity': annotation.opacity } : {}) });
      break;
    case 'whiteout':
    case 'highlightfrag':
    case 'highlightmove':
      shape = svgElement('rect', { x, y, width: boxWidth, height: boxHeight,
        fill: annotation.tool === 'whiteout' ? 'white' : color,
        'fill-opacity': annotation.tool === 'whiteout' ? 1 : .35 });
      break;
    case 'arrowfrag':
    case 'rulefrag': {
      shape = svgElement('line', { x1: x, y1: y, x2, y2, ...shapeStyle,
        ...(annotation.tool === 'arrowfrag' ? { 'marker-end': `url(#arrow-${annotation.id || 'draft'})` } : {}) });
      if (annotation.tool === 'arrowfrag') {
        const defs = svgElement('defs');
        const marker = svgElement('marker', { id: `arrow-${annotation.id || 'draft'}`, viewBox: '0 0 10 10',
          refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
        marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
        defs.append(marker); group.append(defs);
      } else {
        const length = Math.hypot(x2 - x, y2 - y) || 1;
        const capX = (y2 - y) / length * 6 * scale, capY = -(x2 - x) / length * 6 * scale;
        [[x, y], [x2, y2]].forEach(([px, py]) => group.append(svgElement('line', {
          x1: px - capX, y1: py - capY, x2: px + capX, y2: py + capY, ...shapeStyle,
        })));
      }
      break;
    }
    case 'markerfrag':
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
    case 'crosshair':
      shape = svgElement('path', { d: `M${x - width * .01} ${y}H${x + width * .01} M${x} ${y - height * .01}V${y + height * .01}`, ...shapeStyle, stroke: 'red' });
      group.append(svgElement('text', { x: x + 7 * scale, y: y - 8 * scale, fill: 'red', 'font-size': 13 * scale },
        `(${annotation.x1.toFixed(precision())}, ${annotation.y1.toFixed(precision())})`));
      break;
    case 'pinfrag':
      group.append(svgElement('rect', { x: x - 18 * scale, y: y - 18 * scale, width: 36 * scale, height: 36 * scale,
        fill: '#e8eef7', stroke: '#5377ad', 'stroke-dasharray': `${3 * scale} ${3 * scale}` }));
      shape = svgElement('text', { x, y, fill: '#315a93', 'font-size': 12 * scale,
        'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'PIN');
      break;
  }
  if (shape) group.append(shape);
  if (annotation.rotation && ['rectfrag', 'ellipsefrag', 'ovalfrag'].includes(annotation.tool)) {
    // TikZ rotates in the physical plane: positive angles are anticlockwise.
    group.setAttribute('transform', `rotate(${-annotation.rotation} ${(x + x2) / 2} ${(y + y2) / 2})`);
  }
  if (draft || annotation.id === state.selected) {
    const area = tool(annotation.tool).kind === 'point';
    group.append(svgElement('rect', { x: area ? x - 20 * scale : Math.min(x, x2),
      y: area ? y - 20 * scale : Math.min(y, y2),
      width: area ? 40 * scale : Math.max(Math.abs(boxWidth), scale),
      height: area ? 40 * scale : Math.max(Math.abs(boxHeight), scale),
      fill: 'none', stroke: '#2864b3', 'stroke-width': scale, 'stroke-dasharray': `${4 * scale} ${3 * scale}` }));
  }
  if (draft) group.setAttribute('opacity', '.85');
  return group;
}

function renderOverlay() {
  const overlay = $('overlay');
  overlay.replaceChildren();
  if (!state.image) return;
  const { width, height } = state.image;
  overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if ($('grid-toggle').checked) {
    const grid = svgElement('g', { stroke: '#5377ad', 'stroke-width': Math.max(1, width / 1600), 'opacity': .25 });
    for (let n = 0; n <= 10; n++) {
      grid.append(svgElement('line', { x1: width * n / 10, y1: 0, x2: width * n / 10, y2: height }));
      grid.append(svgElement('line', { x1: 0, y1: height * n / 10, x2: width, y2: height * n / 10 }));
    }
    overlay.append(grid);
  }
  state.annotations.forEach((annotation) => {
    // Live typing previews the selected label without creating an undo entry
    // on each keystroke. The normal change/blur handler commits the edit.
    const shown = annotation.id === state.selected && tool(annotation.tool).supportsText
      ? { ...annotation, text: $('text-input').value, rawLatex: $('raw-latex').checked } : annotation;
    overlay.append(renderShape(shown));
  });
  if (state.drag) overlay.append(renderShape(makeDraft(), true));
}

function outputText() {
  if (!state.annotations.length) return '';
  if ($('output-mode').value === 'block') return generateBlock(state.annotations, $('image-path').value.trim() || 'score.png', precision());
  if ($('output-mode').value === 'all') return state.annotations.map((annotation) => generateLine(annotation, precision())).join('\n');
  return generateLine(chosen() || state.annotations.at(-1), precision());
}

function renderOutput() {
  $('latex-output').value = outputText();
  $('copy-button').disabled = !state.annotations.length;
  $('download-button').disabled = !state.annotations.length;
}

function renderHistory() {
  $('annotation-count').textContent = String(state.annotations.length);
  $('annotation-list').replaceChildren();
  for (const annotation of state.annotations) {
    const item = document.createElement('li');
    item.dataset.id = String(annotation.id);
    item.className = `annotation-item${annotation.id === state.selected ? ' is-selected' : ''}`;
    const select = document.createElement('button');
    select.type = 'button'; select.className = 'annotation-select';
    select.setAttribute('aria-pressed', String(annotation.id === state.selected));
    const name = document.createElement('span'); name.className = 'annotation-name';
    name.textContent = `${annotation.id} · ${tool(annotation.tool).label}`;
    const code = document.createElement('code'); code.className = 'annotation-code';
    code.textContent = generateLine(annotation, precision());
    select.append(name, code);
    select.addEventListener('click', () => {
      state.selected = annotation.id;
      $('tool-select').value = annotation.tool;
      updateInspector(annotation); renderAll();
      announce('Annotation selected. Change its settings here, or draw another annotation.');
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'annotation-delete'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Delete annotation ${annotation.id}`);
    remove.addEventListener('click', () => deleteAnnotation(annotation.id));
    item.append(select, remove); $('annotation-list').append(item);
  }
  $('undo-button').disabled = !state.undo.length;
  $('clear-button').disabled = !state.annotations.length;
}

function renderAll() { renderOverlay(); renderHistory(); renderOutput(); }

function layoutImage() {
  if (!state.image) return;
  const zoom = $('zoom-select').value;
  const available = Math.max(120, $('viewport').clientWidth - 32);
  const displayWidth = zoom === 'fit' ? Math.min(available, state.image.width) : state.image.width * Number(zoom) / 100;
  $('image-stage').style.width = `${displayWidth}px`;
  $('image-stage').style.height = `${displayWidth * state.image.height / state.image.width}px`;
}

function pointerPosition(event) {
  return pointFromClient(event.clientX, event.clientY, $('overlay').getBoundingClientRect());
}

function makeDraft() {
  const options = { ...state.drag.options };
  if (state.drag.tool === 'parafrag') options.width = Math.max(.001, Math.abs(state.drag.end.x - state.drag.start.x));
  return makeAnnotation(state.drag.tool, state.drag.start, state.drag.end, options);
}

$('overlay').addEventListener('pointerdown', (event) => {
  if (!state.image || event.button !== 0 || state.drag || !validOptions()) return;
  event.preventDefault();
  const point = pointerPosition(event);
  state.drag = { pointerId: event.pointerId, tool: tool().id, start: point, end: point, options: readOptions(),
    clientX: event.clientX, clientY: event.clientY };
  $('overlay').setPointerCapture(event.pointerId);
  renderOverlay();
});

$('overlay').addEventListener('pointermove', (event) => {
  if (!state.image) return;
  const point = pointerPosition(event);
  $('coordinates').textContent = `x ${point.x.toFixed(precision())} · y ${point.y.toFixed(precision())}`;
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  state.drag.end = point; renderOverlay();
});

$('overlay').addEventListener('pointerup', (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  state.drag.end = pointerPosition(event);
  const active = tool(state.drag.tool);
  const distance = Math.hypot(event.clientX - state.drag.clientX, event.clientY - state.drag.clientY);
  const annotation = makeDraft();
  state.drag = null;
  if ($('overlay').hasPointerCapture(event.pointerId)) $('overlay').releasePointerCapture(event.pointerId);
  if (active.kind !== 'point' && (distance < 3 || (active.kind === 'box' && (annotation.x1 === annotation.x2 || annotation.y1 === annotation.y2)))) {
    renderOverlay(); announce('Drag a larger region to create this annotation.'); return;
  }
  snapshot(); annotation.id = state.nextId++; state.annotations.push(annotation); state.selected = annotation.id;
  updateInspector(annotation); renderAll();
  if ($('auto-copy').checked) void copyText(generateLine(annotation, precision()), true);
  else announce('Annotation added. Its LaTeX line is ready below.', 'success');
});

function cancelDrag() { state.drag = null; renderOverlay(); }
$('overlay').addEventListener('pointercancel', cancelDrag);
$('overlay').addEventListener('lostpointercapture', () => { if (state.drag) cancelDrag(); });

async function copyText(text, automatic = false) {
  if (!text) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    announce(automatic ? 'LaTeX line copied. Paste it into Overleaf.' : 'Copied to clipboard.', 'success');
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = text; fallback.setAttribute('aria-hidden', 'true');
    fallback.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(fallback);
    const active = document.activeElement;
    fallback.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* manual selection below */ }
    fallback.remove(); active?.focus({ preventScroll: true });
    if (copied) announce('LaTeX line copied. Paste it into Overleaf.', 'success');
    else {
      // Always show the exact line we tried to copy if automatic copy was blocked.
      if (automatic) $('output-mode').value = 'latest';
      renderOutput(); $('latex-output').focus({ preventScroll: true }); $('latex-output').select();
      announce('Automatic copying was blocked by your browser. Press Copy, or copy the selected code with Ctrl/Cmd+C.', 'error');
    }
  }
}

function deleteAnnotation(id) {
  snapshot(); state.annotations = state.annotations.filter((item) => item.id !== id);
  if (state.selected === id) state.selected = state.annotations.at(-1)?.id || null;
  if (chosen()) { $('tool-select').value = chosen().tool; updateInspector(chosen()); }
  renderAll(); announce('Annotation deleted. Undo restores it.');
}

$('tool-select').addEventListener('change', () => {
  cancelDrag(); state.selected = null; updateInspector(); renderAll();
});

document.querySelectorAll('[data-field] input, [data-field] textarea, [data-field] select').forEach((input) => {
  input.addEventListener('change', () => {
    const annotation = chosen();
    if (!annotation || !validOptions()) return;
    const next = makeAnnotation(annotation.tool, { x: annotation.x1, y: annotation.y1 }, { x: annotation.x2, y: annotation.y2 }, readOptions());
    if (Object.entries(next).every(([key, value]) => annotation[key] === value)) return;
    snapshot();
    Object.assign(annotation, next, { id: state.selected });
    // A change may be a blur triggered by clicking a history button. Keep
    // that button in the DOM until its click fires; update only its text.
    renderOverlay(); renderOutput();
    const row = $('annotation-list').querySelector(`[data-id="${annotation.id}"]`);
    if (row) row.querySelector('.annotation-code').textContent = generateLine(annotation, precision());
    $('undo-button').disabled = !state.undo.length;
    if ($('auto-copy').checked) void copyText(generateLine(annotation, precision()), true);
  });
});

INSERTIONS.forEach((action) => {
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

$('undo-button').addEventListener('click', () => {
  const previous = state.undo.pop(); if (!previous) return;
  state.annotations = previous.annotations; state.selected = previous.selected;
  if (chosen()) { $('tool-select').value = chosen().tool; updateInspector(chosen()); }
  renderAll(); announce('Last change undone.');
});
$('clear-button').addEventListener('click', () => {
  if (!state.annotations.length) return;
  snapshot(); state.annotations = []; state.selected = null; renderAll(); announce('Annotations cleared. Undo restores them.');
});
$('copy-button').addEventListener('click', () => void copyText(outputText()));
$('download-button').addEventListener('click', () => {
  const blob = new Blob([`${outputText()}\n`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'imageannot.tex'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Downloaded the selected LaTeX output.', 'success');
});
$('output-mode').addEventListener('change', renderOutput);
$('precision-select').addEventListener('change', renderAll);
$('grid-toggle').addEventListener('change', renderOverlay);
$('zoom-select').addEventListener('change', layoutImage);
$('image-path').addEventListener('input', () => {
  renderOutput();
  if (state.remoteUrl) {
    const address = new URL(window.location.href);
    address.searchParams.set('path', $('image-path').value);
    history.replaceState(null, '', address);
  }
});

function suggestedPath(url) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'score.png'; }
  catch { return 'score.png'; }
}

async function loadImage(source, { path, objectUrl = false, remoteUrl = '' } = {}) {
  const token = ++state.loadToken;
  announce('Loading image…');
  const candidate = new Image();
  candidate.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      candidate.onload = resolve; candidate.onerror = () => reject(new Error('Image could not be loaded'));
      candidate.src = source;
    });
    if (token !== state.loadToken) { if (objectUrl) URL.revokeObjectURL(source); return; }
    if (!candidate.naturalWidth || !candidate.naturalHeight) throw new Error('Image has no dimensions');
    cancelDrag();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = objectUrl ? source : null;
    state.remoteUrl = remoteUrl;
    state.image = { width: candidate.naturalWidth, height: candidate.naturalHeight };
    state.annotations = []; state.undo = []; state.selected = null; state.nextId = 1;
    $('source-image').src = source;
    $('source-image').hidden = false;
    $('viewport').classList.add('has-image');
    $('source-image').alt = path || 'Image to annotate';
    $('empty-state').hidden = true; $('image-stage').hidden = false;
    $('image-status').textContent = `${candidate.naturalWidth} × ${candidate.naturalHeight} px`;
    $('image-status').classList.add('is-loaded');
    $('image-path').value = path || suggestedPath(source);
    $('zoom-select').value = 'fit';
    updateInspector(); layoutImage(); renderAll();
    const address = new URL(window.location.href);
    if (remoteUrl) { address.searchParams.set('image', remoteUrl); address.searchParams.set('path', $('image-path').value); }
    else { address.searchParams.delete('image'); address.searchParams.delete('path'); }
    history.replaceState(null, '', address);
    announce('Image ready. Choose a tool and draw; the LaTeX line copies on release.', 'success');
  } catch {
    if (objectUrl) URL.revokeObjectURL(source);
    if (token !== state.loadToken) return;
    announce('Could not load this image. Use a direct image URL (not a sharing page), or download the image and drop it here. Your previous image and annotations are still available.', 'error');
  }
}

function loadFile(file) {
  if (!file) return;
  if ((!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name)) || /\.pdf$/i.test(file.name)) {
    announce('Choose an image file such as PNG, JPEG, WebP, or SVG. Export PDF pages to an image first.', 'error'); return;
  }
  $('image-url').value = '';
  void loadImage(URL.createObjectURL(file), { path: file.name, objectUrl: true });
}

function loadRemote(raw, path) {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid URL scheme');
    if (url.username || url.password) throw new Error('Embedded credentials are not supported');
    if (window.location.protocol === 'https:' && url.protocol === 'http:') {
      announce('Use an HTTPS image URL, or download the image and drop it here.', 'error'); return;
    }
    $('image-url').value = url.href;
    void loadImage(url.href, { path: path || suggestedPath(url.href), remoteUrl: url.href });
  } catch { announce('Enter a complete HTTPS URL pointing directly to an image.', 'error'); }
}

$('url-form').addEventListener('submit', (event) => { event.preventDefault(); loadRemote($('image-url').value.trim()); });
$('file-input').addEventListener('change', (event) => { loadFile(event.target.files[0]); event.target.value = ''; });
$('demo-button').addEventListener('click', () => { $('image-url').value = ''; void loadImage('./demo.svg', { path: 'score.png' }); });

document.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault(); $('drop-zone').classList.add('is-dragover');
});
document.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) $('drop-zone').classList.remove('is-dragover');
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault(); $('drop-zone').classList.remove('is-dragover');
  const files = event.dataTransfer.files;
  if (files.length) loadFile(files[0]);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { cancelDrag(); return; }
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); $('undo-button').click();
  } else if (['Delete', 'Backspace'].includes(event.key) && state.selected !== null) {
    event.preventDefault(); deleteAnnotation(state.selected);
  }
});

new ResizeObserver(() => {
  cancelAnimationFrame(state.resizeFrame);
  state.resizeFrame = requestAnimationFrame(layoutImage);
}).observe($('viewport'));
window.addEventListener('beforeunload', () => { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); });

updateInspector(); renderAll();
const parameters = new URLSearchParams(window.location.search);
if (parameters.has('image')) loadRemote(parameters.get('image'), parameters.get('path'));
else announce('Drop your image, browse for a file, or try the demo to get started.');
