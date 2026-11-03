/**
 * @vitest-environment jsdom
 *
 * Drives the real session and answer route handlers and the real results page.
 * Not collected by `npm test` (the file is not named *.test.ts).
 * Run with `npm run verify:scoring`.
 */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import expected from './expected-findings.json';
import { resetMem } from './memory';
import { runAllProperties, type PropertyResult } from './properties';
import { installResultsFetch } from './render-results';

vi.mock('next/link', () => {
  const ReactActual = require('react') as typeof React;
  return {
    default: ({ children, href }: { children?: React.ReactNode; href: string }) =>
      ReactActual.createElement('a', { href }, children),
  };
});

vi.mock('@/lib/auth', () => ({
  auth: async () => ({
    user: {
      id: (globalThis as unknown as { __lcaeExamScoreUserId?: string }).__lcaeExamScoreUserId ?? 'user-1',
    },
  }),
}));

vi.mock('@/lib/db', () => import('./prisma-shim'));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  resetMem();
});

function line(result: PropertyResult): string {
  const head = `${result.ok ? 'pass' : 'FAIL'} ${result.kind} ${result.id}`;
  if (result.ok || !result.counterexample) return head;
  return `${head}\n  ${result.counterexample}`;
}

it('exam session score integrity', async () => {
  installResultsFetch();
  const results = await runAllProperties();
  const heldFailed = results.filter((result) => result.kind === 'held' && !result.ok);
  const specFailed = results
    .filter((result) => result.kind === 'spec' && !result.ok)
    .map((result) => result.id)
    .sort();
  const expectedIds = [...expected.findings].sort();
  const cleared = expectedIds.filter((id) => !specFailed.includes(id));
  const unexpected = specFailed.filter((id) => !expectedIds.includes(id));

  const modeling = results.filter(
    (result) =>
      !result.ok &&
      !!result.counterexample &&
      (result.counterexample.startsWith('modeling gap') ||
        result.counterexample.startsWith('overlap-timeout'))
  );

  let status: 'findings-only' | 'regression' | 'finding-set-changed' | 'modeling-error';
  if (modeling.length > 0) status = 'modeling-error';
  else if (heldFailed.length > 0) status = 'regression';
  else if (cleared.length > 0 || unexpected.length > 0) status = 'finding-set-changed';
  else status = 'findings-only';

  const report = [
    `verify:scoring status: ${status}`,
    `syncCommit: ${expected.syncCommit}`,
    `seed: ${expected.seed} numRuns: ${expected.numRuns}`,
    '',
    ...results.map(line),
  ];
  if (cleared.length > 0) {
    report.push('', `finding-cleared: ${cleared.join(', ')}`);
  }
  if (unexpected.length > 0) {
    report.push('', `unexpected: ${unexpected.join(', ')}`);
  }
  const text = report.join('\n');
  console.log(text);

  expect(status, text).toBe('findings-only');
  expect(heldFailed.map((result) => result.id), text).toEqual([]);
  expect(specFailed, text).toEqual(expectedIds);
}, 120000);
