# LYRO — Product Requirements Doc

## Original problem statement
Build a responsive WEB APP called LYRO — an AI-powered marks-tracking and
parent-communication tool for coaching centers (JEE / NEET / NDA / Board).
Teacher enters marks once. LYRO turns them into clear, AI-generated progress
summaries and keeps parents informed. Flags weak students early. Single loop:
create batch → add students → enter marks → view AI progress → share with parent.

## Tech stack
- Backend: FastAPI + MongoDB (motor), JWT + bcrypt auth
- Frontend: React (CRA) + Tailwind + shadcn/ui + Recharts + Phosphor Icons + Sonner (toasts)
- AI: Claude Sonnet 4.5 via `emergentintegrations` (Emergent Universal LLM key)
- QR generation: `qrcode[pil]` (UPI QR)

## Users
- Center owner (email/password login) — sees only their own data
- Parents — no login; receive updates via WhatsApp / copy-share

## Implemented (2026-02-04)
### Core loop
- Email/password auth (JWT). Demo owner `owner@lyro.demo / demo1234` seeded on startup.
- Batches CRUD, per-owner isolation (via `center_id`)
- Students CRUD (name + parent WhatsApp + optional course override)
- Tests CRUD (name, subject, chapter, max_marks, date)
- Fast marks grid: keyboard-jump (Enter / ↑ ↓), bulk save, upsert semantics
- Student profile: line chart (Recharts) + history table + rank
- Batch dashboard: class avg, top performers, at-risk (>15% drop), full ranking
- AI endpoints: `/progress-summary`, `/parent-message`, `/monthly-report` (Claude Sonnet 4.5)
- Copy-to-clipboard + WhatsApp deep links (`wa.me/<phone>?text=…`)
- Curated JEE syllabus (Physics/Chemistry/Maths + chapters). NEET/NDA/Boards = empty containers

### Payment QR (added same day)
- Settings page: enter UPI ID or upload own QR image
- Auto-generated UPI QR via `qrcode[pil]` (fallback when no image uploaded)
- Public PNG endpoint `/api/centers/{id}/payment-qr.png`
- Monthly report auto-appends footer with UPI ID + QR URL
- Monthly Report card in UI displays the QR alongside the report so teacher can share it

### Testing
- iteration_1: 100% pass (backend 27/27, frontend E2E happy path)
- iteration_2: Payment QR backend 15/15 pass; Settings page UI verified via screenshot

## Data model (MongoDB collections)
users, centers (+ payment_settings sub-doc), batches, students, tests, marks

## Not built (per spec)
Payments processing/tracking, attendance, timetables, student/parent login,
automated WhatsApp API, multi-branch, roles/permissions.

## Backlog (P1)
- Populate NEET / NDA / Boards syllabi (containers exist; data pending)
- Add data-testid on batch → students tab hyperlink for smoother QA automation
- Refresh preview instantly after `Clear all` in Settings (minor UX polish)

## Backlog (P2)
- CSV import/export of marks
- Class-wide monthly digest (all students in one PDF/message)
- PWA manifest + install prompt
- Custom subject/chapter authoring (beyond curated syllabi)
- Multi-teacher within a center (roles)

## Test credentials
See `/app/memory/test_credentials.md`
