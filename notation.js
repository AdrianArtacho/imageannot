/** Portable text-mode music notation, matching format-exchange/music_notation.py.
 * A safe preview only: the original LaTeX is always kept for export.
 * No TeX execution, HTML injection, browser math library or remote dependency.
 */
import { latexEscape } from './core.js';

export const SYMBOLS = Object.freeze({
  msharp: '♯', mflat: '♭', mnatural: '♮', mdim: '∘', mhalfdim: 'ø', maug: '+', mto: '→',
});
const TAGS = Object.freeze({ textbf: 'strong', textit: 'em', emph: 'em', underline: 'u',
  texttt: 'code', textnormal: 'span', textrm: 'span' });
const SCRIPTS = Object.freeze({ msup: 'sup', textsuperscript: 'sup', msub: 'sub', textsubscript: 'sub' });
const ESCAPES = Object.freeze({ textbackslash: '\\', textasciitilde: '~', textasciicircum: '^' });
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const space = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

/** Read braces without truncating nested commands or escaped literal braces. */
export function readGroup(source, start) {
  if (source[start] !== '{') throw new Error('Expected a braced argument.');
  let depth = 1;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') { i++; continue; }
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return { value: source.slice(start + 1, i), end: i + 1 };
  }
  throw new Error('Unclosed brace: finish the label to complete its preview.');
}

/** All input is escaped; only fixed markup from known commands can become HTML.
 * Unknown commands stay visible and are exported unchanged. Incomplete input is
 * not an exception during typing; it gets a visible explanation instead.
 */
export function previewNotation(value, rawLatex = true) {
  const source = String(value);
  const warnings = new Set();
  const literal = (s) => ({ html: escapeHtml(s), text: s });
  if (!rawLatex) return { ...literal(source), warnings: [] };
  if (source.length > 50000) return { ...literal(source), warnings: ['Label is too long for a formatted preview; export is unchanged.'] };

  function parse(s, depth = 0) {
    if (depth > 32) { warnings.add('Notation nesting is too deep for preview.'); return literal(s); }
    let html = '', text = '';
    const append = (node) => { html += node.html; text += node.text; };
    for (let i = 0; i < s.length;) {
      if (s[i] === '%') { const end = s.indexOf('\n', i); i = end < 0 ? s.length : end; continue; }
      if (s[i] === '{') {
        try { const arg = readGroup(s, i); append(parse(arg.value, depth + 1)); i = arg.end; continue; }
        catch (error) { warnings.add(error.message); append(literal(s.slice(i))); break; }
      }
      if (s[i] !== '\\') {
        if ('$_^'.includes(s[i])) warnings.add('Use the text-mode notation buttons, not $...$, ^ or _, for a portable preview.');
        if (s[i] === '}') warnings.add('Unmatched closing brace in label.');
        append(s[i] === '~' ? { html: '&nbsp;', text: ' ' } : literal(s[i])); i++; continue;
      }
      const match = /^\\([A-Za-z@]+|[^A-Za-z@])/u.exec(s.slice(i));
      if (!match) { append(literal(s[i++])); continue; }
      const name = match[1], end = i + match[0].length;
      if (owns(SYMBOLS, name) || owns(ESCAPES, name)) {
        append(literal(owns(SYMBOLS, name) ? SYMBOLS[name] : ESCAPES[name]));
        i = s.startsWith('{}', end) ? end + 2 : space(s, end); continue;
      }
      if ('#$%&_{}'.includes(name)) { append(literal(name)); i = end; continue; }
      if (name === '\\') { append({ html: '<br>', text: '\n' }); i = end; continue; }
      if ([',', ';', ':', ' ', 'quad', 'qquad'].includes(name)) {
        append({ html: '&nbsp;', text: ' ' }); i = end; continue;
      }
      if (name === '!') { i = end; continue; }
      const known = owns(TAGS, name) || owns(SCRIPTS, name) || ['msupsub', 'mdegree'].includes(name);
      if (known) {
        try {
          const first = readGroup(s, space(s, end));
          const upper = parse(first.value, depth + 1);
          let next = first.end;
          if (name === 'msupsub') {
            const second = readGroup(s, space(s, next)), lower = parse(second.value, depth + 1);
            append({ html: `<span class="music-supsub"><span>${upper.html}</span><span>${lower.html}</span></span>`, text: upper.text + lower.text });
            next = second.end;
          } else if (name === 'mdegree') {
            append({ html: `<span class="music-degree"><span aria-hidden="true" class="music-hat">ˆ</span><span>${upper.html}</span></span>`, text: upper.text + '̂' });
          } else {
            const tag = owns(SCRIPTS, name) ? SCRIPTS[name] : TAGS[name];
            append({ html: `<${tag}>${upper.html}</${tag}>`, text: upper.text });
          }
          i = next; continue;
        } catch (error) {
          warnings.add(`${match[0]}: ${error.message}`);
          append(literal(s.slice(i))); break;
        }
      }
      warnings.add(`${match[0]} is not in the portable preview subset; it is kept unchanged in LaTeX.`);
      // Show unknown macros with their braced arguments as literal text, without
      // interpreting embedded markup or pretending to support their semantics.
      let next = end;
      while (s[space(s, next)] === '{') {
        try { next = readGroup(s, space(s, next)).end; } catch { break; }
      }
      append(literal(s.slice(i, next))); i = next;
    }
    return { html, text };
  }
  return { ...parse(source), warnings: [...warnings] };
}

