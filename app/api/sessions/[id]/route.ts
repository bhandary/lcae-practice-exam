import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { capCorrectCount, questionIdList } from '@/lib/session-rules';

type QuestionRecord = {
  id: string;
  answer?: string;
  justification?: string;
  [key: string]: unknown;
};

function presentQuestion(question: QuestionRecord | null, reveal: boolean) {
  if (!question || reveal) return question;
  const hidden: QuestionRecord = { ...question };
  delete hidden.answer;
  delete hidden.justification;
  return hidden;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const userSession = await prisma.userSession.findUnique({
      where: { id },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!userSession || userSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const questionIds = questionIdList(userSession.questionIds);
    const reveal = Boolean(userSession.completedAt);
    let questions: QuestionRecord[] = [];
    if (questionIds.length > 0) {
      const rows = await prisma.question.findMany({
        where: { id: { in: questionIds } },
      });
      const byId = new Map(rows.map((question) => [question.id, question as QuestionRecord]));
      questions = questionIds.flatMap((questionId) => {
        const question = byId.get(questionId);
        return question ? [presentQuestion(question, reveal) as QuestionRecord] : [];
      });
    }

    return NextResponse.json({
      ...userSession,
      answers: userSession.answers.map((answer) => ({
        ...answer,
        question: presentQuestion(answer.question as QuestionRecord | null, reveal),
      })),
      questions,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    // The body is intentionally unused. correctCount and completedAt are server-owned.
    await request.json();

    const existingSession = await prisma.userSession.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // A second finish must not rewrite the score or the completion time.
    if (existingSession.completedAt) {
      return NextResponse.json(existingSession);
    }

    const rawCorrect = await prisma.userAnswer.count({
      where: {
        userSessionId: id,
        isCorrect: true,
      },
    });
    const correctCount = capCorrectCount(rawCorrect, existingSession.questionCount);

    const userSession = await prisma.userSession.update({
      where: { id },
      data: {
        correctCount,
        completedAt: new Date(),
      },
    });

    return NextResponse.json(userSession);
  } catch (error) {
    console.error('Error updating session:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}
