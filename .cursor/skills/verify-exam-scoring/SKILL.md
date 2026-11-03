---
name: verify-exam-scoring
description: Checks that an LCAE practice-exam session score is computed on the server from stored answers and cannot be corrupted by questionCount, a second submit, finish, or timer expiry. Use when changing session creation, answer submission, finish or expiry, the results score, the domain breakdown, the answer review, or the Prisma UserSession or UserAnswer models.
---

# Verify exam scoring

The check is about one promise: an exam session's score is correct, and a client cannot corrupt it. The score is `correct / session.questionCount`. A timed exam is 40 questions and passes at 70%. Unanswered questions on Finish now count as wrong. Per-domain totals sum to that same total. An answer cannot be stored twice, or after the session is finished, or after `startedAt + timeLimit`. The client does not get to choose `questionCount`, the question list, or `correctCount`.

`isCorrect` is decided in `POST` of `app/api/answers/route.ts` (`selectedAnswer === question.answer`). `correctCount` is decided in `PATCH` of `app/api/sessions/[id]/route.ts` by counting stored answers. The percentage, the pass sentence, the domain totals, and the review are rendered by `ResultsPage` in `app/results/[id]/page.tsx`.

## Why this checker

The ordering (answer, finish, timer expiry, double submit) and the score those events write both live in those handlers and in `ResultsPage`. `lib/exam-utils.test.ts` never imports them. It redefines `calculatePercentage`, `isTimedExamPassed`, and `getDomainBreakdown` locally, and `npm test` only runs that file. A change to the routes leaves `npm test` green.

The checker imports the real handlers and renders the real `ResultsPage`. fast-check searches the score and `questionCount` predicates. Each ordering rule also has one fixed trace, and fast-check searches that same predicate again once the fixed trace holds, so patching only the example does not clear the finding. The double submit is one bounded schedule: two calls to the real `POST`, overlapped on the `await` of `prisma.userAnswer.findFirst` inside that handler.

A TLA+ model of the same order would stay green when those files change. This check fails when they change. Do not re-model it in TLA+, and do not run the statechart skill for this result.

## When a change touches this

Run the check when the diff touches any of these:

- `app/api/sessions/route.ts` — `POST`
- `app/api/sessions/[id]/route.ts` — `GET`, `PATCH`
- `app/api/answers/route.ts` — `POST`
- `app/results/[id]/page.tsx` — `ResultsPage` (the percentage, the pass sentence, `domainStats`, the review `session.answers.map`)
- `prisma/schema.prisma` — models `UserSession` and `UserAnswer`
- `.cursor/skills/verify-exam-scoring/**` — the check itself

A change that only edits `lib/exam-utils.test.ts` does not touch the verified code. Those functions are not on the request path.

`app/exam/[id]/page.tsx` (`handleComplete`, `handleFinishEarly`, the client timer) and `app/exam/setup/page.tsx` send the request the handlers accept. The check calls the handlers directly. A client-only edit leaves every finding below in place. Run the check anyway when the edit is meant to close one of those findings, and expect the finding to remain until the handler or `ResultsPage` changes.

## Run

From the repo root, with dependencies installed (`npm install`; no database and no `prisma generate`):

```bash
npm run verify:scoring
```

That is `vitest run --config .cursor/skills/verify-exam-scoring/verification/vitest.config.ts`. It finishes in a few seconds. `npm test` does not run it. The file is `verification/scoring.check.ts`, which the default Vitest include does not collect.

## Read the result

The status line is the result. The process exit code is 0 only for `findings-only`. Exit code 0 still means the seven findings below are present.

| Status | What it is |
| --- | --- |
| `findings-only` | Every held property passed. Every id in `verification/expected-findings.json` failed with a counterexample that names a route, a stored field, or `ResultsPage` text. That is the steady state at the sync commit. |
| `regression` | A held property failed. The score or a guard that held at the sync commit is broken. |
| `finding-set-changed` | A spec id in `expected-findings.json` now passes (`finding-cleared`), or a spec id failed that is not listed (`unexpected`). |
| `modeling-error` | A counterexample starts with `modeling gap` or `overlap-timeout`. The harness and the handlers disagree. |

