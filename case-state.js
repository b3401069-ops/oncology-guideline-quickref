(() => {
  'use strict';

  const PREFIX = 'oncology-case:';

  function storageOrNull(storage) {
    try {
      return storage || globalThis.sessionStorage || null;
    } catch {
      return null;
    }
  }

  function key(cancerId) {
    return PREFIX + String(cancerId || '');
  }

  function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : !!String(value ?? '').trim();
  }

  function blankValue(field) {
    return field?.type === 'multi_select' ? [] : '';
  }

  function read(cancerId, storage) {
    const target = storageOrNull(storage);
    if (!target) return {};
    try {
      const parsed = JSON.parse(target.getItem(key(cancerId)) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(cancerId, values, storage) {
    const target = storageOrNull(storage);
    if (!target) return;
    const cleaned = Object.fromEntries(
      Object.entries(values || {}).filter(([, value]) => hasValue(value))
    );
    try {
      if (Object.keys(cleaned).length) target.setItem(key(cancerId), JSON.stringify(cleaned));
      else target.removeItem(key(cancerId));
    } catch {}
  }

  function apply(fields, cancerId, storage) {
    const values = read(cancerId, storage);
    return (fields || []).map(field => ({
      ...field,
      value: Object.prototype.hasOwnProperty.call(values, field.id)
        ? values[field.id]
        : blankValue(field),
    }));
  }

  function setValue(cancerId, fieldId, value, storage) {
    const values = read(cancerId, storage);
    if (hasValue(value)) values[fieldId] = value;
    else delete values[fieldId];
    write(cancerId, values, storage);
    return values;
  }

  function removeField(cancerId, fieldId, storage) {
    return setValue(cancerId, fieldId, '', storage);
  }

  function clear(cancerId, storage) {
    write(cancerId, {}, storage);
  }

  function clearAll(storage) {
    const target = storageOrNull(storage);
    if (!target) return;
    try {
      const keys = [];
      for (let index = 0; index < target.length; index++) {
        const candidate = target.key(index);
        if (candidate?.startsWith(PREFIX)) keys.push(candidate);
      }
      keys.forEach(candidate => target.removeItem(candidate));
    } catch {}
  }

  function stripValues(fields) {
    return (fields || []).map(field => {
      const { value, ...definition } = field;
      return definition;
    });
  }

  function migrateLegacy(fields, storage) {
    const grouped = new Map();
    for (const field of fields || []) {
      if (!field?.cancerId || !hasValue(field.value)) continue;
      if (!grouped.has(field.cancerId)) grouped.set(field.cancerId, read(field.cancerId, storage));
      const values = grouped.get(field.cancerId);
      if (!Object.prototype.hasOwnProperty.call(values, field.id)) values[field.id] = field.value;
    }
    for (const [cancerId, values] of grouped) write(cancerId, values, storage);
    return {
      definitions: stripValues(fields),
      migratedCount: (fields || []).filter(field => hasValue(field?.value)).length,
    };
  }

  globalThis.CASE_STATE = Object.freeze({
    key,
    hasValue,
    blankValue,
    read,
    write,
    apply,
    setValue,
    removeField,
    clear,
    clearAll,
    stripValues,
    migrateLegacy,
  });
})();
