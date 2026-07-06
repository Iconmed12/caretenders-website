# Cana admin page redesign — implementation plan

Status: PLAN ONLY. No admin code changed yet. Chosen direction agreed; build to follow
in stages, on a branch, behind the existing admin login, tested before it replaces the
working page.

## Why
The current Cana tender-document page does too much at once: two status panels
(Live / Needs attention), a "select tender" dropdown, a LIVE-on-site bar, a progress
bar, four wide upload cards, a Quality Questions editor, and a Client completion pack,
all stacked into one long scroll. It is hard to scan and hard to know where you are.

## Chosen direction: A — "Focused workspace"
Visual reference (mockups, not code):
- Six directions explored: https://claude.ai/code/artifact/f7effb66-0c26-4147-b419-153c060986ff
- Direction A, full & interactive: https://claude.ai/code/artifact/b87fce51-2a6b-4c30-999d-84f7c5273476

Layout, left to right:
1. The existing global admin menu stays as-is (Dashboard, Care, Commercial, Cana, etc.).
2. A tender list ("rail") grouped into Live and Needs attention, each tender showing a
   document count (e.g. 3/3, 0/4). This replaces the two status panels AND the
   "select tender" dropdown.
3. A workspace that only ever shows the tender you picked, split into three TABS so you
   work on one thing at a time.

## Full content inventory (nothing may be dropped)
Everything currently on the page must have a home. Mapping:

- Tender rail (new): Live / Needs attention groups, per-tender doc counts, New tender
  button, search. Replaces: the two status panels, the select-tender dropdown, the
  "3 of 3" progress read-out.
- Workspace header: tender title + council + Live/offline status pill + Take offline /
  Set live action. Replaces: the standalone "LIVE on site" bar.
- Tab 1 "Documents": the four upload cards (Selection Questionnaire, Quality Questions,
  Service Specification, Scoring Criteria) + the "Save & train Cana" action.
- Tab 2 "Questions": the Quality Questions editor — each question's full text, word
  limit, and weighting %, add/delete a question, + "Save & train Cana".
- Tab 3 "Completion pack": the client's own documents (upload + editable label per file),
  the Submission portal dropdown, the Submission link, + "Save completion pack".
- Tab badges show counts (4 / 5 / 3) so you can see how much is in each at a glance.
- The "Set live" action stays disabled until the four documents are uploaded.

## Build approach: build ALONGSIDE, then swap (do NOT rewrite in place)
Netlify only builds from main, so a half-finished rewrite cannot be previewed on a
branch without going live. Therefore we build the new view as a SEPARATE page that runs
next to the current one, so the working admin is never broken:

1. Add a new page (e.g. a "Cana" beta view) that reads the SAME data and calls the SAME
   existing functions. The old Cana page stays exactly as it is.
2. Ship it, use it live alongside the old one, fix issues.
3. Only once the new view does everything the old one did, make it the default and
   retire the old page.

This means at every step the current admin keeps working, and rollback is trivial
(point the nav back at the old page).

## Stages (each its own branch, shown before merge, one at a time)
- Stage 0: extract the current Cana page's data-loading and actions we will reuse
  (which functions each button calls) so the new view reuses them, not reinvents them.
- Stage 1: new layout shell — global menu + tender rail + empty workspace with the three
  tabs. Reads tenders, populates the rail (Live / Needs attention + counts). No actions
  wired yet. Behind login.
- Stage 2: wire Tab 1 "Documents" — upload/extract/replace for the four doc types +
  Save & train Cana, reusing extract-cana-doc / patch-tender / the existing save path.
- Stage 3: wire Tab 2 "Questions" — load, edit text/word-limit/weighting, add/delete,
  Save & train Cana, reusing extract-questions and the existing question save path.
- Stage 4: wire Tab 3 "Completion pack" — uploads + labels + submission portal + link,
  reusing the current delivery/patch-tender path.
- Stage 5: make the new view the default Cana page; keep the old one one release longer,
  then remove it.

## Files likely touched
- public/admin.html — new page markup + nav entry; later remove old markup.
- public/admin.css — styles for the rail, tabs, cards, question editor, completion pack.
- public/admin-core.js — tender rail + tab switching + tender selection state.
- public/admin-cana-docs.js — Documents tab wiring (reuse existing upload/extract).
- public/admin-cana-questions.js — Questions tab wiring (reuse existing editor logic).
- public/admin-delivery.js — Completion pack wiring (reuse existing logic).
No Netlify functions need to change; the redesign is presentation only and reuses the
existing endpoints and data.

## Testing per stage (admin is behind the Phase 1 login)
After each stage, on the live admin: the old page still works untouched; the new view
does what that stage added, tested against a real tender (Targeted Short Breaks) and a
needs-attention tender (NHS24). Rollback: point the nav back to the old page.

## Rules carried over from how we work
One stage at a time; show before/after and get a clear yes before each merge; run
`node --check` on changed JS and `node scripts/check-refs.js` (expect PASS) before
pushing; never touch Stripe/payments or the generation engine as part of this UI work.

## Not in scope here
- The paused SQ auto-fill feature (see SQ-FINDINGS.md).
- Any change to how Cana generates responses.
