import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface QuestionData {
  id: string;
  domain: string;
  difficulty: string;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  answer: string;
  justification: string;
  source: string;
}

async function main() {
  console.log('Starting seed...');

  // Read questions from JSON file
  const questionsPath = path.join(process.cwd(), 'data', 'questions.json');
  const questionsData: QuestionData[] = JSON.parse(
    fs.readFileSync(questionsPath, 'utf-8')
  );

  console.log(`Found ${questionsData.length} questions to seed`);

  // Upsert each question
  let created = 0;
  let updated = 0;

  for (const q of questionsData) {
    const existing = await prisma.question.findUnique({
      where: { id: q.id },
    });

    await prisma.question.upsert({
      where: { id: q.id },
      update: {
        domain: q.domain,
        difficulty: q.difficulty,
        question: q.question,
        optionA: q.options.A,
        optionB: q.options.B,
        optionC: q.options.C,
        optionD: q.options.D,
        answer: q.answer,
        justification: q.justification,
        source: q.source,
      },
      create: {
        id: q.id,
        domain: q.domain,
        difficulty: q.difficulty,
        question: q.question,
        optionA: q.options.A,
        optionB: q.options.B,
        optionC: q.options.C,
        optionD: q.options.D,
        answer: q.answer,
        justification: q.justification,
        source: q.source,
      },
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  console.log(`Seed complete: ${created} created, ${updated} updated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
