import fc from 'fast-check';
import { BANK } from './bank';
import {
  assignedQuestionIds,
  onlySession,
  patchSession,
  postAnswer,
  postSession,
  storedAnswers,
  storedSessions,
  type CallResult,
} from './drive';
import {
  backdateSession,
  resetMem,
  setCurrentUserId,
  setFindFirstHook,
  userAnswerPairIsUnique,
} from './memory';
import {
  domainTotalSum,
  headline,
  headlinePercentage,
  renderResultsText,
  reviewCount,
} from './render-results';

export type PropertyKind = 'held' | 'spec';

export type PropertyResult = {
  id: string;
  kind: PropertyKind;
  ok: boolean;
  counterexample: string | null;
};

export const FAST_CHECK_SEED = 20261103;
export const FAST_CHECK_RUNS = 25;

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const PRACTICE_COUNTS = [10, 20, 40] as const;

function fail(message: string): never {
  throw new Error(message);
}

async function checkFast(
  property: ReturnType<typeof fc.asyncProperty>
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const run = await fc.check(property, {
    numRuns: FAST_CHECK_RUNS,
    seed: FAST_CHECK_SEED,
  });
  if (!run.failed) return { ok: true };
  if (run.errorInstance instanceof Error && run.errorInstance.message) {
    return { ok: false, detail: run.errorInstance.message };
  }
  if (run.counterexample !== null) {
    return { ok: false, detail: `counterexample ${fc.stringify(run.counterexample)}` };
  }
  return {
    ok: false,
    detail: `fast-check stopped before a counterexample (interrupted=${String(run.interrupted)}, skips=${run.numSkips})`,
  };
}

function result(
  id: string,
  kind: PropertyKind,
  checked: { ok: boolean; detail?: string }
): PropertyResult {
  return {
    id,
    kind,
    ok: checked.ok,
    counterexample: checked.ok ? null : (checked.detail ?? 'failed'),
  };
}

async function openPractice(questionCount: number): Promise<string> {
  const created = await postSession({
    mode: 'practice',
    domain: null,
    questionCount,
    timeLimit: null,
  });
  if (created.status !== 200 || typeof created.json.id !== 'string') {
    fail(
      `POST app/api/sessions/route.ts status ${created.status} for practice questionCount ${questionCount}: ${JSON.stringify(created.json)}`
    );
  }
  return created.json.id;
}

async function openTimed(): Promise<string> {
  const created = await postSession({
    mode: 'timed-exam',
    domain: null,
    questionCount: 40,
    timeLimit: 7200,
  });
  if (created.status !== 200 || typeof created.json.id !== 'string') {
    fail(
      `POST app/api/sessions/route.ts status ${created.status} for timed-exam questionCount 40: ${JSON.stringify(created.json)}`
    );
  }
  return created.json.id;
}

async function finish(sessionId: string, extra: Record<string, unknown> = {}): Promise<CallResult> {
  return patchSession(sessionId, {
    completedAt: new Date().toISOString(),
    correctCount: 999,
    ...extra,
  });
}

async function answerLetter(
  sessionId: string,
  questionId: string,
  selected: string,
  extra: Record<string, unknown> = {}
): Promise<CallResult> {
  return postAnswer({
    userSessionId: sessionId,
    questionId,
    selectedAnswer: selected,
    ...extra,
  });
}

export async function hIsCorrect(): Promise<PropertyResult> {
  const checked = await checkFast(
    fc.asyncProperty(
      fc.integer({ min: 0, max: BANK.length - 1 }),
      fc.constantFrom(...LETTERS),
      fc.boolean(),
      async (index, selected, clientIsCorrect) => {
        resetMem();
        const question = BANK[index];
        const sessionId = await openPractice(10);
        const answered = await answerLetter(sessionId, question.id, selected, {
          isCorrect: clientIsCorrect,
        });
        const row = storedAnswers()[0];
        const expected = selected === question.answer;
        if (answered.status !== 200 || !row || row.isCorrect !== expected) {
          fail(
            `POST app/api/answers/route.ts stored isCorrect=${String(row?.isCorrect)} for ${question.id} selectedAnswer=${selected} Question.answer=${question.answer} while the body sent isCorrect=${String(clientIsCorrect)}. HTTP ${answered.status} body ${JSON.stringify(answered.json)}.`
          );
        }
      }
    )
  );
  return result('H-ISCORRECT', 'held', checked);
}

