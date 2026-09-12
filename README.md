# Gridiron Chess · 1.0.0

A phone-first PvP American football strategy game built with React, TypeScript, Firebase Authentication, Firestore, Cloud Functions, and Firebase Hosting.

The repository contains the integrated application, authoritative simulation, security rules, automated verification, and a GitHub Actions deployment workflow. You do not need a computer, a terminal, local Node, or an emulator. GitHub runs the builds and tests for you.

## First deployment from a phone

These are account configuration steps, not remaining game implementation.

### 1. Put this project in your GitHub repository

Use the supplied repository or upload the ZIP contents with GitHub's web interface in your mobile browser. All TypeScript, React, Firebase, style, test, and build files belong in the repository root. Do not upload `node_modules`, `dist`, test output, or a service-account key.

The sole required configuration subfolder is `.github/workflows/deploy.yml`: GitHub only recognizes workflow files there. The identical root `deploy.yml` is supplied for convenient copying from a phone. If your phone's file picker skips hidden folders, open GitHub → Add file → Create new file, enter `.github/workflows/deploy.yml`, and paste the contents of the root `deploy.yml`. Make future workflow edits in the `.github/workflows/` copy; that is the file GitHub executes.

Keep the default branch named `main`. `package-lock.json` is included so GitHub installs the same tested versions.

### 2. Prepare Firebase

