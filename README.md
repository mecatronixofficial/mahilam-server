# Little Mahilam Backend

NestJS 11 + PostgreSQL + Prisma 7 backend for the Little Mahilam Preschool public website, CMS and CRM.

## Setup

```powershell
bun install                  # or npm install
copy .env.example .env       # then fill in the values
npm run prisma:deploy        # apply migrations (use prisma:migrate in development)
npm run prisma:seed          # optional: admin user, classes, programs
npm run start:dev            # http://localhost:4000/api/v1, docs at /api/docs
```

Production: `npm run build && npm run start:prod`. Run `npm run prisma:deploy` on every deploy before starting the new build.

## Conventions

- Every response is `{ success, data, message? }`. Errors are `{ success:false, statusCode, message, errors? }`, where `message` is always a readable string.
- List endpoints accept optional `?page=&limit=&search=`. Without `page`/`limit` they return every row (as before); with them, the response adds `meta: { page, limit, total, pages }`.
- Authentication uses HTTP-only cookies (15 min access token, 7 day rotating refresh token).
- **Roles:** any signed-in user can read CRM/CMS data and create or edit records. Deletes, CMS content changes, fee edits and voids, academics setup, staff management, fee reports and CSV exports require `ADMIN` or `SUPER_ADMIN`.
- Every successful write by a signed-in user is recorded in the audit log (passwords are redacted).

## API overview (`/api/v1`)

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` (liveness), `GET /health/ready` (checks the database) |
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/change-password`, `GET /auth/me` |
| Public site | `GET /cms/public/home`, `banners`, `announcements`, `programs[/:slug]`, `facilities`, `activities[/:slug]`, `testimonials`, `events[/:slug]` (`?when=upcoming\|past`), `gallery[/:slug]`, `blogs[/:slug]`, `settings`; `POST /cms/public/testimonials` |
| Enquiries | `POST /enquiries/public`; `GET/POST /enquiries` (filters: `status`, `source`, `assignedStaffId`, `followUpDue=true`); `GET/PATCH/DELETE /enquiries/:id`; `POST /enquiries/:id/follow-ups`; `DELETE /enquiries/:id/follow-ups/:followUpId` |
| Students | `GET/POST /students` (filters: `status`, `classLevelId`, `sectionId`); `GET/PATCH/DELETE /students/:id`; `POST /students/:id/guardians`; `PATCH/DELETE /students/:id/guardians/:guardianId` |
| Admissions | `GET/POST /admissions`; `GET/PATCH/DELETE /admissions/:id`; `POST /admissions/:id/confirm` (creates the student record) |
| Fees | `GET/POST /fees`; `GET/PATCH/DELETE /fees/:id`; `GET/POST /fees/payments`; `POST /fees/payments/:id/void`; CRUD `/fees/types`, `/fees/structures`; `POST /fees/structures/:id/assign` |
| Academics | CRUD `/academics/years`, `/academics/classes`, `/academics/sections` |
| CMS admin | CRUD `/cms/announcements`, `banners`, `blogs`, `testimonials`, `events`, `gallery/albums`, `gallery/items`, `programs`, `facilities`, `activities`; `GET/POST /cms/settings`, `DELETE /cms/settings/:key` |
| Staff | `GET/POST /staff`, `PATCH/DELETE /staff/:id` |
| Reports | `GET /reports/dashboard`, `enquiries`, `admissions`, `fees`, `audit-logs`; CSV: `/reports/export/{enquiries,students,fees,payments}.csv` (`?from=&to=` where relevant) |
| Integrations | `GET /integrations/status`, `POST /integrations/uploads/image` (multipart field `file`) |

Public settings: only keys starting with `school.`, `site.`, `social.` or `public.` are exposed by `GET /cms/public/settings`.

## Performance notes

