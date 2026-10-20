import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Dev-only test credentials provider when TEST_USER_EMAIL is set
    ...(process.env.TEST_USER_EMAIL
      ? [
          Credentials({
            id: "test-credentials",
            name: "Test User",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (credentials.email === process.env.TEST_USER_EMAIL) {
                // Find or create test user
                let user = await prisma.user.findUnique({
                  where: { email: credentials.email as string },
                });

                if (!user) {
                  user = await prisma.user.create({
                    data: {
                      email: credentials.email as string,
                      name: "Test User",
                      emailVerified: new Date(),
                    },
                  });
                }

                return user;
              }
              return null;
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnExam = nextUrl.pathname.startsWith("/exam");
      const isOnHistory = nextUrl.pathname.startsWith("/history");
      const isOnResults = nextUrl.pathname.startsWith("/results");

      if (isOnExam || isOnHistory || isOnResults) {
        return isLoggedIn;
      }
      return true;
    },
  },
});
