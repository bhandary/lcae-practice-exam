import fc from 'fast-check';
import { BANK, questionById } from './bank';
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

function pinnedIds(): string[] {
  const ids = assignedQuestionIds({}, onlySession());
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    fail(
      `modeling gap: assignedQuestionIds found [${ids.join(', ')}] on the stored session. POST app/api/sessions/route.ts should persist questionIds.`
    );
  }
  return ids;
}

function questionFromPin(index: number) {
  const ids = pinnedIds();
  const id = ids[index % ids.length];
  const question = questionById(id);
  if (!question) {
    fail(`modeling gap: pinned id ${id} is not in the verification bank`);
  }
  return question;
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
  const pinned = assignedQuestionIds(created.json, storedSessions()[0]);
  if (pinned.length !== questionCount || new Set(pinned).size !== pinned.length) {
    fail(
      `modeling gap: practice questionCount ${questionCount} pinned [${pinned.join(', ')}]. The session must pin that many distinct question ids.`
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
  const pinned = assignedQuestionIds(created.json, storedSessions()[0]);
  const pinnedSet = new Set(pinned);
  if (pinned.length !== 40 || pinnedSet.size !== 40) {
    fail(`modeling gap: timed session pinned ${pinned.length} ids, expected 40 distinct.`);
  }
  for (const question of BANK) {
    if (!pinnedSet.has(question.id)) {
      fail(`modeling gap: timed session did not pin ${question.id}`);
    }
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
      fc.integer({ min: 0, max: 9 }),
      fc.constantFrom(...LETTERS),
      fc.boolean(),
      async (index, selected, clientIsCorrect) => {
        resetMem();
        const sessionId = await openPractice(10);
        const question = questionFromPin(index);
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
          fc.constant(count),
          fc.array(fc.constantFrom(...LETTERS), { minLength: count, maxLength: count })
        )
      ),
      async ([count, letters]) => {
        resetMem();
        const sessionId = await openPractice(10);
        const ids = pinnedIds();
        if (ids.length < count) {
          fail(`modeling gap: practice session pinned ${ids.length} ids, needed ${count}`);
        }
        for (let i = 0; i < count; i += 1) {
          const question = questionById(ids[i]);
          if (!question) fail(`modeling gap: pinned id ${ids[i]} is not in the verification bank`);
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
      fc.integer({ min: 0, max: 9 }),
      fc.constantFrom(...LETTERS),
      fc.constantFrom(...LETTERS),
      async (index, first, second) => {
        resetMem();
        const sessionId = await openPractice(10);
        const question = questionFromPin(index);
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
  const question = questionFromPin(0);
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
        const ids = pinnedIds();
        const correctN = Math.min(correctCount, ids.length);
        const wrongN = Math.min(wrongCount, Math.max(0, ids.length - correctN));
        for (let i = 0; i < correctN; i += 1) {
          const question = questionById(ids[i]);
          if (!question) fail(`modeling gap: pinned id ${ids[i]} is not in the verification bank`);
          const answered = await answerLetter(sessionId, question.id, question.answer);
          if (answered.status !== 200) {
            fail(`setup answer ${question.id} HTTP ${answered.status}`);
          }
        }
        for (let i = 0; i < wrongN; i += 1) {
          const question = questionById(ids[correctN + i]);
          if (!question) {
            fail(`modeling gap: pinned id ${ids[correctN + i]} is not in the verification bank`);
          }
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
          storedCorrect !== correctN ||
          !shown ||
          shown.correct !== storedCorrect ||
          shown.total !== questionCount ||
          percentNode !== expectedPercent
        ) {
          fail(
            `ResultsPage showed "${shown?.correct} correct out of ${shown?.total}" and ${percentNode} for practice questionCount ${questionCount} with ${correctN} correct UserAnswer rows and ${wrongN} incorrect ones (${questionCount - correctN - wrongN} unanswered). Store correctCount=${storedCorrect}. Expected ${storedCorrect} correct out of ${questionCount} and ${expectedPercent}. Unanswered questions stay in the denominator.`
          );
        }
      }
    )
  );
  return result('H-OVERALL-SCORE', 'held', checked);
}

export async function hFinishIdempotent(): Promise<PropertyResult> {
  resetMem();
  const sessionId = await openPractice(10);
  const question = questionFromPin(0);
  const answered = await answerLetter(sessionId, question.id, question.answer);
  if (answered.status !== 200) {
    return result('H-FINISH-IDEMPOTENT', 'held', {
      ok: false,
      detail: `setup answer ${question.id} HTTP ${answered.status}`,
    });
  }
  const clientStamp = '1999-01-01T00:00:00.000Z';
  const before = Date.now();
  const first = await patchSession(sessionId, { completedAt: clientStamp, correctCount: 999 });
  const after = Date.now();
  const stored = onlySession();
  const completedMs = new Date(stored.completedAt as Date | string).getTime();
  const second = await patchSession(sessionId, {
    completedAt: new Date(0).toISOString(),
    correctCount: 0,
  });
  const again = onlySession();
  const againMs = new Date(again.completedAt as Date | string).getTime();
  const ok =
    first.status === 200 &&
    second.status === 200 &&
    stored.correctCount === 1 &&
    again.correctCount === 1 &&
    againMs === completedMs &&
    completedMs !== Date.parse(clientStamp) &&
    completedMs >= before &&
    completedMs <= after + 2000;
  if (ok) return result('H-FINISH-IDEMPOTENT', 'held', { ok: true });
  return result('H-FINISH-IDEMPOTENT', 'held', {
    ok: false,
    detail: `PATCH app/api/sessions/[id]/route.ts first HTTP ${first.status} stored correctCount ${stored.correctCount} completedAt ${String(stored.completedAt)} (client sent ${clientStamp}). Second PATCH HTTP ${second.status} stored correctCount ${again.correctCount} completedAt ${String(again.completedAt)}. A second finish must keep both fields, and completedAt must be the server clock.`,
  });
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
  if (!canonical.ok) return result('F-QUESTIONCOUNT', 'held', canonical);
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
          timeLimit: mode === 'timed-exam' ? 60 : null,
        });
        const stored = storedSessions()[0];
        const pinned = assignedQuestionIds(created.json, stored);
        if (mode === 'timed-exam') {
          if (
            created.status >= 400 ||
            !stored ||
            stored.questionCount !== 40 ||
            stored.timeLimit !== 7200 ||
            pinned.length !== 40 ||
            new Set(pinned).size !== 40
          ) {
            fail(
              `POST app/api/sessions/route.ts stored mode=timed-exam questionCount=${String(stored?.questionCount)} timeLimit=${String(stored?.timeLimit)} pinned=${pinned.length} from client questionCount=${questionCount} timeLimit=60. HTTP ${created.status}. A timed exam must persist questionCount 40 and timeLimit 7200 (120 minutes).`
            );
          }
          return;
        }
        const expected = Math.min(BANK.length, Math.max(1, questionCount));
        const legal = PRACTICE_COUNTS.includes(questionCount as 10 | 20 | 40);
        if (
          created.status >= 400 ||
          !stored ||
          stored.questionCount !== expected ||
          (legal && stored.questionCount !== questionCount) ||
          stored.timeLimit !== null ||
          pinned.length !== expected ||
          new Set(pinned).size !== pinned.length
        ) {
          fail(
            `POST app/api/sessions/route.ts stored mode=practice questionCount=${String(stored?.questionCount)} timeLimit=${String(stored?.timeLimit)} pinned=${pinned.length} from client questionCount=${questionCount}. HTTP ${created.status}. Practice questionCount must clamp to 1..${BANK.length}; 10, 20, and 40 must be stored as sent.`
          );
        }
      }
    )
  );
  return result('F-QUESTIONCOUNT', 'held', checked);
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
    if (created.status >= 400 || !stored || stored.questionCount !== 40 || stored.timeLimit !== 7200) {
      fail(
        `POST /api/sessions { mode: "timed-exam", questionCount: 1, timeLimit: 7200 } returned HTTP ${created.status} and stored questionCount ${String(stored?.questionCount)} timeLimit ${String(stored?.timeLimit)}. A timed exam is 40 questions and 120 minutes.`
      );
    }
    const sessionId = String(created.json.id);
    const question = questionFromPin(0);
    await answerLetter(sessionId, question.id, question.answer);
    await finish(sessionId);
    const text = await renderResultsText(sessionId);
    const shown = headline(text);
    if (!shown || shown.total !== 40 || shown.correct !== 1 || headlinePercentage(text) === '100%') {
      fail(
        `POST /api/sessions { mode: "timed-exam", questionCount: 1, timeLimit: 7200 } stored questionCount ${stored.questionCount}. One correct answer then PATCH made ResultsPage show ${headlinePercentage(text)} and "${shown?.correct} correct out of ${shown?.total}". Passing 1 of 1 is not 70% of 40.`
      );
    }
    resetMem();
    const unknownMode = await postSession({
      mode: 'speedrun',
      domain: null,
      questionCount: 10,
      timeLimit: null,
    });
    if (unknownMode.status < 400 || storedSessions().length !== 0) {
      fail(
        `POST /api/sessions { mode: "speedrun" } returned HTTP ${unknownMode.status} and stored ${storedSessions().length} session(s). Unknown modes must be rejected.`
      );
    }
    resetMem();
    const unknownDomain = await postSession({
      mode: 'practice',
      domain: 'Security',
      questionCount: 10,
      timeLimit: null,
    });
    if (unknownDomain.status < 400 || storedSessions().length !== 0) {
      fail(
        `POST /api/sessions { mode: "practice", domain: "Security" } returned HTTP ${unknownDomain.status} and stored ${storedSessions().length} session(s). Unknown domains must be rejected.`
      );
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fNoAnswerAfterFinish(): Promise<PropertyResult> {
  const canonical = await canonicalAnswerAfterFinish();
  if (!canonical.ok) return result('F-NO-ANSWER-AFTER-FINISH', 'held', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.boolean(), async (closeFirst) => {
      resetMem();
      const sessionId = await openPractice(10);
      const firstQuestion = questionFromPin(0);
      const secondQuestion = questionFromPin(1);
      const first = await answerLetter(sessionId, firstQuestion.id, firstQuestion.answer);
      if (first.status !== 200) fail(`first answer HTTP ${first.status}`);
      if (closeFirst) {
        const patched = await finish(sessionId);
        if (patched.status !== 200) fail(`PATCH HTTP ${patched.status}`);
      }
      const second = await answerLetter(sessionId, secondQuestion.id, secondQuestion.answer);
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
          `After PATCH set completedAt, POST app/api/answers/route.ts for ${secondQuestion.id} returned HTTP ${second.status} and the session has ${rows} UserAnswer rows. An answer after finish must be rejected and must not change the stored score.`
        );
      }
    })
  );
  return result('F-NO-ANSWER-AFTER-FINISH', 'held', checked);
}

