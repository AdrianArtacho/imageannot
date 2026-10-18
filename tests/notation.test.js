import test from 'node:test';
import assert from 'node:assert/strict';
import { INSERTIONS, SYMBOLS, insertNotation, previewNotation, readGroup } from '../notation.js';
import { makeAnnotation, generateLine, generateBlock, latexEscape } from '../core.js';

const preview = (s) => previewNotation(s, true);
test('portable notation vocabulary matches the pipeline', () => {
  assert.deepEqual(SYMBOLS, { msharp:'♯',mflat:'♭',mnatural:'♮',mdim:'∘',mhalfdim:'ø',maug:'+',mto:'→' });
  assert.equal(preview('V\\msup{7}').html, 'V<sup>7</sup>');
  assert.equal(preview('C\\msub{4}').html, 'C<sub>4</sub>');
  assert.equal(preview('V\\textsuperscript{7}').html, 'V<sup>7</sup>');
  assert.equal(preview('C\\textsubscript{4}').html, 'C<sub>4</sub>');
});
test('balanced groups preserve nested formatting and escaped braces', () => {
  const s = String.raw`{V\msup{\msharp 5}\{x\}}tail`;
  assert.equal(readGroup(s,0).value, String.raw`V\msup{\msharp 5}\{x\}`);
  assert.equal(s.slice(readGroup(s,0).end), 'tail');
  assert.equal(preview(String.raw`\textbf{V\msup{\msharp 5}}`).html, '<strong>V<sup>♯5</sup></strong>');
  assert.equal(preview(String.raw`\underline{\textit{C\msub{4}}}`).html, '<u><em>C<sub>4</sub></em></u>');
});
test('stacked figures and scale degrees have structured markup', () => {
  const stacked = preview(String.raw`V\msupsub{\msharp 6}{\textit{4}}`);
  assert.equal(stacked.html, 'V<span class="music-supsub"><span>♯6</span><span><em>4</em></span></span>');
  assert.deepEqual(stacked.warnings, []);
  assert.match(preview(String.raw`\mdegree{3}`).html, /class="music-hat"/);
});
test('command word boundaries and whitespace match TeX', () => {
  assert.equal(preview(String.raw`\mflat{}VII C\msharp{} minor \msharp 4 A\mnatural{}`).text, '♭VII C♯ minor ♯4 A♮');
  assert.equal(preview(String.raw`ii\msup{\mhalfdim 7} vii\msup{\mdim 7}`).html, 'ii<sup>ø7</sup> vii<sup>∘7</sup>');
  assert.equal(preview(String.raw`\mflatVII`).text, String.raw`\mflatVII`);
  assert.ok(preview(String.raw`\mflatVII`).warnings.length);
});
test('plain mode does not parse macros', () => {
  assert.equal(previewNotation(String.raw`V\msup{7} & <b>`, false).html, String.raw`V\msup{7} &amp; &lt;b&gt;`);
});
test('literal HTML, including HTML inside macros, cannot execute', () => {
  const p = preview(String.raw`\textbf{<img src=x onerror='alert(1)'>}&<script>alert(2)</script>`);
  assert.ok(!p.html.includes('<img'));
  assert.ok(!p.html.includes('<script>'));
  assert.ok(p.html.startsWith('<strong>&lt;img'));
  for (const name of ['constructor','__proto__','toString']) assert.ok(preview('\\'+name+'{x}').warnings.length);
});
test('incomplete and unsupported LaTeX stay visible with warnings, never crash', () => {
  for (const s of [String.raw`V\msup{7`, String.raw`\msupsub{6}`, String.raw`\msup`, String.raw`$V^7$`, String.raw`\foo{<b>}`]) {
    const p = preview(s); assert.ok(p.text.length); assert.ok(p.warnings.length); assert.ok(!p.html.includes('<b>'));
  }
  assert.equal(preview('\\unknown{A}').text, '\\unknown{A}');
  assert.ok(preview('\\textbf{'.repeat(34) + 'x' + '}'.repeat(34)).warnings.length);
});
test('escaped symbols, line breaks and comments can be previewed', () => {
  assert.equal(preview(String.raw`A\&B \{C\} \%`).text, 'A&B {C} %');
  assert.equal(preview('A% comment\nB').text, 'A\nB');
  assert.equal(preview(String.raw`A\\B`).html, 'A<br>B');
  assert.equal(preview(latexEscape('a_b & 50% #1 $2 {x} ~ ^ \\')).text, 'a_b & 50% #1 $2 {x} ~ ^ \\');
});
test('wrap selected text, or select a useful placeholder at an empty cursor', () => {
  const a = insertNotation('V7',1,2,'msup');
  assert.equal(a.text, String.raw`V\msup{7}`); assert.equal(a.text.slice(a.selectionStart,a.selectionEnd),'7');
  const b = insertNotation('C',1,1,'msub');
  assert.equal(b.text, String.raw`C\msub{4}`); assert.equal(b.text.slice(b.selectionStart,b.selectionEnd),'4');
  const c = insertNotation('V',1,1,'msupsub');
  assert.equal(c.text, String.raw`V\msupsub{6}{4}`);
});
test('symbol insertions terminate control words before following letters', () => {
  const a=insertNotation('VII',0,0,'mflat');
  assert.equal(a.text, String.raw`\mflat{}VII`); assert.equal(a.selectionStart,8); assert.equal(a.selectionEnd,8);
  assert.equal(preview(a.text).text, '♭VII');
});
test('insertion enables raw mode but safely escapes existing plain text only once', () => {
  const a = insertNotation('A&B7',3,4,'msup',false);
  assert.equal(a.text, String.raw`A\&B\msup{7}`); assert.equal(a.rawLatex, true);
  assert.equal(preview(a.text).text, 'A&B7');
  const b = insertNotation(a.text,a.selectionStart,a.selectionStart,'msharp',true);
  assert.equal(b.text, String.raw`A\&B\msup{\msharp{}7}`);
  assert.equal(preview(b.text).text, 'A&B♯7');
});
test('every toolbar action inserts valid portable markup', () => {
  for(const action of INSERTIONS) {
    const result=insertNotation('V',1,1,action.id);
    assert.deepEqual(preview(result.text).warnings, [], result.text);
  }
  assert.throws(()=>insertNotation('',0,0,'invalid'));
});
test('four label types export original nested commands, not preview HTML', () => {
  const text=String.raw`\textbf{V\msupsub{\msharp 6}{4}}`;
  const items=['textfrag','parafrag','markerfrag','markerfragdark'].map(tool => makeAnnotation(tool,{x:.1,y:.2},{x:.5,y:.3},{text,rawLatex:true}));
  for(const a of items) {
    const line=generateLine(a); assert.ok(line.endsWith(`{${text}}`)); assert.ok(!line.includes('<')); assert.ok(!line.includes('textbackslash'));
  }
  const block=generateBlock(items, 'scores/example.png');
  assert.equal(block.split(text).length-1,4);
  assert.ok(!block.includes('music-supsub'));
});
