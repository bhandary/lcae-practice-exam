import { describe, it, expect } from 'vitest';

// Test utilities for question selection and scoring

interface Question {
  id: string;
  domain: string;
  difficulty: string;
}

// Domain filtering utility
export function filterByDomain(questions: Question[], domain: string | null): Question[] {
  if (!domain) return questions;
  return questions.filter((q) => q.domain === domain);
}

// Random selection without duplicates
export function selectRandomQuestions(questions: Question[], count: number): Question[] {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, questions.length));
}

// Timed exam mix: 10 questions per domain
export function selectTimedExamQuestions(questions: Question[]): Question[] {
  const domains = ['Build', 'Test', 'Deploy', 'Monitor'];
  const questionsPerDomain = 10;

  const selectedQuestions = domains.flatMap((domain) => {
    const domainQuestions = questions.filter((q) => q.domain === domain);
    return selectRandomQuestions(domainQuestions, questionsPerDomain);
  });

  return selectedQuestions.sort(() => Math.random() - 0.5);
}

// Calculate pass/fail for timed exam
export function isTimedExamPassed(correctCount: number, totalQuestions: number): boolean {
  const percentage = (correctCount / totalQuestions) * 100;
  return percentage >= 70;
}

// Calculate score percentage
export function calculatePercentage(correctCount: number, totalQuestions: number): number {
  if (totalQuestions === 0) return 0;
  return Math.round((correctCount / totalQuestions) * 100);
}

// Domain breakdown
export function getDomainBreakdown(
  answers: Array<{ isCorrect: boolean; question: { domain: string } }>
): Record<string, { total: number; correct: number }> {
  return answers.reduce((acc, answer) => {
    const domain = answer.question.domain;
    if (!acc[domain]) {
      acc[domain] = { total: 0, correct: 0 };
    }
    acc[domain].total++;
    if (answer.isCorrect) {
      acc[domain].correct++;
    }
    return acc;
  }, {} as Record<string, { total: number; correct: number }>);
}

// Tests
describe('Question Selection', () => {
  const mockQuestions: Question[] = [
    { id: 'BUILD-001', domain: 'Build', difficulty: 'easy' },
    { id: 'BUILD-002', domain: 'Build', difficulty: 'medium' },
    { id: 'BUILD-003', domain: 'Build', difficulty: 'hard' },
    { id: 'TEST-001', domain: 'Test', difficulty: 'easy' },
    { id: 'TEST-002', domain: 'Test', difficulty: 'medium' },
    { id: 'DEPLOY-001', domain: 'Deploy', difficulty: 'easy' },
    { id: 'DEPLOY-002', domain: 'Deploy', difficulty: 'medium' },
    { id: 'MONITOR-001', domain: 'Monitor', difficulty: 'easy' },
    { id: 'MONITOR-002', domain: 'Monitor', difficulty: 'medium' },
  ];

  it('should filter questions by domain', () => {
    const buildQuestions = filterByDomain(mockQuestions, 'Build');
    expect(buildQuestions).toHaveLength(3);
    expect(buildQuestions.every((q) => q.domain === 'Build')).toBe(true);
  });

  it('should return all questions when domain is null', () => {
    const allQuestions = filterByDomain(mockQuestions, null);
    expect(allQuestions).toHaveLength(mockQuestions.length);
  });

  it('should select requested number of questions without duplicates', () => {
    const selected = selectRandomQuestions(mockQuestions, 5);
    expect(selected).toHaveLength(5);

    const ids = selected.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5); // No duplicates
  });

  it('should not exceed available questions', () => {
    const selected = selectRandomQuestions(mockQuestions, 100);
    expect(selected).toHaveLength(mockQuestions.length);
  });

  it('should create balanced timed exam mix', () => {
    const expandedMock: Question[] = [];
    ['Build', 'Test', 'Deploy', 'Monitor'].forEach((domain) => {
      for (let i = 0; i < 15; i++) {
        expandedMock.push({
          id: `${domain.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
          domain,
          difficulty: 'medium',
        });
      }
    });

    const examQuestions = selectTimedExamQuestions(expandedMock);

    expect(examQuestions).toHaveLength(40);

    const domainCounts = examQuestions.reduce((acc, q) => {
      acc[q.domain] = (acc[q.domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(domainCounts['Build']).toBe(10);
    expect(domainCounts['Test']).toBe(10);
    expect(domainCounts['Deploy']).toBe(10);
    expect(domainCounts['Monitor']).toBe(10);

    const ids = examQuestions.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(40); // No duplicates
  });
});

describe('Scoring', () => {
  it('should calculate percentage correctly', () => {
    expect(calculatePercentage(7, 10)).toBe(70);
    expect(calculatePercentage(28, 40)).toBe(70);
    expect(calculatePercentage(35, 40)).toBe(88);
    expect(calculatePercentage(0, 10)).toBe(0);
    expect(calculatePercentage(10, 10)).toBe(100);
  });

  it('should handle zero questions', () => {
    expect(calculatePercentage(0, 0)).toBe(0);
  });

  it('should determine pass/fail at 70% threshold', () => {
    expect(isTimedExamPassed(28, 40)).toBe(true); // Exactly 70%
    expect(isTimedExamPassed(27, 40)).toBe(false); // Just under 70%
    expect(isTimedExamPassed(35, 40)).toBe(true); // Above 70%
    expect(isTimedExamPassed(0, 40)).toBe(false);
    expect(isTimedExamPassed(40, 40)).toBe(true);
  });

  it('should calculate domain breakdown correctly', () => {
    const answers = [
      { isCorrect: true, question: { domain: 'Build' } },
      { isCorrect: false, question: { domain: 'Build' } },
      { isCorrect: true, question: { domain: 'Build' } },
      { isCorrect: true, question: { domain: 'Test' } },
      { isCorrect: true, question: { domain: 'Test' } },
    ];

    const breakdown = getDomainBreakdown(answers);

    expect(breakdown['Build']).toEqual({ total: 3, correct: 2 });
    expect(breakdown['Test']).toEqual({ total: 2, correct: 2 });
  });
});