export const INSERTIONS = Object.freeze([
  { id: 'msup', label: 'x⁷', title: 'Superscript — \\msup{7}', command: 'msup', placeholder: '7' },
  { id: 'msub', label: 'x₄', title: 'Subscript — \\msub{4}', command: 'msub', placeholder: '4' },
  { id: 'msupsub', label: '6 / 4', title: 'Stacked upper/lower figures — \\msupsub{6}{4}', command: 'msupsub', placeholder: '6' },
  { id: 'msharp', label: '♯', title: 'Sharp — \\msharp{}', symbol: true },
  { id: 'mflat', label: '♭', title: 'Flat — \\mflat{}', symbol: true },
  { id: 'mnatural', label: '♮', title: 'Natural — \\mnatural{}', symbol: true },
  { id: 'mdegree', label: '3̂', title: 'Scale-degree hat — \\mdegree{3}', command: 'mdegree', placeholder: '3' },
  { id: 'mdim', label: '∘', title: 'Diminished symbol — \\mdim{} (use superscript to raise it)', symbol: true },
  { id: 'mhalfdim', label: 'ø', title: 'Half-diminished symbol — \\mhalfdim{} (use superscript to raise it)', symbol: true },
  { id: 'maug', label: '+', title: 'Augmented symbol — \\maug{}', symbol: true },
  { id: 'mto', label: '→', title: 'Right arrow — \\mto{}', symbol: true },
  { id: 'textbf', label: 'B', title: 'Bold — \\textbf{...}', command: 'textbf', placeholder: 'text' },
  { id: 'textit', label: 'I', title: 'Italic — \\textit{...}', command: 'textit', placeholder: 'text' },
  { id: 'underline', label: 'U', title: 'Underline — \\underline{...}', command: 'underline', placeholder: 'text' },
]);

/** Selection-aware insertion, with a lossless switch from plain label escaping.
 * Symbols include {} so typing VII after flat cannot create \\mflatVII.
 */
export function insertNotation(value, start, end, id, rawLatex = true) {
  const action = INSERTIONS.find((item) => item.id === id);
  if (!action) throw new RangeError(`Unknown notation action: ${id}`);
  const s = String(value);
  const from = Math.max(0, Math.min(s.length, Number(start) || 0));
  const to = Math.max(from, Math.min(s.length, Number(end) || 0));
  const convert = rawLatex ? (x) => x : latexEscape;
  const before = convert(s.slice(0, from)), selected = convert(s.slice(from, to)), after = convert(s.slice(to));
  const content = selected || action.placeholder;
  const prefix = `\\${id}{`;
  const insertion = action.symbol ? `\\${id}{}` : `${prefix}${content}}${id === 'msupsub' ? '{4}' : ''}`;
  const selectionStart = before.length + (action.symbol ? insertion.length : prefix.length);
  return { text: before + insertion + after, rawLatex: true, selectionStart,
    selectionEnd: action.symbol ? selectionStart : selectionStart + content.length };
}
