# Service intents and partner introduction implementation plan

> For agentic workers: use superpowers:executing-plans for website changes and one bounded PDF asset task.

**Goal:** Turn the approved repair / home selection / business quotation approach into working public journeys and a shareable partner introduction.
**Architecture:** Keep the current static customer assets and Worker, D1, R2 and push flow. Add consent v3 for optional photos and typed inquiries. Reuse existing service/space/details columns, keeping v1/v2 compatibility and administrator permissions unchanged.
**Tech Stack:** HTML/CSS/JS, Cloudflare Worker, SQLite integration tests, ReportLab PDF.
**Spec:** User approved the three journeys and supplied five installation references on 2026-10-27. This document records that approved scope; no additional design approval is needed.

## Design and constraints
- First screen offers repair/lock problem telephone consultation, home product selection, and business/multiple-unit installation.
- Preserve all 363 products, galleries, videos, designated price list and contact information.
- Business section includes the five supplied references, no dates, quantities, logos, endorsement or invented project photos. School names remain 광주 양x중학교 and 선운 운x초등학교.
- A4 PDF and PNG downloadable from the business section, public phone 0507-1469-2808 and URL https://jeonnamlock.com/#business.
- Unified form has repair/home/business types, required neighborhood and phone, optional photos. Business company/type/quantity/desired-date are optional but validated when present. Existing product notes survive intent switches.
- v3 consent 2026-10-27-v3. Business metadata formatted by server into existing details; no schema migration or administrator layout redesign.
- No advertising changes, outgoing messages, invented guarantees or online payment.

## Review focus
- Photo-free inquiries must persist, notify and be readable only by authorized admin.
- Legacy drafts still require photos when their v2 consent requires them.
- Business invalid type, excessive quantity and invalid dates fail validation.
- Failed transmission retains one frozen inquiry and retries without duplicates.
- Navigation and optional form fields remain keyboard/mobile usable.

## Tasks
- [x] Backend: integration tests for v3 no-photo submission, three services, business metadata/validation and privacy; implement payload alongside v1/v2.
- [x] Customer UI: add hero and three paths, repair and business sections, update optional-photo form and consent, preserve catalog links; update client retry tests and admin display tests.
- [x] Assets: create/verify brochure PDF and PNG, serve with exact bytes and MIME through build/preview, include download links.
- [x] Verification: full node test suite; local desktop/mobile and business + repair submission, administrator receipt review; independent branch review.
- [ ] Publish exact tested source using Sites; verify deployment and provide website + brochure links.

## Execution ledger
- Existing isolated worktree codex/redesign-analytics verified and Sites source opened at a6fa2c0b16b0c982e46b094c74aa53ecb6d507a6.
- Ruling: no new price-to-model matching because owner has not specified designated models. Preserve existing price conditions.
- Ruling: use actual supplied installation references as text; unrelated photographs will not represent those sites.

- Backend and customer tests: new v3 tests observed RED, implemented, passed with legacy compatibility.
- Browser: desktop and 390px mobile checked; no horizontal overflow. Photo-free business and repair inquiries saved in local environment; private admin login and company/type/18-unit/date values verified. Existing product modal retained.
- Assets: A4 PDF and PNG rendered/reviewed; exact bytes and MIME verified in Worker build.
- Final review: independent conversion_final_review; no remaining important/critical findings.
- Final: fixed leading-zero quantity rejected after form froze — leading zero client regression RED→GREEN, full suite 63/63.
- Final: no deferred minors. Existing price conditions kept because designated model mapping is unspecified; no unrelated photos used for supplied project references.
- Publication: source helper will commit/push the verified build and native Sites will publish it to the unchanged public audience.

