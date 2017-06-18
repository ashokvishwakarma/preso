/** @jsx h */
import { h } from '../utils/dom.js';
import { easeOutQuad } from '../utils/css-ease.js';
import css from './style.scss';
import hljs from 'highlight.js/lib/highlight.js';
import js from 'highlight.js/lib/languages/javascript.js';

hljs.registerLanguage('javascript', js);

document.head.append(<style>{css}</style>);

function normalizeIndent(str) {
  // trim empty lines from start & end
  str = str.replace(/^\s?\n|\n\s?$/g, '');

  const lines = str.split('\n');
  const indentLen = /^\s*/.exec(lines[0])[0].length;
  return lines.map(l => l.slice(indentLen)).join('\n');
}

export default class Code extends HTMLElement {
  constructor() {
    super();
    this._hasBeenConnected = false;
    this._content = Promise.resolve('');
    this._queue = Promise.resolve();
    this._updateQueued = false;
    this._pre = (
      <pre>
        {this._code = <code class="hljs" />}
      </pre>
    );
  }
  async connectedCallback() {
    if (!this.closest('preso-slide')) throw Error("preso-code must be within a preso-slide");

    if (this._hasBeenConnected) return;
    this._hasBeenConnected = true;
    this._synchronize();

    if (this.textContent.trim()) {
      // Runs the setter specified below
      this.textContent = this.textContent;
      this.innerHTML = '';
    }
    this.append(this._pre);
    this._queueUpdate();
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name == 'src') {
      this._content = fetch(newVal).then(r => r.text());
      if (this._hasBeenConnected) this._synchronize();
    }
    if (this._hasBeenConnected) this._queueUpdate();
  }
  set textContent(val) {
    this._content = Promise.resolve(normalizeIndent(val));
  }
  get textContent() {
    return super.textContent;
  }
  _synchronize() {
    const slide = this.closest('preso-slide');
    slide.synchronize(this._content);
  }
  _queueUpdate() {
    if (this._updateQueued) return;
    this._updateQueued = true;

    // Wait a frame to allow multiple attributes to be set
    this._queue = this._queue.then(async () => {
      const slide = this.closest('preso-slide');
      await slide.synchronize();
      this._updateQueued = false;
      this._update();
    });
  }
  async _update() {
    // Figure out language
    let lang = 'plain';

    if (this.codeLang) {
      lang = this.codeLang;
    }
    else if (this.src) {
      const result = /\.([^.]+)$/.exec(this.src);
      if (result[1]) lang = result[1];
    }

    const lines = (await this._content).split('\n');
    // Start begins at 1
    const start = (this.start || 1) - 1;
    // End is inclusive
    const end = (this.end || lines.length);
    const content = lines.slice(start, end).join('\n');
    const startHeight = window.getComputedStyle(this).height;

    // Set code
    const result = hljs.highlight(lang, content);
    this._code.innerHTML = result.value;

    // Transition
    const slide = this.closest('preso-slide');
    
    this.style.height = '';
    
    if (!slide.transition) return;

    const endHeight = window.getComputedStyle(this).height;

    await this.animate([
      {height: startHeight},
      {height: endHeight}
    ], {
      duration: 300,
      easing: easeOutQuad
    }).finished;
  }
}

const numberAttrs = ['start', 'end'];
const reflectAttrs = ['src', 'code-lang'];

Code.observedAttributes = [...numberAttrs, ...reflectAttrs];

for (const attr of numberAttrs) {
  const prop = attr.replace(/-\w/g, match => match.slice(1).toUpperCase());

  Object.defineProperty(Code.prototype, prop, {
    get() {
      return Number(this.getAttribute(attr));
    },
    set(val) {
      this.setAttribute(attr, Number(val));
    }
  });
}

for (const attr of reflectAttrs) {
  const prop = attr.replace(/-\w/g, match => match.slice(1).toUpperCase());

  Object.defineProperty(Code.prototype, prop, {
    get() {
      return this.getAttribute(attr);
    },
    set(val) {
      this.setAttribute(attr, val);
    }
  });
}

customElements.define('preso-code', Code);