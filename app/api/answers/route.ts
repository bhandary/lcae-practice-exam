import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userSessionId, questionId, selectedAnswer } = body;

    // Validate that the userSession belongs to this user
    const userSession = await prisma.userSession.findUnique({
      where: { id: userSessionId },
    });

    if (!userSession || userSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 403 });
    }

    // Check if this question was already answered in this session
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

    // Get the question to compute correctness server-side
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

    // Compute correctness - NEVER trust the client
    const isCorrect = selectedAnswer === question.answer;

    const answer = await prisma.userAnswer.create({
      data: {
        userSessionId,
        questionId,
        selectedAnswer,
        isCorrect,
      },
    });

    // Return the answer with correctness and justification
    return NextResponse.json({
      ...answer,
      correctAnswer: question.answer,
      justification: question.justification,
      source: question.source,
    });
  } catch (error) {
    console.error('Error creating answer:', error);
    return NextResponse.json(
      { error: 'Failed to create answer' },
      { status: 500 }
    );
  }
}
