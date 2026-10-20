import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const count = parseInt(searchParams.get('count') || '10', 10);
    const mode = searchParams.get('mode');

    let questions;

    if (mode === 'timed-exam') {
      // For timed exam: 40 questions with balanced distribution
      const domains = ['Build', 'Test', 'Deploy', 'Monitor'];
      const questionsPerDomain = 10;
      
      const allQuestions = await Promise.all(
        domains.map(async (d) => {
          return prisma.question.findMany({
            where: { domain: d },
            orderBy: { id: 'asc' },
            take: 1000, // Get all questions for shuffling
            select: {
              id: true,
              domain: true,
              difficulty: true,
              question: true,
              optionA: true,
              optionB: true,
              optionC: true,
              optionD: true,
              // Exclude answer and justification - only send after submission
            },
          });
        })
      );

      // Shuffle and take 10 from each domain
      const selectedQuestions = allQuestions.flatMap((domainQuestions) => {
        const shuffled = domainQuestions.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, questionsPerDomain);
      });

      // Final shuffle of all 40 questions
      questions = selectedQuestions.sort(() => Math.random() - 0.5);
    } else {
      // Practice mode: select from specified domain or all
      const where = domain ? { domain } : {};
      
      const allQuestions = await prisma.question.findMany({
        where,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          domain: true,
          difficulty: true,
          question: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          // Exclude answer and justification - only send after submission
        },
      });

      // Shuffle and take requested count
      questions = allQuestions
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(count, allQuestions.length));
    }

    return NextResponse.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}
