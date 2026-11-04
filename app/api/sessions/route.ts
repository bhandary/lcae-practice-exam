import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { planSessionCreate } from '@/lib/session-rules';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid session body' }, { status: 400 });
    }

    const questions = await prisma.question.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        domain: true,
      },
    });

    const plan = planSessionCreate({
      mode: body.mode,
      domain: body.domain,
      questionCount: body.questionCount,
      timeLimit: body.timeLimit,
      questions,
    });
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: 400 });
    }

    const userSession = await prisma.userSession.create({
      data: {
        userId: session.user.id,
        mode: plan.mode,
        domain: plan.domain,
        questionCount: plan.questionCount,
        timeLimit: plan.timeLimit,
        questionIds: plan.questionIds,
      },
    });

    return NextResponse.json(userSession);
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
