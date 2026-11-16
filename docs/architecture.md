# LL-001 architecture

A dependency-free static browser app, with a pure data engine separated from its presentation. The source can be served directly on GitHub Pages. Node is needed only for development checks, not by browser users. There is no backend, external runtime script, telemetry, network connector or AI call. The application CSP uses `connect-src 'none'`.

- `time.js`: explicit-offset instant validation, IANA wall-time resolution, day boundaries and DST handling.
- `model.js`: versioned record/source schema, strict import normalization, source-scoped identity and deterministic revision merge.
- `schedule.js`: bounded weekly/fortnightly expansion, occurrence exceptions, current/next activity, deadlines, conservative free periods and cross-source duplicate flags.
- `storage.js`: localStorage adapter; full workspace validation, revision guard, recovery without overwriting corrupt data and separate demo/personal keys.
- `demo.js`: explicitly synthetic records; no invented successful synchronisation times.
- `app.js`: DOM views and local transactions. Web Locks serialises supported browsers’ writes; saving fails visibly before the UI adopts an unsaved state. Cross-tab storage events refresh views.

The canonical item supports events, assignments, tasks, reminders, goals and journal entries. IDs are the JSON-encoded tuple [sourceId, externalId], avoiding delimiter collisions. Times normalize to UTC instants; recurrence uses an explicit IANA time zone. All-day dates have exclusive ends. Unknown fields are rejected to avoid storing source payloads and credential fields. Text fields still require human review for sensitive content.

Imported entries retain the origin and evidence `imported`; manual entries use `user-entered`; demo entries use `demo`. `inferred` describes derived free intervals. Missing fields are computed and labelled unavailable. No imported assertion can set an entry or connection to verified. In LL-002 verification should be a separate evidence record with scope, method, check time and expiry, never a boolean copied from a payload.

Sources retain `lastImportAt` (successful local processing), `reportedSyncAt` (exporter-reported upstream success), `lastAttemptAt`, `lastError` and an explicitly unverified connection state. Failed imports preserve successful history. Imported data is not silently discarded on omissions. Explicit cancellation tombstones prevent a stale export from resurrecting cancelled events.

The prototype deliberately limits recurrence to timed same-day, minute-aligned weekly/fortnightly schedules, finite within two years. Complex provider rules must arrive as expanded occurrences with stable IDs. Unsupported rules reject the batch. When a recurring wall time falls in a DST gap/ambiguity it produces an unknown-time marker; a provider occurrence with an explicit instant resolves it. All-day recurring rules and recurrence “this and following” edits should be expanded upstream.

Future house and companion renderers should consume immutable engine snapshots and derived activity, not read DOM elements or duplicate scheduling rules. Add a repository interface/IndexedDB migration when data volume warrants it. Define a small explicit memory schema before AI conversation; journal text is user data, not automatically companion memory. Add a read-only summarisation boundary, consent, provenance and retention before any remote AI request. AI must not become the source of calendar truth.

Local storage is durable across ordinary reloads, not a guaranteed backup. School policies, incognito mode, browser eviction and origin changes may remove it. It is unencrypted and all scripts on the same origin can access it. A dedicated origin is preferable to sharing a sensitive app under a general GitHub Pages account origin. Persistence is browser-specific, with no device sync. Backups are private user downloads. There is no service worker or offline installation in this phase; an already loaded page computes without network, but loading the site requires its static files.

The Web Locks + revision approach is appropriate for a small prototype. Browsers without Web Locks retain stale-write detection but cannot make two truly simultaneous localStorage writes atomic; use one editing tab. Failed writes do not update the UI or claim success. Unsupported future schema versions are preserved for recovery; this release has no historical migration because it introduces v1.
