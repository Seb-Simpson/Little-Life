# LL-001 verification record

Date: 16 November 2026. Only synthetic data used.

## Automated checks

`npm run check`: syntax validation of source, scripts and tests; referenced root assets; no-network application CSP.

`npm test`: 48 passing Node tests covering London offsets and DST bounds; current/next activity and overlap; free-window clipping/unknown times; all-day/overnight events; weekly/fortnightly schedules, exceptions, moves and cancellations; replay/source-scoped deduplication; stale updates and atomic conflict rejection; unknown/missing fields; consent/evidence claims; separate demo/personal state; reload persistence; corrupt/future-schema preservation; quota/storage failures and stale-writer rejection.

`npm run build`: 160 KB static output with relative URLs; no credential/runtime service configuration. Both checked-in synthetic import examples validate and replay without adding duplicates.

## Browser QA

Not completed. The managed `sites-preview` service could not open browser port 4173: the preview relay timed out waiting for readiness. The first preview attempt also exposed that the development server ignored the supplied port; that source defect was fixed and later attempts reached the separate relay failure. The Cloud browser/desktop runtime was initialised, but the preview route remained unavailable. No alternative browser path was used. Layout, responsive rendering, form interactions, file-picker/download flows and browser reload behaviour remain unverified in a real browser. The Node suite verifies the underlying scheduling/import/persistence behaviour; it is not a substitute for browser UI QA.

## Explicitly unverified

- School account connectivity, permission/consent, school export policy and licence entitlements.
- Contents/behaviour of Sebastian’s existing Power Automate flows; retrieval success is user reported.
- SOCS academic/co-curricular coverage and feed access; Outlook/Teams/email completeness and freshness.
- Automatic delivery into Little Life (not implemented), real school data import (not attempted), managed-laptop persistence and device notifications (not implemented).
- GitHub Pages deployment (not enabled), Windows/Lively compatibility and storage sharing.

No external account was accessed and no managed-device restriction was bypassed.