A product bug's counterexample is a trace: HTTP status from `POST /api/sessions`, `POST /api/answers`, or `PATCH /api/sessions/:id`, fields on the stored `UserSession` or `UserAnswer`, and text from `ResultsPage`. Trust that trace.

A modeling error is the harness. `modeling gap` means a handler called a Prisma method, a fetch, or a response shape the shim does not implement (`verification/prisma-shim.ts`, `verification/drive.ts`, `verification/render-results.tsx`). `overlap-timeout` means `POST` in `app/api/answers/route.ts` no longer reaches `userAnswer.findFirst` twice before either `create`. The held property `H-NO-DOUBLE-SEQUENTIAL` still checks the duplicate guard. Move the hook in `fNoConcurrentDouble` only after you have read the new await point, then run the check again. Until the hook matches the handler, the timeout is not a new product bug.

`finding-cleared` means that spec property now holds. Read the handler it names. Keep the property. Remove the id from `verification/expected-findings.json` and from the findings section below, in the same commit. Do not weaken the predicate in `verification/properties.ts` to force a pass.

## Properties

Held properties must pass. Spec properties are the promise. At the sync commit the spec properties fail, and the failures are the findings.

| Id | Kind | Statement | Code |
| --- | --- | --- | --- |
| `H-ISCORRECT` | held | `UserAnswer.isCorrect` is `selectedAnswer === Question.answer`. A body field `isCorrect` is ignored. | `POST` in `app/api/answers/route.ts` |
| `H-CORRECTCOUNT` | held | `PATCH` stores `correctCount` as the count of stored answers with `isCorrect` true. A body field `correctCount` (the check sends `999`) is ignored. | `PATCH` in `app/api/sessions/[id]/route.ts` |
| `H-NO-DOUBLE-SEQUENTIAL` | held | A second `POST` for the same session and question returns 400 and leaves the first row in place. | `findFirst` then the 400 in `POST` of `app/api/answers/route.ts` |
| `H-OWNER` | held | Another user's `POST` is 403 and writes no row. Their `PATCH` and `GET` are 404 and leave `correctCount` at 0. The owner can still answer. | `userId` checks in `POST` of `app/api/answers/route.ts` and in `GET` and `PATCH` of `app/api/sessions/[id]/route.ts` |
| `H-OVERALL-SCORE` | held | After finish, `ResultsPage` shows `correctCount` correct out of `questionCount`, and the `.text-5xl` node is `Math.round(correctCount / questionCount * 100)` percent. Unanswered questions stay in the denominator. A timed session shows "You passed the exam!" when that percentage is at least 70, and "You need 70% to pass" otherwise. 28/40 is 70 and passes. 27/40 rounds to 68 and does not. | `ResultsPage` in `app/results/[id]/page.tsx` |
| `F-QUESTIONCOUNT` | spec | A stored timed session has `questionCount` 40. A stored practice session has `questionCount` 10, 20, or 40. Any other integer is rejected or coerced. The legal values still store as sent. | `POST` in `app/api/sessions/route.ts` |
| `F-NO-ANSWER-AFTER-FINISH` | spec | After `PATCH` sets `completedAt`, a later `POST` for a different question is rejected and the row count stays put. A second question before finish is still accepted. | `POST` in `app/api/answers/route.ts` (it never reads `completedAt`) |
| `F-NO-ANSWER-AFTER-EXPIRY` | spec | A timed session whose `startedAt + timeLimit` is in the past rejects the answer. A fresh timed session, and a practice session, still accept one. | `POST` in `app/api/answers/route.ts` (it never reads `startedAt` or `timeLimit`) |
| `F-NO-CONCURRENT-DOUBLE` | spec | Two overlapping submits of one question leave one `UserAnswer`, and at most one response is HTTP 200. | `findFirst` and `create` in `POST` of `app/api/answers/route.ts`; `@@unique` on `UserAnswer` in `prisma/schema.prisma` |
| `F-ASSIGNED-SET` | spec | Session create pins 10 distinct question ids for a practice session of 10, and `POST /api/answers` rejects an id outside that set. | `POST` in `app/api/sessions/route.ts` and `POST` in `app/api/answers/route.ts`. The reader is `assignedQuestionIds` in `verification/drive.ts`. |
| `F-SCORE-BOUNDED` | spec | `correctCount` after finish is at most `questionCount`, and the results headline does not show more correct answers than that total. | `PATCH` count in `app/api/sessions/[id]/route.ts` and `ResultsPage` |
| `F-DOMAIN-REVIEW` | spec | After finish, the sum of the domain `total` figures equals `questionCount`, and the review has one "Your answer:" row per question, including unanswered questions counted wrong. | `domainStats` reduce and `session.answers.map` in `ResultsPage` |

