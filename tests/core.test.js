import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, makeAnnotation, generateLine, generateBlock, pointFromClient, latexEscape } from '../core.js';

const start = { x: 0.1, y: 0.2 };
const end = { x: 0.6, y: 0.8 };

test('pointer coordinates use the top-left origin and positive downward y', () => {
  const bounds = { left: 100, top: 200, width: 400, height: 200 };
  assert.deepEqual(pointFromClient(100, 200, bounds), { x: 0, y: 0 });
  assert.deepEqual(pointFromClient(300, 250, bounds), { x: 0.5, y: 0.25 });
  assert.deepEqual(pointFromClient(500, 400, bounds), { x: 1, y: 1 });
  assert.deepEqual(pointFromClient(90, 500, bounds), { x: 0, y: 1 });
});

test('bounds must describe an image with positive finite dimensions', () => {
  for (const width of [0, -1, NaN, Infinity]) {
    assert.throws(() => pointFromClient(0, 0, { left: 0, top: 0, width, height: 20 }));
  }
  assert.throws(() => pointFromClient(0, 0, { left: 0, top: 0, width: 20, height: 0 }));
  assert.throws(() => pointFromClient(NaN, 0, { left: 0, top: 0, width: 20, height: 20 }));
});

test('reverse box drags normalize corners while arrow and ruler directions survive', () => {
  const rectangle = makeAnnotation('rectfrag', end, start);
  assert.deepEqual([rectangle.x1, rectangle.y1, rectangle.x2, rectangle.y2], [0.1, 0.2, 0.6, 0.8]);
  assert.equal(generateLine(rectangle), '\\rectfrag[red][0]{0.1}{0.2}{0.6}{0.8}');
  for (const tool of ['arrowfrag', 'rulefrag']) {
    const line = makeAnnotation(tool, end, start);
    assert.deepEqual([line.x1, line.y1, line.x2, line.y2], [0.6, 0.8, 0.1, 0.2]);
  }
});

test('point tools use the initial click and all coordinates are clamped', () => {
  const marker = makeAnnotation('markerfrag', start, end);
  assert.deepEqual([marker.x1, marker.y1, marker.x2, marker.y2], [0.1, 0.2, 0.1, 0.2]);
  const rectangle = makeAnnotation('rectfrag', { x: -2, y: 3 }, { x: 2, y: -4 });
  assert.deepEqual([rectangle.x1, rectangle.y1, rectangle.x2, rectangle.y2], [0, 0, 1, 1]);
});

test('every command matches the active macro signature and optional argument order', () => {
  const options = { color: 'green!60!black', rotation: 25, opacity: 0.45, scale: 1.5, text: 'Motif', pinPath: 'icons/pin.png', fontSize: 'small' };
  const expected = {
    rectfrag: '\\rectfrag[green!60!black][25]{0.1}{0.2}{0.6}{0.8}',
    ellipsefrag: '\\ellipsefrag[green!60!black][25]{0.1}{0.2}{0.6}{0.8}',
    ovalfrag: '\\ovalfrag[green!60!black][25][0.45]{0.1}{0.2}{0.6}{0.8}',
    highlightfrag: '\\highlightfrag[green!60!black]{0.1}{0.2}{0.6}{0.8}',
    highlightmove: '\\highlightmove[green!60!black]{0.1}{0.2}{0.6}{0.8}',
    whiteout: '\\highlightfrag[whiteout]{0.1}{0.2}{0.6}{0.8}',
    arrowfrag: '\\arrowfrag[green!60!black]{0.1}{0.2}{0.6}{0.8}',
    rulefrag: '\\rulefrag[green!60!black]{0.1}{0.2}{0.6}{0.8}',
    textfrag: '\\textfrag[green!60!black]{0.1}{0.2}{1.5}{Motif}',
    markerfrag: '\\markerfrag[green!60!black]{0.1}{0.2}{Motif}',
    markerfragdark: '\\markerfragdark[green!60!black]{0.1}{0.2}{Motif}',
    crosshair: '\\crosshair{0.1}{0.2}',
    parafrag: '\\parafrag[\\small]{0.1}{0.2}{0.5}{Motif}',
    pinfrag: '\\pinfrag[25]{0.1}{0.2}{1.5}{icons/pin.png}',
  };
  assert.equal(TOOLS.length, Object.keys(expected).length);
  for (const tool of TOOLS) {
    assert.equal(generateLine(makeAnnotation(tool.id, start, end, options)), expected[tool.id], tool.id);
  }
});

