// An accessible rotary knob (WAI-ARIA slider pattern).
// Drag up/right to increase, Shift for fine control, double-click to reset.
// Keyboard: arrows nudge, Page Up/Down jump, Home/End go to the ends.

import { h } from './dom.js';
import { toNorm, fromNorm, formatValue, spokenValue } from '../state/params.js';

const START = -135;
const END = 135;
const C = 30; // centre of the 60×60 drawing
const R = 24;

function polar(deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
}

function arcPath(a0, a1) {
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function createKnob({ key, spec, value, onChange, onHint }) {
  let norm = toNorm(spec, value);
  const id = `knob-${key}`;
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  const arc = h('path', { class: 'knob__arc' });
  const pointer = h('line', { class: 'knob__pointer', x1: C, y1: C, x2: C, y2: 17 });
  const svg = h(
    'svg',
    { viewBox: '0 0 60 60', 'aria-hidden': 'true', focusable: 'false' },
    h('path', { class: 'knob__track', d: arcPath(START, END) }),
    arc,
    h('circle', { class: 'knob__cap', cx: C, cy: C, r: 15 }),
    pointer,
  );
  const dial = h(
    'div',
    {
      class: 'knob__dial',
      id,
      role: 'slider',
      tabindex: 0,
      'aria-labelledby': labelId,
      'aria-describedby': descId,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-orientation': 'vertical',
    },
    svg,
  );
  const valueEl = h('span', { class: 'knob__value', 'aria-hidden': 'true' });
  const root = h(
    'div',
    { class: 'knob', dataset: { key } },
    dial,
    h('span', { class: 'knob__label', id: labelId }, spec.label),
    valueEl,
    h('span', { class: 'visually-hidden', id: descId }, `${spec.tech}. ${spec.hint}`),
  );

  function render() {
    const angle = START + norm * (END - START);
    arc.setAttribute('d', norm > 0.002 ? arcPath(START, angle) : '');
    pointer.setAttribute('transform', `rotate(${angle.toFixed(1)} ${C} ${C})`);
    const v = fromNorm(spec, norm);
    valueEl.textContent = formatValue(spec, v);
    dial.setAttribute('aria-valuenow', String(Math.round(norm * 100)));
    dial.setAttribute('aria-valuetext', spokenValue(spec, v));
  }

  function setNorm(next) {
    const n = Math.max(0, Math.min(1, next));
    if (Math.abs(n - norm) < 1e-6) return;
    norm = n;
    render();
    onChange(fromNorm(spec, norm));
  }

  dial.addEventListener('keydown', (e) => {
    const fine = e.shiftKey ? 0.2 : 1;
    const steps = {
      ArrowUp: 0.01 * fine,
      ArrowRight: 0.01 * fine,
      ArrowDown: -0.01 * fine,
      ArrowLeft: -0.01 * fine,
      PageUp: 0.1,
      PageDown: -0.1,
    };
    if (e.key in steps) setNorm(norm + steps[e.key]);
    else if (e.key === 'Home') setNorm(0);
    else if (e.key === 'End') setNorm(1);
    else return;
    e.preventDefault();
  });

  let drag = null;
  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dial.focus({ preventScroll: true });
    dial.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: norm };
    root.classList.add('is-dragging');
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const travel = drag.y - e.clientY + (e.clientX - drag.x);
    setNorm(drag.start + travel / (e.shiftKey ? 900 : 180));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    root.classList.remove('is-dragging');
  };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);
  dial.addEventListener('dblclick', () => setNorm(toNorm(spec, spec.default)));

  const hint = () => onHint?.(spec);
  dial.addEventListener('focus', hint);
  root.addEventListener('pointerenter', hint);

  render();
  return {
    el: root,
    set(v) {
      norm = toNorm(spec, v);
      render();
    },
  };
}