export async function hCorrectCount(): Promise<PropertyResult> {
  const checked = await checkFast(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 8 }).chain((count) =>
        fc.tuple(
          fc.shuffledSubarray(
            Array.from({ length: BANK.length }, (_, index) => index),
            { minLength: count, maxLength: count }
          ),
          fc.array(fc.constantFrom(...LETTERS), { minLength: count, maxLength: count })
        )
      ),
      async ([indexes, letters]) => {
        resetMem();
        const sessionId = await openPractice(10);
        for (let i = 0; i < indexes.length; i += 1) {
          const question = BANK[indexes[i]];
          const answered = await answerLetter(sessionId, question.id, letters[i]);
          if (answered.status !== 200) {
            fail(
              `POST app/api/answers/route.ts rejected ${question.id} selectedAnswer=${letters[i]} with HTTP ${answered.status} before finish.`
            );
          }
        }
        const patched = await finish(sessionId);
        const expected = storedAnswers().filter((answer) => answer.isCorrect).length;
        const stored = onlySession().correctCount;
        if (patched.status !== 200 || stored !== expected || patched.json.correctCount !== expected) {
          fail(
            `PATCH app/api/sessions/[id]/route.ts wrote correctCount=${String(patched.json.correctCount)} (store ${stored}) after the body sent correctCount=999. Count of UserAnswer rows with isCorrect true is ${expected}. HTTP ${patched.status}.`
          );
        }
      }
    )
  );
  return result('H-CORRECTCOUNT', 'held', checked);
}

export async function hNoDoubleSequential(): Promise<PropertyResult> {
  const checked = await checkFast(
    fc.asyncProperty(
      fc.integer({ min: 0, max: BANK.length - 1 }),
      fc.constantFrom(...LETTERS),
      fc.constantFrom(...LETTERS),
      async (index, first, second) => {
        resetMem();
        const question = BANK[index];
        const sessionId = await openPractice(10);
        const firstResponse = await answerLetter(sessionId, question.id, first);
        const secondResponse = await answerLetter(sessionId, question.id, second);
        const rows = storedAnswers().filter((answer) => answer.questionId === question.id);
        if (firstResponse.status !== 200 || secondResponse.status !== 400 || rows.length !== 1) {
          fail(
            `Second POST app/api/answers/route.ts for ${question.id} on session ${sessionId} returned HTTP ${secondResponse.status} (first HTTP ${firstResponse.status}) and left ${rows.length} UserAnswer rows. The findFirst guard should reject the duplicate with 400 and keep the first selectedAnswer=${first}.`
          );
        }
        if (rows[0].selectedAnswer !== first) {
          fail(
            `Duplicate POST overwrote selectedAnswer from ${first} to ${rows[0].selectedAnswer} on ${question.id}.`
          );
        }
      }
    )
  );
  return result('H-NO-DOUBLE-SEQUENTIAL', 'held', checked);
}

export async function hOwner(): Promise<PropertyResult> {
  resetMem();
  const sessionId = await openPractice(10);
  const question = BANK[0];
  setCurrentUserId('user-2');
  const answered = await answerLetter(sessionId, question.id, question.answer);
  const patched = await finish(sessionId);
  const fetched = await (await import('./drive')).getSession(sessionId);
  const rows = storedAnswers().length;
  const correctCount = onlySession().correctCount;
  setCurrentUserId('user-1');
  const ownerStillCan = await answerLetter(sessionId, question.id, question.answer);
  const ok =
    answered.status === 403 &&
    rows === 0 &&
    patched.status === 404 &&
    correctCount === 0 &&
    fetched.status === 404 &&
    ownerStillCan.status === 200 &&
    storedAnswers().length === 1;
  if (ok) return result('H-OWNER', 'held', { ok: true });
  return result('H-OWNER', 'held', {
    ok: false,
    detail: `User user-2 called POST app/api/answers/route.ts (HTTP ${answered.status}, rows ${rows}), PATCH app/api/sessions/[id]/route.ts (HTTP ${patched.status}, correctCount ${correctCount}), and GET (HTTP ${fetched.status}) on user-1's session ${sessionId}. Owner retry HTTP ${ownerStillCan.status}, rows ${storedAnswers().length}. Expected 403, no row, 404, correctCount 0, then owner 200.`,
  });
}

