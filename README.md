# LCAE Practice Exam

A polished, full-stack practice exam web application for the **LangChain Certified Agent Engineer (LCAE)** certification. Built with Next.js, TypeScript, Tailwind CSS, and PostgreSQL.

## Features

- **439 Practice Questions** across 4 domains: Build, Test, Deploy, Monitor
- **Google Sign-In** with Auth.js/NextAuth and Prisma adapter
- **Two Practice Modes:**
  - **Practice Mode:** Choose domain (Build/Test/Deploy/Monitor/Mixed), select question count (10/20/40), untimed
  - **Timed Exam Mode:** 40 questions (10 per domain), 120 minutes, 70% to pass
- **Instant Feedback:** After each answer, see correct/incorrect status, justification, and source
- **Progress Tracking:** Per-session and per-domain scoring, persistent history
- **Results Dashboard:** Detailed performance breakdown by domain
- **History Page:** View all past sessions with scores and timestamps
- **Dark Mode:** System-aware theme with manual toggle
- **Responsive Design:** Works great on desktop, tablet, and mobile

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** Auth.js (NextAuth v5) with Google provider
- **Testing:** Vitest for unit tests
- **Deployment:** Railway-ready

## Local Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Google OAuth credentials (optional for local testing)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd lcae-practice-exam
npm install
```

### 2. Database Setup

Start a local PostgreSQL database:

```bash
# Using Docker
docker run --name lcae-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lcae_practice_exam -p 5432:5432 -d postgres

# Or use your existing PostgreSQL installation
```

### 3. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lcae_practice_exam"
AUTH_SECRET="generate-with: openssl rand -base64 32"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# Optional: Enable test user for local development
TEST_USER_EMAIL="test@example.com"
NEXT_PUBLIC_TEST_USER_EMAIL="test@example.com"
```

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or use existing)
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. For production: `https://your-domain.com/api/auth/callback/google`
7. Copy Client ID and Client Secret to `.env`

**For local testing without Google OAuth:** Set `TEST_USER_EMAIL` in `.env` to enable a test credentials provider.

### 5. Database Migration and Seeding

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed questions from data/questions.json
npm run seed
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Run Tests

```bash
npm test
```

Tests cover:
- Domain filtering
- Question selection without duplicates
- Timed exam 40-question balanced mix (10 per domain)
- Pass threshold calculation (70%)
- Score percentage calculation
- Domain breakdown statistics

## Project Structure

```
.
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Auth.js handlers
│   │   ├── questions/    # Question fetching
│   │   ├── sessions/     # Session management
│   │   ├── answers/      # Answer submission
│   │   └── history/      # History and stats
│   ├── auth/signin/      # Sign-in page
│   ├── exam/
│   │   ├── setup/        # Mode picker
│   │   └── [id]/         # Exam interface
│   ├── results/[id]/     # Results page
│   ├── history/          # History page
│   └── page.tsx          # Home page
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── theme-toggle.tsx  # Dark mode toggle
│   └── sign-in-form.tsx  # Sign-in UI
├── lib/
│   ├── auth.ts           # Auth.js configuration
│   ├── db.ts             # Prisma client
│   └── utils.ts          # Utilities
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed script
├── data/
│   └── questions.json    # 439 questions
└── tests/
    └── exam-utils.test.ts # Unit tests
```

## Database Schema

- **User, Account, Session, VerificationToken:** Auth.js models
- **Question:** Question bank (id, domain, difficulty, question, options A-D, answer, justification, source)
- **UserSession:** Practice sessions (mode, domain, questionCount, correctCount, startedAt, completedAt, timeLimit)
- **UserAnswer:** Individual answers (userSessionId, questionId, selectedAnswer, isCorrect, answeredAt)

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server (runs migrations and seed first)
- `npm run seed` - Seed/update questions from JSON
- `npm test` - Run Vitest unit tests
- `npx prisma studio` - Open Prisma Studio (database GUI)

## Railway Deployment

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init
```

### 2. Add PostgreSQL

In Railway dashboard:
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically set `DATABASE_URL`

### 3. Set Environment Variables

In Railway project settings, add:

```
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
AUTH_URL=https://your-app.railway.app
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=<your-google-client-id>
AUTH_GOOGLE_SECRET=<your-google-client-secret>
```

**Important:** Update Google OAuth authorized redirect URI to include:
`https://your-app.railway.app/api/auth/callback/google`

### 4. Deploy

```bash
railway up
```

The app will:
1. Build with Nixpacks
2. Run `prisma migrate deploy` to apply migrations
3. Run `prisma db seed` to load questions (idempotent)
4. Start with `npm start`

### 5. Verify

Check Railway logs for successful migration and seed. Visit your app URL.

## Features Detail

### Practice Mode
- Choose any domain or mix all
- Select 10, 20, or 40 questions
- Untimed, relaxed practice
- Immediate feedback after each answer

### Timed Exam Mode
- Mirrors real LCAE exam: 40 questions, 120 minutes
- 10 questions per domain (Build, Test, Deploy, Monitor)
- Countdown timer with auto-submit
- 70% pass threshold (28/40 correct)

### Progress Tracking
- Each session saved with timestamp
- Per-domain performance breakdown
- Overall accuracy across all sessions
- Clear history option

### Question Bank
- 439 questions total
- Domains: Build (121), Test (105), Deploy (107), Monitor (106)
- Difficulties: easy (118), medium (240), hard (81)
- Each question includes justification and source reference

## Development

### Adding Questions

Edit `data/questions.json` and run:

```bash
npm run seed
```

The seed script upserts questions (updates existing, creates new).

### Modifying Schema

```bash
# Make changes to prisma/schema.prisma
npx prisma migrate dev --name your_migration_name
npx prisma generate
```

## Troubleshooting

### Auth Issues

- Verify `AUTH_SECRET` is set and unique
- Ensure `AUTH_TRUST_HOST=true` for Railway/production
- Check Google OAuth redirect URI matches exactly
- For local testing, set `TEST_USER_EMAIL` to bypass Google OAuth

### Database Issues

- Run `npx prisma migrate reset` to reset database (WARNING: deletes data)
- Check `DATABASE_URL` is correct
- Ensure PostgreSQL is running

### Build Issues

- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Verify Node version: `node -v` (18+)

## License

MIT

## Contributing

Pull requests welcome! Please ensure tests pass before submitting.

---

Built with ❤️ for LCAE certification prep
