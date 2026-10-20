import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

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

    return NextResponse.json(userSession);
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
    const body = await request.json();
    const { completedAt } = body;

    // Verify the session belongs to this user
    const existingSession = await prisma.userSession.findUnique({
      where: { id },
    });

    if (!existingSession || existingSession.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Compute correctCount from actual answers - NEVER trust the client
    const correctCount = await prisma.userAnswer.count({
      where: {
        userSessionId: id,
        isCorrect: true,
      },
    });

    const userSession = await prisma.userSession.update({
      where: { id },
      data: {
        correctCount,
        completedAt,
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