In [Firebase Console](https://console.firebase.google.com/):

1. Select **footballchess-b2d35**, the project configured in this build. The included Firestore rules own the `users`, `games`, and `vaults` collections. Use a dedicated game project unless you have reviewed the effect on an existing app's rules and collections.
2. Enable the Blaze plan for Cloud Functions deployment. Billing belongs to your Firebase account; no payment credentials belong in the repository or chat.
3. Your registered Web app configuration is included in root `firebase-config.ts`. Authentication, Firestore, and Cloud Functions use this project. Game analytics are stored in Firestore; the optional Google Analytics SDK is not enabled.
4. Build → Authentication → Get started → Sign-in method → Email/Password → Enable. Leave email-link sign-in off unless you separately want it.
5. Build → Firestore Database → Create database. Use the default database and production mode. Choose a region near your users; the functions in this release use `us-central1`.
6. Open Hosting and enable it for the project. Your primary site will use `PROJECT_ID.web.app`.
7. Authentication → Settings → Authorized domains: ensure `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com` are present. Add any custom domain you later use.

### 3. Authorize GitHub deployments

Open your project's Google Cloud console from Firebase settings. All of this is available in the phone browser.

Create a dedicated service account named `gridiron-deploy` in IAM & Admin → Service Accounts. Assign project roles needed for this combined deployment:

- Firebase Admin
- Cloud Functions Admin
- Cloud Run Admin
- Cloud Scheduler Admin
- Service Account User
- Service Usage Admin (the Firebase CLI enables required product APIs on first deployment)

Create a JSON key for that deployment account. In GitHub → repository Settings → Secrets and variables → Actions:

- Add repository secret `FIREBASE_SERVICE_ACCOUNT`: the complete service-account JSON.
- Deployment defaults to `footballchess-b2d35`. If you already set repository variable `FIREBASE_PROJECT_ID`, ensure its value is `footballchess-b2d35`. Changing projects also requires updating `firebase-config.ts`.

Keep the JSON out of source files, commit history, and chat. The workflow uses Google's authentication action and temporary runner credentials.

In Google Cloud APIs & Services, enable Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Cloud Scheduler, Pub/Sub, and Firebase Rules if they are not already enabled. The deployment account can also enable required APIs automatically.

On new projects whose default compute service account has no build permissions, grant the build account shown by Cloud Build the **Cloud Build Service Account** role. The function runtime account must have **Cloud Datastore User** to access Firestore. These are service account IAM settings, not source changes. A deployment error names the missing account or permission if your organization enforces additional restrictions.

### 4. Run deployment

GitHub → Actions → **Test and deploy Gridiron Chess** → Run workflow → main.

GitHub installs dependencies, checks TypeScript, runs simulation tests, runs Firebase security/integration tests, and runs mobile Chromium tests. Deployment begins only when verification succeeds. It publishes Firestore rules/indexes, the `coach` callable, the `selectionClock` scheduled function, and the PWA.

Open `https://YOUR_PROJECT_ID.web.app` from your phone. Subsequent pushes to `main` repeat verification and deployment. Pull requests run verification without production deployment. You may add approval protection to GitHub's `production` environment if you want a release gate.

No developer-run local commands are required.

## Play a full game

1. Create an account with email/password and a coach name. Your club receives 23 rated athletes and ten saved starter plays.
2. Open Playbook. Customize five offense and five defense slots. Starters are usable immediately; every slot can be redesigned.
3. Offense: select a receiver and draw a route. Select other receivers to add more routes. Draw/redraw replaces the selected route, Clear resets it, and Edit points reshapes waypoints. Choose distinct primary and secondary reads. Save. A run uses RB's drawn path.
4. Defense: select a defender and choose man, zone, blitz, rush, spy, or contain. Pick man targets; drag zone centers and adjust their radii. Save.
5. Invite another coach. Share the twelve-character code or invite link. The opponent signs in and joins using the code.
6. Each side selects from its frozen five-play game plan. Offense also chooses mentality or a special-teams action. Lock the call. Opposing calls remain secret.
7. The server resolves both calls once and publishes the official movement replay. Choose the next call until the game ends.
8. Reopen any completed game for play-by-play, statistics, replay, revealed routes/assignments, and opponent scouting. Career Analytics aggregates completed-game results.

## Rules used by this release

- Eleven offense and eleven defense players; one kicker per roster. Equal starter ratings for every team, with different strengths by athlete and position.
- Four three-minute quarters; snap duration plus a 22-second runoff for in-bounds plays. Incompletions/turnovers use a shorter runoff. No timeouts or penalties in this ruleset.
- Opening possession and halftime possession start at the 25. Kickoffs and return teams are abstracted into field position.
- Standard four downs, first downs, touchdowns, safeties, interceptions, lost fumbles, punts, and field goals.
- Touchdowns: six points, followed by your choice of a kick for one or a play for two. The try extends an expired quarter.
- Overtime: alternating possessions at the opponent's 25; both teams receive a possession before comparing scores. Tied pairs repeat. No punts in overtime.
- Interceptions change possession at the interception spot; there are no interception return plays. Goal-line turnovers/punts can be touchbacks.
- Two minutes to lock each snap. The server scheduler or either participant may resolve an expired deadline. Missing calls use the first saved play, an extra point on tries, or a punt on fourth down in regulation. Three consecutive misses end the game. A concession awards the opponent the win. Both missing teams can finish tied.
- Five simultaneous waiting/active games per coach. Waiting invites expire for joining after 24 hours and can be canceled from Games.

## Architecture and authority

| File                            | Purpose                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `model.ts`                      | Game, play, athlete, route, frame, and statistics models                                                                       |
| `starters.ts`                   | Real rated rosters, five offensive and five defensive starter calls                                                            |
| `validation.ts`                 | Strict server input validation and bounded route/assignment schemas                                                            |
| `engine.ts`                     | Seeded movement simulation, two-read decisions, coverage, pressure, ball flight, catches, tackling, kicks, and full-game rules |
| `analytics.ts`                  | Shared calculations for official play, player, team, and situational statistics                                                |
| `server.ts`                     | Authenticated callables, private locked calls, transactional resolution, timeout scheduler, permanent results                  |
| `firestore.rules`               | Participant-only game access, private playbooks, denied client writes, completion-only film                                    |
| `firebase-client.ts`            | Authentication persistence, Firebase connection, callable transport                                                            |
| `App.tsx`                       | Account, home, playbook, roster, games, profile, and navigation                                                                |
| `PlayEditor.tsx`, `Field.tsx`   | Touch route/zone editing and official replay animation                                                                         |
| `GameScreen.tsx`, `Stats.tsx`   | Live games, film, analytics, opponent scouting                                                                                 |
| `styles.css`                    | Phone-first design and safe-area navigation                                                                                    |
| `manifest.webmanifest`, `sw.js` | Installable PWA and cached app shell                                                                                           |
| `build-server.mjs`              | Server bundling and fingerprinted PWA asset preparation                                                                        |
| `*.test.ts`, `mobile.spec.ts`   | Simulation, validation, rules, integration, and touch UI verification                                                          |

Firestore collections:

- `users/{uid}`: server-owned coach profile and immutable initial roster.
- `users/{uid}/plays/{slot}`: coach's ten saved plays, readable by owner, written through a validated callable.
- `users/{uid}/plans/{gameId}`: owner's game-start roster/play snapshot.
- `users/{uid}/stats/career`: server-aggregated record, team, and player statistics.
- `users/{uid}/playStats/{hash}`: individual historical play aggregates; separate documents avoid an ever-growing career document.
- `games/{id}`: participant-readable game state and lock flags, with no secret calls.
- `games/{id}/snaps/{turn}`: immutable public replay events; no opponent play IDs, names, assignments, concepts, or read indexes.
- `games/{id}/film/{turn}`: full used plays plus explanation, readable by participants only after completion. Kicks do not reveal unused scrimmage plays.
- `games/{id}/reports/{uid}`: final game statistics for postgame analysis by either participant.
- `vaults/{id}`: server-only play snapshots, calls, and in-progress aggregates. All client reads/writes denied.

One Firestore transaction locks a submission, detects the second call, simulates, advances the game, stores the official snap, and clears both calls. Turn numbers reject stale and replayed requests. Transaction retries cannot publish duplicate snaps. Random seeds are generated server-side. Clients never supply movement, ratings, yardage, scores, or analytics.

The film uses the exact frozen plays from the game, even if a coach changes their live playbook later. Only participants may read it. Actual on-field movement and the target are visible during live replay; selected-read identity and saved assignments remain postgame information.

## Simulation and analytics definitions

Movement runs at 0.12-second steps. Receivers travel the polyline drawn by the coach; speed, acceleration, release, and route running affect timing. Man defenders follow receivers with leverage/reaction lag. Zones respond to nearby route threats within their areas. Rushers contend with blockers; spies and contain defenders hold their responsibilities until pursuit. Pursuit, blocking, elusiveness, and tackling determine ground outcomes.

The QB considers primary first, then secondary. Evaluation includes separation, help, lanes, throw distance, awareness, coverage matchup, and pressure. Mentality adjusts window threshold, progression timing, release timing, patience, and willingness to force a throw. Arm strength changes flight time; accuracy and pressure handling change the landing point. Catch/ball skill matchups and defender proximity resolve possession. There is no random target selector or canned outcome table.

Success rate: at least 40% of required yards on first down, 60% on second, or a first down on third/fourth, excluding turnovers. Explosive plays: 20+ yards. Pass completions followed by lost fumbles still credit the reception; interception flight distance is not offensive yardage. Conversions and kicks are excluded from scrimmage efficiency metrics. Coverage credit is assigned separately from the tackler. Situational splits include down, distance band, combined down/distance, man/zone/blitz, and offensive concept.

Play name changes create a separate historical aggregate; geometry changes under the same name continue that play's aggregate. The game-specific film always preserves exact geometry. Team and player records are only updated once, as part of the game-completion transaction.

## Operating from your phone

- Edit root source files in GitHub web or ask your coding agent to make changes.
- View build and deployment status in GitHub Actions; open failed steps for the actual error.
- View account users, data, functions logs, usage, and indexes in Firebase/Google Cloud web consoles.
- Use Firebase Hosting's release history to roll back the frontend. A frontend rollback does not roll back functions or rules; redeploy a reviewed commit for a complete rollback.
- Install the app from your phone browser's Add to Home Screen / Install action.
- Realtime listeners are backed by authenticated Firestore REST refreshes every five seconds while the screen is visible, immediately after your own actions, and when returning online or foregrounding the app. This recovers stalled mobile streams without trusting client-generated results.

An internet connection is required to save or play PvP. The PWA caches the shell; it never computes official snaps offline.

## Official platform references

- [Firebase callable functions and authentication](https://firebase.google.com/docs/functions/callable)
- [Functions setup, supported runtime, and deployment](https://firebase.google.com/docs/functions/get-started)
- [Hosting reserved configuration URLs](https://firebase.google.com/docs/hosting/reserved-urls)
- [Firebase CLI and automated deployments](https://firebase.google.com/docs/cli)
- [Cloud Functions IAM roles](https://docs.cloud.google.com/functions/docs/reference/iam/roles)
- [Cloud Scheduler access control](https://docs.cloud.google.com/scheduler/docs/access-control)
