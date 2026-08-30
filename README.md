This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Production modules

Set the Client 1 production modules as follows (leave unset only in the legacy internal environment):

```bash
# Client 1 production modules; leave unset only in the legacy internal environment.
CLIENT_ENABLED_MODULES=dashboard,tasks,surveys,fleet
```

When `CLIENT_INVITE_ONLY=true`, this setting is mandatory. Missing, empty,
all-invalid, or partly invalid module lists return HTTP 503 at middleware before
authentication. An empty setting remains unrestricted only for the legacy
environment where `CLIENT_INVITE_ONLY` is unset.

## Client 1 access

Client 1 is invite-only. Set the following in its deployment environment:

```bash
CLIENT_INVITE_ONLY=true
CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED=true
NEXT_PUBLIC_APP_URL=https://portal.client.example
```

Before launch, disable public sign-ups in the dedicated Client 1 Supabase
project. This is required because the Supabase anonymous key is available to
the browser; hiding the application sign-up control alone cannot prevent direct
calls to Supabase Auth. Invite users through the portal after creating the
initial administrator through the trusted deployment/bootstrap process.
The app fails closed with HTTP 503 until
`CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED=true` is explicitly set.

Configure the dedicated Client 1 Supabase project before sending invitations:

1. In **Authentication → URL Configuration**, set the Site URL to
   `https://portal.client.example` and add
   `https://portal.client.example/callback` to the allowed redirect URLs.
2. In **Authentication → Email Templates → Invite user**, make the acceptance
   link point through the application callback so the server can verify the
   hashed invite token and establish its SSR cookie session:

   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">
     Accept invitation
   </a>
   ```

   The application supplies `.RedirectTo` as the canonical
   `NEXT_PUBLIC_APP_URL` plus `/callback`; do not hard-code a different host in
   the template.
3. Keep public sign-ups disabled. The invited auth user ID must match the
   profile pre-created by the administrator in the intended organization and
   role. Invalid, expired, unbound, or email-mismatched invitations are rejected.

After successful token verification, the user is sent to `/set-password`; the
password update completes against the SSR-authenticated Supabase session and
then enters the portal at `/dashboard`.

Leave `CLIENT_INVITE_ONLY` unset only for the legacy internal environment,
which retains its self-service onboarding flow.

## Client 1 PWA

The authenticated portal is installable as an online-first Progressive Web App.
Set this client branding at build time, then rebuild the deployment:

```bash
NEXT_PUBLIC_APP_NAME=Taru Villas Management Portal
NEXT_PUBLIC_APP_SHORT_NAME=Taru Villas
NEXT_PUBLIC_THEME_COLOR=#1f5138
```

The PWA caches only static application assets. Portal data, API responses,
forms, photos, uploads, and offline queues are intentionally excluded from
this first release. Follow
[the device acceptance runbook](docs/runbooks/client-pwa-acceptance.md) before
cutting over `portal.taruvillas.com`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
