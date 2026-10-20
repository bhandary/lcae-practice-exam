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
    const { mode, domain, questionCount, timeLimit } = body;

    // Create new user session
    const userSession = await prisma.userSession.create({
      data: {
        userId: session.user.id,
        mode,
        domain: domain || null,
        questionCount,
        timeLimit: timeLimit || null,
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
