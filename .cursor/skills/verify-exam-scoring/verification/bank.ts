// Synthetic question bank for the scoring check.
// It is not data/questions.json and it is not selected by app/api/questions/route.ts.
// Forty rows (ten per domain) so a timed session of 40 and a practice session of 10
// can both be filled, and so a client can submit more correct answers than a
// practice session's questionCount.

export const DOMAINS = ['Build', 'Test', 'Deploy', 'Monitor'] as const;
export const LETTERS = ['A', 'B', 'C', 'D'] as const;

export type BankQuestion = {
  id: string;
  domain: (typeof DOMAINS)[number];
  difficulty: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: (typeof LETTERS)[number];
  justification: string;
  source: string;
};

export const BANK: BankQuestion[] = DOMAINS.flatMap((domain, domainIndex) =>
  Array.from({ length: 10 }, (_, index) => {
    const answer = LETTERS[(domainIndex + index) % LETTERS.length];
    const id = `${domain.toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
    return {
      id,
      domain,
      difficulty: 'medium',
      question: `${domain} question ${index + 1}`,
      optionA: 'option A',
      optionB: 'option B',
      optionC: 'option C',
      optionD: 'option D',
      answer,
      justification: `${id} justification`,
      source: 'verification-bank',
    };
  })
);

export function questionById(id: string): BankQuestion | undefined {
  return BANK.find((question) => question.id === id);
}
