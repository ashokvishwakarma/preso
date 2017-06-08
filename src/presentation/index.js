/** @jsx h */
import './notes/index.js';
import {h, createEmptyWindow} from '../utils/dom.js';
import Slide from './slide/index.js';
import {fade} from './transitions/index.js';
import css from './style.scss';

export default class Presentation extends HTMLElement {
  constructor() {
    super();

    this.defaultTransition = fade();

    this._hasBeenConnected = false;
    this._currentSlideNum = -1;
    this._currentSlide = null;
    this._slideFuncs = [];
    this._transitionFuncs = [];
    // Appended in connectedCallback
    this._stage = <div class="preso__stage"></div>;
    this.notes = <preso-notes></preso-notes>;

    // Add shadow dom
    let resizeObserver;

    this.attachShadow({mode: 'closed'}).append(
      this._shadowStyle = <style>{css}</style>,
      <div class="preso__layout">
        {this._stageCell = <div class="preso__cell"/>}
        {this._notesCell = <div class="preso__cell"/>}
        {resizeObserver = <iframe class="preso__resize-observer"></iframe>}
      </div>,
      <slot/>
    );

    // Watch for element size changes
    resizeObserver.addEventListener('load', () => {
      resizeObserver.contentWindow.addEventListener('resize', () => this._handleResize());
    });
    resizeObserver.src = '';

    // Add key listeners
    this.addEventListener('keydown', event => {
      switch (event.key) {
        case ' ':
          event.preventDefault();
          this.next();
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.next({preventTransition: true});
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.previous({preventTransition: true});
          break;
      }
    });

    // Other listeners
    this.notes.addEventListener('popoutclick', () => this._onPopOutClick());
  }

  connectedCallback() {
    if (!this._hasBeenConnected) {
      this.append(this._stage, this.notes);
      this.tabIndex = 0;

      this._stage.style.width = `${this.width}px`;
      this._stage.style.height = `${this.height}px`;
      this.notes.style.width = `${this.notesWidth}px`;
      this.notes.style.height = `${this.notesHeight}px`;

      this._hasBeenConnected = true;
    }

    this._handleResize();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    switch(name) {
      case 'width':
        this._stage.style.width = `${this.width}px`;
        this._handleResize();
        break;
      case 'height':
        this._stage.style.height = `${this.height}px`;
        this._handleResize();
        break;
      case 'notes-width':
        this.notes.style.width = `${this.notesWidth}px`;
        this._handleResize();
        break;
      case 'notes-height':
        this.notes.style.height = `${this.notesHeight}px`;
        this._handleResize();
        break;
    }
  }

  _onPopOutClick() {
    const win = createEmptyWindow();
    win.document.documentElement.classList.add('notes-popup');
    win.document.body.append(this.notes);
    this._notesCell.remove();
    this._notesCell = win.document.documentElement;
    win.addEventListener('resize', () => this._handleResize());
    this._handleResize();
  }

  _handleResize() {
    const stageRect = this._stageCell.getBoundingClientRect();
    const notesRect = this._notesCell.getBoundingClientRect();

    // Resize stage
    const stageScale = Math.min(
      stageRect.width / this.width,
      stageRect.height / this.height
    );

    const stageLeft = (stageRect.width - (this.width * stageScale)) / 2 + stageRect.left;
    const stageTop = (stageRect.height - (this.height * stageScale)) / 2 + stageRect.top;

    this._stage.style.transform = `translate(${stageLeft}px, ${stageTop}px) scale(${stageScale})`;

    // Resize notes
    const notesScale = Math.min(
      notesRect.width / this.notesWidth,
      notesRect.height / this.notesHeight
    );

    const notesLeft = (notesRect.width - (this.notesWidth * notesScale)) / 2 + notesRect.left;
    const notesTop = (notesRect.height - (this.notesHeight * notesScale)) / 2 + notesRect.top;

    this.notes.style.transform = `translate(${notesLeft}px, ${notesTop}px) scale(${notesScale})`;
  }

  /**
   * @param {function(Slide): PromiseLike} asyncFunc
   */
  slide(asyncFunc) {
    this._slideFuncs.push(asyncFunc);
    this._transitionFuncs.push(this.defaultTransition);

    if (this._slideFuncs.length == 1) {
      this.goTo(0);
    }
  }

  transition(transitionFunc) {
    this._transitionFuncs[this._transitionFuncs.length - 1] = transitionFunc;
  }

  async goTo(num, {
    state = 0,
    preventTransition = false
  }={}) {
    const slide = new Slide();
    const exitingSlide = this._currentSlide;
    const func = this._slideFuncs[num];

    this._currentSlide = slide;
    this._currentSlideNum = num;

    slide.style.opacity = 0;
    this._stage.append(slide);

    slide._run(func, {
      autoAdvanceNum: state,
      preventTransition
    });

    const transition = preventTransition ? false : this._transitionFuncs[num - 1];

    if (transition) {
      await transition(slide, exitingSlide, this._stage);
    }
    else {
      await slide.prepare();
      slide.style.opacity = 1;
    }

    if (exitingSlide) exitingSlide.remove();
  }

  next({
    preventTransition = false
  }={}) {
    if (this._currentSlide._complete) {
      // As long as it isn't the last slide
      if (this._currentSlideNum + 1 != this._slideFuncs.length) {
        this.goTo(this._currentSlideNum + 1, {preventTransition});
      }
      return;
    }
    this._currentSlide._advance({preventTransition});
  }

  previous() {
    if (this._currentSlide._currentStateNum == 0) {
      // As long as we aren't already on the first slide
      if (this._currentSlideNum != 0) {
        this.goTo(this._currentSlideNum - 1, {
          preventTransition: true,
          state: -1
        });
      }
      return;
    }

    this.goTo(this._currentSlideNum, {
      preventTransition: true,
      state: this._currentSlide._currentStateNum - 1
    });
  }
}

Presentation.observedAttributes = [
  'width', 'height', 'notes-width', 'notes-height'
];

// Property accessors for attributes
for (const attr of Presentation.observedAttributes) {
  const prop = attr.replace(/-\w/g, match => match.slice(1).toUpperCase());

  Object.defineProperty(Presentation.prototype, prop, {
    get() {
      const num = Number(this.getAttribute(attr));
      if (num) return num;

      // defaults:
      if (attr.endsWith('width')) return 1920;
      if (attr.endsWith('height')) return 1080;
    },
    set(val) {
      this.setAttribute(attr, Number(val));
    }
  });
}

customElements.define('preso-presentation', Presentation);