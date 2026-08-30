# Client PWA Acceptance Runbook

Use this checklist against the HTTPS deployment at
`https://portal.taruvillas.com` before production cutover. Test with a real
Taru Villas invite-only account.

## Android Chrome

- [ ] Open the HTTPS custom domain and confirm the install prompt/menu option
  uses the Taru Villas name and icon.
- [ ] Install the app, launch it from the launcher, and confirm it opens in a
  standalone window at the login screen or dashboard.
- [ ] Log in and navigate Dashboard, Tasks, Surveys, and Fleet.
- [ ] In Fleet, subscribe a driver/device to push notifications and verify a
  test notification opens the intended portal location.
- [ ] Enable airplane mode after the portal has loaded and confirm the offline
  notice reads: “You are offline. Reconnect to continue using the portal.”
- [ ] In Chrome DevTools Application > Cache Storage, confirm no `/api/` path
  is cached. Confirm only static `/_next/static/` and PWA icon assets exist.

## iOS Safari

- [ ] Open the HTTPS custom domain, use Share > Add to Home Screen, and verify
  the Taru Villas name and icon.
- [ ] Launch from the Home Screen and confirm standalone behavior, login, and
  navigation through Dashboard, Tasks, Surveys, and Fleet.
- [ ] Confirm Fleet push subscription/notification behavior on a supported iOS
  version and that notification navigation returns to the portal.
- [ ] Enable airplane mode after the portal has loaded and confirm the same
  offline notice appears; do not expect form drafts or uploads to persist.
- [ ] Inspect Cache Storage with Safari Web Inspector and confirm there are no
  cached `/api/` paths.

## Worker update check

- [ ] In a staging deployment, change the service-worker cache name, deploy,
  and open the already-installed portal.
- [ ] Confirm a single “A portal update is ready.” prompt appears.
- [ ] Choose Refresh and confirm the application reloads only after the new
  worker takes control.
