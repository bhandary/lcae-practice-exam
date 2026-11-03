'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Calendar, Clock, Target, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Answer {
  isCorrect: boolean;
  question: {
    domain: string;
  };
}

interface HistorySession {
  id: string;
  mode: string;
  domain: string | null;
  questionCount: number;
  correctCount: number;
  completedAt: string;
  timeLimit: number | null;
  answers: Answer[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      setSessions(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch('/api/history', { method: 'DELETE' });
      setSessions([]);
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading history...</p>
      </div>
    );
  }

  const totalSessions = sessions.length;
  const totalQuestions = sessions.reduce((sum, s) => sum + s.questionCount, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correctCount, 0);
  const overallPercentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          {sessions.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All History?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your session history and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearHistory}>
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Your Progress</h1>
            <p className="text-muted-foreground">
              Track your improvement over time
            </p>
          </div>

          {sessions.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No sessions yet. Start practicing to see your history!
                </p>
                <Link href="/exam/setup?mode=practice">
                  <Button>Start Practice</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">{totalSessions}</CardTitle>
                    <CardDescription>Sessions Completed</CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">{totalQuestions}</CardTitle>
                    <CardDescription>Questions Answered</CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">{overallPercentage}%</CardTitle>
                    <CardDescription>Overall Accuracy</CardDescription>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Session History</CardTitle>
                  <CardDescription>
                    Click any session to view detailed results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sessions.map((session) => {
                    const percentage = Math.round((session.correctCount / session.questionCount) * 100);
                    const date = new Date(session.completedAt);
                    const isTimedExam = session.mode === 'timed-exam';
                    const passed = percentage >= 70;

                    // Calculate domain breakdown
                    const domainCounts = session.answers.reduce((acc, answer) => {
                      const domain = answer.question.domain;
                      acc[domain] = (acc[domain] || 0) + (answer.isCorrect ? 1 : 0);
                      return acc;
                    }, {} as Record<string, number>);

                    return (
                      <Link key={session.id} href={`/results/${session.id}`}>
                        <div className="p-4 rounded-lg border hover:border-primary transition-colors cursor-pointer">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isTimedExam && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground">
                                  Timed Exam
                                </span>
                              )}
                              {isTimedExam && passed && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                  Passed
                                </span>
                              )}
                              {!session.domain && !isTimedExam && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground">
                                  Mixed
                                </span>
                              )}
                              {session.domain && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground">
                                  {session.domain}
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold">
                              {percentage}%
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {date.toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {date.toLocaleTimeString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Target className="h-3.5 w-3.5" />
                              {session.correctCount}/{session.questionCount}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
