import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { BookOpen, Clock, History, LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth';

async function handleSignOut() {
  'use server';
  await signOut({ redirectTo: '/auth/signin' });
}

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/signin');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">LCAE Practice Exam</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {session.user.name || session.user.email}
            </span>
            <ThemeToggle />
            <form action={handleSignOut}>
              <Button variant="ghost" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Welcome to Your LCAE Practice
            </h2>
            <p className="text-lg text-muted-foreground">
              Prepare for your LangChain Certified Agent Engineer exam with 439 practice questions
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Practice Mode
                </CardTitle>
                <CardDescription>
                  Practice by domain or mix all sections. Untimed and flexible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/exam/setup?mode=practice">
                  <Button className="w-full" size="lg">
                    Start Practice
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Timed Exam
                </CardTitle>
                <CardDescription>
                  40 questions, 120 minutes. 70% to pass. Mirrors the real exam.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/exam/setup?mode=timed-exam">
                  <Button className="w-full" size="lg" variant="default">
                    Start Exam
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Your Progress
              </CardTitle>
              <CardDescription>
                View your past sessions and track improvement over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/history">
                <Button variant="outline" className="w-full">
                  View History
                </Button>
              </Link>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Question Bank:</strong> 439 questions across 4 domains
            </p>
            <p>
              Build (121) • Test (105) • Deploy (107) • Monitor (106)
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
