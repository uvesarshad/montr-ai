import { it, expect } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

class FakeElement {
  children = [];
  id = '';
  value = '';
  innerText = '';
  onclick = null;
  onkeypress = null;
  scrollTop = 0;
  scrollHeight = 0;
  style = { cssText: '' };
  html = '';
  ownerDocument;
  tagName;

  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  set innerHTML(value) {
    this.html = value;
    this.ownerDocument.registerMarkup(value);
  }

  get innerHTML() {
    return this.html;
  }

  appendChild(child) {
    this.children.push(child);
    this.ownerDocument.registerElementTree(child);
    return child;
  }
}

class FakeDocument {
  elementsById = new Map();
  listeners = [];
  body;

  constructor(hasBody) {
    this.body = hasBody ? new FakeElement(this, 'body') : null;
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  getElementById(id) {
    return this.elementsById.get(id) ?? null;
  }

  addEventListener(eventName, listener) {
    if (eventName === 'DOMContentLoaded') {
      this.listeners.push(listener);
    }
  }

  dispatchDOMContentLoaded() {
    if (!this.body) {
      this.body = new FakeElement(this, 'body');
    }

    for (const listener of this.listeners.splice(0)) {
      listener();
    }
  }

  registerMarkup(markup) {
    const idMatches = markup.matchAll(/id="([^"]+)"/g);

    for (const match of idMatches) {
      const element = new FakeElement(this, 'div');
      element.id = match[1];
      this.elementsById.set(element.id, element);
    }
  }

  registerElementTree(element) {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }

    for (const child of element.children) {
      this.registerElementTree(child);
    }
  }
}

function runWidgetScript(document) {
  const storage = new Map();
  const script = fs.readFileSync(path.join(process.cwd(), 'public', 'chatbot-widget.js'), 'utf8');
  const window = {
    MontrAIConfig: {
      baseUrl: 'https://app.montr.io',
      widgetToken: 'wgt_test',
      position: 'bottom-right',
      primaryColor: '#7a5af8',
      greeting: 'Hi! How can I help you today?',
      placeholder: 'Type your message...',
      showLauncher: true,
    },
  };

  const context = vm.createContext({
    window,
    document,
    console: {
      log() {},
      error() {},
    },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    fetch: async () => ({
      json: async () => ({ reply: 'ok' }),
    }),
    io: () => ({
      connected: false,
      on() {},
      emit() {},
    }),
    Math,
    Date,
  });

  vm.runInContext(script, context, { filename: 'chatbot-widget.js' });
}

it('chatbot widget waits until the document body exists before auto-initializing', async () => {
  const document = new FakeDocument(false);

  expect(() => runWidgetScript(document)).not.toThrow();
  expect(document.getElementById('montrai-widget')).toBe(null);

  document.dispatchDOMContentLoaded();

  // init() now validates against the server (async fetch) before building
  // the widget DOM — flush the pending promise chain before asserting.
  await new Promise((resolve) => setImmediate(resolve));

  expect(document.getElementById('montrai-widget')).toBeTruthy();
  expect(document.getElementById('montrai-launcher')).toBeTruthy();
});
