import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TIMED_EXAM_LIMIT_SECONDS,
  TIMED_EXAM_QUESTION_COUNT,
  buildExamReview,
  capCorrectCount,
  isTimedSessionExpired,
  isUniqueConstraintError,
  planSessionCreate,
  scorePercentage,
  tallyDomains,
  type QuestionRef,
} from './session-rules';

function bank(perDomain: number): QuestionRef[] {
  return ['Build', 'Test', 'Deploy', 'Monitor'].flatMap((domain) =>
    Array.from({ length: perDomain }, (_, index) => ({
      id: `${domain.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
      domain,
    }))
  );
}

describe('planSessionCreate', () => {
  const questions = bank(12);

  it('forces a timed exam to 40 questions and 120 minutes', () => {
    const plan = planSessionCreate({
      mode: 'timed-exam',
      domain: 'Build',
      questionCount: 1,
      timeLimit: 60,
      questions,
      random: () => 0.5,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.questionCount).toBe(TIMED_EXAM_QUESTION_COUNT);
    expect(plan.questionIds).toHaveLength(40);
    expect(new Set(plan.questionIds).size).toBe(40);
    expect(plan.timeLimit).toBe(TIMED_EXAM_LIMIT_SECONDS);
    expect(plan.domain).toBeNull();
    const perDomain = plan.questionIds.reduce(
      (acc, id) => {
        const domain = id.split('-')[0];
        acc[domain] = (acc[domain] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    expect(perDomain).toEqual({ BUILD: 10, TEST: 10, DEPLOY: 10, MONITOR: 10 });
  });

  it('stores legal practice counts as sent', () => {
    for (const questionCount of [10, 20, 40]) {
      const plan = planSessionCreate({
        mode: 'practice',
        domain: null,
        questionCount,
        timeLimit: null,
        questions,
        random: () => 0.25,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.questionCount).toBe(questionCount);
      expect(plan.questionIds).toHaveLength(questionCount);
      expect(new Set(plan.questionIds).size).toBe(questionCount);
      expect(plan.timeLimit).toBeNull();
    }
  });

  it('clamps practice questionCount to the questions that exist', () => {
    const low = planSessionCreate({
      mode: 'practice',
      domain: 'mixed',
      questionCount: -2,
      timeLimit: null,
      questions,
      random: () => 0.1,
    });
    const high = planSessionCreate({
      mode: 'practice',
      domain: null,
      questionCount: 80,
      timeLimit: 15,
      questions,
      random: () => 0.1,
    });
    expect(low.ok && low.questionCount).toBe(1);
    expect(high.ok && high.questionCount).toBe(questions.length);
    expect(high.ok && high.timeLimit).toBe(15);
  });

  it('clamps a single-domain practice session to that domain', () => {
    const plan = planSessionCreate({
      mode: 'practice',
      domain: 'Test',
      questionCount: 100,
      timeLimit: null,
      questions,
      random: () => 0.3,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.domain).toBe('Test');
    expect(plan.questionCount).toBe(12);
    expect(plan.questionIds.every((id) => id.startsWith('TEST-'))).toBe(true);
  });

  it('rejects unknown modes and domains without a plan', () => {
    expect(
      planSessionCreate({
        mode: 'speedrun',
        domain: null,
        questionCount: 10,
        timeLimit: null,
        questions,
      })
    ).toEqual({ ok: false, error: 'Unknown exam mode' });
    expect(
      planSessionCreate({
        mode: 'practice',
        domain: 'Security',
        questionCount: 10,
        timeLimit: null,
        questions,
      })
    ).toEqual({ ok: false, error: 'Unknown domain' });
  });

  it('rejects a timed exam when a domain cannot fill 10 questions', () => {
    const plan = planSessionCreate({
      mode: 'timed-exam',
      domain: null,
      questionCount: 40,
      timeLimit: 7200,
      questions: bank(9),
    });
    expect(plan).toEqual({ ok: false, error: 'Not enough questions to start a timed exam' });
  });
});

describe('answer window and score caps', () => {
  const started = new Date('2026-01-01T00:00:00.000Z');

  it('expires a timed session at startedAt + timeLimit and not before', () => {
    const session = { mode: 'timed-exam', startedAt: started, timeLimit: 7200 };
    expect(isTimedSessionExpired(session, started.getTime() + 7200 * 1000 - 1)).toBe(false);
    expect(isTimedSessionExpired(session, started.getTime() + 7200 * 1000)).toBe(true);
  });

  it('does not expire practice sessions', () => {
    expect(
      isTimedSessionExpired(
        { mode: 'practice', startedAt: started, timeLimit: 10 },
        started.getTime() + 60_000
      )
    ).toBe(false);
  });

  it('caps correctCount and the percentage at the session total', () => {
    expect(capCorrectCount(11, 10)).toBe(10);
    expect(capCorrectCount(4, 10)).toBe(4);
    expect(scorePercentage(11, 10)).toBe(100);
    expect(scorePercentage(28, 40)).toBe(70);
    expect(scorePercentage(27, 40)).toBe(68);
    expect(scorePercentage(1, 0)).toBe(0);
  });

  it('recognizes a Prisma unique violation', () => {
    expect(isUniqueConstraintError(Object.assign(new Error('dup'), { code: 'P2002' }))).toBe(true);
    expect(isUniqueConstraintError(new Error('nope'))).toBe(false);
  });
});

describe('results review', () => {
  it('counts every pinned question, with unanswered questions wrong', () => {
    const questions = bank(1).slice(0, 4).map((question) => ({
      ...question,
      question: question.id,
      answer: 'A',
      justification: 'because',
      source: 'bank',
    }));
    const answers = [
      {
        id: 'ans-1',
        questionId: questions[0].id,
        selectedAnswer: 'A',
        isCorrect: true,
        question: questions[0],
      },
    ];
    const review = buildExamReview(questions, answers);
    expect(review).toHaveLength(4);
    expect(review.filter((row) => row.unanswered)).toHaveLength(3);
    expect(review.filter((row) => !row.isCorrect)).toHaveLength(3);
    const domains = tallyDomains(
      review.map((row) => ({ isCorrect: row.isCorrect, domain: row.question.domain }))
    );
    const total = Object.values(domains).reduce((sum, stats) => sum + stats.total, 0);
    const correct = Object.values(domains).reduce((sum, stats) => sum + stats.correct, 0);
    expect(total).toBe(4);
    expect(correct).toBe(1);
  });
});

describe('scoring migration', () => {
  it('dedupes answer rows before adding the unique index', () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        'prisma/migrations/20261103230000_pin_session_questions_and_unique_answers/migration.sql'
      ),
      'utf8'
    );
    const dedupeAt = migration.indexOf('DELETE FROM "UserAnswer"');
    const uniqueAt = migration.indexOf(
      'CREATE UNIQUE INDEX "UserAnswer_userSessionId_questionId_key"'
    );
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(uniqueAt).toBeGreaterThan(dedupeAt);
    expect(migration).toContain('ADD COLUMN "questionIds"');
  });

  it('declares the pinned ids and the answer uniqueness in the schema', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('questionIds');
    expect(schema).toContain('@@unique([userSessionId, questionId])');
  });
});
