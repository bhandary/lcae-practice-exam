// Session rules shared by the API routes and the results page.
// The client does not choose the question list, questionCount, or correctCount.

export const EXAM_DOMAINS = ['Build', 'Test', 'Deploy', 'Monitor'] as const;
export type ExamDomain = (typeof EXAM_DOMAINS)[number];

export const TIMED_EXAM_QUESTION_COUNT = 40;
export const TIMED_EXAM_PER_DOMAIN = 10;
export const TIMED_EXAM_LIMIT_SECONDS = 120 * 60;

export type ExamMode = 'practice' | 'timed-exam';

export type QuestionRef = {
  id: string;
  domain: string;
};

export type SessionCreatePlan =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: ExamMode;
      domain: string | null;
      questionCount: number;
      timeLimit: number | null;
      questionIds: string[];
    };

export function parseExamMode(value: unknown): ExamMode | null {
  if (value === 'practice' || value === 'timed-exam') return value;
  return null;
}

export function parseExamDomain(
  value: unknown
): { ok: true; domain: string | null } | { ok: false } {
  if (value === null || value === undefined || value === '' || value === 'mixed') {
    return { ok: true, domain: null };
  }
  if (typeof value === 'string' && (EXAM_DOMAINS as readonly string[]).includes(value)) {
    return { ok: true, domain: value };
  }
  return { ok: false };
}

export function clampQuestionCount(requested: number, available: number): number {
  if (available < 1) return 0;
  const truncated = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  return Math.min(available, Math.max(1, truncated));
}

export function shuffleInPlace<T>(items: T[], random: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = items[i];
    items[i] = items[j];
    items[j] = current;
  }
  return items;
}

export function selectPracticeQuestionIds(
  questions: QuestionRef[],
  domain: string | null,
  requestedCount: number,
  random: () => number = Math.random
): string[] {
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const question of questions) {
    if (domain && question.domain !== domain) continue;
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    pool.push(question.id);
  }
  const count = clampQuestionCount(requestedCount, pool.length);
  return shuffleInPlace(pool, random).slice(0, count);
}

export function selectTimedQuestionIds(
  questions: QuestionRef[],
  random: () => number = Math.random
): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const domain of EXAM_DOMAINS) {
    const pool: string[] = [];
    for (const question of questions) {
      if (question.domain !== domain || seen.has(question.id)) continue;
      seen.add(question.id);
      pool.push(question.id);
    }
    selected.push(...shuffleInPlace(pool, random).slice(0, TIMED_EXAM_PER_DOMAIN));
  }
  return shuffleInPlace(selected, random);
}

export function planSessionCreate(input: {
  mode: unknown;
  domain: unknown;
  questionCount: unknown;
  timeLimit: unknown;
  questions: QuestionRef[];
  random?: () => number;
}): SessionCreatePlan {
  const mode = parseExamMode(input.mode);
  if (!mode) return { ok: false, error: 'Unknown exam mode' };

  const domain = parseExamDomain(input.domain);
  if (!domain.ok) return { ok: false, error: 'Unknown domain' };

  const random = input.random ?? Math.random;

  if (mode === 'timed-exam') {
    const questionIds = selectTimedQuestionIds(input.questions, random);
    if (questionIds.length !== TIMED_EXAM_QUESTION_COUNT) {
      return { ok: false, error: 'Not enough questions to start a timed exam' };
    }
    return {
      ok: true,
      mode,
      domain: null,
      questionCount: TIMED_EXAM_QUESTION_COUNT,
      timeLimit: TIMED_EXAM_LIMIT_SECONDS,
      questionIds,
    };
  }

  if (typeof input.questionCount !== 'number' || !Number.isFinite(input.questionCount)) {
    return { ok: false, error: 'Invalid questionCount' };
  }

  const questionIds = selectPracticeQuestionIds(
    input.questions,
    domain.domain,
    input.questionCount,
    random
  );
  if (questionIds.length < 1) {
    return { ok: false, error: 'No questions available' };
  }

  const timeLimit =
    typeof input.timeLimit === 'number' && Number.isFinite(input.timeLimit)
      ? Math.trunc(input.timeLimit)
      : null;

  return {
    ok: true,
    mode,
    domain: domain.domain,
    questionCount: questionIds.length,
    timeLimit,
    questionIds,
  };
}

export function isTimedSessionExpired(
  session: { mode: string; startedAt: Date | string; timeLimit: number | null },
  now: number = Date.now()
): boolean {
  if (session.mode !== 'timed-exam') return false;
  if (typeof session.timeLimit !== 'number' || !Number.isFinite(session.timeLimit)) return false;
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return now >= started + session.timeLimit * 1000;
}

export function capCorrectCount(correctCount: number, questionCount: number): number {
  const correct = Number.isFinite(correctCount) ? correctCount : 0;
  const total = Number.isFinite(questionCount) && questionCount > 0 ? questionCount : 0;
  return Math.min(Math.max(0, correct), total);
}

export function scorePercentage(correctCount: number, questionCount: number): number {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return 0;
  const capped = capCorrectCount(correctCount, questionCount);
  return Math.min(100, Math.max(0, Math.round((capped / questionCount) * 100)));
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export type ReviewAnswer<Q extends { id: string }> = {
  id: string;
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  question: Q;
};

export type ReviewRow<Q extends { id: string }> = {
  key: string;
  question: Q;
  selectedAnswer: string | null;
  isCorrect: boolean;
  unanswered: boolean;
};

export function buildExamReview<Q extends { id: string }>(
  questions: Q[] | null | undefined,
  answers: Array<ReviewAnswer<Q>>
): ReviewRow<Q>[] {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const ordered =
    questions && questions.length > 0 ? questions : answers.map((answer) => answer.question);

  return ordered.map((question) => {
    const answer = byQuestion.get(question.id);
    if (answer) {
      return {
        key: answer.id,
        question: answer.question ?? question,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: answer.isCorrect,
        unanswered: false,
      };
    }
    return {
      key: `unanswered-${question.id}`,
      question,
      selectedAnswer: null,
      isCorrect: false,
      unanswered: true,
    };
  });
}

export function tallyDomains(
  items: Array<{ isCorrect: boolean; domain: string }>
): Record<string, { total: number; correct: number }> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.domain]) acc[item.domain] = { total: 0, correct: 0 };
      acc[item.domain].total += 1;
      if (item.isCorrect) acc[item.domain].correct += 1;
      return acc;
    },
    {} as Record<string, { total: number; correct: number }>
  );
}

export function questionIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}
