import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const page = readFileSync(new URL('../site/medical/observatory.html', import.meta.url), 'utf8');
const resultsText = readFileSync(new URL('../site/medical/results.json', import.meta.url), 'utf8');
const results = JSON.parse(resultsText);
const receiptText = readFileSync(new URL('../site/medical/observatory-receipt.json', import.meta.url), 'utf8');
const datasetDoi = JSON.parse(receiptText).dataset.doi;
const staticTable = page.match(/<tbody id="record-table">([\s\S]*?)<\/tbody>/)[1];
const featuredRow = page.match(/data-featured-row="(\d+)"/)?.[1];
let run = 0;

test('every cohort tile can reveal its frozen probabilities without JavaScript', () => {
  const tiles = [...page.matchAll(/<details class="native-record" id="record-(\d+)"[^>]*>([\s\S]*?)<\/details>/g)];
  assert.equal(tiles.length, results.calibration.records.length);
  for (const [index, record] of results.calibration.records.entries()) {
    const [, number, content] = tiles[index];
    assert.equal(Number(number), index + 1);
    assert.match(content, /<summary\b/);
    assert.ok(content.includes(`source row ${record.row}"`));
    for (const [name, value] of [['Raw', record.raw], ['Calibrated', record.calibrated]]) {
      assert.ok(content.includes(`${name} ${(value * 100).toFixed(2)}%`));
    }
  }
});

test('static no-JavaScript table preserves every frozen test row and both probabilities', () => {
  const rows = [...staticTable.matchAll(/<tr data-row="(\d+)">([\s\S]*?)<\/tr>/g)];
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
});

test('the featured case and dataset source can be inspected without JavaScript', () => {
  const feature = page.match(/id="record-detail"([\s\S]*?)<\/section>/)[1];
  const record = results.calibration.records.find(row => row.row === 215);
  assert.match(feature, /<strong>215<\/strong>/);
  assert.match(feature, /Malignant \(1\)/);
  for (const probability of [record.raw, record.calibrated]) {
    assert.ok(feature.includes((probability * 100).toFixed(2)));
  }
  const receipt = page.match(/id="receipt-fields"([\s\S]*?)<\/dl>/)[1];
  assert.ok(receipt.includes(`href="${datasetDoi}"`));
});

test('static export is reproducible and local navigation targets exist', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../research/build_observatory_view.mjs', import.meta.url)), '--check']);
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(page.includes(`id="${target}"`), `Missing ${target}`);
  assert.doesNotMatch(page, /(?:id|href)="#?(?:threshold|deferral)"/);
  assert.match(page, /<th scope="col">Source row<\/th>/);
  assert.match(page, /<summary>[^<]*114[^<]*<\/summary>/);
  const labIndex = readFileSync(new URL('../site/medical/index.html', import.meta.url), 'utf8');
  assert.match(labIndex, /href="observatory.html"/);
  assert.doesNotMatch(labIndex + page, /AI Reliability Observatory/i);
});

async function loadController({receipt = receiptText, failure = false} = {}) {
  const elements = new Map();
  const handlers = {};
  const originals = {document: globalThis.document, fetch: globalThis.fetch};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: selector === '#record-table' ? staticTable : '',
      textContent: '', dataset: selector === '#record-detail' ? {featuredRow} : {},
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

test('verified cohort and table each expose all records through one initial tab stop', async () => {
  const harness = await loadController();
  try {
    const {element} = harness;
    assert.equal(element('#load-status').dataset.state, 'verified', element('#load-status').textContent);
    for (const selector of ['#cohort-grid', '#record-table']) {
      const buttons = element(selector).innerHTML.match(/<button\b[^>]*>/g);
      assert.deepEqual(buttons.map(button => Number(button.match(/data-record="(\d+)"/)[1])),
        results.calibration.records.map(record => record.row));
      assert.equal(buttons.filter(button => button.includes('tabindex="-1"')).length, 113);
      const tabStops = buttons.filter(button => button.includes('tabindex="0"'));
      assert.equal(tabStops.length, 1);
      assert.match(tabStops[0], /data-record="215"/);
      assert.match(tabStops[0], /aria-pressed="true"/);
    }
  } finally { harness.restore(); }
});

test('selecting a tile reveals its probabilities in the same grid and Down follows the visual column', async t => {
  const {element, handlers, restore} = await loadController();
  t.after(restore);
  const grid = element('#cohort-grid');
  const columns = 6;
  globalThis.getComputedStyle = () => ({gridTemplateColumns: Array(columns).fill('44px').join(' ')});
  t.after(() => { delete globalThis.getComputedStyle; });
  let placement, focused, scrolled;
  const buttons = results.calibration.records.map(({row}, index) => ({
    dataset: {record: String(row)},
    closest(selector) {
      if (selector === '#cohort-grid') return grid;
      return selector === 'button[data-record]' ? this : null;
    },
    focus: () => { focused = row; },
    after: readout => { placement = {index, readout}; },
  }));
  grid.querySelectorAll = () => buttons;
  grid.querySelector = selector => buttons.find(button => selector.includes(`="${button.dataset.record}"`));
  document.querySelector = selector => selector === '#record-inspector' ? placement?.readout : element(selector);
  document.createElement = () => ({
    dataset: {}, setAttribute() {}, closest: () => null, remove() {},
    scrollIntoView() { scrolled = this; },
  });
  const index = results.calibration.records.findIndex(record => record.row === 215);
  handlers.click({target: buttons[index]});
  assert.equal(placement.index, Math.floor(index / columns) * columns + columns - 1);
  assert.equal(scrolled, placement.readout);
  assert.match(placement.readout.innerHTML, /45\.71%/);
  assert.match(placement.readout.innerHTML, /52\.08%/);
  assert.match(element('#selection-status').textContent, /215/);

  let prevented = false;
  handlers.keydown({target: buttons[index], key: 'ArrowDown', preventDefault() { prevented = true; }});
  const next = results.calibration.records[index + columns];
  assert.ok(prevented);
  assert.equal(focused, next.row);
  assert.equal(Number(placement.readout.dataset.recordRow), next.row);
  assert.equal(scrolled, placement.readout);
});

test('hydrating the receipt preserves the clickable dataset citation', async () => {
  const harness = await loadController();
  try {
    assert.ok(harness.element('#receipt-fields').innerHTML.includes(`href="${datasetDoi}"`));
  } finally { harness.restore(); }
});

test('failed verification preserves the static table and omits interactive record controls', async () => {
  const altered = JSON.parse(receiptText);
  altered.run.seed++;
  for (const options of [{receipt: JSON.stringify(altered)}, {failure: true}]) {
    const harness = await loadController(options);
    try {
      assert.equal(harness.element('#load-status').dataset.state, 'error');
      assert.equal(harness.element('#record-table').innerHTML, staticTable);
      assert.doesNotMatch(harness.element('#cohort-grid').innerHTML, /<button\b/);
      assert.match(harness.element('#load-status').textContent, /reference snapshot/);
    } finally { harness.restore(); }
  }
});
