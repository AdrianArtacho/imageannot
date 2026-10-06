/**
 * Coordinates and LaTeX generation for ltx/reveal/imageannot.tex.
 * The imageannot scope has its origin at the image's top-left corner:
 * x runs right, y runs down, and both coordinates range from 0 to 1.
 */

export const TOOLS = Object.freeze([
  { id: 'rectfrag', label: 'Rectangle', command: 'rectfrag', kind: 'box', defaultColor: 'red', supportsRotation: true },
  { id: 'ellipsefrag', label: 'Ellipse outline', command: 'ellipsefrag', kind: 'box', defaultColor: 'red', supportsRotation: true },
  { id: 'ovalfrag', label: 'Filled ellipse', command: 'ovalfrag', kind: 'box', defaultColor: 'blue', supportsRotation: true, supportsOpacity: true },
  { id: 'highlightfrag', label: 'Highlight', command: 'highlightfrag', kind: 'box', defaultColor: 'yellow' },
  { id: 'highlightmove', label: 'Highlight move', command: 'highlightmove', kind: 'box', defaultColor: 'yellow' },
  { id: 'whiteout', label: 'Whiteout', command: 'highlightfrag', kind: 'box', defaultColor: 'whiteout' },
  { id: 'arrowfrag', label: 'Arrow', command: 'arrowfrag', kind: 'line', defaultColor: 'red' },
  { id: 'rulefrag', label: 'Ruler', command: 'rulefrag', kind: 'line', defaultColor: 'black' },
  { id: 'textfrag', label: 'Text', command: 'textfrag', kind: 'point', defaultColor: 'black', supportsText: true, supportsScale: true },
  { id: 'markerfrag', label: 'Outlined marker', command: 'markerfrag', kind: 'point', defaultColor: 'red', supportsText: true },
  { id: 'markerfragdark', label: 'Filled marker', command: 'markerfragdark', kind: 'point', defaultColor: 'red', supportsText: true },
  { id: 'crosshair', label: 'Crosshair', command: 'crosshair', kind: 'point', defaultColor: 'red' },
  { id: 'parafrag', label: 'Paragraph', command: 'parafrag', kind: 'box', defaultColor: 'black', supportsText: true },
  { id: 'pinfrag', label: 'Image pin', command: 'pinfrag', kind: 'point', defaultColor: 'black', supportsRotation: true, supportsScale: true },
].map((tool) => Object.freeze(tool)));

const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));
const FONT_SIZES = new Set(['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge']);

function finite(value, name) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return number;
}

function unit(value, name) {
  return Math.min(1, Math.max(0, finite(value, name)));
}

function getTool(id) {
  const tool = TOOL_BY_ID.get(id);
  if (!tool) throw new RangeError(`Unknown annotation tool: ${id}`);
  return tool;
}

function fontCommand(value = '\\normalsize') {
  const name = String(value).replace(/^\\/, '');
  if (!FONT_SIZES.has(name)) throw new RangeError(`Unsupported font size: ${value}`);
  return `\\${name}`;
}

/** Convert viewport pointer coordinates into normalized image coordinates. */
export function pointFromClient(clientX, clientY, bounds) {
  if (!bounds) throw new TypeError('Image bounds are required.');
  const width = finite(bounds.width, 'Image width');
  const height = finite(bounds.height, 'Image height');
  if (width <= 0 || height <= 0) throw new RangeError('Image dimensions must be greater than zero.');
  const left = finite(bounds.left, 'Image left');
  const top = finite(bounds.top, 'Image top');
  return {
    x: unit((finite(clientX, 'Pointer x') - left) / width, 'x'),
    y: unit((finite(clientY, 'Pointer y') - top) / height, 'y'),
  };
}

/**
 * Build an annotation from normalized endpoints. Box corners are reordered;
 * line endpoints retain the drawing direction; point tools use the start.
 * Paragraph width defaults to the horizontal span of its drawn box.
 */