- Public website endpoints are cached in memory (`PUBLIC_CACHE_TTL_MS`, default 60 s) and send `Cache-Control` headers. Any CMS change clears the cache immediately.
- New enquiry notifications (Resend / WhatsApp) are sent in the background, so the public form responds straight away. Notification failures are logged and never lose the enquiry.
- Enquiry, student, admission and receipt numbers come from an atomic per-year counter (`Sequence` table), which avoids duplicates under concurrency or after deletes.
- Payments lock the fee row, so concurrent payments can't corrupt totals, and overpayments are rejected.
- Indexes cover every foreign key and the common list filters; see the `20260929120000_add_sequences_and_indexes` migration.

## Scheduled jobs

Hourly: purge expired refresh sessions. Daily at 00:30 (`TZ`): mark unpaid past-due fees `OVERDUE`. Weekly: prune audit logs older than `AUDIT_RETENTION_DAYS`. If you run more than one instance, set `DISABLE_CRON=true` on all but one.

On Vercel the in-process scheduler is switched off; instead Vercel Cron calls `GET /api/v1/tasks/run` once a day at 00:30 IST (19:00 UTC) and runs all three jobs. It requires `Authorization: Bearer $CRON_SECRET`.

## Deploying to Vercel

`vercel.json` installs with Bun and runs `bun run build` (Prisma generate + TypeScript build) and serves the compiled app from one serverless function, `api/index.js` -> `src/serverless.ts`. Every path is rewritten to it, so URLs stay `/api/v1/...`. Local development and Docker still use `src/main.ts`; both share `src/app.factory.ts`.

The server, Prisma client and Vercel entry point use native ES modules. Nest packages are pinned to the CommonJS-compatible NestJS 11 line because the Vercel runtime rejects the `require()` call from `@nestjs/throttler` to the ESM-only NestJS 12 packages. Keep these package versions and `bun.lock` in sync. `package.json` pins the deployment runtime to Node.js 24.x. After updating an existing project, redeploy with the build cache disabled once to replace the old CommonJS output. Verify `GET /api/v1/health` and `GET /api/v1/cms/public/settings` after deployment.

1. Import this repo as a Vercel project (root: this folder). `vercel.json` sets the build and output, so no framework preset is needed.
2. Set the environment variables from `.env.example`. Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL` and `CRON_SECRET`. Use a pooled database URL and `DATABASE_POOL_MAX=1`-`3`.
3. Run migrations against the production database from your machine or CI: `DATABASE_URL=... bun run prisma:deploy` (and `prisma:seed` once). Builds do not migrate.
4. The frontend sends browser requests through its own `/api/v1` proxy. Set its `API_URL_INTERNAL` (or existing `NEXT_PUBLIC_API_URL` fallback) to this backend's complete URL, such as `https://mahilam-server.vercel.app/api/v1`, then redeploy the frontend. Cookies remain HTTP-only, Secure and `SameSite=Lax` on the frontend host, so CMS/CRM sign-in works across separate Vercel projects. Set this backend's `FRONTEND_URL` to the frontend origin, such as `https://mahilam-ui.vercel.app`. Verify `/api/v1/health` on the frontend returns JSON before testing sign-in.

Limits to know: request bodies are capped at 4.5 MB on Vercel (below the 5 MB image-upload limit), requests time out after 30 s (`maxDuration`), and the in-memory public cache and rate limits are per function instance.

## Integrations

Fill in the Cloudflare R2, Resend and Meta WhatsApp Cloud API values in `.env` to enable them. Uploaded images are checked by their file signature, not only by their declared type.

## Database connection troubleshooting

Run `bun run db:check` to test the API's effective `DATABASE_URL` without printing credentials. As in the API, an inherited environment variable takes precedence over `.env`.

`Can't reach database server` (Prisma `P1001`) indicates a connectivity failure. Check that the provider's service is running, the hostname and port match its current connection URI, and your network/firewall and provider IP allow-list permit access. The diagnostic distinguishes DNS, timeout/refused-connection, credential and TLS errors. If a later check succeeds, the earlier failure may have been temporary; a successful check cannot establish the cause of a past outage.

