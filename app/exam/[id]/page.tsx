'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/react-label';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Clock, CheckCircle2, XCircle, ChevronRight, AlertTriangle, Flag } from 'lucide-react';

interface Question {
  id: string;
  domain: string;
  difficulty: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer?: string;
  justification?: string;
  source?: string;
}

interface UserSession {
  id: string;
  mode: string;
  domain: string | null;
  questionCount: number;
  timeLimit: number | null;
  startedAt: string;
}

export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { answer: string; correct: boolean; justification: string; correctAnswer: string; source: string }>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isTimedExam = session?.mode === 'timed-exam';
  const currentQuestion = questions[currentIndex];
  const correctCount = Object.values(answers).filter((a) => a.correct).length;
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const unansweredCount = questions.length - Object.keys(answers).length;

  useEffect(() => {
    async function loadSession() {
      try {
        // Fetch session
        const sessionRes = await fetch(`/api/sessions/${id}`);
        const sessionData = await sessionRes.json();
        setSession(sessionData);

        // Fetch questions
        const questionsRes = await fetch(
          `/api/questions?mode=${sessionData.mode}&domain=${sessionData.domain || ''}&count=${sessionData.questionCount}`
        );
        const questionsData = await questionsRes.json();
        setQuestions(questionsData);

        // Initialize timer if timed exam
        if (sessionData.timeLimit) {
          const elapsed = Math.floor(
            (Date.now() - new Date(sessionData.startedAt).getTime()) / 1000
          );
          setTimeRemaining(Math.max(0, sessionData.timeLimit - elapsed));
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error loading session:', error);
      }
    }

    loadSession();
  }, [id]);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          handleComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !currentQuestion) return;

    // Save answer to database and get correctness from server
    const response = await fetch('/api/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userSessionId: id,
        questionId: currentQuestion.id,
        selectedAnswer,
      }),
    });

    const result = await response.json();

    setAnswers({
      ...answers,
      [currentQuestion.id]: {
        answer: selectedAnswer,
        correct: result.isCorrect,
        justification: result.justification,
        correctAnswer: result.correctAnswer,
        source: result.source,
      },
    });

    setShowFeedback(true);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer('');
      setShowFeedback(false);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completedAt: new Date().toISOString(),
      }),
    });

    router.push(`/results/${id}`);
  };

  const handleFinishEarly = async () => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completedAt: new Date().toISOString(),
      }),
    });

    router.push(`/results/${id}`);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading || !currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  const isAnswered = currentQuestion.id in answers;
  const userAnswer = answers[currentQuestion.id];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-sm">
              Question {currentIndex + 1} of {questions.length}
            </div>
            <div className="text-sm text-muted-foreground">
              Score: {correctCount}/{Object.keys(answers).length}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isTimedExam && timeRemaining !== null && (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                <span className={timeRemaining < 600 ? 'text-destructive' : ''}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Flag className="h-4 w-4 mr-2" />
                  Finish Now
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finish Exam Early?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {unansweredCount > 0 ? (
                      <>
                        You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount !== 1 ? 's' : ''}.
                        Unanswered questions will be scored as incorrect.
                      </>
                    ) : (
                      'You have answered all questions. Are you ready to see your results?'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continue Exam</AlertDialogCancel>
                  <AlertDialogAction onClick={handleFinishEarly}>
                    Finish Now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <Progress value={progress} className="h-2" />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    {currentQuestion.domain} - {currentQuestion.difficulty}
                  </CardTitle>
                </div>
              </div>
              <CardDescription className="text-base leading-relaxed mt-4">
                {currentQuestion.question}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={selectedAnswer}
                onValueChange={setSelectedAnswer}
                disabled={showFeedback}
              >
                {['A', 'B', 'C', 'D'].map((option) => {
                  const optionText = currentQuestion[`option${option}` as keyof Question] as string;
                  const isCorrectAnswer = showFeedback && userAnswer && option === userAnswer.correctAnswer;
                  const isSelected = selectedAnswer === option;
                  
                  let className = 'flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer';
                  
                  if (showFeedback) {
                    if (isCorrectAnswer) {
                      className += ' border-green-500 bg-green-50 dark:bg-green-950/20';
                    } else if (isSelected) {
                      className += ' border-red-500 bg-red-50 dark:bg-red-950/20';
                    }
                  } else if (isSelected) {
                    className += ' border-primary bg-primary/5';
                  }

                  return (
                    <div key={option} className={className}>
                      <RadioGroupItem value={option} id={option} className="mt-1" />
                      <Label htmlFor={option} className="flex-1 cursor-pointer font-normal">
                        <span className="font-semibold mr-2">{option}.</span>
                        {optionText}
                      </Label>
                      {showFeedback && isCorrectAnswer && (
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      )}
                      {showFeedback && isSelected && !isCorrectAnswer && (
                        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </RadioGroup>

              {showFeedback && userAnswer && (
                <div className="space-y-4 p-4 bg-muted rounded-lg">
                  <div className="flex items-start gap-2">
                    {userAnswer.correct ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {userAnswer.correct ? 'Correct!' : 'Incorrect'}
                      </p>
                      {!userAnswer.correct && (
                        <p className="text-sm">
                          The correct answer is <strong>{userAnswer.correctAnswer}</strong>
                        </p>
                      )}
                      <p className="text-sm leading-relaxed">{userAnswer.justification}</p>
                      <p className="text-xs text-muted-foreground">
                        Source: {userAnswer.source}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                {!showFeedback ? (
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedAnswer}
                    size="lg"
                  >
                    Submit Answer
                  </Button>
                ) : (
                  <Button onClick={handleNext} size="lg">
                    {currentIndex < questions.length - 1 ? (
                      <>
                        Next Question
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </>
                    ) : (
                      'View Results'
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
