# Little Mahilam Backend

NestJS 12 + PostgreSQL + Prisma 7 backend for the Little Mahilam Preschool public website, CMS and CRM.

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

## Integrations

Fill in the Cloudflare R2, Resend and Meta WhatsApp Cloud API values in `.env` to enable them. Uploaded images are checked by their file signature, not only by their declared type.

## Prisma migration on Windows Application Control

If Windows blocks Prisma's unsigned native schema engine with `spawn UNKNOWN`, keep Application Control enabled and run the migration through the Linux tooling container:

```powershell
$env:MIGRATION_NAME="init"
npm.cmd run prisma:migrate:docker
```

The container reads `DATABASE_URL` from `.env` and writes the generated migration back into `prisma/migrations` through the project mount.

## Prisma 7 note

This backend uses Prisma 7 with `prisma.config.ts`, the generated `prisma-client`, and the PostgreSQL driver adapter (`@prisma/adapter-pg`).