async function canonicalAnswerAfterFinish(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    const firstQuestion = questionFromPin(0);
    const secondQuestion = questionFromPin(1);
    const first = await answerLetter(sessionId, firstQuestion.id, firstQuestion.answer);
    const closed = await finish(sessionId);
    const correctAfterClose = onlySession().correctCount;
    const second = await answerLetter(sessionId, secondQuestion.id, secondQuestion.answer);
    if (second.status >= 400 && storedAnswers().length === 1) return { ok: true };
    const reopened = await finish(sessionId);
    fail(
      `Practice session ${sessionId}: POST /api/answers ${firstQuestion.id} HTTP ${first.status}, PATCH finish HTTP ${closed.status} stored correctCount ${correctAfterClose} (body correctCount 999 ignored). Then POST /api/answers ${secondQuestion.id} HTTP ${second.status}. A second PATCH HTTP ${reopened.status} stored correctCount ${onlySession().correctCount}. Rows=${storedAnswers().length}. Finish now must close answering; the later answer was scored.`
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
  if (!canonical.ok) return result('F-NO-ANSWER-AFTER-EXPIRY', 'held', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.boolean(), fc.boolean(), async (timed, expired) => {
      resetMem();
      const sessionId = timed ? await openTimed() : await openPractice(10);
      if (expired) backdateSession(sessionId, timed ? 7201 : 86400);
      const question = questionFromPin(0);
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
  return result('F-NO-ANSWER-AFTER-EXPIRY', 'held', checked);
}

async function canonicalExpiry(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openTimed();
    backdateSession(sessionId, 7201);
    const question = questionFromPin(0);
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
    const question = questionFromPin(0);
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
      return result('F-NO-CONCURRENT-DOUBLE', 'held', { ok: true });
    }
    return result('F-NO-CONCURRENT-DOUBLE', 'held', {
      ok: false,
      detail: `Two overlapping POST /api/answers for ${question.id} on session ${sessionId} both passed findFirst before either create. Statuses ${first.status} and ${second.status}. Stored UserAnswer rows for that question: ${rows.length}. userAnswerPairIsUnique()=${String(userAnswerPairIsUnique())} (prisma/schema.prisma model UserAnswer has no @@unique([userSessionId, questionId])). Both rows are isCorrect=${String(rows.every((row) => row.isCorrect))}, so a later PATCH count would add ${rows.filter((row) => row.isCorrect).length} to correctCount for one question.`,
    });
  } catch (error) {
    setFindFirstHook(null);
    return result('F-NO-CONCURRENT-DOUBLE', 'held', {
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
      return result('F-ASSIGNED-SET', 'held', { ok: true });
    }
    return result('F-ASSIGNED-SET', 'held', {
      ok: false,
      detail: `POST /api/sessions { mode: "practice", questionCount: 10 } HTTP ${created.status} response keys [${Object.keys(created.json).join(', ')}] pinned ${pinned.length} question ids. POST /api/answers questionId ${outsider.id} (a bank question${pinned.includes(outsider.id) ? ' in that list' : ' not in that list'}) returned HTTP ${answered.status} and stored ${storedAnswers().length} row(s). The session does not record the questions that count, so the client chooses the numerator.`,
    });
  } catch (error) {
    return result('F-ASSIGNED-SET', 'held', {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function scoreWithinQuestionCount(extraAttempts: number): Promise<void> {
  const sessionId = await openPractice(10);
  const ids = pinnedIds();
  for (const id of ids) {
    const question = questionById(id);
    if (!question) fail(`modeling gap: pinned id ${id} is not in the verification bank`);
    const answered = await answerLetter(sessionId, id, question.answer);
    if (answered.status !== 200) {
      fail(`pinned answer ${id} HTTP ${answered.status} ${JSON.stringify(answered.json)}`);
    }
  }
  const outsiders = BANK.filter((question) => !ids.includes(question.id)).slice(0, extraAttempts);
  if (outsiders.length < 1) fail('modeling gap: the bank has no question outside the pinned set');
  for (const question of outsiders) {
    const answered = await answerLetter(sessionId, question.id, question.answer);
    const storedExtra = storedAnswers().some((row) => row.questionId === question.id);
    if (answered.status < 400 || storedExtra) {
      fail(
        `POST /api/sessions practice questionCount 10 accepted ${question.id} outside the pinned set (HTTP ${answered.status}). An answer the session did not pin must be rejected so correctCount cannot exceed questionCount.`
      );
    }
  }
  const patched = await finish(sessionId);
  const text = await renderResultsText(sessionId);
  const shown = headline(text);
  const stored = onlySession().correctCount;
  const percentText = headlinePercentage(text);
  const percent = percentText ? Number.parseInt(percentText, 10) : Number.NaN;
  if (
    patched.status !== 200 ||
    stored > 10 ||
    !shown ||
    shown.correct > shown.total ||
    percent > 100
  ) {
    fail(
      `POST /api/sessions practice questionCount 10, ${ids.length} pinned correct answers and ${outsiders.length} rejected outsiders. PATCH stored correctCount ${stored}. ResultsPage showed ${percentText} and "${shown?.correct} correct out of ${shown?.total}". correctCount and the headline must stay within questionCount.`
    );
  }
}

export async function fScoreBounded(): Promise<PropertyResult> {
  const canonical = await canonicalScoreBound();
  if (!canonical.ok) return result('F-SCORE-BOUNDED', 'held', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.integer({ min: 11, max: 16 }), async (answers) => {
      resetMem();
      await scoreWithinQuestionCount(answers - 10);
    })
  );
  return result('F-SCORE-BOUNDED', 'held', checked);
}

async function canonicalScoreBound(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    await scoreWithinQuestionCount(1);
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function fDomainReview(): Promise<PropertyResult> {
  const canonical = await canonicalDomainReview();
  if (!canonical.ok) return result('F-DOMAIN-REVIEW', 'held', canonical);
  const checked = await checkFast(
    fc.asyncProperty(fc.integer({ min: 0, max: 9 }), async (answeredCount) => {
      resetMem();
      const sessionId = await openPractice(10);
      const ids = pinnedIds();
      for (let i = 0; i < answeredCount; i += 1) {
        const question = questionById(ids[i]);
        if (!question) fail(`modeling gap: pinned id ${ids[i]} is not in the verification bank`);
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
  return result('F-DOMAIN-REVIEW', 'held', checked);
}

async function canonicalDomainReview(): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    resetMem();
    const sessionId = await openPractice(10);
    const question = questionFromPin(0);
    await answerLetter(sessionId, question.id, question.answer);
    await finish(sessionId);
    const text = await renderResultsText(sessionId);
    const domains = domainTotalSum(text);
    const reviews = reviewCount(text);
    const shown = headline(text);
    if (domains === 10 && reviews === 10 && shown?.correct === 1 && shown.total === 10) {
      return { ok: true };
    }
    fail(
      `Finish now: practice questionCount 10, one correct answer ${question.id} (${question.domain}), nine unanswered. ResultsPage headline "${shown?.correct} correct out of ${shown?.total}" ${headlinePercentage(text)} (the ratio counts the nine as wrong). Domain totals sum to ${domains}. Review lists ${reviews} question(s). Per-domain totals and the per-question review must include unanswered questions so they sum to questionCount.`
    );
  } catch (error) {
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
    hFinishIdempotent,
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