export async function hOverallScore(): Promise<PropertyResult> {
  const explicit = await explicitOverallCases();
  if (!explicit.ok) return result('H-OVERALL-SCORE', 'held', explicit);

  const checked = await checkFast(
    fc.asyncProperty(
      fc.constantFrom(10, 20, 40),
      fc.integer({ min: 0, max: 6 }),
      fc.integer({ min: 0, max: 6 }),
      async (questionCount, correct, wrong) => {
        resetMem();
        const wrongCount = Math.min(wrong, 6);
        const correctCount = Math.min(correct, 6);
        const sessionId = await openPractice(questionCount);
        for (let i = 0; i < correctCount; i += 1) {
          const question = BANK[i];
          const answered = await answerLetter(sessionId, question.id, question.answer);
          if (answered.status !== 200) {
            fail(`setup answer ${question.id} HTTP ${answered.status}`);
          }
        }
        for (let i = 0; i < wrongCount; i += 1) {
          const question = BANK[10 + i];
          const wrongLetter = LETTERS.find((letter) => letter !== question.answer) ?? 'A';
          const answered = await answerLetter(sessionId, question.id, wrongLetter);
          if (answered.status !== 200) {
            fail(`setup answer ${question.id} HTTP ${answered.status}`);
          }
        }
        const patched = await finish(sessionId);
        if (patched.status !== 200) fail(`PATCH HTTP ${patched.status}`);
        const storedCorrect = onlySession().correctCount;
        const text = await renderResultsText(sessionId);
        const shown = headline(text);
        const percentNode = headlinePercentage(text);
        const expectedPercent = `${Math.round((storedCorrect / questionCount) * 100)}%`;
        if (
          storedCorrect !== correctCount ||
          !shown ||
          shown.correct !== storedCorrect ||
          shown.total !== questionCount ||
          percentNode !== expectedPercent
        ) {
          fail(
            `ResultsPage showed "${shown?.correct} correct out of ${shown?.total}" and ${percentNode} for practice questionCount ${questionCount} with ${correctCount} correct UserAnswer rows and ${wrongCount} incorrect ones (${questionCount - correctCount - wrongCount} unanswered). Store correctCount=${storedCorrect}. Expected ${storedCorrect} correct out of ${questionCount} and ${expectedPercent}. Unanswered questions stay in the denominator.`
          );
        }
      }
    )
  );
  return result('H-OVERALL-SCORE', 'held', checked);
}

