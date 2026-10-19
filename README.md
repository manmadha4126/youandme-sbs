# youandme

A private, mobile-friendly messaging app for two authorized users. It supports real-time chat, media sharing, presence, and an installable PWA.

## Setup

1. Install Node.js and npm.
2. Create a local `.env` file with your Supabase settings:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Keep the service-role key private; never expose it in client-side code.

3. Install dependencies and start the app:

```sh
npm install
npm run dev
```

## Useful commands

```sh
npm run build
npm run lint
```

The app uses React, TypeScript, TanStack Start, and Supabase.
