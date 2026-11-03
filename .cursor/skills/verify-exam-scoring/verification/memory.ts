import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BANK, type BankQuestion } from './bank';

// In-memory stand-in for the Prisma calls made by the session and answer routes.
// Uniqueness of (userSessionId, questionId) follows prisma/schema.prisma, not a
// wish. If that model grows @@unique on those two fields, the second create throws.

export type SessionRow = {
  id: string;
  userId: string;
  mode: string;
  domain: string | null;
  questionCount: number;
  correctCount: number;
  startedAt: Date;
  completedAt: Date | string | null;
  timeLimit: number | null;
  [extra: string]: unknown;
};

export type AnswerRow = {
  id: string;
  userSessionId: string;
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: Date;
};

export type FindFirstHook = (where: {
  userSessionId?: string;
  questionId?: string;
}) => Promise<void>;

type Mem = {
  sessions: SessionRow[];
  answers: AnswerRow[];
  questions: BankQuestion[];
  seq: number;
  findFirstHook: FindFirstHook | null;
};

const GLOBAL_KEY = '__lcaeExamScoreMem';
const USER_KEY = '__lcaeExamScoreUserId';

function fresh(): Mem {
  return {
    sessions: [],
    answers: [],
    questions: BANK.map((question) => ({ ...question })),
    seq: 0,
    findFirstHook: null,
  };
}

export function getMem(): Mem {
  const g = globalThis as unknown as Record<string, Mem | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = fresh();
  return g[GLOBAL_KEY];
}

export function resetMem(): void {
  const g = globalThis as unknown as Record<string, Mem>;
  g[GLOBAL_KEY] = fresh();
  setCurrentUserId('user-1');
}

export function nextId(prefix: string): string {
  const mem = getMem();
  mem.seq += 1;
  return `${prefix}-${mem.seq}`;
}

export function getCurrentUserId(): string {
  const g = globalThis as unknown as Record<string, string | undefined>;
  return g[USER_KEY] ?? 'user-1';
}

export function setCurrentUserId(userId: string): void {
  const g = globalThis as unknown as Record<string, string>;
  g[USER_KEY] = userId;
}

export function setFindFirstHook(hook: FindFirstHook | null): void {
  getMem().findFirstHook = hook;
}

export function backdateSession(id: string, secondsAgo: number): void {
  const session = getMem().sessions.find((row) => row.id === id);
  if (!session) {
    throw new Error(`modeling gap: no UserSession ${id} to backdate`);
  }
  session.startedAt = new Date(Date.now() - secondsAgo * 1000);
}

let uniqueCache: { mtime: string; value: boolean } | null = null;

// Read the UserAnswer model each call so a schema edit is visible without
// restarting the process. Cache on file contents.
export function userAnswerPairIsUnique(): boolean {
  const schemaPath = path.join(process.cwd(), 'prisma/schema.prisma');
  let schema: string;
  try {
    schema = readFileSync(schemaPath, 'utf8');
  } catch (error) {
    throw new Error(
      `modeling gap: could not read ${schemaPath} to mirror UserAnswer uniqueness (${error instanceof Error ? error.message : String(error)})`
    );
  }
  if (uniqueCache?.mtime === schema) return uniqueCache.value;
  const value = modelDeclaresPairUnique(schema, 'UserAnswer', 'userSessionId', 'questionId');
  uniqueCache = { mtime: schema, value };
  return value;
}

export function modelDeclaresPairUnique(
  schema: string,
  model: string,
  fieldA: string,
  fieldB: string
): boolean {
  const match = schema.match(new RegExp(`model\\s+${model}\\s*\\{`));
  if (!match || match.index === undefined) {
    throw new Error(`modeling gap: model ${model} is not in prisma/schema.prisma`);
  }
  const start = match.index + match[0].length;
  let depth = 1;
  let end = start;
  for (; end < schema.length && depth > 0; end += 1) {
    if (schema[end] === '{') depth += 1;
    else if (schema[end] === '}') depth -= 1;
  }
  const body = schema.slice(start, end);
  const uniques = body.match(/@@unique\s*\(\s*\[[^\]]+\]\s*\)/g) ?? [];
  return uniques.some((entry) => entry.includes(fieldA) && entry.includes(fieldB));
}
