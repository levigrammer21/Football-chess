# Verification · Gridiron Chess 1.0.0

## Executed checks

- Production TypeScript compilation, Vite build, Cloud Functions bundle, and generated service-worker syntax validation passed.
- 19 simulation and validation tests passed: waypoint following, strict two-read targeting, reproducible seeds, ratings effects, mentality effects, downs, first downs, possession reversal, touchdowns, kicks, conversions, safeties, turnovers, halftime, regulation endings, overtime, complete games, analytics, input validation, and live-data redaction.
- Five Firestore security tests passed: owner-only data, denied official-result/stat writes, private vaults, hidden live film, participant-scoped queries, and completion-only film/report access.
- Firebase integration test passed with real Auth and Firestore emulators and the exported production callable function. The final verified game completed 52 authoritative snaps with a 10–35 score. The test also verified account registration, login/logout, saved/reloaded routes and assignments, distinct player identities, frozen plans, simultaneous submissions, duplicate/stale request rejection, identical client results, reconnection, permanent snaps, game statistics, historical play aggregates, used-play reveal, and timeout forfeiture. Three missed calls awarded the active opponent a win and released both active-game slots.

The test host does not permit Firebase's Functions emulator Unix socket. `integration-runner.mjs` serves the unchanged exported callable over local HTTP instead. Authentication, Firestore, transactions, security rules, and the simulation remain real. The runner refuses to start unless configured for the `demo-gridiron` project and both emulators. GitHub Actions runs the standard Functions emulator on Ubuntu.

## Mobile verification

The included Playwright suite uses phone dimensions and native touch events to draw multiple routes, choose reads, save and reload plays, edit defensive assignments, join with a second account, lock both sides, replay the official snap, refresh/reconnect, concede, inspect revealed film/statistics, and sign out. It checks for horizontal overflow and uncaught JavaScript errors. The mobile suite passed in 10.6 seconds with two separate headless Chromium processes at phone dimensions. Native touch route drawing, saved play reloads, all listed game/film actions, the horizontal-overflow check, and the JavaScript-error check passed. This was browser emulation, not a physical iPhone test.

## Deployment boundary

No production Firebase project or target GitHub repository was supplied, so production deployment, production email delivery, real-device Safari behavior, production IAM, and the deployed Cloud Scheduler trigger have not been verified. These are not claimed as completed tests. GitHub Actions includes the automated verification gate and complete deployment steps; README.md provides the web-console setup path.

A passing suite does not establish long-term competitive balance or validate every real-world football rule. This release's explicit ruleset and statistical definitions are documented in README.md.