export function makeAnnotation(toolId, start, end = start, options = {}) {
  const tool = getTool(toolId);
  if (!start || !end) throw new TypeError('Annotation endpoints are required.');
  const sx = unit(start.x, 'Start x');
  const sy = unit(start.y, 'Start y');
  const ex = unit(end.x, 'End x');
  const ey = unit(end.y, 'End y');
  let x1 = sx;
  let y1 = sy;
  let x2 = ex;
  let y2 = ey;
  if (tool.kind === 'box') {
    x1 = Math.min(sx, ex);
    y1 = Math.min(sy, ey);
    x2 = Math.max(sx, ex);
    y2 = Math.max(sy, ey);
  } else if (tool.kind === 'point') {
    x2 = x1;
    y2 = y1;
  }

  const defaultText = toolId.startsWith('markerfrag') ? '1' : 'Label';
  const defaultOpacity = toolId === 'whiteout' ? 1 : toolId === 'ovalfrag' ? 0.2 : 0.35;
  const scale = finite(options.scale ?? 1, 'Scale');
  if (scale <= 0) throw new RangeError('Scale must be greater than zero.');

  return {
    tool: tool.id,
    x1,
    y1,
    x2,
    y2,
    color: toolId === 'whiteout' ? 'whiteout' : String(options.color ?? tool.defaultColor).trim() || tool.defaultColor,
    rotation: finite(options.rotation ?? 0, 'Rotation'),
    opacity: toolId === 'whiteout' ? 1 : unit(options.opacity ?? defaultOpacity, 'Opacity'),
    scale,
    text: String(options.text ?? defaultText),
    width: unit(options.width ?? x2 - x1, 'Paragraph width'),
    pinPath: String(options.pinPath ?? 'pin.png'),
    fontSize: fontCommand(options.fontSize),
    rawLatex: Boolean(options.rawLatex),
  };
}

/** Escape plain labels in one pass so replacement braces are not re-escaped. */
export function latexEscape(value) {
  const replacements = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    '$': '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    '_': '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return String(value).replace(/\r\n?|\n/g, ' ').replace(/[\\{}$&#%_~^]/g, (character) => replacements[character]);
}

function formatter(precision) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new RangeError('Precision must be an integer from 0 to 12.');
  }
  return (value) => {
    const rounded = finite(value, 'Annotation number').toFixed(precision);
    if (/^-?0(?:\.0+)?$/.test(rounded)) return '0';
    // Keep decimal notation: Number(...).toString() would emit 1e-8 for
    // tiny coordinates even when the requested precision is eight places.
    return rounded.includes('.') ? rounded.replace(/0+$/, '').replace(/\.$/, '') : rounded;
  };
}

/** Generate one command using the argument order of the active TeX macros. */
export function generateLine(annotation, precision = 4) {
  const tool = getTool(annotation?.tool);
  const format = formatter(precision);
  // Revalidate annotations restored from JSON as well as ones created above.
  const item = makeAnnotation(tool.id,
    { x: annotation.x1, y: annotation.y1 },
    { x: annotation.x2 ?? annotation.x1, y: annotation.y2 ?? annotation.y1 },
    annotation);
  const point = `{${format(item.x1)}}{${format(item.y1)}}`;
  const box = `${point}{${format(item.x2)}}{${format(item.y2)}}`;
  const text = item.rawLatex ? item.text : latexEscape(item.text);

  switch (tool.id) {
    case 'rectfrag':
    case 'ellipsefrag':
      return `\\${tool.command}[${item.color}][${format(item.rotation)}]${box}`;
    case 'ovalfrag':
      return `\\ovalfrag[${item.color}][${format(item.rotation)}][${format(item.opacity)}]${box}`;
    case 'highlightfrag':
    case 'highlightmove':
    case 'whiteout':
    case 'arrowfrag':
    case 'rulefrag':
      return `\\${tool.command}[${item.color}]${box}`;
    case 'textfrag':
      return `\\textfrag[${item.color}]${point}{${format(item.scale)}}{${text}}`;
    case 'markerfrag':
    case 'markerfragdark':
      return `\\${tool.command}[${item.color}]${point}{${text}}`;
    case 'crosshair':
      return `\\crosshair${point}`;
    case 'parafrag':
      return `\\parafrag[${item.fontSize}]${point}{${format(item.width)}}{${text}}`;
    case 'pinfrag':
      return `\\pinfrag[${format(item.rotation)}]${point}{${format(item.scale)}}{${item.pinPath}}`;
    default:
      throw new RangeError(`Unsupported annotation tool: ${tool.id}`);
  }
}

/** Wrap multiple commands using the user's Overleaf image path. */
export function generateBlock(annotations, imagePath = 'image.png', precision = 4) {
  if (!Array.isArray(annotations)) throw new TypeError('Annotations must be an array.');
  const path = String(imagePath).trim();
  if (!path) throw new RangeError('An image path is required.');
  const commands = annotations.map((annotation) => `  ${generateLine(annotation, precision)}`);
  return `\\imageannot{${path}}{\n${commands.length ? `${commands.join('\n')}\n` : ''}}`;
}