async function explicitOverallCases(): Promise<{ ok: true } | { ok: false; detail: string }> {
  const cases: Array<{ label: string; run: () => Promise<void> }> = [
    {
      label: 'timed 28/40 passes',
      run: async () => {
        resetMem();
        const sessionId = await openTimed();
        for (let i = 0; i < 28; i += 1) {
          const question = BANK[i];
          const answered = await answerLetter(sessionId, question.id, question.answer);
          if (answered.status !== 200) fail(`answer ${question.id} HTTP ${answered.status}`);
        }
        await finish(sessionId);
        const text = await renderResultsText(sessionId);
        const shown = headline(text);
        if (
          onlySession().correctCount !== 28 ||
          !shown ||
          shown.correct !== 28 ||
          shown.total !== 40 ||
          headlinePercentage(text) !== '70%' ||
          !text.includes('You passed the exam!')
        ) {
          fail(
            `Timed 28 correct out of questionCount 40 rendered "${shown?.correct} correct out of ${shown?.total}" ${headlinePercentage(text)}. Pass copy present=${text.includes('You passed the exam!')}. Expected 70% and "You passed the exam!".`
          );
        }
      },
    },
    {
      label: 'timed 27/40 fails',
      run: async () => {
        resetMem();
        const sessionId = await openTimed();
        for (let i = 0; i < 27; i += 1) {
          const question = BANK[i];
          const answered = await answerLetter(sessionId, question.id, question.answer);
          if (answered.status !== 200) fail(`answer ${question.id} HTTP ${answered.status}`);
        }
        await finish(sessionId);
        const text = await renderResultsText(sessionId);
        const shown = headline(text);
        if (
          !shown ||
          shown.correct !== 27 ||
          shown.total !== 40 ||
          headlinePercentage(text) !== '68%' ||
          !text.includes('You need 70% to pass')
        ) {
          fail(
            `Timed 27 correct out of questionCount 40 rendered "${shown?.correct} correct out of ${shown?.total}" ${headlinePercentage(text)}. Expected 68% (Math.round(27/40*100)) and "You need 70% to pass".`
          );
        }
      },
    },
  ];
  try {
    for (const entry of cases) await entry.run();
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fQuestionCount(): Promise<PropertyResult> {
  const canonical = await canonicalQuestionCount();
  if (!canonical.ok) return result('F-QUESTIONCOUNT', 'spec', canonical);
  const checked = await checkFast(
    fc.asyncProperty(
      fc.constantFrom('timed-exam', 'practice'),
      fc.integer({ min: -2, max: 80 }),
      async (mode, questionCount) => {
        resetMem();
        const created = await postSession({
          mode,
          domain: null,
          questionCount,
          timeLimit: mode === 'timed-exam' ? 7200 : null,
        });
        const legal =
          mode === 'timed-exam' ? questionCount === 40 : PRACTICE_COUNTS.includes(questionCount as 10 | 20 | 40);
        const stored = storedSessions()[0];
        if (legal) {
          if (created.status >= 400 || !stored || stored.questionCount !== questionCount) {
            fail(
              `Legal ${mode} questionCount ${questionCount} was not stored. HTTP ${created.status} stored ${String(stored?.questionCount)}.`
            );
          }
          return;
        }
        const keptIllegal = stored?.questionCount === questionCount && created.status < 400;
        const coerced =
          created.status < 400 &&
          stored &&
          (mode === 'timed-exam'
            ? stored.questionCount === 40
            : PRACTICE_COUNTS.includes(stored.questionCount as 10 | 20 | 40));
        const rejected = created.status >= 400 && !stored;
        if (keptIllegal || (!coerced && !rejected)) {
          fail(
            `POST app/api/sessions/route.ts stored mode=${mode} questionCount=${String(stored?.questionCount)} from client questionCount=${questionCount}. HTTP ${created.status}. Timed sessions must persist 40 and practice sessions must persist 10, 20, or 40; reject or coerce anything else.`
          );
        }
      }
    )
  );
  return result('F-QUESTIONCOUNT', 'spec', checked);
}

async function canonicalQuestionCount(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const created = await postSession({
      mode: 'timed-exam',
      domain: null,
      questionCount: 1,
      timeLimit: 7200,
    });
    const stored = storedSessions()[0];
    const acceptedIllegal = created.status < 400 && stored?.questionCount === 1;
    if (!acceptedIllegal) return { ok: true };
    const question = BANK[0];
    const sessionId = String(created.json.id);
    await answerLetter(sessionId, question.id, question.answer);
    await finish(sessionId);
    const text = await renderResultsText(sessionId);
    fail(
      `POST /api/sessions { mode: "timed-exam", questionCount: 1, timeLimit: 7200 } returned HTTP ${created.status} and stored questionCount ${stored.questionCount}. One correct POST /api/answers for ${question.id}, then PATCH finish, made ResultsPage show ${headlinePercentage(text)} and "${headline(text)?.correct} correct out of ${headline(text)?.total}". Pass copy present=${text.includes('You passed the exam!')}. A timed exam is 40 questions; 70% of 1 is not 70% of 40.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('POST /api/sessions')) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fNoAnswerAfterFinish(): Promise<PropertyResult> {
  const canonical = await canonicalAnswerAfterFinish();
  if (!canonical.ok) return result('F-NO-ANSWER-AFTER-FINISH', 'spec', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.boolean(), async (closeFirst) => {
      resetMem();
      const sessionId = await openPractice(10);
      const first = await answerLetter(sessionId, BANK[0].id, BANK[0].answer);
      if (first.status !== 200) fail(`first answer HTTP ${first.status}`);
      if (closeFirst) {
        const patched = await finish(sessionId);
        if (patched.status !== 200) fail(`PATCH HTTP ${patched.status}`);
      }
      const second = await answerLetter(sessionId, BANK[1].id, BANK[1].answer);
      const rows = storedAnswers().length;
      if (!closeFirst) {
        if (second.status !== 200 || rows !== 2) {
          fail(
            `A second distinct question before finish was rejected (HTTP ${second.status}, rows ${rows}). That path has to stay open.`
          );
        }
        return;
      }
      if (second.status < 400 || rows !== 1) {
        fail(
          `After PATCH set completedAt, POST app/api/answers/route.ts for ${BANK[1].id} returned HTTP ${second.status} and the session has ${rows} UserAnswer rows. An answer after finish must be rejected and must not change the stored score.`
        );
      }
    })
  );
  return result('F-NO-ANSWER-AFTER-FINISH', 'spec', checked);
}

async function canonicalAnswerAfterFinish(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    const first = await answerLetter(sessionId, BANK[0].id, BANK[0].answer);
    const closed = await finish(sessionId);
    const correctAfterClose = onlySession().correctCount;
    const second = await answerLetter(sessionId, BANK[1].id, BANK[1].answer);
    if (second.status >= 400 && storedAnswers().length === 1) return { ok: true };
    const reopened = await finish(sessionId);
    fail(
      `Practice session ${sessionId}: POST /api/answers ${BANK[0].id} HTTP ${first.status}, PATCH finish HTTP ${closed.status} stored correctCount ${correctAfterClose} (body correctCount 999 ignored). Then POST /api/answers ${BANK[1].id} HTTP ${second.status}. A second PATCH HTTP ${reopened.status} stored correctCount ${onlySession().correctCount}. Rows=${storedAnswers().length}. Finish now must close answering; the later answer was scored.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Practice session')) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fNoAnswerAfterExpiry(): Promise<PropertyResult> {
  const canonical = await canonicalExpiry();
  if (!canonical.ok) return result('F-NO-ANSWER-AFTER-EXPIRY', 'spec', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.boolean(), fc.boolean(), async (timed, expired) => {
      resetMem();
      const sessionId = timed ? await openTimed() : await openPractice(10);
      if (expired) backdateSession(sessionId, timed ? 7201 : 86400);
      const question = BANK[0];
      const answered = await answerLetter(sessionId, question.id, question.answer);
      const rows = storedAnswers().length;
      if (!timed || !expired) {
        if (answered.status !== 200 || rows !== 1) {
          fail(
            `${timed ? 'timed' : 'practice'} session ${expired ? 'backdated' : 'fresh'} rejected ${question.id} with HTTP ${answered.status}. Only a timed session past startedAt + timeLimit must reject.`
          );
        }
        return;
      }
      if (answered.status < 400 || rows !== 0) {
        fail(
          `Timed session ${sessionId} with timeLimit 7200 and startedAt 7201 seconds ago accepted POST /api/answers for ${question.id} (HTTP ${answered.status}, rows ${rows}). Expiry is only the client timer in ExamPage; the answer route never reads startedAt or timeLimit.`
        );
      }
    })
  );
  return result('F-NO-ANSWER-AFTER-EXPIRY', 'spec', checked);
}

async function canonicalExpiry(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openTimed();
    backdateSession(sessionId, 7201);
    const question = BANK[0];
    const answered = await answerLetter(sessionId, question.id, question.answer);
    if (answered.status >= 400 && storedAnswers().length === 0) return { ok: true };
    const patched = await finish(sessionId);
    fail(
      `POST /api/sessions timed-exam questionCount 40 timeLimit 7200, then startedAt moved 7201 seconds back (the row's startedAt + timeLimit is in the past). POST /api/answers ${question.id} returned HTTP ${answered.status} and stored isCorrect=${String(storedAnswers()[0]?.isCorrect)}. PATCH then stored correctCount ${onlySession().correctCount} (HTTP ${patched.status}). The server still scored the answer after the 120 minute limit.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('POST /api/sessions timed-exam')) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fNoConcurrentDouble(): Promise<PropertyResult> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    const question = BANK[0];
    let arrived = 0;
    let openBarrier: () => void = () => {};
    const opened = new Promise<void>((resolve) => {
      openBarrier = resolve;
    });
    setFindFirstHook(async () => {
      arrived += 1;
      if (arrived >= 2) openBarrier();
      await Promise.race([
        opened,
        new Promise<void>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'overlap-timeout: POST app/api/answers/route.ts did not await userAnswer.findFirst twice before either create. The overlap hook is the await gap in that handler; if the check moved, update the hook and treat a timeout as a modeling gap until you do.'
                )
              ),
            1000
          );
        }),
      ]);
    });
    const body = {
      userSessionId: sessionId,
      questionId: question.id,
      selectedAnswer: question.answer,
    };
    const [first, second] = await Promise.all([postAnswer(body), postAnswer(body)]);
    setFindFirstHook(null);
    const rows = storedAnswers().filter((answer) => answer.questionId === question.id);
    const successes = [first.status, second.status].filter((status) => status === 200).length;
    if (rows.length === 1 && successes <= 1) {
      return result('F-NO-CONCURRENT-DOUBLE', 'spec', { ok: true });
    }
    return result('F-NO-CONCURRENT-DOUBLE', 'spec', {
      ok: false,
      detail: `Two overlapping POST /api/answers for ${question.id} on session ${sessionId} both passed findFirst before either create. Statuses ${first.status} and ${second.status}. Stored UserAnswer rows for that question: ${rows.length}. userAnswerPairIsUnique()=${String(userAnswerPairIsUnique())} (prisma/schema.prisma model UserAnswer has no @@unique([userSessionId, questionId])). Both rows are isCorrect=${String(rows.every((row) => row.isCorrect))}, so a later PATCH count would add ${rows.filter((row) => row.isCorrect).length} to correctCount for one question.`,
    });
  } catch (error) {
    setFindFirstHook(null);
    return result('F-NO-CONCURRENT-DOUBLE', 'spec', {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function fAssignedSet(): Promise<PropertyResult> {
  try {
    resetMem();
    const created = await postSession({
      mode: 'practice',
      domain: null,
      questionCount: 10,
      timeLimit: null,
    });
    if (created.status !== 200 || typeof created.json.id !== 'string') {
      fail(`POST /api/sessions HTTP ${created.status} ${JSON.stringify(created.json)}`);
    }
    const sessionId = created.json.id;
    const pinned = assignedQuestionIds(created.json, storedSessions()[0]);
    const outsider =
      BANK.find((question) => !pinned.includes(question.id)) ??
      fail('modeling gap: the bank has no question outside the pinned set');
    const answered = await answerLetter(sessionId, outsider.id, outsider.answer);
    const pinnedOk = pinned.length === 10 && new Set(pinned).size === 10;
    const outsiderRejected = answered.status >= 400 && !storedAnswers().some((row) => row.questionId === outsider.id);
    if (pinnedOk && outsiderRejected) {
      return result('F-ASSIGNED-SET', 'spec', { ok: true });
    }
    return result('F-ASSIGNED-SET', 'spec', {
      ok: false,
      detail: `POST /api/sessions { mode: "practice", questionCount: 10 } HTTP ${created.status} response keys [${Object.keys(created.json).join(', ')}] pinned ${pinned.length} question ids. POST /api/answers questionId ${outsider.id} (a bank question${pinned.includes(outsider.id) ? ' in that list' : ' not in that list'}) returned HTTP ${answered.status} and stored ${storedAnswers().length} row(s). The session does not record the questions that count, so the client chooses the numerator.`,
    });
  } catch (error) {
    return result('F-ASSIGNED-SET', 'spec', {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function fScoreBounded(): Promise<PropertyResult> {
  const canonical = await canonicalScoreBound();
  if (!canonical.ok) return result('F-SCORE-BOUNDED', 'spec', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.integer({ min: 11, max: 16 }), async (answers) => {
      resetMem();
      const sessionId = await openPractice(10);
      for (let i = 0; i < answers; i += 1) {
        const question = BANK[i];
        const answered = await answerLetter(sessionId, question.id, question.answer);
        if (answered.status !== 200) {
          fail(`answer ${i + 1} ${question.id} HTTP ${answered.status}`);
        }
      }
      const patched = await finish(sessionId);
      const text = await renderResultsText(sessionId);
      const shown = headline(text);
      const stored = onlySession().correctCount;
      if (patched.status !== 200 || stored > 10 || (shown && shown.correct > shown.total)) {
        fail(
          `Practice questionCount 10 accepted ${answers} correct answers. PATCH stored correctCount ${stored}. ResultsPage showed "${shown?.correct} correct out of ${shown?.total}" ${headlinePercentage(text)}.`
        );
      }
    })
  );
  return result('F-SCORE-BOUNDED', 'spec', checked);
}

async function canonicalScoreBound(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    for (let i = 0; i < 11; i += 1) {
      const question = BANK[i];
      const answered = await answerLetter(sessionId, question.id, question.answer);
      if (answered.status !== 200) fail(`answer ${question.id} HTTP ${answered.status} ${JSON.stringify(answered.json)}`);
    }
    await finish(sessionId);
    const text = await renderResultsText(sessionId);
    const shown = headline(text);
    const stored = onlySession().correctCount;
    if (stored <= 10 && shown && shown.correct <= shown.total) return { ok: true };
    fail(
      `POST /api/sessions practice questionCount 10, then 11 correct POST /api/answers (${BANK.slice(0, 11).map((question) => question.id).join(', ')}). PATCH app/api/sessions/[id]/route.ts counted correctCount ${stored}. ResultsPage showed ${headlinePercentage(text)} and "${shown?.correct} correct out of ${shown?.total}". correctCount is not capped by questionCount.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('POST /api/sessions practice')) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fDomainReview(): Promise<PropertyResult> {
  const canonical = await canonicalDomainReview();
  if (!canonical.ok) return result('F-DOMAIN-REVIEW', 'spec', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.integer({ min: 0, max: 9 }), async (answeredCount) => {
      resetMem();
      const sessionId = await openPractice(10);
      for (let i = 0; i < answeredCount; i += 1) {
        const question = BANK[i];
        const answered = await answerLetter(sessionId, question.id, question.answer);
        if (answered.status !== 200) fail(`answer ${question.id} HTTP ${answered.status}`);
      }
      await finish(sessionId);
      const text = await renderResultsText(sessionId);
      const domains = domainTotalSum(text);
      const reviews = reviewCount(text);
      if (domains !== 10 || reviews !== 10) {
        fail(
          `Finish now on practice questionCount 10 with ${answeredCount} answers. ResultsPage domain totals sum to ${domains} and the review lists ${reviews} "Your answer:" rows. Both must equal questionCount 10, with each unanswered question counted wrong in its domain.`
        );
      }
    })
  );
  return result('F-DOMAIN-REVIEW', 'spec', checked);
}

async function canonicalDomainReview(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    const question = BANK[0];
    await answerLetter(sessionId, question.id, question.answer);
    await finish(sessionId);
    const text = await renderResultsText(sessionId);
    const domains = domainTotalSum(text);
    const reviews = reviewCount(text);
    const shown = headline(text);
    if (domains === 10 && reviews === 10) return { ok: true };
    fail(
      `Finish now: practice questionCount 10, one correct answer ${question.id} (${question.domain}), nine unanswered. ResultsPage headline "${shown?.correct} correct out of ${shown?.total}" ${headlinePercentage(text)} (the ratio counts the nine as wrong). Domain totals sum to ${domains} (the only row is ${question.domain}). Review lists ${reviews} question(s). Per-domain totals and the per-question review only include answered questions, so they do not sum to questionCount.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Finish now:')) {
      return { ok: false, detail: error.message };
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function runAllProperties(): Promise<PropertyResult[]> {
  const runners = [
    hIsCorrect,
    hCorrectCount,
    hNoDoubleSequential,
    hOwner,
    hOverallScore,
    fQuestionCount,
    fNoAnswerAfterFinish,
    fNoAnswerAfterExpiry,
    fNoConcurrentDouble,
    fAssignedSet,
    fScoreBounded,
    fDomainReview,
  ];
  const results: PropertyResult[] = [];
  for (const run of runners) {
    results.push(await run());
  }
  return results;
}
