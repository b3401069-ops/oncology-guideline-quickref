const test = require('node:test');
const assert = require('node:assert/strict');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

global.window = global;
require('../case-state.js');
const state = global.CASE_STATE;

test('keeps patient values in session storage and definitions value-free', () => {
  const storage = new MemoryStorage();
  const fields = [
    { id: 'stage', cancerId: 'hcc', type: 'single_select', label: 'Stage', value: 'C' },
    { id: 'markers', cancerId: 'hcc', type: 'multi_select', label: 'Markers', value: ['AFP high'] },
  ];
  const migrated = state.migrateLegacy(fields, storage);
  assert.equal(migrated.migratedCount, 2);
  assert.equal('value' in migrated.definitions[0], false);
  assert.deepEqual(state.apply(migrated.definitions, 'hcc', storage).map(field => field.value), ['C', ['AFP high']]);
});

test('clears one case without changing field definitions', () => {
  const storage = new MemoryStorage();
  const fields = [{ id: 'stage', cancerId: 'hcc', type: 'single_select', label: 'Stage' }];
  state.setValue('hcc', 'stage', 'B', storage);
  assert.equal(state.apply(fields, 'hcc', storage)[0].value, 'B');
  state.clear('hcc', storage);
  assert.equal(state.apply(fields, 'hcc', storage)[0].value, '');
});


test('clears all cancer case sessions while leaving unrelated session data', () => {
  const storage = new MemoryStorage();
  state.setValue('hcc', 'stage', 'C', storage);
  state.setValue('nsclc', 'stage', 'IV', storage);
  storage.setItem('unrelated', 'keep');
  state.clearAll(storage);
  assert.deepEqual(state.read('hcc', storage), {});
  assert.deepEqual(state.read('nsclc', storage), {});
  assert.equal(storage.getItem('unrelated'), 'keep');
});
