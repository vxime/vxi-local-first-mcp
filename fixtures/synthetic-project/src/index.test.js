// Synthetic test fixture.
import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import { add } from './index.js';
test('add', () => strictEqual(add(1, 2), 3));
