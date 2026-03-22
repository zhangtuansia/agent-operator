import test from 'node:test';
import assert from 'node:assert/strict';

import { ZOOM_DEFAULT } from '../src/constants.ts';
import { defaultZoom } from '../src/office/toolUtils.ts';

test('defaultZoom stays fixed even if device pixel ratio changes', () => {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { devicePixelRatio?: number };
  };
  const originalWindow = globalWithWindow.window;

  try {
    Object.defineProperty(globalWithWindow, 'window', {
      configurable: true,
      value: { devicePixelRatio: 2 },
    });
    assert.equal(defaultZoom(), ZOOM_DEFAULT);

    Object.defineProperty(globalWithWindow, 'window', {
      configurable: true,
      value: { devicePixelRatio: 1 },
    });
    assert.equal(defaultZoom(), ZOOM_DEFAULT);
  } finally {
    Object.defineProperty(globalWithWindow, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});
