import { Instrument_Serif } from 'next/font/google';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';
import { auth } from '@/lib/auth';

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Canonical copy from Auth.js sign-in and error pages
 * (`@auth/core` signinErrors and the AccessDenied / Configuration / Verification views).
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  default: 'Unable to sign in.',
  Signin: 'Try signing in with a different account.',
  OAuthSignin: 'Try signing in with a different account.',
  OAuthCallbackError: 'Try signing in with a different account.',
  OAuthCreateAccount: 'Try signing in with a different account.',
  EmailCreateAccount: 'Try signing in with a different account.',
  Callback: 'Try signing in with a different account.',
  OAuthAccountNotLinked:
    'To confirm your identity, sign in with the same account you used originally.',
  EmailSignin: 'The e-mail could not be sent.',
  CredentialsSignin: 'Sign in failed. Check the details you provided are correct.',
  SessionRequired: 'Please sign in to access this page.',
  AccessDenied: 'You do not have permission to sign in.',
  Configuration: 'There is a problem with the server configuration.',
  Verification:
    'The sign in link is no longer valid. It may have been used already or it may have expired.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function messageForAuthError(code: string | undefined): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  const match = Object.keys(AUTH_ERROR_MESSAGES).find(
    (key) => key.toLowerCase() === trimmed.toLowerCase()
  );
  return AUTH_ERROR_MESSAGES[match ?? 'default'];
}

function resolveCallbackUrl(raw: string | undefined, origin: string | null): string {
  const value = raw?.trim();
  if (!value || value.includes('\\')) return '/';

  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!origin) return '/';

  try {
    const url = new URL(value);
    if (url.origin !== origin) return '/';
    const next = `${url.pathname}${url.search}${url.hash}` || '/';
    if (!next.startsWith('/') || next.startsWith('//')) return '/';
    return next;
  } catch {
    return '/';
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [session, params, headerList] = await Promise.all([
    auth(),
    searchParams,
    headers(),
  ]);

  if (session?.user) {
    redirect('/');
  }

  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  const origin = host ? `${proto}://${host}` : null;
  const callbackUrl = resolveCallbackUrl(firstParam(params.callbackUrl), origin);
  const errorMessage = messageForAuthError(firstParam(params.error));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F3F4F1] px-6 pb-16 pt-10 antialiased dark:bg-[#1C1B19] sm:px-8 sm:pb-32 sm:pt-12">
      <div className="w-full max-w-[360px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9A958C] dark:text-[#9C978E]">
          LCAE Practice Exam
        </p>
        <h1
          className={`${instrumentSerif.className} mt-3.5 text-[2.55rem] font-normal leading-[0.94] tracking-[-0.03em] text-[#1A1916] dark:text-[#F4F1EB] sm:text-[3.05rem]`}
        >
          Agent Engineer
          <br />
          Practice
        </h1>
        <p className="mt-5 text-[15px] leading-[1.65] text-[#4E4B46] dark:text-[#C9C4BB]">
          Sign in with Google. Each account keeps its own practice sessions, scores, and progress by domain.
        </p>
        {errorMessage ? (
          <p
            role="alert"
            className="mt-6 text-[13.5px] leading-relaxed text-[#6A5648] dark:text-[#D7C6B6]"
          >
            {errorMessage}
          </p>
        ) : null}
        <SignInForm callbackUrl={callbackUrl} hasError={errorMessage !== null} />
      </div>
    </div>
  );
}
