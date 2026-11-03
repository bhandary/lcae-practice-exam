import React, { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { getSession } from './drive';

// Renders the real ResultsPage (app/results/[id]/page.tsx).
// fetch is dispatched to GET app/api/sessions/[id]/route.ts, the handler the page calls.

export function installResultsFetch(): void {
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const id = url.match(/\/api\/sessions\/([^/?]+)/)?.[1];
    if (method === 'GET' && id) {
      const result = await getSession(id);
      return new Response(JSON.stringify(result.json), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`modeling gap: ResultsPage fetch ${method} ${url} is not the session GET`);
  };
  globalThis.fetch = fetchImpl as typeof fetch;
  if (typeof window !== 'undefined') {
    window.fetch = fetchImpl as typeof fetch;
  }
}

export async function renderResultsText(sessionId: string): Promise<string> {
  cleanup();
  const { default: ResultsPage } = await import('@/app/results/[id]/page');
  // ResultsPage calls use(params). That suspends once, so the render needs a boundary.
  await act(async () => {
    render(
      React.createElement(
        React.Suspense,
        { fallback: React.createElement('p', null, 'suspense-fallback') },
        React.createElement(ResultsPage, { params: Promise.resolve({ id: sessionId }) })
      )
    );
  });
  try {
    await screen.findByText(/correct out of/i, {}, { timeout: 4000 });
  } catch (error) {
    const snippet = document.body.innerHTML.slice(0, 800);
    throw new Error(
      `modeling gap: ResultsPage did not render a score for session ${sessionId}. body=${snippet}. ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
    );
  }
  return document.body.textContent ?? '';
}

export function headline(text: string): { correct: number; total: number } | null {
  const match = text.match(/(\d+) correct out of (\d+)/);
  if (!match) return null;
  return { correct: Number(match[1]), total: Number(match[2]) };
}

export function headlinePercentage(text: string): string | null {
  const node = document.querySelector('.text-5xl');
  if (!node) return null;
  return (node.textContent ?? '').trim();
}

// Domain rows are rendered as "{correct}/{total} ({percent}%)" by ResultsPage.
export function domainTotalSum(text: string): number {
  const re = /(\d+)\/(\d+) \(\d+%\)/g;
  let sum = 0;
  for (const match of text.matchAll(re)) {
    sum += Number(match[2]);
  }
  return sum;
}

export function reviewCount(text: string): number {
  return text.split('Your answer:').length - 1;
}
