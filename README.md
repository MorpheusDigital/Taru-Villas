This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Production modules

Set the Client 1 production modules as follows (leave unset only in the legacy internal environment):

```bash
# Client 1 production modules; leave unset only in the legacy internal environment.
CLIENT_ENABLED_MODULES=dashboard,tasks,surveys,fleet
```

## Client 1 access

Client 1 is invite-only. Set the following in its deployment environment:

```bash
CLIENT_INVITE_ONLY=true
CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED=true
```

Before launch, disable public sign-ups in the dedicated Client 1 Supabase
project. This is required because the Supabase anonymous key is available to
the browser; hiding the application sign-up control alone cannot prevent direct
calls to Supabase Auth. Invite users through the portal after creating the
initial administrator through the trusted deployment/bootstrap process.
The app fails closed with HTTP 503 until
`CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED=true` is explicitly set.

Leave `CLIENT_INVITE_ONLY` unset only for the legacy internal environment,
which retains its self-service onboarding flow.

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
