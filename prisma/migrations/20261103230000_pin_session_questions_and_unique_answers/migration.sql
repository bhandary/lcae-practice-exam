-- Pin the questions chosen for a session.
-- Existing rows receive an empty array and stay readable. An empty list means
-- the session was created before pinning; new sessions always store the ids.
ALTER TABLE "UserSession" ADD COLUMN "questionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- One stored answer per question per session. Keep the earliest submission
-- (then the smaller id) so the first answer wins, matching the sequential guard.
-- Run this before the unique index so deploy succeeds when production already
-- has duplicate rows. Finished correctCount values are left as stored.
DELETE FROM "UserAnswer"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY "userSessionId", "questionId"
                ORDER BY "answeredAt" ASC, "id" ASC
            ) AS "rn"
        FROM "UserAnswer"
    ) AS "ranked"
    WHERE "ranked"."rn" > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAnswer_userSessionId_questionId_key" ON "UserAnswer"("userSessionId", "questionId");