fast-check uses seed `20261103` and 25 runs (`FAST_CHECK_SEED` and `FAST_CHECK_RUNS` in `verification/properties.ts`, copied in `verification/expected-findings.json`). Spec properties print the fixed trace while that trace fails. The search runs once the fixed trace holds.

## Findings

These seven are the steady state. The words are the counterexamples the check prints.

**`F-QUESTIONCOUNT`.** `POST /api/sessions` stores the client's `questionCount` with no check. `{ mode: "timed-exam", questionCount: 1, timeLimit: 7200 }` returns HTTP 200 and stores `questionCount` 1. One correct answer for `BUILD-001`, then `PATCH`, makes `ResultsPage` show 100% and "1 correct out of 1", with the pass copy. A timed exam is 40 questions. Passing 1 of 1 is not 70% of 40.

**`F-NO-ANSWER-AFTER-FINISH`.** Finish now does not close the session. On practice session `sess-1`, `POST /api/answers` for `BUILD-001` returns 200, `PATCH` stores `correctCount` 1 and ignores body `correctCount` 999, then `POST /api/answers` for `BUILD-002` returns 200. A second `PATCH` stores `correctCount` 2. Two rows are stored. The answer route never looks at `completedAt`.

**`F-NO-ANSWER-AFTER-EXPIRY`.** The 120 minute limit is only the timer in `ExamPage`. A timed session with `questionCount` 40 and `timeLimit` 7200, whose `startedAt` is 7201 seconds in the past, still accepts `POST /api/answers` for `BUILD-001` (HTTP 200, `isCorrect` true). `PATCH` then stores `correctCount` 1. The answer route never reads `startedAt` or `timeLimit`.

**`F-NO-CONCURRENT-DOUBLE`.** Two overlapping `POST /api/answers` for `BUILD-001` both pass `findFirst` before either `create`. Both return HTTP 200 and both rows are stored, both `isCorrect` true. `prisma/schema.prisma` model `UserAnswer` has no `@@unique([userSessionId, questionId])` (the migration `prisma/migrations/20261020200257_initial/migration.sql` only indexes `userSessionId` and `questionId` separately). A later `PATCH` would add 2 to `correctCount` for one question. The sequential guard `H-NO-DOUBLE-SEQUENTIAL` still holds: one request at a time is rejected.

**`F-ASSIGNED-SET`.** `POST /api/sessions` for a practice session of 10 returns keys `id, userId, mode, domain, questionCount, correctCount, startedAt, completedAt, timeLimit` and pins 0 question ids. `POST /api/answers` for `BUILD-001` returns HTTP 200 and stores a row. The session never records which questions count, so the client chooses the numerator. `GET` in `app/api/questions/route.ts` is a separate shuffle and is not tied to the session.

**`F-SCORE-BOUNDED`.** A practice session with `questionCount` 10 accepts 11 correct answers (`BUILD-001` through `BUILD-010`, then `TEST-001`). `PATCH` stores `correctCount` 11. `ResultsPage` shows 110% and "11 correct out of 10".

