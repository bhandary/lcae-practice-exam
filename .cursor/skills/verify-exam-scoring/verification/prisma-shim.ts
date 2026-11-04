import { questionById, type BankQuestion } from './bank';
import {
  getMem,
  nextId,
  userAnswerPairIsUnique,
  type AnswerRow,
  type SessionRow,
} from './memory';

// Subset of Prisma used by:
//   POST app/api/sessions/route.ts
//   GET, PATCH app/api/sessions/[id]/route.ts
//   POST app/api/answers/route.ts
// Any other call throws, so a new query shows up as a modeling gap
// rather than a silent empty result.
// question.findMany supports the two shapes those routes use:
//   orderBy id, select { id, domain } for session create
//   where: { id: { in: string[] } } for the pinned question list on GET

function copySession(row: SessionRow): SessionRow {
  return { ...row };
}

function copyAnswer(row: AnswerRow): AnswerRow {
  return { ...row };
}

function answersFor(sessionId: string) {
  return getMem()
    .answers.filter((answer) => answer.userSessionId === sessionId)
    .map((answer) => {
      const question = questionById(answer.questionId);
      return {
        ...copyAnswer(answer),
        question: question ? { ...question } : null,
      };
    });
}

export const prisma = {
  userSession: {
    async create({ data }: { data: Record<string, unknown> }) {
      // Mirror Prisma: columns the route omits keep their defaults
      // (correctCount 0, startedAt now, completedAt null). Columns the route
      // sends are stored, including any future field such as a pinned question list.
      const row: SessionRow = {
        id: nextId('sess'),
        userId: '',
        mode: '',
        domain: null,
        questionCount: 0,
        correctCount: 0,
        startedAt: new Date(),
        completedAt: null,
        timeLimit: null,
        ...data,
      };
      if (!(row.startedAt instanceof Date)) row.startedAt = new Date();
      getMem().sessions.push(row);
      return copySession(row);
    },

    async findUnique({
      where,
      include,
    }: {
      where: { id: string };
      include?: { answers?: { include?: { question?: boolean } } };
    }) {
      const row = getMem().sessions.find((session) => session.id === where.id);
      if (!row) return null;
      if (include?.answers) {
        if (!include.answers.include?.question) {
          throw new Error(
            `modeling gap: userSession.findUnique include ${JSON.stringify(include)} is not the answers.question shape used by GET app/api/sessions/[id]/route.ts`
          );
        }
        return { ...copySession(row), answers: answersFor(row.id) };
      }
      if (include) {
        throw new Error(
          `modeling gap: userSession.findUnique include ${JSON.stringify(include)} is not implemented`
        );
      }
      return copySession(row);
    },

    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) {
      const row = getMem().sessions.find((session) => session.id === where.id);
      if (!row) {
        throw new Error(`modeling gap: userSession.update missed ${where.id}`);
      }
      Object.assign(row, data);
      return copySession(row);
    },
  },

  userAnswer: {
    async findFirst({
      where,
    }: {
      where: { userSessionId?: string; questionId?: string };
    }) {
      const hook = getMem().findFirstHook;
      if (hook) await hook(where);
      const found = getMem().answers.find(
        (answer) =>
          (where.userSessionId === undefined || answer.userSessionId === where.userSessionId) &&
          (where.questionId === undefined || answer.questionId === where.questionId)
      );
      return found ? copyAnswer(found) : null;
    },

    async count({
      where,
    }: {
      where: { userSessionId: string; isCorrect?: boolean };
    }) {
      return getMem().answers.filter(
        (answer) =>
          answer.userSessionId === where.userSessionId &&
          (where.isCorrect === undefined || answer.isCorrect === where.isCorrect)
      ).length;
    },

    async create({ data }: { data: Record<string, unknown> }) {
      const userSessionId = String(data.userSessionId);
      const questionId = String(data.questionId);
      if (
        userAnswerPairIsUnique() &&
        getMem().answers.some(
          (answer) => answer.userSessionId === userSessionId && answer.questionId === questionId
        )
      ) {
        const error = new Error(
          'Unique constraint failed on the fields: (`userSessionId`,`questionId`)'
        ) as Error & { code: string };
        error.code = 'P2002';
        throw error;
      }
      const row: AnswerRow = {
        id: nextId('ans'),
        userSessionId,
        questionId,
        selectedAnswer: String(data.selectedAnswer),
        isCorrect: Boolean(data.isCorrect),
        answeredAt: new Date(),
      };
      getMem().answers.push(row);
      return copyAnswer(row);
    },
  },

  question: {
    async findUnique({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, boolean>;
    }) {
      const question = questionById(where.id);
      if (!question) return null;
      if (!select) return { ...question };
      return pickQuestion(question, select);
    },

    async findMany(args?: {
      where?: { domain?: string; id?: string | { in?: unknown } };
      orderBy?: { id?: string };
      select?: Record<string, boolean>;
      take?: number;
    }) {
      const where = args?.where;
      if (where) {
        const keys = Object.keys(where);
        if (keys.some((key) => key !== 'domain' && key !== 'id')) {
          throw new Error(
            `modeling gap: question.findMany where ${JSON.stringify(where)} is not implemented`
          );
        }
        if (where.id && typeof where.id === 'object') {
          const idKeys = Object.keys(where.id);
          if (idKeys.some((key) => key !== 'in') || !Array.isArray(where.id.in)) {
            throw new Error(
              `modeling gap: question.findMany where.id ${JSON.stringify(where.id)} is not implemented`
            );
          }
          if (where.id.in.some((id) => typeof id !== 'string')) {
            throw new Error('modeling gap: question.findMany where.id.in must be strings');
          }
        } else if (where.id !== undefined && typeof where.id !== 'string') {
          throw new Error(
            `modeling gap: question.findMany where.id ${JSON.stringify(where.id)} is not implemented`
          );
        }
      }
      if (args?.orderBy && args.orderBy.id !== 'asc') {
        throw new Error(
          `modeling gap: question.findMany orderBy ${JSON.stringify(args.orderBy)} is not implemented`
        );
      }

      let rows = getMem().questions.filter((question) => matchesQuestionWhere(question, where));
      if (args?.orderBy?.id === 'asc') {
        rows = [...rows].sort((a, b) => a.id.localeCompare(b.id));
      }
      if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
      return rows.map((question) =>
        args?.select ? pickQuestion(question, args.select) : { ...question }
      );
    },
  },
};

function matchesQuestionWhere(
  question: BankQuestion,
  where: { domain?: string; id?: string | { in?: unknown } } | undefined
): boolean {
  if (!where) return true;
  if (typeof where.domain === 'string' && question.domain !== where.domain) return false;
  if (typeof where.id === 'string' && question.id !== where.id) return false;
  if (where.id && typeof where.id === 'object' && Array.isArray(where.id.in)) {
    if (!where.id.in.includes(question.id)) return false;
  }
  return true;
}

function pickQuestion(question: BankQuestion, select: Record<string, boolean>) {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) picked[key] = (question as unknown as Record<string, unknown>)[key];
  }
  return picked;
}
