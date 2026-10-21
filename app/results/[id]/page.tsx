'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Home, History, Trophy, AlertCircle } from 'lucide-react';

interface Question {
  id: string;
  domain: string;
  difficulty: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: string;
  justification: string;
  source: string;
}

interface Answer {
  id: string;
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  question: Question;
}

interface Session {
  id: string;
  mode: string;
  domain: string | null;
  questionCount: number;
  correctCount: number;
  startedAt: string;
  completedAt: string;
  timeLimit: number | null;
  answers: Answer[];
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await fetch(`/api/sessions/${id}`);
        const data = await response.json();
        setSession(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading results:', error);
      }
    }

    loadResults();
  }, [id]);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading results...</p>
      </div>
    );
  }

  const percentage = Math.round((session.correctCount / session.questionCount) * 100);
  const isTimedExam = session.mode === 'timed-exam';
  const passed = percentage >= 70;

  // Domain breakdown
  const domainStats = session.answers.reduce((acc, answer) => {
    const domain = answer.question.domain;
    if (!acc[domain]) {
      acc[domain] = { total: 0, correct: 0 };
    }
    acc[domain].total++;
    if (answer.isCorrect) {
      acc[domain].correct++;
    }
    return acc;
  }, {} as Record<string, { total: number; correct: number }>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold">Exam Results</h1>
          <div className="flex gap-2">
            <Link href="/history">
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm">
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card className="border-2">
            <CardHeader className="text-center pb-8">
              <div className="flex justify-center mb-4">
                {passed ? (
                  <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Trophy className="h-10 w-10 text-green-600" />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                    <AlertCircle className="h-10 w-10 text-amber-600" />
                  </div>
                )}
              </div>
              <CardTitle className="text-3xl mb-2">
                {isTimedExam ? (passed ? 'Congratulations!' : 'Keep Practicing!') : 'Session Complete!'}
              </CardTitle>
              <CardDescription className="text-base">
                {isTimedExam
                  ? passed
                    ? 'You passed the exam!'
                    : 'You need 70% to pass. Keep practicing!'
                  : 'Review your performance below'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-5xl font-bold">{percentage}%</div>
                <div className="text-muted-foreground">
                  {session.correctCount} correct out of {session.questionCount}
                </div>
                <Progress value={percentage} className="h-3 mt-4" />
              </div>

              {isTimedExam && (
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm">
                    Pass threshold: <strong>70%</strong> (28/40 correct)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance by Domain</CardTitle>
              <CardDescription>
                See how you performed in each domain
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(domainStats)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([domain, stats]) => {
                  const domainPercentage = Math.round((stats.correct / stats.total) * 100);
                  return (
                    <div key={domain} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{domain}</span>
                        <span className="text-muted-foreground">
                          {stats.correct}/{stats.total} ({domainPercentage}%)
                        </span>
                      </div>
                      <Progress value={domainPercentage} className="h-2" />
                    </div>
                  );
                })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review Answers</CardTitle>
              <CardDescription>
                See which questions you got right and wrong
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {session.answers.map((answer, index) => (
                <div
                  key={answer.id}
                  className="p-4 rounded-lg border space-y-2"
                >
                  <div className="flex items-start gap-3">
                    {answer.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-semibold">
                        Question {index + 1} - {answer.question.domain}
                      </p>
                      <p className="text-sm">{answer.question.question}</p>
                      <div className="text-sm space-y-1">
                        <p>
                          Your answer: <strong>{answer.selectedAnswer}</strong>
                          <span className="text-muted-foreground">
                            {' '}
                            (Correct: <strong>{answer.question.answer}</strong>)
                          </span>
                        </p>
                        <p className="text-muted-foreground">
                          {answer.question.justification}
                        </p>
                        {answer.question.source && (
                          <p className="text-xs text-muted-foreground">
                            Source: {answer.question.source}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full">
                Return Home
              </Button>
            </Link>
            <Link href="/exam/setup?mode=practice" className="flex-1">
              <Button className="w-full">Practice Again</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
