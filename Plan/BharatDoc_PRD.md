# BharatDoc — Product Requirements Document

## 1. Executive Summary
BharatDoc is a mobile-first Progressive Web App (PWA) designed for small clinics in India. It enables doctors to record patient consultations, transcribe them using OpenAI GPT-4o-mini Transcription, generate AI-powered clinical summaries via GPT-4o-mini, and save those summaries as PDF records tied to a patient ID. The app is built for low-connectivity environments with offline-first local recording, manual transcription triggers, and a phone + OTP authentication flow.

**Target Users:** ~10 doctors across one or more clinics  
**Primary Device:** Android smartphones (iOS supported)  
**Deployment:** PWA (installable, no app store required)  
**Backend:** Railway.app Node/Express worker + Vercel (Next.js frontend)
---
## 2. Problem Statement
Doctors in Indian clinics spend significant time on post-consultation documentation. Clinical notes are often incomplete, delayed, or inconsistent. BharatDoc eliminates this friction by capturing consultation audio, converting it to structured clinical summaries using AI, and making those summaries instantly available as PDF records — without requiring EHR integration.

---
## 3. Goals & Non-Goals
### Goals
- Allow doctors to record consultations on their phone with one tap
- Store audio locally when offline and sync/process when connected
- Transcribe audio via OpenAI GPT-4o-mini Transcription API (manually triggered)
- Generate editable clinical summaries via GPT-4o-mini using doctor-configured prompts
- Export and store the summary as a PDF linked to a patient ID
- Provide secure, individual doctor logins via phone number + OTP
- Group doctors under a clinic with an owner-controlled approval flow
- Allow clinic-scoped patient record search across all doctors

### Non-Goals (v1)
- No EHR/HIS direct integration
- No automated or always-on recording
- No real-time transcription during recording
- No patient-facing interface
- No billing or prescription management
- No co-owner or deputy role (one owner per clinic)
- No multi-clinic support for a single doctor

---

## 4. User Personas

### Dr. (Doctor — Primary User)
- A general practitioner or specialist in a small Indian clinic
- Sees 30–80 patients/day; primarily on Android phone
- Often on spotty internet (2G/3G/poor 4G)
- Comfortable with WhatsApp-level UX; not technically advanced
- Wants minimal friction — recording must be one-tap

### Clinic Owner (Owner — Elevated Role)
- One doctor per clinic holds the Owner role
- Responsible for approving new doctor registrations
- Manages clinic profile (name, logo, address)
- Has all the same recording/transcription features as a regular doctor
- Accesses a lightweight admin dashboard inside Settings

---

## 5. Authentication & Onboarding

### Provider: Firebase Authentication
Firebase Authentication handles phone number + OTP login. Free tier, native OTP SMS delivery, proven at scale, integrates cleanly with Next.js.

### Account States

Every doctor account has an `account_status` that gates their access:

| Status | Meaning | App Experience |
|--------|---------|----------------|
| `pending_approval` | Joined a clinic, awaiting owner approval | Locked screen with status message |
| `active` | Approved and fully operational | Full app access |
| `rejected` | Rejected or removed by clinic owner | Rejection screen on login |

---

### Sign-Up Flow

#### Step 1 — Phone + OTP (all users)
- Enter mobile number → receive OTP → verify
- Firebase session created

#### Step 2 — Personal Profile (all users)
All fields on a single screen:

| Field | Required | Notes |
|-------|----------|-------|
| Full name | ✅ | Appears on all PDFs |
| Specialization | ✅ | e.g., General Physician, Cardiologist; appears on PDFs |
| Medical registration no. | Optional | Shown in PDF footer |
| Profile photo | Optional | Shown in app header |

#### Step 3 — Clinic Setup (two paths)

**Path A — Create a new clinic (becomes Owner)**
- Enter clinic name ✅
- Enter clinic address (optional, shown on PDFs)
- Upload clinic logo (optional, shown on PDFs)
- Account created: `role = 'owner'`, `account_status = 'active'`
- A unique 6-character **Clinic Code** is auto-generated (e.g., `MED42X`)
- Owner lands directly on Dashboard