**`F-DOMAIN-REVIEW`.** Finish now on a practice session of 10 with one correct `BUILD-001` answer and nine unanswered questions: the headline is "1 correct out of 10" and 10%, so the ratio does count the nine as wrong. The domain totals sum to 1 (only Build). The review lists 1 question. `domainStats` and the review walk `session.answers` only, so they do not sum to `questionCount`.

## Coverage

Confirmed against sync commit `bbdc5c7c078b2704475a7a2b8e72d2ca68e6be64`.

| File | What the check executes |
| --- | --- |
| `app/api/sessions/route.ts` | `POST` |
| `app/api/sessions/[id]/route.ts` | `GET`, `PATCH` |
| `app/api/answers/route.ts` | `POST` |
| `app/results/[id]/page.tsx` | `ResultsPage`: percentage, pass sentence, `domainStats` reduce, review `session.answers.map` |
| `prisma/schema.prisma` | `UserAnswer` `@@unique` is read by `userAnswerPairIsUnique` in `verification/memory.ts` on each answer `create` |

The harness stands in for Prisma and for `auth()`. It is not the product. `verification/prisma-shim.ts` implements `userSession.create`, `userSession.findUnique`, `userSession.update`, `userAnswer.findFirst`, `userAnswer.count`, `userAnswer.create`, and `question.findUnique`. Anything else throws `modeling gap`. `userAnswer.create` throws `P2002` when the schema declares `@@unique` on `userSessionId` and `questionId`. `assignedQuestionIds` in `verification/drive.ts` accepts `questionIds` or `questions` (array of ids, or of `{ id }`) on the create JSON or on the stored session row.

## Sync commit

`bbdc5c7c078b2704475a7a2b8e72d2ca68e6be64`

That commit is the product tree these predicates describe (`POST` / `GET` / `PATCH` above, `ResultsPage`, and the `UserSession` / `UserAnswer` models). The same hash is `syncCommit` in `verification/expected-findings.json`.

Move the hash forward only after you have re-read those functions at the new commit and run `npm run verify:scoring`. Update the hash in this file and in `expected-findings.json` together. Do that when the status is `findings-only`, or in the same commit that updates the findings list so the status is `findings-only` again. A commit that only edits this skill does not move the hash. A commit that changes a covered file does not move the hash until that re-read and that run are done.

## Bounds and assumptions

- The question bank is 40 synthetic rows in `verification/bank.ts` (10 each of Build, Test, Deploy, Monitor). It is not `data/questions.json`, and `GET` `app/api/questions/route.ts` is not called.
- `auth()` is stubbed as a logged-in user (`user-1`, and `user-2` for `H-OWNER`). The check does not cover a missing session (HTTP 401).
- There is no Postgres. Time passing is done by moving the stored `startedAt` backward, which matches a handler that compares `Date.now()` with `startedAt + timeLimit`. The answer route does not read either field today.
- The overlap is exactly two `POST /api/answers` calls, paused inside `userAnswer.findFirst` until both have entered, then both continue. Other schedules (a `PATCH` overlapping a `POST`, three submits) are not run.
- `questionCount` search values are integers from -2 through 80, plus the fixed timed case of 1. Non-integers are not sent. Prisma would reject those before a row is stored; this shim is not asked to.
- Modes other than `practice` and `timed-exam` are not constrained. Practice `domain` and a practice `timeLimit` are not constrained. Timed `timeLimit` is sent as 7200 in the traces; the expiry rule uses whatever `timeLimit` was stored.
- The check does not require `PATCH` to replace the client's `completedAt` with the server clock. It does require that once `completedAt` is set, further answers are rejected.
- The headline percentage is the `.text-5xl` node in `ResultsPage`. Domain totals are parsed from text of the form `correct/total (percent%)`. Review rows are counted by the substring `Your answer:`. If a redesign moves the score out of those shapes, update `verification/render-results.tsx` and re-run. That edit is a harness change: re-read the page and keep the predicate.
- `H-OVERALL-SCORE` fast-check draws up to 6 correct and 6 wrong answers on practice counts 10, 20, and 40. The 28/40 and 27/40 timed cases are fixed traces, not part of the 25 runs.
- Reject or coerce both satisfy `F-QUESTIONCOUNT` and `F-SCORE-BOUNDED`, as long as no stored session keeps an illegal `questionCount` and `correctCount` does not exceed it. A legal 10, 20, or 40 (and timed 40) must still be stored as sent.

