// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

describe('dbg', () => {
  it('compare strings', () => {
    const literal = 'a"b';
    const div = document.createElement('div');
    div.textContent = 'a"b';
    const fromDom = div.innerHTML;
    console.log('literal char codes:', [...literal].map(c => c.charCodeAt(0)));
    console.log('fromDom char codes:', [...fromDom].map(c => c.charCodeAt(0)));
    console.log('literal === fromDom:', literal === fromDom);
    console.log('literal replace:', literal.replace(/"/g, '"'));
    console.log('fromDom replace:', fromDom.replace(/"/g, '"'));
  });
});
