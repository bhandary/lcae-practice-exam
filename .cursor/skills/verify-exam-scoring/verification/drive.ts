import { getMem, type AnswerRow, type SessionRow } from './memory';

type Json = Record<string, unknown>;

export type CallResult = {
  status: number;
  json: Json;
};

async function readJson(response: Response): Promise<Json> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Json;
    return { value: parsed };
  } catch {
    return { raw: text };
  }
}

export async function postSession(body: Json): Promise<CallResult> {
  const { POST } = await import('@/app/api/sessions/route');
  const response = await POST(
    new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, json: await readJson(response) };
}

export async function postAnswer(body: Json): Promise<CallResult> {
  const { POST } = await import('@/app/api/answers/route');
  const response = await POST(
    new Request('http://localhost/api/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, json: await readJson(response) };
}

export async function patchSession(id: string, body: Json): Promise<CallResult> {
  const { PATCH } = await import('@/app/api/sessions/[id]/route');
  const response = await PATCH(
    new Request(`http://localhost/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: response.status, json: await readJson(response) };
}

export async function getSession(id: string): Promise<CallResult> {
  const { GET } = await import('@/app/api/sessions/[id]/route');
  const response = await GET(new Request(`http://localhost/api/sessions/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, json: await readJson(response) };
}

export function storedSessions(): SessionRow[] {
  return getMem().sessions;
}

export function storedAnswers(): AnswerRow[] {
  return getMem().answers;
}

export function onlySession(): SessionRow {
  const sessions = storedSessions();
  if (sessions.length !== 1) {
    throw new Error(`modeling gap: expected one UserSession, found ${sessions.length}`);
  }
  return sessions[0];
}

// Shapes a fixed question list might show up in, if the route starts pinning one.
// Update this reader when the product stores the set under a different name,
// then re-run the check. Returning [] means the create response did not pin a set.
export function assignedQuestionIds(createBody: Json, stored: SessionRow | undefined): string[] {
  const candidates = [
    createBody.questionIds,
    createBody.questions,
    stored?.questionIds,
    stored?.questions,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) {
      return candidate as string[];
    }
    if (
      Array.isArray(candidate) &&
      candidate.every((item) => item && typeof item === 'object' && typeof (item as Json).id === 'string')
    ) {
      return (candidate as Json[]).map((item) => String(item.id));
    }
  }
  return [];
}