**Path B — Join an existing clinic (becomes Doctor)**
- Enter the 6-character Clinic Code (shared by owner verbally or via WhatsApp)
- Clinic name shown as read-only confirmation
- Account created: `role = 'doctor'`, `account_status = 'pending_approval'`
- A join request is created in `clinic_join_requests`
- Doctor sees: *"Your request to join [Clinic Name] is pending approval from the clinic owner. You'll be notified once approved."*
- No app features accessible until approved

---

### Approval Flow

```
DOCTOR registers with Clinic Code
         │
         ▼
clinic_join_requests row created (status = 'pending')
doctors.account_status = 'pending_approval'
         │
         ▼
OWNER sees badge in Settings → "1 Pending Approval"
Owner opens Clinic Admin → Pending Approvals list
Owner reviews: name, phone, specialization, requested date
         │
    ┌────┴────┐
  Approve    Reject
    │           │
    ▼           ▼
account_status  account_status
= 'active'      = 'rejected'
join_request    join_request
status =        status =
'approved'      'rejected'
    │           │
    ▼           ▼
Doctor gets   Doctor sees
full access   rejection screen
              on next login
```

---

## 6. Core Features

### 6.1 Dashboard (Home Screen)

**Elements:**
- Large "Start Recording" CTA (bottom thumb-zone)
- **Clinic name displayed prominently** in the app header (below doctor name), always visible as context
- Recent recordings list (last 10): Patient ID, date/time, duration, doctor name (for clinic-scoped view), status badge
- Quick search by Patient ID (clinic-scoped — shows all doctors' records)
- Doctor name + clinic name + profile photo in header
- Settings icon (with badge count for pending approvals, Owner only)

**Status Badge Color Coding:**

| Status | Color | Meaning |
|--------|-------|---------|
| Recorded | Gray | Audio saved locally or uploaded; not transcribed |
| Transcribed | Blue | GPT-4o-mini Transcription API processed the audio |
| Summary Ready | Amber | GPT summary generated; pending doctor review |
| PDF Saved | Green | Summary finalized and saved |

---

### 6.2 Recording Screen

**Pre-Recording:**
- Clinic name shown at top of screen (read-only context banner)
- Optional: Patient ID, consultation label
- "Start Recording" button

**During Recording:**
- Waveform visualizer, elapsed timer
- Pause / Stop buttons
- Audio chunks written to IndexedDB every 30 seconds
- Format: WebM/Opus (Android) or MP4/AAC (iOS) via RecordRTC
- Hard limit: 60 minutes

**Post-Recording:**
- Playback with scrubber
- Patient ID (mandatory before transcription or PDF generation)
- Consultation label (optional)
- Actions: "Transcribe Now" (online) or "Save & Transcribe Later" (offline-safe)

**Offline Handling:**
- Banner: *"You're offline. Recording saved locally. Transcribe when connected."*
- Offline recordings flagged with 📴 in Dashboard
- On reconnect: *"You have X recordings pending transcription"*
- Never auto-uploaded — always manually triggered

---

### 6.3 Transcription

**Trigger:** Doctor taps "Transcribe" on any `Recorded` status entry.

**Flow:**
1. Connectivity check — error shown if offline
2. Audio POSTed to Railway worker
3. Railway calls GPT-4o-mini Transcription API (`gpt-4o-mini-transcribe`); language hint from doctor's Settings
4. Transcript saved to Supabase; status → `Transcribed`
5. Transcript shown in read-only view

**Error Handling:**
- Upload failure: 3 retries with exponential backoff
- Whisper error: human-readable message + Retry button
- Large files (> 25MB): Railway splits into 5-min chunks with 10s overlap, stitches result

---

### 6.4 Summary Generation

**Trigger:** Doctor taps "Generate Summary" on any `Transcribed` recording.

**Flow:**
1. Transcript + doctor's system prompt sent to Railway
2. Railway calls GPT-4o-mini
3. Summary returned in editable rich text field
4. Doctor edits → "Save Summary" → status → `Summary Ready`

**Default System Prompt:**
```
You are a clinical documentation assistant. Based on the following doctor-patient 
conversation transcript, generate a structured clinical summary with these sections:

- Chief Complaint
- History of Present Illness
- Key Findings / Symptoms Mentioned
- Provisional Diagnosis (if mentioned)
- Treatment / Prescription (if mentioned)
- Follow-up Instructions (if mentioned)
- Additional Notes

Be concise, clinical, and factual. Do not infer anything not explicitly mentioned.

Transcript:
{{transcript}}
```

**Custom Prompt (Settings):**
- Doctor replaces default prompt; must contain `{{transcript}}`
- Preview/test mode: paste sample transcript, run test generation
- Changes apply to future summaries only

---

### 6.5 PDF Generation & Storage

**Trigger:** Doctor taps "Save as PDF" from Summary screen.

**PDF Contents:**
- Clinic logo + name + address (from clinic profile)
- Doctor name + specialization + medical registration no.
- Patient ID, consultation date/time, label
- Full summary (post-edits)
- Footer: *"Generated by BharatDoc | AI-assisted — verify before clinical use"*

**Storage:** Railway generates PDF (`@react-pdf/renderer`) → uploaded to Supabase Storage (private bucket, signed URLs) → metadata saved in DB → status → `PDF Saved`

**Frontend Actions:** View (signed URL) | Download | Share (Web Share API)

---

### 6.6 Patient Record Search

Accessible from bottom nav. **Clinic-scoped** — searches across all doctors in the same clinic.

- Search by Patient ID (exact or prefix match)
- Results: all recordings/summaries for that patient across the clinic, sorted newest-first
- Each result shows: date, **clinic name**, doctor name, label, status, PDF link
- Clinic name shown in the search results header as scope context: *"Showing records for Patient [ID] across [Clinic Name]"*
- A doctor cannot see recordings from a different clinic

---

### 6.7 Doctor Settings

**Profile**
- Edit name, specialization, medical reg no., profile photo
- Phone number (read-only)

**Transcription**
- Default language: Auto-detect / Hindi / English / Hinglish

**Summary Prompt**
- Active GPT prompt editor with `{{transcript}}` validation
- Reset to Default, Preview/Test mode

**Account**
- Logout
- Delete account (with confirmation)

---

### 6.8 Clinic Owner Admin Dashboard (Settings → Clinic Admin Tab)

Accessible only to doctors with `role = 'owner'`. A dedicated tab in Settings — not a separate page.

#### Pending Approvals
- List: doctor name, phone, specialization, requested date
- Actions: **Approve** / **Reject** (optional rejection reason)
- Badge count shown on Settings nav icon when requests are pending

#### Active Doctors
- All approved doctors in the clinic
- Shows: name, specialization, phone, join date, total recording count
- Action: **Remove from Clinic** (sets `account_status = 'rejected'`; doctor loses access immediately)

#### Clinic Profile
- Edit clinic name, address, logo
- **Clinic Code** displayed (read-only, tap-to-copy) — owner shares this with new doctors verbally or via WhatsApp

#### Rejected / Removed Doctors
- Historical list for audit trail
- Action: **Re-approve** (reactivates account → `account_status = 'active'`)

---

## 7. Engineering Implementation

### 7.1 Final Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Next.js 14 (App Router) | SSR + PWA support; API routes for lightweight calls |
| **Frontend Hosting** | Vercel Free Tier | Free; 10s timeout acceptable — heavy work offloaded to Railway |
| **Auth** | Firebase Authentication | Free OTP phone login; no monthly fee |
| **Database** | Supabase (managed Postgres) | Managed Postgres + Storage in one dashboard; generous free tier |
| **File Storage** | Supabase Storage | Included in Supabase; signed URLs; free for MVP. Migrate to Cloudflare R2 when egress costs grow |
| **Backend Worker** | Railway.app (Node.js + Express) | Persistent server; no function timeout; free ~500hrs/mo on Hobby plan |
| **Audio Recording** | RecordRTC | Abstracts Android/iOS format differences; Whisper-compatible |
| **Local Storage** | IndexedDB via `idb` | Audio chunks during recording; survives crashes and offline sessions |
| **Transcription** | OpenAI GPT-4o-mini Transcription (`gpt-4o-mini-transcribe`) | Best accuracy for Indian English + Hindi; priced per token (audio input) |
| **Summarization** | OpenAI GPT-4o-mini | 8× cheaper than GPT-4o; sufficient for structured clinical summaries |
| **PDF Generation** | `@react-pdf/renderer` | Runs in Node.js; no headless browser; adequate for text-heavy documents |
| **UI Components** | Tailwind CSS + shadcn/ui | Accessible by default; rapid development; mobile-first |
| **PWA** | `@ducanh2912/next-pwa` | Service worker + manifest for Next.js |

---

### 7.2 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DOCTOR'S PHONE                       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Next.js PWA (Vercel Free)               │  │
│  │  ┌─────────────┐    ┌──────────────────────────┐  │  │
│  │  │  IndexedDB  │    │   Service Worker Cache   │  │  │
│  │  │ (audio      │    │   (app shell, offline    │  │  │
│  │  │  chunks)    │    │    dashboard read)       │  │  │
│  │  └─────────────┘    └──────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS (manual trigger only)
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌─────────────────────┐       ┌────────────────────────────┐
│  Vercel (Next.js)   │       │  Railway.app Worker        │
│  API Routes         │       │  (Node.js + Express)       │
│  - Auth callbacks   │       │                            │
│  - Lightweight CRUD │       │  POST /transcribe          │
│    (recordings,     │       │  → GPT-4o-mini Transcription API             │
│    approvals, etc.) │       │                            │
│                     │       │  POST /summarize           │
│  No heavy AI calls  │       │  → GPT-4o-mini             │
│  (10s timeout safe) │       │                            │
└────────┬────────────┘       │  POST /generate-pdf        │
         │                    │  → @react-pdf/renderer     │
         │                    │  → Supabase Storage upload │
         │                    └────────────┬───────────────┘
         └──────────────┬──────────────────┘
                        ▼
           ┌────────────────────────┐
           │        Supabase        │
           │  ┌──────────────────┐  │
           │  │   Postgres DB    │  │
           │  │  clinics         │  │
           │  │  doctors         │  │
           │  │  recordings      │  │
           │  │  join_requests   │  │
           │  └──────────────────┘  │
           │  ┌──────────────────┐  │
           │  │  Storage Buckets │  │
           │  │  audio / pdfs    │  │
           │  └──────────────────┘  │
           └────────────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │      OpenAI APIs       │
           │  Whisper + GPT-4o-mini │
           └────────────────────────┘
```

---

### 7.3 Vercel vs. Railway: Responsibility Split

| Operation | Handled By | Reason |
|-----------|-----------|--------|
| Auth callbacks / session validation | Vercel | Fast; < 1s |
| Fetch recordings list | Vercel | Simple DB read |
| Save edited summary text | Vercel | Simple DB write |
| Patient ID search | Vercel | Simple DB query |
| Approve / reject doctor | Vercel | Simple DB write |
| **Upload audio → Whisper transcription** | **Railway** | 30–90s; timeout-sensitive |
| **GPT-4o-mini summary generation** | **Railway** | 5–15s; safer on persistent server |
| **PDF generation + Supabase upload** | **Railway** | CPU + I/O intensive |

---

### 7.4 Database Schema

#### `clinics`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | Auto-generated |
| name | TEXT | NOT NULL | Shown on PDFs and sign-up confirmation |
| clinic_code | TEXT | UNIQUE, NOT NULL | 6-char alphanumeric e.g. `MED42X`; auto-generated at clinic creation; shared by owner to onboard doctors |
| address | TEXT | | Optional; shown on PDFs |
| logo_storage_path | TEXT | | Optional; Supabase Storage path |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

#### `doctors`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | Auto-generated |
| firebase_uid | TEXT | UNIQUE, NOT NULL | From Firebase Auth; used to identify session |
| clinic_id | UUID | FK → clinics | Set at sign-up; NULL briefly before clinic assignment |
| role | TEXT | NOT NULL | `'owner'` or `'doctor'` |
| account_status | TEXT | NOT NULL | `'pending_approval'` / `'active'` / `'rejected'` |
| name | TEXT | NOT NULL | Shown on PDFs |
| specialization | TEXT | NOT NULL | e.g., "General Physician"; shown on PDFs |
| medical_reg_no | TEXT | | Optional; shown in PDF footer |
| phone | TEXT | NOT NULL | Firebase-verified phone number |
| profile_photo_path | TEXT | | Optional; Supabase Storage path |
| custom_prompt | TEXT | | NULL → system default prompt used |
| transcription_lang | TEXT | NOT NULL | Default `'auto'` |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

#### `clinic_join_requests`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| clinic_id | UUID | FK → clinics, NOT NULL | The clinic being requested to join |
| doctor_id | UUID | FK → doctors, NOT NULL | The requesting doctor |
| status | TEXT | NOT NULL | `'pending'` / `'approved'` / `'rejected'` |
| rejection_reason | TEXT | | Optional; set by owner on reject |
| requested_at | TIMESTAMPTZ | NOT NULL | |
| reviewed_at | TIMESTAMPTZ | | NULL until owner acts |
| reviewed_by | UUID | FK → doctors | NULL until owner acts; must be `role = 'owner'` |

> One active request per doctor at a time. Enforce via partial unique index:  
> `CREATE UNIQUE INDEX idx_one_pending_request ON clinic_join_requests(doctor_id) WHERE status = 'pending';`

---

#### `recordings`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | Client-generated before upload (allows optimistic local tracking) |
| doctor_id | UUID | FK → doctors, NOT NULL | Recording owner |
| clinic_id | UUID | FK → clinics, NOT NULL | Denormalized for fast clinic-scoped patient search |
| patient_id | TEXT | | Mandatory before PDF generation; not enforced at DB level to allow post-recording tagging |
| label | TEXT | | Optional consultation label |
| duration_seconds | INTEGER | | |
| audio_storage_path | TEXT | | Supabase Storage path; NULL if only stored locally |
| transcript | TEXT | | NULL until transcribed |
| summary | TEXT | | NULL until generated |
| pdf_storage_path | TEXT | | NULL until PDF saved |
| status | TEXT | NOT NULL | `'recorded'` / `'transcribed'` / `'summary_ready'` / `'pdf_saved'` |
| recorded_at | TIMESTAMPTZ | NOT NULL | Device-captured timestamp (not server time) |
| created_at | TIMESTAMPTZ | NOT NULL | DB insert timestamp |

---

### 7.5 Database Indexes

```sql
-- Doctor's own recordings, sorted by date (Dashboard list)
CREATE INDEX idx_recordings_doctor_date
  ON recordings(doctor_id, recorded_at DESC);

-- Clinic-scoped patient search (cross-doctor lookup)
CREATE INDEX idx_recordings_clinic_patient
  ON recordings(clinic_id, patient_id);

-- Pending approval lookups (owner admin dashboard)
CREATE INDEX idx_join_requests_clinic_status
  ON clinic_join_requests(clinic_id, status);

-- Clinic code lookup at sign-up (fast exact match)
CREATE UNIQUE INDEX idx_clinics_code
  ON clinics(clinic_code);

-- Prevent duplicate pending requests per doctor
CREATE UNIQUE INDEX idx_one_pending_request
  ON clinic_join_requests(doctor_id)
  WHERE status = 'pending';
```

---

### 7.6 Sign-Up & Approval Flow (Engineering Detail)

```
OWNER ONBOARDING
──────────────────────────────────────────────────────────
1. POST /api/auth/register
   Body: { firebase_uid, phone, name, specialization,
           medical_reg_no?, profile_photo_path?,
           clinic_name, clinic_address?, clinic_logo_path? }
2. Server:
   a. INSERT INTO clinics (name, address, logo_storage_path,
                           clinic_code = generate_code())
   b. INSERT INTO doctors (firebase_uid, clinic_id, role='owner',
                           account_status='active', ...)
3. Response: { doctor, clinic } → redirect to Dashboard

DOCTOR SIGN-UP (via Clinic Code)
──────────────────────────────────────────────────────────
1. GET /api/clinics/lookup?code=MED42X
   Response: { clinic_id, clinic_name } or 404
2. POST /api/auth/register
   Body: { firebase_uid, phone, name, specialization,
           medical_reg_no?, profile_photo_path?,
           clinic_id, role='doctor' }
3. Server:
   a. INSERT INTO doctors (..., account_status='pending_approval')
   b. INSERT INTO clinic_join_requests (clinic_id, doctor_id,
                                        status='pending')
4. Response: { status: 'pending_approval' } → pending screen

OWNER APPROVES
──────────────────────────────────────────────────────────
1. POST /api/clinic/join-requests/:id/approve  (Owner only)
2. Server:
   a. UPDATE clinic_join_requests SET status='approved',
      reviewed_at=now(), reviewed_by=owner_id
   b. UPDATE doctors SET account_status='active'
3. Response: 200 OK

OWNER REJECTS
──────────────────────────────────────────────────────────
1. POST /api/clinic/join-requests/:id/reject
   Body: { reason? }
2. Server:
   a. UPDATE clinic_join_requests SET status='rejected',
      rejection_reason=reason, reviewed_at=now()
   b. UPDATE doctors SET account_status='rejected'
3. Response: 200 OK
```

---

### 7.7 Access Control Rules (Server-Side Enforcement)

All rules enforced on the Railway worker and Vercel API routes by verifying the Firebase JWT and checking `doctor.account_status` and `doctor.role` on every request.

| Action | Allowed Roles | Extra Condition |
|--------|--------------|-----------------|
| Record / transcribe / summarize / PDF | `doctor`, `owner` | `account_status = 'active'` |
| View own recordings | `doctor`, `owner` | `account_status = 'active'` |
| Search recordings by Patient ID | `doctor`, `owner` | Scoped to `clinic_id` only |
| View other doctor's recording detail | `doctor`, `owner` | Same `clinic_id` only |
| Approve / reject join requests | `owner` only | |
| Remove doctor from clinic | `owner` only | Cannot remove self |
| Edit clinic profile | `owner` only | |
| View clinic admin dashboard | `owner` only | |

---

### 7.8 Railway Worker: API Routes

```
POST /api/transcribe
  Headers: Authorization: Bearer <firebase_jwt>
  Body: multipart/form-data { audio: File, recording_id: string }
  Returns: { transcript: string, recording_id: string }

POST /api/summarize
  Headers: Authorization: Bearer <firebase_jwt>
  Body: { recording_id, transcript, system_prompt }
  Returns: { summary: string }

POST /api/generate-pdf
  Headers: Authorization: Bearer <firebase_jwt>
  Body: { recording_id, summary, patient_id, doctor_name,
          specialization, medical_reg_no, clinic_name,
          clinic_address, clinic_logo_url, recorded_at, label }
  Returns: { pdf_url: string }  // Signed Supabase Storage URL
```

---

### 7.9 PWA & Offline Implementation

**Service Worker** (via `@ducanh2912/next-pwa`):
- Caches: app shell (HTML, CSS, JS, fonts)
- Caches: last Dashboard data for read-only offline access
- Does NOT cache audio blobs — binary blobs go in IndexedDB only

**IndexedDB Schema:**
```typescript
// DB: 'medscribe-local', version: 1
// Store: 'recordings'
{
  key: string,              // UUID, generated client-side
  chunks: Blob[],           // 30-second audio chunks
  mimeType: string,         // 'audio/webm;codecs=opus' or 'audio/mp4'
  startedAt: number,        // Unix timestamp
  patientId: string | null,
  label: string | null,
  status: 'recording' | 'complete' | 'uploading' | 'uploaded'
}
```

**Crash Recovery:** On app load, check IndexedDB for `status: 'recording'` entries. If found, prompt: *"Recover unfinished recording?"* → Resume or Discard.

---

### 7.10 Audio Recording Implementation

**Library:** RecordRTC  
**Config:**
```javascript
const recorder = new RecordRTC(stream, {
  type: 'audio',
  mimeType: 'audio/webm;codecs=opus', // Falls back to audio/mp4 on iOS
  timeSlice: 30000,
  ondataavailable: (blob) => appendChunkToIndexedDB(recordingId, blob)
});
```

**File Size Estimates:**
| Duration | Android (WebM/Opus) | iOS (MP4/AAC) |
|----------|--------------------|--------------------|
| 10 min | ~600KB | ~1.2MB |
| 30 min | ~1.8MB | ~3.6MB |
| 60 min | ~3.6MB | ~7.2MB |

---

### 7.11 Environment Variables

Two separate `.env` files are required — one for the Vercel Next.js frontend, one for the Railway backend worker. Keys prefixed with `NEXT_PUBLIC_` are safely bundled into the browser by Next.js. All other keys are server-side only and must never appear in frontend code.

#### `.env.local` — Vercel / Next.js Frontend

```
# Firebase Auth (public — safe to expose to browser)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Supabase (public anon key — safe to expose to browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Railway worker base URL (used server-side in Next.js API routes only)
RAILWAY_WORKER_URL=
```

#### `.env` — Railway Backend Worker (server-side only, never exposed)

```
# OpenAI — used for both gpt-4o-mini-transcribe and gpt-4o-mini chat
OPENAI_API_KEY=

# Supabase elevated key (for server-side writes and storage uploads)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Firebase Admin SDK — paste entire service account JSON as a single escaped line
FIREBASE_ADMIN_SDK_JSON=
```

#### Provisioning Guide

| Key | Service | Where to Find |
|-----|---------|--------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase | Console → Project Settings → General → Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase | Console → Project Settings → `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase | Console → Project Settings → Project ID |
| `FIREBASE_ADMIN_SDK_JSON` | Firebase | Console → Project Settings → Service Accounts → Generate new private key → paste full JSON as one line |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Dashboard → Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Dashboard → Settings → API → `service_role` secret key |
| `OPENAI_API_KEY` | OpenAI | platform.openai.com → API Keys → Create new secret key |
| `RAILWAY_WORKER_URL` | Railway | Railway dashboard → your worker service → Settings → Public URL |

---

### 7.12 Estimated Monthly Cost

Assumptions: 50 consultations/day across all doctors, avg 10-min recording.

| Service | Usage | Cost |
|---------|-------|------|
| Vercel Free | Frontend hosting | $0 |
| Firebase Auth | OTP SMS (~1,500/mo) | $0 (free tier: 10K/mo) |
| Supabase Free | DB + Storage | $0 |
| Railway Hobby | ~200hrs compute/mo | $0–$5 |
| OpenAI GPT-4o-mini Transcription | ~1,500 summaries equivalent audio tokens | ~$30 |
| OpenAI GPT-4o-mini | ~1,500 summaries × ~2K tokens | ~$0.45 |
| **Total** | | **~$30–100/mo** |

> Whisper is the dominant cost. Doctors should be informed that transcription cost is volume-driven (~$0.06 per 10-min consultation).

---

## 8. UX & Design Principles

### Mobile-First
- Designed for one-handed use on a 6-inch Android screen
- Primary CTA always in bottom thumb-zone
- Bottom navigation: Home | Search | Settings
- Minimum touch target: 44×44px

### Offline Resilience
- Full app shell loads offline
- Offline state always communicated — no silent failures
- Pending recordings visually distinct (📴) in Dashboard

### Minimal Cognitive Load
- Recording flow: ≤ 2 taps from app open
- Patient ID can be added after recording — no blocking pre-recording fields
- Every error state has a clear recovery action

### Data Safety
- 30-second chunk writes to IndexedDB during recording
- Crash recovery on app reload
- Confirmation dialog before deleting any recording or summary

---

## 9. Recording Edge Cases

| Scenario | Behavior |
|----------|----------|
| App backgrounded during recording | RecordRTC continues; chunks still saved to IndexedDB |
| Phone call interrupts | MediaRecorder pauses; doctor prompted to Resume or Stop on return |
| Battery dies | Last saved chunk retained in IndexedDB; partial audio uploadable |
| Recording > 60 minutes | Auto-stops with notification; doctor starts new session |
| Audio file > 25MB | Railway splits into 5-min chunks (10s overlap), stitches result |
| Mic permission denied | Guided to browser settings on first launch; cannot record without |
| Very low audio level | Volume detection warning; option to re-record before uploading |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| App load (cached, offline) | < 2 seconds |
| App load (first load, 3G) | < 5 seconds |
| Transcription turnaround (10-min audio) | < 45 seconds |
| Summary generation | < 15 seconds |
| PDF generation | < 10 seconds |
| Max recording duration | 60 minutes |
| IndexedDB storage budget | Up to 500MB (prompt to clear old recordings) |
| Supported browsers | Android Chrome 90+, iOS Safari 15+, Chrome Desktop |
| Concurrent users | 10 (single shared OpenAI key; no queue needed at this scale) |
| Data retention | 1 year (Supabase) |

---

## 11. Phased Roadmap

### Phase 1 — MVP
- [ ] Firebase Auth phone + OTP login
- [ ] Clinic creation (owner) + Clinic Code join flow (doctor)
- [ ] Approval flow + pending state UI
- [ ] Clinic Owner admin tab (pending approvals, active doctors, clinic profile)
- [ ] Recording screen (RecordRTC + IndexedDB chunked writes)
- [ ] Manual transcription → Railway → GPT-4o-mini Transcription API
- [ ] Summary generation (default + custom GPT prompt)
- [ ] Editable summary view
- [ ] PDF generation + Supabase Storage
- [ ] Patient ID tagging (pre or post recording)
- [ ] Dashboard with status badges
- [ ] Clinic-scoped patient record search
- [ ] Settings page (profile, prompt editor, language)
- [ ] PWA installability (manifest + service worker)

### Phase 2 — Hardening
- [ ] Offline banner + pending transcription queue
- [ ] Crash recovery (IndexedDB resume on reload)
- [ ] Audio quality warning (low volume detection)
- [ ] Phone call interruption handling
- [ ] Large file chunking (Railway worker)
- [ ] Remove doctor / re-approve flow (owner)

### Phase 3 — Scale & Polish
- [ ] Push notifications (approval status, transcription complete)
- [ ] Summary version history (track doctor edits)
- [ ] Usage analytics (recordings/day, API cost estimates per doctor)
- [ ] Hindi UI localization
- [ ] Co-owner / deputy role
- [ ] Migrate file storage to Cloudflare R2 (when egress costs grow)
- [ ] GPT model toggle in Settings (GPT-4o vs GPT-4o-mini)

---

## 12. Additional refinements (post Phase 3)
2. **IndexedDB quota:** Prompt doctors to upload and clear local recordings periodically. Consider an auto-clear of `status: 'uploaded'` entries older than 7 days.
3. **Railway cold starts:** On Hobby plan, Railway may cold-start after inactivity (~5s). A health-check ping from the frontend on app load keeps the worker warm.