PostgreSQL code `28P01` (Prisma `P1000`) means the database rejected the credentials. Replace `DATABASE_URL` with the current connection URI from the database provider and restart `bun run start:dev`. When assembling a URI manually, percent-encode special characters in the username and password. Keep the provider's SSL parameters. Applying migrations does not fix rejected credentials or connectivity failures.

Startup executes `SELECT 1` through Prisma before the API reports that it has started. The pg adapter opens connections lazily, so `$connect()` alone does not prove PostgreSQL is reachable. A later database outage is still possible; `GET /api/v1/health/ready` checks current connectivity.

## Prisma migration on Windows Application Control

If Windows blocks Prisma's unsigned native schema engine with `spawn UNKNOWN`, keep Application Control enabled and run the migration through the Linux tooling container:

```powershell
$env:MIGRATION_NAME="init"
npm.cmd run prisma:migrate:docker
```

The container reads `DATABASE_URL` from `.env` and writes the generated migration back into `prisma/migrations` through the project mount.

## Prisma 7 note

This backend uses Prisma 7 with `prisma.config.ts`, the generated `prisma-client`, and the PostgreSQL driver adapter (`@prisma/adapter-pg`).

## School CRM release and integration verification

The CRM reuses the existing NestJS modules, Prisma/PostgreSQL adapter and cookie JWT sessions. The public form enters Enquiry with purpose ADMISSION or CONTACT; scheduled follow-ups use FollowUpTask while EnquiryFollowUp remains a retained contact log. Enrollment and financial changes lock linked rows and commit critical audit records atomically.

Pending school migrations, as checked read-only on 22 October 2026: 20261009120000_add_learning_photos and 20261022090000_complete_school_crm. The latter is additive and transactional, preserves old enum values, and rejects conflicting current-year/application/primary-guardian history instead of deleting it. New private files are stored in authenticated database records, never public R2 URLs. Complete source and verification evidence are in ../../UI/mahilam-ui/SCHOOL_CRM_AUDIT_AND_COMPLETION.md.

For release, preserve a recoverable backup and rehearse on a restored copy, inspect the preflight output, apply reviewed pending migrations with bun run prisma:deploy, deploy this backend, and then release the matching frontend. Builds do not migrate. Do not reset or seed the school database to enable the CRM. Legacy drafts must receive factual class/year/consent/document details before submission.

The regular test command builds before running all existing and new tests:

~~~powershell
bun run typecheck
bun run test
~~~

The PostgreSQL workflow is opt-in. Supply a NEW EMPTY disposable local database each run:

~~~powershell
$env:CRM_TEST_DATABASE_URL='<local PostgreSQL URL with database mahilam_crm_test_unique>'
bun run test
~~~

The integration harness explicitly rejects remote hosts, names without the mahilam_crm_test_ prefix, and nonempty public schemas. It never falls back to DATABASE_URL, resets an existing database, or seeds school records. It deploys all migrations, tests actual persistence/concurrent enrollment/concurrent void/forced rollback, verifies CMS publishing and cache invalidation, guardians, attendance, academics, fees/settings/staff, and leaves synthetic fixtures only in the disposable database. With no test URL this one test is skipped, not certified as passing.

The frontend's tests/crm-browser.mjs can then use that migrated synthetic database via CRM_BROWSER_DATABASE_URL. It starts the real API and temporary production frontend/Chrome, forwards browser API requests to that isolated API, and verifies the public form, login, roles, mutations, saved refresh, failed-request rollback and responsive pages. No real parent message is sent; test provider credentials are cleared and cron jobs disabled.

Use bun scripts/crm-readonly-audit.mjs [optional-output-path] for school schema/migration metadata and aggregate compatibility diagnostics. It uses BEGIN READ ONLY and does not output family rows or connection credentials.

Messaging: existing Resend/Meta new-enquiry notifications remain supported. General CRM communication records have RECORDED status; delivery is never asserted without provider evidence. Configure and verify actual production providers separately.
