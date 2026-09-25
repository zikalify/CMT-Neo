'use strict';

// Minimal zero-dependency browser mock for CMT-Neo unit/integration tests.
// Installs global.localStorage, global.document, global.history,
// global.getComputedStyle so app.js functions that touch the DOM work in Node.

function createLocalStorage() {
  let store = Object.create(null);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = Object.create(null); },
    _dump: () => ({ ...store })
  };
}

function createElementStub() {
  return {
    textContent: '',
    innerHTML: '',
    value: '',
    max: '',
    href: '',
    download: '',
    style: {
      setProperty() {},
      transform: '',
      transition: ''
    },
    classList: {
      add() {},
      remove() {},
      contains: () => false
    },
    dataset: {},
    setAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    click() {},
    appendChild() {},
    removeChild() {},
    closest: () => null
  };
}

function createDocumentStub() {
  const bySelector = new Map();

  const body = {
    appendChild() {},
    removeChild() {}
  };

  const documentElement = {
    style: { setProperty() {} }
  };

  function elFor(sel) {
    if (!bySelector.has(sel)) bySelector.set(sel, createElementStub());
    return bySelector.get(sel);
  }

  // Pre-create the elements app.js touches via $('#...')
  ['#phaseBadge', '#heroBig', '#heroLabel', '#heroTiny', '#toast', '#logDate',
   '#historyList', '#logSheetTitle', '#logSheetSub', '#confirmLog', '#logDate',
   '#confirmTitle', '#confirmSub', '#confirmYes'].forEach(elFor);

  return {
    _els: bySelector,
    body,
    documentElement,
    querySelector: (sel) => {
      if (sel === 'meta[name="theme-color"]') return null;
      return elFor(sel);
    },
    querySelectorAll: () => [],
    getElementById: (id) => elFor('#' + id),
    createElement: () => createElementStub(),
    addEventListener() {},
    removeEventListener() {}
  };
}

function installFakeBrowser() {
  const ls = createLocalStorage();
  const doc = createDocumentStub();

  global.localStorage = ls;
  global.document = doc;
  global.history = global.history || { pushState() {}, back() {} };
  if (!global.getComputedStyle) {
    global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  }
  if (!global.window) global.window = {};
  return { localStorage: ls, document: doc };
}

function resetFakeBrowser(handle) {
  handle.localStorage.clear();
  for (const el of handle.document._els.values()) {
    el.textContent = '';
    el.innerHTML = '';
    el.value = '';
    el.max = '';
  }
}

module.exports = {
  createLocalStorage,
  createElementStub,
  createDocumentStub,
  installFakeBrowser,
  resetFakeBrowser
};
