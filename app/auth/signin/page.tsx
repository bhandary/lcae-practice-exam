import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <SignInForm />
    </div>
  );
}
