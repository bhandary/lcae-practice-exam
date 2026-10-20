'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/react-label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, Play } from 'lucide-react';
import Link from 'next/link';

function ExamSetupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = searchParams.get('mode') || 'practice';
  const isTimedExam = mode === 'timed-exam';

  const [domain, setDomain] = useState<string>(isTimedExam ? 'mixed' : 'Build');
  const [questionCount, setQuestionCount] = useState<number>(isTimedExam ? 40 : 10);

  const handleStart = async () => {
    // Create session
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        domain: domain === 'mixed' ? null : domain,
        questionCount,
        timeLimit: isTimedExam ? 7200 : null, // 120 minutes = 7200 seconds
      }),
    });

    if (response.ok) {
      const session = await response.json();
      router.push(`/exam/${session.id}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isTimedExam ? 'Timed Exam Setup' : 'Practice Setup'}
        </CardTitle>
        <CardDescription>
          {isTimedExam
            ? 'Configure your timed exam (40 questions, 120 minutes, 70% to pass)'
            : 'Choose your practice domain and question count'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isTimedExam && (
          <>
            <div className="space-y-3">
              <Label>Domain</Label>
              <RadioGroup value={domain} onValueChange={setDomain}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Build" id="build" />
                  <Label htmlFor="build" className="font-normal cursor-pointer">
                    Build (121 questions)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Test" id="test" />
                  <Label htmlFor="test" className="font-normal cursor-pointer">
                    Test (105 questions)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Deploy" id="deploy" />
                  <Label htmlFor="deploy" className="font-normal cursor-pointer">
                    Deploy (107 questions)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Monitor" id="monitor" />
                  <Label htmlFor="monitor" className="font-normal cursor-pointer">
                    Monitor (106 questions)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mixed" id="mixed" />
                  <Label htmlFor="mixed" className="font-normal cursor-pointer">
                    Mixed (all domains)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>Number of Questions</Label>
              <RadioGroup
                value={questionCount.toString()}
                onValueChange={(val) => setQuestionCount(parseInt(val))}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="10" id="q10" />
                  <Label htmlFor="q10" className="font-normal cursor-pointer">
                    10 questions
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="20" id="q20" />
                  <Label htmlFor="q20" className="font-normal cursor-pointer">
                    20 questions
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="40" id="q40" />
                  <Label htmlFor="q40" className="font-normal cursor-pointer">
                    40 questions
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </>
        )}

        {isTimedExam && (
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold">Exam Configuration</h4>
            <ul className="space-y-2 text-sm">
              <li>• 40 questions from all domains (10 per domain)</li>
              <li>• 120 minutes (2 hours) time limit</li>
              <li>• 70% pass threshold (28/40 correct)</li>
              <li>• Timer will auto-submit when time expires</li>
            </ul>
          </div>
        )}

        <Button onClick={handleStart} className="w-full" size="lg">
          <Play className="h-4 w-4 mr-2" />
          {isTimedExam ? 'Start Exam' : 'Start Practice'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ExamSetupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-2xl mx-auto">
          <Suspense fallback={<div>Loading...</div>}>
            <ExamSetupForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
