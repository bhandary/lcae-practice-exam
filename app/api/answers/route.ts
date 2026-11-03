import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  isTimedSessionExpired,
  isUniqueConstraintError,
  questionIdList,
} from '@/lib/session-rules';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userSessionId, questionId, selectedAnswer } = body;

    const userSession = await prisma.userSession.findUnique({
      where: { id: userSessionId },
    });

    if (!userSession || userSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 403 });
    }

    if (userSession.completedAt) {
      return NextResponse.json({ error: 'Session is already completed' }, { status: 409 });
    }

    if (isTimedSessionExpired(userSession)) {
      return NextResponse.json({ error: 'Time limit exceeded' }, { status: 409 });
    }

    const questionIds = questionIdList(userSession.questionIds);
    // Legacy sessions created before pinning have an empty list and still accept
    // any real question. New sessions always pin a set.
    if (questionIds.length > 0 && !questionIds.includes(questionId)) {
      return NextResponse.json(
        { error: 'Question is not part of this session' },
        { status: 400 }
      );
    }

    // Sequential duplicate guard. Overlapping submits can both pass this read;
    // the unique index on (userSessionId, questionId) rejects the loser.
    const existingAnswer = await prisma.userAnswer.findFirst({
      where: {
        userSessionId,
        questionId,
      },
    });

    if (existingAnswer) {
      return NextResponse.json(
        { error: 'Question already answered' },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        answer: true,
        justification: true,
        source: true,
      },
    });

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const isCorrect = selectedAnswer === question.answer;

    try {
      const answer = await prisma.userAnswer.create({
        data: {
          userSessionId,
          questionId,
          selectedAnswer,
          isCorrect,
        },
      });

      return NextResponse.json({
        ...answer,
        correctAnswer: question.answer,
        justification: question.justification,
        source: question.source,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: 'Question already answered' },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating answer:', error);
    return NextResponse.json(
      { error: 'Failed to create answer' },
      { status: 500 }
    );
  }
}
