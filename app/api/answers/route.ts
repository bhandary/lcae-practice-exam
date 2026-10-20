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
    const { userSessionId, questionId, selectedAnswer, isCorrect } = body;

    const answer = await prisma.userAnswer.create({
      data: {
        userSessionId,
        questionId,
        selectedAnswer,
        isCorrect,
      },
    });

    return NextResponse.json(answer);
  } catch (error) {
    console.error('Error creating answer:', error);
    return NextResponse.json(
      { error: 'Failed to create answer' },
      { status: 500 }
    );
  }
}
