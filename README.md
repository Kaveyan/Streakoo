# Habit Tracker — Production Setup

Full-stack version of the habit tracker: the original React UI is untouched;
a Node.js/Express + MongoDB backend now provides accounts, Google OAuth, and
per-user data persistence.

```
habit-tracker-app/
├── backend/                 Express API, MongoDB models, JWT + Google auth
│   ├── src/
│   │   ├── config/          db.js, passport.js (Google strategy)
│   │   ├── controllers/     authController.js, dataController.js
│   │   ├── middleware/      authMiddleware.js (JWT guard), errorHandler.js
│   │   ├── models/          User.js, HabitData.js
│   │   ├── routes/          authRoutes.js, dataRoutes.js
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/                Vite + React app
    ├── src/
    │   ├── api/              axios.js, auth.js, storage.js
    │   ├── context/          AuthContext.jsx
    │   ├── components/       HabitTracker.jsx (ORIGINAL UI, unchanged aside
    │   │                     from 4 lines swapping browser storage for the
    │   │                     backend API — see "What changed" below)
    │   │                     ProtectedRoute.jsx
    │   ├── pages/             Login.jsx, Register.jsx, AuthSuccess.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## What changed in the UI file, and why

Your component (`HabitTracker.jsx`) used a sandbox-only `window.storage`
API to persist data. That API doesn't exist outside the Claude preview
environment, so it's replaced with a matching `storage.get/set` module
(`frontend/src/api/storage.js`) that calls the new backend instead. That is
the **only** change to the file — 1 import line + swapping
`window.storage.get/set` → `storage.get/set` in 3 places. No markup, styling,
layout, or logic was touched.

A small "logged in as … / Log out" control was added, but it lives entirely
in `App.jsx` as a fixed overlay outside the tracker component, not inside
`HabitTracker.jsx`.

## 1. MongoDB

Use a local MongoDB instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.
Grab the connection string (`mongodb+srv://...`).

## 2. Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth client ID** → Application type: **Web application**.
3. Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
   (update to your production backend URL when you deploy).
4. Copy the generated Client ID and Client Secret.

## 3. Backend setup

```bash
cd backend
cp .env.example .env
# fill in MONGO_URI, JWT_SECRET, SESSION_SECRET, GOOGLE_CLIENT_ID,
# GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, CLIENT_URL
npm install
npm run dev        # nodemon, http://localhost:5000
```

## 4. Frontend setup

```bash
cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:5000/api
npm install
npm run dev         # http://localhost:5173
```

## Auth flow

- **Email/password**: `POST /api/auth/register`, `POST /api/auth/login` — issue
  a JWT set as an httpOnly cookie (also returned in the JSON body if you'd
  rather use header-based auth from a native client).
- **Google**: the "Continue with Google" button links to
  `GET /api/auth/google`, which redirects to Google, then to
  `GET /api/auth/google/callback`, which creates/links the user, sets the
  same auth cookie, and redirects to the SPA's `/auth/success` route.
- All `/api/data` routes require the auth cookie (or `Authorization: Bearer
  <token>` header) via the `protect` middleware.

## Data model

Rather than reshaping your existing localStorage-style blob into many
collections (which would have required touching the UI's save/load logic),
`HabitData` stores one document per user with the same shape your component
already reads/writes (`habits`, `completions`, `targets`, `todayTasks`,
`weekTasks`, `tracks`, `trackEntries`, `theme`, etc). `PUT /api/data` does a
shallow merge (`$set`), matching the original `save(patch)` semantics.

## Production notes

- Set `NODE_ENV=production` on the backend — cookies switch to
  `Secure; SameSite=None` so they work across your deployed frontend/backend
  domains (requires HTTPS).
- Put the frontend behind a CDN/static host (Vercel, Netlify, S3+CloudFront)
  and the backend behind a Node host (Render, Railway, Fly.io, EC2, etc.).
  Update `CLIENT_URL`, `GOOGLE_CALLBACK_URL`, and `VITE_API_URL` accordingly,
  and add the production callback URL in the Google Cloud Console.
- Consider adding refresh-token rotation and email verification for a fuller
  production auth flow — the current setup covers register/login/Google
  OAuth/logout/session check, which is enough to ship with.
