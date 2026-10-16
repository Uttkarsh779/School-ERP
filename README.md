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

---

## API Endpoints (Backend)

| Method | Endpoint               | Description                    | Auth Required |
|--------|------------------------|--------------------------------|---------------|
| POST   | `/api/users/register`  | Create a new user account      | No            |
| POST   | `/api/users/login`     | Login & get JWT tokens         | No            |
| GET    | `/api/users/ref-token` | Refresh expired access token   | Refresh Token |

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
3. **Dead sidebar** (`Sidebar/index.tsx`) with non-existent routes still in the codebase.
4. **Sidebar navigation disconnected** from real admin routes.
5. **Folder typo** — `DataConatiner` should be `DataContainer`.
