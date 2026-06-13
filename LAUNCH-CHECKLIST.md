# Cana / Tender Experts -- Launch Checklist

Last updated: 2026-06-13 (late)

This is the living pre-launch checklist. Ask Claude "where are we on launch"
at any time (7pm or otherwise) and it will read this file and give you the
current state. Claude updates this file as items are completed.

## Status key
- [ ] not started
- [~] in progress
- [x] done

---

## 1. Membership system (core commercial engine)
- [x] Stripe webhook recording members (subscriptions table)
- [x] Welcome email naming the linked membership email
- [x] Membership check + sign-in gated bypass (no payment for members)
- [x] Member dashboard: skips form, shows status + profile + generate
- [x] Members review SQ before generation
- [x] Member status pill in nav
- [x] "Your plan" badge + "Upgrade or manage" button on plans page
- [x] Renewal date shown (fallback from signup + term for now)

## 2. Expert Review (£300 add-on)
- [x] Checkbox on member dashboard
- [x] Card on results page (members + non-members)
- [x] Payment fires after generation starts
- [ ] Ops notification: paid review emails consulting@icongrp.co.uk with the
      client's responses attached (NOT built -- reviews currently have no
      fulfilment alert)
- [ ] Decide + add scope line ("up to ~10 questions, larger quoted") and the
      48h turnaround promise wording on the card

## 3. Cana generation quality (LAUNCH BLOCKERS)
- [x] Response truncation: max_tokens raised 4000 -> 8000 per answer, generated
      one question at a time so each gets full budget. Verified clean on 5 real bids
- [~] Genericness: Key People section added to profile (named staff by role) and
      fed into generation; KPIs + social value now flow in too. Still want richer
      contract-example prompting in onboarding to push specificity further
- [x] Word-count control: answers already generated to each question's stated
      page/word limit
- [x] Em dashes stripped from all generated output (house rule)
- [x] [INSERT: ...] gaps render bold red in the Word doc with a review banner

## 3b. Onboarding profile depth (the real genericness fix)
- [~] Key People capture live (Registered Manager, Safeguarding Lead, Operations
      Lead, Nominated Individual, Care Coordinator, Other)
- [x] Contract examples section live (up to 3, full PSQ fields), fed into both
      written answers and the SQ contract table, always re-tailored to the spec
- [x] Supabase columns added: key_people jsonb, contract_examples jsonb
- [ ] Optional later: knowledge base of strong example ANSWERS for written
      scored questions (separate from form-filling, helps answer quality)

## 4. Delivery + fulfilment
- [ ] Full delivery pack email retest: confirm completion docs + checklist +
      portal link all land via generate-cana-background end to end
- [x] SQ fill engine v2 rebuilt and live: tested against 7 real council SQs,
      handles contract grids, right-cell/below-cell layouts, supplier name.
      Contract examples from profile auto-fill the SQ contract table.
- [ ] Watch real SQ output across more councils, refine matching as needed

## 5. Payments go-live (ONE coordinated switch, after ALL testing approved)
- [ ] Convert membership to real recurring Stripe subscriptions (Option B):
      proper recurring prices in plan-checkout, real current_period_end,
      auto-renewal, cancel support, failed-payment retries
- [ ] Flip every £1 TEST amount to real prices in one pass:
      - cana-checkout unit_amount -> 48000 (£480 one-off)
      - plan-checkout membership -> 89700 / 167400 / 298800 (3/6/12mo)
      - plan-checkout review -> 30000 (£300)
- [ ] Confirm STRIPE_SECRET_KEY is set in Netlify (needed for period reads)

## 6. Security hardening (LAST, before any marketing push)
- [ ] Admin password protection (admin.html currently open to anyone with URL)
- [ ] RLS on all tables incl. subscriptions, with policies
- [ ] Functions switched to service-role key (bypasses RLS server-side)
- [ ] Signed-token admin auth + CORS lockdown
- [ ] Record all Netlify env var values somewhere private + secure

## 7. Backups + infrastructure
- [ ] Supabase Pro upgrade (daily automated DB backups -- only real backup gap;
      code is already safe in GitHub)
- [ ] Optional: weekly manual CSV export of tenders + subscriptions tables

## 8. Open decisions (Joel only)
- [ ] Homepage 94% stat -- keep or remove now members submit unreviewed output
- [ ] £480-credit-toward-membership offer -- yes / no
- [ ] Daily matched-tenders member email -- build now or post-launch

---

## Done this far (for confidence)
The entire membership commercial layer is live and working: a member can pay,
be recorded, get a welcome email, sign in, land on a tailored dashboard, review
their SQ, generate unlimited bids with no further payment, optionally add a £300
expert review, and see their status reflected across the nav, profile and plans
pages. All payments remain in £1 TEST mode until the coordinated go-live flip.
