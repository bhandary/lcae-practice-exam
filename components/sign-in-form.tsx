'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type Pending = 'google' | 'test' | null;

function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function SignInForm({
  callbackUrl,
  hasError,
}: {
  callbackUrl: string;
  hasError: boolean;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const testUserEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
  const busy = pending !== null;

  const handleGoogleSignIn = async () => {
    setPending('google');
    try {
      await signIn('google', { callbackUrl });
    } catch {
      setPending(null);
    }
  };

  const handleTestSignIn = async () => {
    if (!testUserEmail) return;
    setPending('test');
    try {
      await signIn('test-credentials', {
        email: testUserEmail,
        callbackUrl,
      });
    } catch {
      setPending(null);
    }
  };

  return (
    <div className={hasError ? 'mt-4' : 'mt-8'}>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={busy}
        aria-busy={pending === 'google'}
        className={cn(
          'inline-flex h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border px-5 text-[15px] font-medium leading-none transition-[background-color,box-shadow,transform] duration-150',
          'border-[#E4E1DA] bg-white text-[#1A1916] shadow-[0_1px_1px_rgba(28,27,25,0.04),0_1px_2px_rgba(28,27,25,0.05)]',
          'hover:bg-[#F6F5F1] hover:shadow-[0_1px_2px_rgba(28,27,25,0.06),0_8px_18px_rgba(28,27,25,0.06)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#6F6A62]',
          'active:translate-y-px active:bg-[#E9E7E1] active:shadow-none',
          'disabled:pointer-events-none disabled:opacity-80',
          'dark:border-[#3F3C37] dark:bg-[#262421] dark:text-[#F4F1EB] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]',
          'dark:hover:border-[#4A4641] dark:hover:bg-[#34322E]',
          'dark:focus-visible:outline-[#D4CFC6]',
          'dark:active:bg-[#1A1917]'
        )}
      >
        {pending === 'google' ? (
          <span
            className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <GoogleMark />
        )}
        {pending === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <p className="mt-4 text-[13px] leading-[1.6] text-[#6E6A63] dark:text-[#A8A399]">
        Google is asked only for OpenID, email, and profile. LCAE Practice Exam never reads your Gmail.
      </p>

      {testUserEmail ? (
        <button
          type="button"
          onClick={handleTestSignIn}
          disabled={busy}
          className="mt-6 block cursor-pointer text-left text-[13px] text-[#8A857C] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#4E4B46] hover:decoration-current focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6F6A62] disabled:pointer-events-none disabled:opacity-60 dark:text-[#9C978E] dark:hover:text-[#D0CBC3] dark:focus-visible:outline-[#D4CFC6]"
        >
          {pending === 'test' ? 'Signing in…' : 'Sign in as test user'}
        </button>
      ) : null}
    </div>
  );
}
