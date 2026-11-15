# School ERP — DreamProj

A full-stack School ERP system with a React + TypeScript frontend and a Node.js + Express + TypeScript backend.

---

## Project Structure

```
DreamProj/
├── frontend/               # React + TypeScript frontend (Vite build tool)
│   ├── src/
│   │   ├── assets/         # Static images
│   │   ├── components/     # Reusable UI components (Button, Input, Table, etc.)
│   │   ├── i18n/           # Translations (English, Hindi)
│   │   ├── pages/          # Route-level pages (Admin, Public)
│   │   ├── store/          # Redux Toolkit + RTK Query (state & API services)
│   │   ├── App.tsx         # Router definitions
│   │   ├── main.tsx        # App entry point + Provider wrapper
│   │   └── types.d.ts      # Global TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                # Node.js + Express + TypeScript REST API
│   ├── src/
│   │   ├── config/         # Database connection setup
│   │   ├── controllers/    # Request handlers (auth, students, fees, etc.)
│   │   ├── middleware/     # JWT auth + RBAC guards
│   │   ├── models/         # Data shape definitions
│   │   ├── routes/         # API endpoint registry
│   │   ├── app.ts          # Express app configuration
│   │   └── index.ts        # Server entry point
│   ├── .env                # Environment variables (PORT, DB URI, JWT keys)
│   ├── package.json
│   └── tsconfig.json
│
├── FRONTEND_CODE_ANALYSIS.md   # Detailed code quality audit
├── README_PROJECT_ANALYSIS.md  # Original codebase analysis
└── setup_project.ps1           # Rename crm-ascs → frontend + scaffold backend dirs
```

---

## Getting Started

### Step 1: Run the setup script (rename crm-ascs → frontend)
```powershell
cd "D:\web_development\DreamProj"
.\setup_project.ps1
```

### Step 2: Install and start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend will run on: `http://localhost:5173`

### Step 3: Install and start the Backend
```bash
cd backend
npm install
npm run dev
```
Backend API will run on: `http://localhost:5000`

### Step 4: Forgot password (email and SMS codes)

The code is complete. Staff and admins get a 6-digit code by email; students get one by SMS on the
mobile number on file (student's own, else father's, else mother's). A code lasts 10 minutes, works
once and dies after 5 wrong tries. Run `backend/prisma/password_reset.sql` once on a new database.

To make it send real messages, only `backend/.env` needs filling in (all keys are listed in `.env.example`):

| What | Keys | Notes |
|------|------|-------|
| Sender email | `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Gmail: `SMTP_PASS` is an **App Password** (Google Account → Security → 2-Step Verification → App passwords), not the normal password. `EMAIL_PROVIDER=console` prints emails in the server log instead. |
| SMS provider | `SMS_PROVIDER` = `console`, `twilio`, `msg91` or `fast2sms`, plus that provider's keys | `console` prints the SMS in the server log. A Twilio trial needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` and sends only to numbers verified in Twilio. MSG91 / Fast2SMS need Indian DLT registration. |
| Test routing | `OTP_TEST_EMAIL`, `OTP_TEST_PHONE` | While set, **every** code goes here instead of the real user. Clear both to go live. |
| School name in messages | `SCHOOL_NAME` | |

Restart the backend after changing `.env`. Check the flow with `npm run test:password-reset` (uses throwaway accounts, sends nothing).

---

## API Endpoints (Backend)

| Method | Endpoint               | Description                    | Auth Required |
|--------|------------------------|--------------------------------|---------------|
| POST   | `/api/users/register`  | Create a new user account      | Super Admin   |
| POST   | `/api/users/login`     | Login & get JWT tokens         | No            |
| GET    | `/api/users/ref-token` | Refresh expired access token   | Refresh Token |
| POST   | `/api/users/forgot-password` | Send a reset code (`identifier`, `mode`: `staff` or `family`) | No |
| POST   | `/api/users/reset-password`  | Code + new password (`identifier`, `mode`, `code`, `newPassword`) | No |

---

## Tech Stack

| Layer     | Technology                         |
|-----------|------------------------------------|
| Frontend  | React 18, TypeScript, Vite         |
| State     | Redux Toolkit, RTK Query           |
| Forms     | React Hook Form, Yup               |
| Animation | Framer Motion                      |
| i18n      | i18next (EN + HI)                  |
| Backend   | Node.js, Express, TypeScript       |
| Auth      | JWT (access + refresh tokens)      |
| Security  | bcryptjs password hashing, RBAC    |

---

## Known Issues (Frontend — Action Required)
> See [FRONTEND_CODE_ANALYSIS.md](./FRONTEND_CODE_ANALYSIS.md) for full details.

1. **File casing inconsistency** in imports — will crash on Linux production servers.
2. **Role-guard bypass** — `allowedRoles` prop is accepted but never enforced in `protectedRoute.tsx`.
3. **Folder typo** — `DataConatiner` should be `DataContainer`.