## Update the verification

1. Read the diff against the coverage list. If it touches none of those files, stop.
2. Re-read the named function. Match each predicate you touch to the line it describes.
3. Run `npm run verify:scoring`.
4. On `regression`, the held counterexample is a product bug. Fix the product or revert the change. Do not edit the predicate to match the bug.
5. On `finding-cleared`, the product now meets that spec property. Remove only that id from `expected-findings.json` and from the findings section. Keep the predicate.
6. On `unexpected`, read the counterexample. A trace through the handlers is a new finding: add the id only after the predicate is the property you mean, and record the counterexample here. A `modeling gap` is a shim update.
7. On `modeling-error`, update the shim or the overlap hook so it follows the handler, then run again.
8. Move the sync commit only by the rule in the previous section.

`assignedQuestionIds` is the one reader that guesses a future shape. If the product pins the question list under a different field, update that function and say so here. Do not make it return a made-up list.

## See a held property fail

At the sync commit, each held property failed when the guard it names was broken, and the product files were restored afterward. Use the same scratch when you need to see that a property still bites. Restore the file with `git checkout -- <path>` before you commit. The status must be `regression` on that id, then `findings-only` after the restore.

- `H-ISCORRECT`: in `POST` of `app/api/answers/route.ts`, set `isCorrect` from `body.isCorrect === true` instead of `selectedAnswer === question.answer`. The counterexample is a selected letter equal to `Question.answer` stored as `isCorrect` false when the body sends false. `H-OVERALL-SCORE` fails with it, because 28 correct answers are stored as wrong and the page shows 0%.
- `H-CORRECTCOUNT`: in `PATCH` of `app/api/sessions/[id]/route.ts`, store `body.correctCount` instead of the `userAnswer.count`. The counterexample is `correctCount` 999 against one correct row. The page then shows 999.
- `H-NO-DOUBLE-SEQUENTIAL`: delete the `findFirst` / 400 block in `POST` of `app/api/answers/route.ts`. The second `POST` for `BUILD-001` returns 200 and leaves 2 rows. Putting `create` before that check also fails it: the second response can be 400 while 2 rows remain.
- `H-OWNER`: drop the `userSession.userId !== session.user.id` conjunct on the answer `POST`. `user-2` gets HTTP 200 and a row on `user-1`'s session. `PATCH` and `GET` stay 404 if those checks are still there. The owner's own retry then hits the duplicate guard (400).
- `H-OVERALL-SCORE`: in `ResultsPage`, divide by `session.answers.length` and print that length as the total. 28 correct answers on a 40-question timed exam render "28 correct out of 28" and 100%, with the pass copy.

## What this does not cover

- `GET` in `app/api/questions/route.ts` (the 10-per-domain shuffle, the practice `count` query).
- `app/api/history/route.ts` and `app/history/page.tsx`. The history page repeats `Math.round(correctCount / questionCount * 100)` and is not rendered.
- The client timer and the Finish now dialog in `app/exam/[id]/page.tsx`. The live header score there is `correct / answered`, which is a different ratio from the results page.
- `app/exam/setup/page.tsx`. It sends the legal body (`questionCount` 40 and `timeLimit` 7200 for a timed exam). The check's findings are what the server does with a different body.
- Whether `PATCH` overwrites `completedAt` with the server clock, or refuses a second finish that only rewrites the timestamp.
- HTTP 401, and any user pair besides `user-1` and `user-2`.
- More than two overlapping answer posts, and any overlap of `PATCH` with `POST`.
- The contents of `data/questions.json` and the seed.
- Modes other than `practice` and `timed-exam`, practice `domain`, and practice `timeLimit`.
