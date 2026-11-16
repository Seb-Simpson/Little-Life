# Little Life — LL-001

A local-first life-data engine and browser prototype: today’s timeline, tomorrow’s schedule, assignments, current/next activity, inferred free time, journal/goals, integration status, manual entry and structured JSON import.

**School integrations are not connected or verified.** The app starts in a clearly labelled demonstration workspace with a fixed 11:05 preview clock. “Use my data” opens a separate empty personal workspace. Sebastian’s existing SOCS/Teams Power Automate retrieval is user reported; this repository does not claim to have tested it.

## Open the browser app

Serve the repository with any static web host. Browser users install nothing and need no account. All application URLs are relative, including when hosted under a GitHub Pages repository path. ES modules require HTTP(S); double-clicking `index.html` using a file URL is not supported.

For development, use Node 22 or newer; there are no npm dependencies to install:

```sh
npm run dev
```

Open `http://localhost:5173`. `PORT` can change the development port. The local development server is for trusted development networks only. On the managed Cloud workspace, use its supported preview URL.

## Try the prototype

1. Explore the demo. Its timeline includes a cancellation, recurring practice, assignments and a missing deadline. The preview clock and every sample record are labelled.
2. Select **Use my data** for the empty personal workspace.
3. **Add entry** creates events (including weekly repeats), assignments, tasks, reminders, goals or journal entries. Edit your manual entries to update or cancel them. Tasks/goals can be completed and reopened. Reminders appear in the dashboard; no background/device notifications are implemented.
4. **Your data** accepts a documented JSON file/paste. Preview validates the entire batch before import. Re-importing unchanged IDs is idempotent. Use a source’s real application to edit imported entries, then import the newer record.
5. **Integrations** distinguishes the local import time from an unverified upstream sync time. No connection becomes verified through a file import.
6. Download a local backup and test restoring it in the same workspace. Browser storage can be cleared by device policy; do not use it as the only copy.

The checked-in `examples/*.demo.json` files are synthetic format examples, not live integrations. They are deliberately titled DEMO. For real import, replace all sample content with permitted data. The built-in “Download sample JSON” creates a date-current synthetic example; it still establishes no connection.

## Documentation

- [Integration feasibility and safe connection guide](docs/integrations.html): each source, permissions, restrictions, automatic-sync feasibility, verification status and actions for Sebastian.
- [Import contract and Power Automate mapping](docs/import-format.html): IDs, time zones, recurrence, cancellation, merge rules and limits.
- [Architecture and persistence boundaries](docs/architecture.md).
- [Recommended LL-002 plan](docs/ll-002.md).
- [Verification record](docs/verification.md).

## Checks

```sh
npm run check
npm test
npm run build
```

The dependency-free Node suite covers scheduling, DST, recurrence/exceptions, persistence/recovery, replay deduplication, stale updates/cancellations and missing data. The build produces `dist/`. CI runs checks, tests and the build on PRs; it does not deploy or merge.

## GitHub Pages after review

This is a buildless static app. After approving/merging the PR, Sebastian may enable repository **Settings → Pages → Deploy from a branch → main / (root)**, if school/GitHub policy permits it. The resulting route is `https://seb-simpson.github.io/Little-Life/`. No Pages configuration was changed or deployment verified in LL-001. Alternatively, publish only `dist/` through an approved Pages workflow. The checked-in CI only prepares a static artifact.

Keep the public repository and Pages assets limited to synthetic examples and source code. Never commit school JSON, journals, credentials, flow definitions or private ICS/feed URLs. Local import does not write a repository file. Ignored folders `private-data/`, `imports/`, `backups/` and `*.local.json` reduce accidental commits but do not replace review. There is no `.env` or secret needed for LL-001.

Storage is unencrypted, browser/origin-local and separate for demo/personal data. GitHub project Pages under the same account share an origin; scripts on another project at that origin can access browser storage. Use an approved dedicated origin before storing sensitive data. Backups remain private user downloads. No remote AI, analytics or data API is called; application fetch/XHR connections are blocked by CSP. External documentation links are opened only by the user.

Lively Wallpaper, an animated house, companion memories and AI conversation are future work. The pure engine modules allow additional renderers without changing the authoritative data model. Lively’s storage and runtime have not been tested.
