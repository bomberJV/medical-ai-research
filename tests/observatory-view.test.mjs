import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const page = readFileSync(new URL('../site/medical/observatory.html', import.meta.url), 'utf8');
const resultsText = readFileSync(new URL('../site/medical/results.json', import.meta.url), 'utf8');
const results = JSON.parse(resultsText);
const receiptText = readFileSync(new URL('../site/medical/observatory-receipt.json', import.meta.url), 'utf8');
let run = 0;

test('static no-JavaScript table preserves every frozen test row and both probabilities', () => {
  const table = page.match(/<tbody id="record-table">([\s\S]*?)<\/tbody>/)[1];
  const rows = [...table.matchAll(/<tr data-row="(\d+)">([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 114);
  assert.deepEqual(rows.map(row => Number(row[1])), results.calibration.records.map(row => row.row));
  for (let index = 0; index < rows.length; index++) {
    const record = results.calibration.records[index];
    assert.ok(rows[index][2].includes(record.raw.toFixed(8)));
    assert.ok(rows[index][2].includes(record.calibrated.toFixed(8)));
    assert.ok(rows[index][2].includes(record.truth ? 'Malignant (1)' : 'Benign (0)'));
  }
  const wrong = rows.filter(row => row[2].includes('incorrect'));
  assert.deepEqual(wrong.map(row => Number(row[1])), [190, 215]);
  assert.match(page, /1 \/ 42/);
  assert.match(page, /0\.02050/);
  assert.match(page, /0\.09642/);
  assert.match(page, /complete record table above/);
});

test('static export is reproducible and local navigation targets exist', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../research/build_observatory_view.mjs', import.meta.url)), '--check']);
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(page.includes(`id="${target}"`), `Missing ${target}`);
  assert.match(page, /<select id="threshold" disabled>/);
  assert.match(page, /<th scope="col">Source row<\/th>/);
  assert.match(page, /<summary>Read all 114 record-level predictions as a table<\/summary>/);
  assert.match(readFileSync(new URL('../site/medical/index.html', import.meta.url), 'utf8'), /href="observatory.html"/);
});

async function loadController({receipt = receiptText, failure = false} = {}) {
  const elements = new Map();
  const handlers = {};
  const originals = {document: globalThis.document, fetch: globalThis.fetch};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', dataset: {}, disabled: selector === '#threshold', value: '0.5',
      addEventListener: (type, callback) => { handlers[`${selector}:${type}`] = callback; },
      setAttribute() {},
    });
    return elements.get(selector);
  };
  globalThis.document = {
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener: (type, callback) => { handlers[type] = callback; },
  };
  globalThis.fetch = async path => {
    if (failure) throw new Error('Test network failure');
    return {ok: true, text: async () => path.includes('receipt') ? receipt : resultsText};
  };
  try {
    await import(`../site/medical/observatory.js?view-test=${++run}`);
    return {elements, handlers, element, restore: () => { globalThis.document = originals.document; globalThis.fetch = originals.fetch; }};
  } catch (error) {
    globalThis.document = originals.document;
    globalThis.fetch = originals.fetch;
    throw error;
  }
}

test('controller renders full cohort, preserves full comparison on deferral, and inspects an adverse row', async () => {
  const harness = await loadController();
  try {
    const {element, handlers} = harness;
    assert.equal(element('#load-status').dataset.state, 'verified');
    assert.equal(element('#threshold').disabled, false);
    assert.equal((element('#record-table').innerHTML.match(/<tr /g) || []).length, 114);
    assert.match(element('#record-detail').innerHTML, /<strong>147<\/strong>/);
    const fullComparison = element('#comparison-body').innerHTML;
    const control = element('#threshold');
    control.value = '0.99';
    handlers['#threshold:change']({target: control});
    assert.equal(element('#comparison-body').innerHTML, fullComparison);
    assert.match(element('#selective-summary').innerHTML, /45 <small>\/ 114/);
    assert.match(element('#selective-summary').innerHTML, /69 <small>\/ 114/);
    assert.equal((element('#record-table').innerHTML.match(/<tr /g) || []).length, 114);
    handlers.click({target: {closest: () => ({dataset: {record: '190'}})}});
    assert.match(element('#record-detail').innerHTML, /<strong>190<\/strong>/);
    assert.equal((element('#record-detail').innerHTML.match(/class="outcome incorrect"/g) || []).length, 2);
  } finally { harness.restore(); }
});

test('controller leaves interactions disabled when receipt or fetch validation fails', async () => {
  const altered = JSON.parse(receiptText);
  altered.run.seed++;
  for (const options of [{receipt: JSON.stringify(altered)}, {failure: true}]) {
    const harness = await loadController(options);
    try {
      assert.equal(harness.element('#load-status').dataset.state, 'error');
      assert.equal(harness.element('#threshold').disabled, true);
      assert.equal(harness.element('#record-table').innerHTML, '');
      assert.match(harness.element('#load-status').textContent, /reference snapshot/);
    } finally { harness.restore(); }
  }
});
