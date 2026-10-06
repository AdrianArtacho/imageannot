/**
 * Browser integration checks. Run `node tests/browser.mjs` after installing
 * Playwright and its Chromium browser (`npx playwright install chromium`).
 * The script starts a temporary local HTTP server unless IMAGEANNOT_TEST_URL
 * is set. CODEX_PRIMARY_RUNTIME_NODE_MODULES is an optional module fallback.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch (error) {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  playwright = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.IMAGEANNOT_TEST_PORT || 8137);
const baseURL = process.env.IMAGEANNOT_TEST_URL || `http://127.0.0.1:${port}/`;
const server = process.env.IMAGEANNOT_TEST_URL ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'pipe',
});
let browser;

const fixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="white"/><path d="M0 250H1000M500 0V500" stroke="black"/></svg>');

function checkCoordinates(line, expected) {
  const numbers = [...line.matchAll(/\{(-?\d+(?:\.\d+)?)\}/g)].map((match) => Number(match[1]));
  assert.equal(numbers.length, expected.length, `Unexpected coordinate count: ${line}`);
  numbers.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= 0.002, `${line}: coordinate ${index + 1} was ${value}, expected ${expected[index]}.`);
  });
}

async function draw(page, start, end = start) {
  const surface = page.locator('#overlay');
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, 'Image drawing surface has no dimensions.');
  await page.mouse.move(box.x + start[0] * box.width, box.y + start[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + end[0] * box.width, box.y + end[1] * box.height, { steps: 8 });
  await page.mouse.up();
}

async function loadFixture(page) {
  await page.locator('#file-input').setInputFiles({ name: 'test-score.svg', mimeType: 'image/svg+xml', buffer: fixture });
  await page.waitForFunction(() => {
    const image = document.querySelector('#source-image');
    return !image.hidden && image.complete && image.naturalWidth === 1000 && image.naturalHeight === 500;
  });
}

async function latestLine(page) {
  return page.locator('#latex-output').inputValue();
}

async function count(page, expected) {
  await page.waitForFunction((number) => Number(document.querySelector('#annotation-count').textContent) === number, expected);
}

async function installClipboardMock(context) {
  await context.addInitScript(() => {
    window.__copied = [];
    window.__denyClipboard = false;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => {
        if (window.__denyClipboard) throw new DOMException('Clipboard denied for test.', 'NotAllowedError');
        window.__copied.push(text);
      } },
    });
    // Deterministically exercise the visible-code fallback when access is denied.
    const originalExecCommand = typeof document.execCommand === 'function' ? document.execCommand.bind(document) : () => false;
    document.execCommand = (...args) => window.__denyClipboard ? false : originalExecCommand(...args);
  });
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {}
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Temporary server exited with code ${server.exitCode}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${baseURL}.`);
}

try {
  await waitForServer();
  browser = await playwright.chromium.launch({ headless: true,
    ...(process.env.IMAGEANNOT_CHROMIUM_PATH ? { executablePath: process.env.IMAGEANNOT_CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await installClipboardMock(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(baseURL);
  await loadFixture(page);
  const tools = await page.locator('#tool-select option').evaluateAll((options) => options.map((option) => option.value));
  assert.equal(tools.length, 14, 'Expected all 14 source-macro tools.');
  assert.ok(tools.includes('whiteout') && tools.includes('parafrag') && tools.includes('pinfrag'));

  await draw(page, [0.1, 0.2], [0.6, 0.8]);
  await count(page, 1);
  assert.match(await latestLine(page), /^\\rectfrag\[red\]\[0\]/);
  checkCoordinates(await latestLine(page), [0.1, 0.2, 0.6, 0.8]);
  await page.waitForFunction(() => window.__copied.length === 1);
  assert.equal(await page.evaluate(() => window.__copied[0]), await latestLine(page), 'Drawing should automatically copy its fragment.');
  console.log('PASS: file upload, all tool choices, normalized rectangle, automatic copy');

  await page.locator('#zoom-select').selectOption('100');
  await draw(page, [0.6, 0.8], [0.1, 0.2]);
  await count(page, 2);
  checkCoordinates(await latestLine(page), [0.1, 0.2, 0.6, 0.8]);
  await page.locator('#tool-select').selectOption('arrowfrag');
  await draw(page, [0.6, 0.8], [0.1, 0.2]);
  await count(page, 3);
  assert.match(await latestLine(page), /^\\arrowfrag\[red\]/);
  checkCoordinates(await latestLine(page), [0.6, 0.8, 0.1, 0.2]);
  console.log('PASS: zoom-independent coordinates, reverse rectangle drag, and preserved arrow direction');

  await page.locator('#tool-select').selectOption('whiteout');
  await draw(page, [0.2, 0.3], [0.7, 0.9]);
  await count(page, 4);
  assert.match(await latestLine(page), /^\\highlightfrag\[whiteout\]/);
  assert.equal(await page.locator('#overlay g[data-id="4"] rect').first().getAttribute('fill'), 'white');
  assert.equal(await page.locator('#overlay g[data-id="4"] rect').first().getAttribute('fill-opacity'), '1');
  await page.locator('#tool-select').selectOption('ellipsefrag');
  await page.locator('#rotation-input').fill('30');
  await draw(page, [0.15, 0.25], [0.55, 0.75]);
  await count(page, 5);
  assert.match(await latestLine(page), /^\\ellipsefrag\[red\]\[30\]/);
  checkCoordinates(await latestLine(page), [0.15, 0.25, 0.55, 0.75]);
  assert.match(await page.locator('#overlay g[data-id="5"]').getAttribute('transform'), /^rotate\(-30 /);
  console.log('PASS: opaque whiteout command and ellipse rotation');

  await page.locator('#annotation-list .annotation-select').first().click();
  await page.locator('#color-input').fill('blue');
  await page.locator('#color-input').blur();
  await page.waitForFunction(() => document.querySelector('#latex-output').value.startsWith('\\rectfrag[blue]'));
  await page.locator('#annotation-list .annotation-delete').first().click();
  await count(page, 4);
  await page.locator('#undo-button').click();
  await count(page, 5);
  await page.locator('#clear-button').click();
  await count(page, 0);
  await page.locator('#undo-button').click();
  await count(page, 5);
  console.log('PASS: select and edit earlier fragment, delete/restore, clear/restore');

  await page.locator('#image-path').fill('images/test_score.png');
  await page.locator('#output-mode').selectOption('block');
  assert.match(await latestLine(page), /^\\imageannot\{images\/test_score\.png\}\{\n/);
  const expectedDownload = `${await latestLine(page)}\n`;
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-button').click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), expectedDownload, 'Downloaded .tex should match the selected output format.');
  await page.locator('#output-mode').selectOption('latest');
  await page.evaluate(() => { window.__denyClipboard = true; });
  await page.locator('#tool-select').selectOption('rectfrag');
  await draw(page, [0.12, 0.24], [0.48, 0.72]);
  await count(page, 6);
  await page.waitForFunction(() => /blocked|Ctrl\/Cmd\+C|selected code/i.test(document.querySelector('#status').textContent));
  assert.ok((await latestLine(page)).startsWith('\\rectfrag'), 'Clipboard failure should leave generated code available.');
  console.log('PASS: full imageannot export, .tex download, and clipboard failure fallback');

  const previousSource = await page.locator('#source-image').getAttribute('src');
  await page.route('**/not-an-image.png', (route) => route.abort());
  await page.locator('#image-url').fill(new URL('not-an-image.png', baseURL).href);
  await page.locator('#url-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => /could not|couldn't|unable|failed|cannot|not load/i.test(document.querySelector('#status').textContent));
  assert.equal(await page.locator('#source-image').getAttribute('src'), previousSource, 'Failed replacement must retain the previous image.');
  await count(page, 6);
  console.log('PASS: failed image URL retains existing image and annotations');

  const query = new URL(baseURL);
  query.searchParams.set('image', new URL('demo.svg', baseURL).href);
  query.searchParams.set('path', 'examples/demo.svg');
  await page.goto(query.href);
  await page.waitForFunction(() => {
    const image = document.querySelector('#source-image');
    return !image.hidden && image.complete && image.naturalWidth > 0;
  });
  assert.equal(await page.locator('#image-path').inputValue(), 'examples/demo.svg');
  console.log('PASS: direct image and Overleaf path URL parameters');

  const dataTransfer = await page.evaluateHandle((svg) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([svg], 'dropped-score.svg', { type: 'image/svg+xml' }));
    return transfer;
  }, fixture.toString());
  await page.locator('#drop-zone').dispatchEvent('drop', { dataTransfer });
  await page.waitForFunction(() => document.querySelector('#source-image').naturalWidth === 1000);
  assert.equal(await page.locator('#image-path').inputValue(), 'dropped-score.svg');
  console.log('PASS: image drag and drop');

  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.locator('#zoom-select').selectOption('fit');
    const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    assert.ok(dimensions.page <= dimensions.viewport + 1, `Page overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`);
  }
  console.log('PASS: no horizontal page overflow at 320, 375, and 768px');
  assert.deepEqual(pageErrors, [], 'Browser runtime errors occurred.');
  await context.close();
  console.log('All ImageAnnot browser integration checks passed.');
} finally {
  await browser?.close();
  server?.kill();
}
