# Little Life — LL-002

A static, local-first life companion prototype continued from PR #1 / `fd89950`. No live school integration is verified. All checked-in examples and browser fixtures are synthetic.

## What changed

- Source/category coverage windows and source-specific freshness: missing, partial, stale or failed data suppresses free-time answers. Reading an old file never renews its upstream observation.
- Lessons, activities, personal events and assignments are distinct. Timelines detect overlaps and cancellations; current/next activity is anchored to the current clock, independently of the date being browsed.
- A deterministic daily briefing answers today, next lesson, next possible free period, due-soon assignments and missing information from the life engine, with supporting record IDs and uncertainty.
- A connection wizard links private JSON exports from the existing SOCS/Teams Power Automate flows through the OneDrive folder Sebastian confirmed already syncs to his laptop. Native read-only handles are remembered; one-click refresh and optional minute-by-minute refresh while visible avoid repeated importing.
- Personal data is blocked on shared/public deployments. Public builds accept built-in synthetic data only; private production requires an explicit dedicated HTTPS origin. A path or key prefix is not privacy isolation.
- Node tests plus actual Chromium browser tests cover reload, persistence, manual entry, imports/replay, backup/restore, navigation, keyboard interaction, responsive layout, linked handles and privacy gates.

## Open in a browser

Browser users install nothing. The default production build is a public demonstration and accepts no typed/imported personal data. Runtime code has no external dependencies, account login, telemetry or remote AI request. The application CSP blocks fetch/XHR with `connect-src 'none'`.

For development (Node 22+, no runtime dependencies):

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/`. Use **Use my data** only on this trusted development origin or an approved dedicated private deployment. School export/storage policy still applies. File URLs are unsupported; ES modules require HTTP(S). Do not run untrusted apps on the same origin/port.

## Connection setup

Use **Integrations → Connection wizard** and the [beginner setup guide](docs/ll-002-connection.html). It explains the exact Select/Compose/Create-file/Update-file sequence, stable IDs, class/assignment fields, coverage and cancellations. Actual SOCS dynamic-content field names depend on the existing flow and must be checked against its authorised output; none were guessed or tested here.

Recommended chain: existing approved flow → private `Little Life/socs.json` / `teams.json` in school OneDrive → existing OneDrive sync → user-selected browser file handles. No new Microsoft app registration, public link, premium HTTP action or folder scanning is implemented. OneDrive for Business is a standard connector, but licence, DLP, export entitlement and managed browser permission must be confirmed. This route is conditionally feasible without new paid services or tenant-admin permissions, not a guarantee of school approval.

On the approved origin, link each file once. A refresh rereads its data; an optional timer checks every minute while visible. Browser permission may need reconnecting after a reload, and OneDrive replacement can require relinking. Closing/hiding the app stops reads. Normal JSON file/paste import remains available as a fallback. The native picker is available in supported Edge/Chrome browsers; do not bypass policy if blocked.

## Data confidence

[Import v2](docs/ll-002-import.html) adds event categories and bounded coverage: source, category, start/end, observedAt and complete/partial. Defaults require SOCS lessons/activities (12h freshness), Outlook personal events (6h) and Teams assignments (24h). The wizard allows explicitly declaring that all personal events are managed manually; it cannot remove academic coverage requirements. Version 1 imports/backups migrate without inventing coverage or categories.

A fresh complete empty export reports no entries only within its declared scope. Missing data is never confirmed free time. Any gap remains inferred from exporter-reported coverage. A next event is labelled recorded and may have earlier missing commitments. Imported claims cannot independently verify a connection.

## Checks and browser tests

```sh
npm run check
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

For an existing compatible Chromium on Linux:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

The Playwright runner owns its test server; no preview relay is needed. Tests use synthetic files and native origin-private file handles with only file selection/permission outcomes simulated. They establish local browser processing, not Windows OneDrive synchronisation, the OS file picker or school permission. CI runs checks, unit tests, public build and Chromium tests before uploading `dist/`. See the [verification record](docs/verification.md).

## Deployment and privacy

`npm run build` produces `dist/` with relative URLs, `.nojekyll` and an enforced synthetic-only policy, including when served on localhost. Deploy only `dist/` for public use. **Settings → Pages → Source: GitHub Actions**, then the manual **Publish synthetic demo to Pages** workflow after review/approval. It reruns tests and builds before publishing. No Pages setting was changed or workflow dispatched for LL-002. The app is tested under `/Little-Life/` for project-path compatibility.

Never deploy raw development source as the private release. An approved operator may create a private build for a reviewed dedicated origin:

```sh
npm run build -- --private-origin https://YOUR-APPROVED-DEDICATED-HOSTNAME
```

Only that exact HTTPS origin at `/` accepts personal data. All `github.io` origins, unconfigured hosts and subpaths are blocked. Host only trusted Little Life code there; no unrelated apps/service workers may share its origin. Domain/host provision is a separate school-approved step and is not assumed free or permission-free. School laptop rules still apply. Public deployment uses only synthetic data, even if a previous browser preference selected personal mode; it does not load the legacy personal workspace. Any legacy personal data already stored on an old shared origin must be removed through the browser’s approved site-data controls after an approved recovery/backup.

Local storage is unencrypted and not a backup. Private downloads and file handles stay on the trusted browser/origin; browser clearing, policy or device loss may remove them. Never commit real exports, journals, flow definitions, school URLs or credentials. Ignored folders are only an additional guard, not sanitisation. No school data was used in this implementation.

## Documentation and next steps

- [Practical setup, permissions, OneDrive feasibility and troubleshooting](docs/ll-002-connection.html).
- [Version 2 coverage/import contract](docs/ll-002-import.html).
- [Architecture](docs/architecture.md) and [verification evidence](docs/verification.md).
- [LL-003 recommendation](docs/ll-003.md).
- [LL-001 source-by-source feasibility reference](docs/integrations.html).

Animated house, persistent companion memories, remote AI conversations and Lively are still future work. LL-002 introduces deterministic briefing and trusted-data boundaries first.