test('whiteout stays opaque and uses the final TikZ whiteout style', () => {
  const annotation = makeAnnotation('whiteout', start, end, { color: 'blue', opacity: 0.1 });
  assert.equal(annotation.color, 'whiteout');
  assert.equal(annotation.opacity, 1);
  assert.equal(generateLine(annotation), '\\highlightfrag[whiteout]{0.1}{0.2}{0.6}{0.8}');
});

test('paragraph box sets north-west anchor and image width fraction', () => {
  const paragraph = makeAnnotation('parafrag', end, start, { text: 'First phrase' });
  assert.equal(generateLine(paragraph), '\\parafrag[\\normalsize]{0.1}{0.2}{0.5}{First phrase}');
  const explicitWidth = makeAnnotation('parafrag', start, end, { width: 0.3, fontSize: '\\footnotesize' });
  assert.equal(generateLine(explicitWidth), '\\parafrag[\\footnotesize]{0.1}{0.2}{0.3}{Label}');
});

test('plain labels escape TeX metacharacters without double-escaping replacements', () => {
  const plain = 'a_b & 50% #1 $2 {x} ~ ^ \\';
  const escaped = 'a\\_b \\& 50\\% \\#1 \\$2 \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}';
  assert.equal(latexEscape(plain), escaped);
  assert.equal(latexEscape('a\r\nb\nc'), 'a b c');
  assert.equal(generateLine(makeAnnotation('textfrag', start, end, { text: 'A_B' })), '\\textfrag[black]{0.1}{0.2}{1}{A\\_B}');
  assert.equal(generateLine(makeAnnotation('textfrag', start, end, { text: '$a_b$', rawLatex: true })), '\\textfrag[black]{0.1}{0.2}{1}{$a_b$}');
});

test('rounding is stable, removes trailing zeroes and never prints negative zero', () => {
  const annotation = makeAnnotation('rectfrag', { x: 0.123456, y: 0.999999 }, { x: 0.3, y: 0.7 }, { rotation: -0.000001 });
  assert.equal(generateLine(annotation), '\\rectfrag[red][0]{0.1235}{0.7}{0.3}{1}');
  assert.equal(generateLine(annotation, 2), '\\rectfrag[red][0]{0.12}{0.7}{0.3}{1}');
  assert.equal(generateLine(makeAnnotation('crosshair', { x: 0.00000001, y: 0.2 }), 8), '\\crosshair{0.00000001}{0.2}');
  assert.throws(() => generateLine(annotation, -1));
  assert.throws(() => generateLine(annotation, 1.5));
  assert.throws(() => generateLine(annotation, 13));
});

test('full blocks use the Overleaf path and preserve annotation order', () => {
  const rectangle = makeAnnotation('rectfrag', start, end);
  const arrow = makeAnnotation('arrowfrag', end, start);
  assert.equal(generateBlock([rectangle, arrow], 'scores/bach.png'), '\\imageannot{scores/bach.png}{\n  \\rectfrag[red][0]{0.1}{0.2}{0.6}{0.8}\n  \\arrowfrag[red]{0.6}{0.8}{0.1}{0.2}\n}');
  assert.equal(generateBlock([], 'score.png'), '\\imageannot{score.png}{\n}');
  assert.throws(() => generateBlock([], '  '));
});

test('bad annotation values fail explicitly rather than creating broken LaTeX', () => {
  assert.throws(() => makeAnnotation('not-a-macro', start, end));
  assert.throws(() => makeAnnotation('rectfrag', { x: NaN, y: 0 }, end));
  assert.throws(() => makeAnnotation('textfrag', start, end, { scale: 0 }));
  assert.throws(() => makeAnnotation('parafrag', start, end, { fontSize: 'not-a-size' }));
});
