# Cana / Tender Experts -- Launch Checklist

Last updated: 2026-06-13

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
- [ ] Response truncation: increase maxTokens in generation so answers do not
      cut off
- [ ] Genericness: feed the knowledge base strong example responses so output
      is specific, not templated
- [ ] Word-count control: generate answers to the tender's stated word limits
      (idea from competitor analysis, strong-to-have)

## 4. Delivery + fulfilment
- [ ] Full delivery pack email retest: confirm completion docs + checklist +
      portal link all land via generate-cana-background end to end
- [ ] SQ fill audit v2 -- waiting on Joel to send the Reading PSQ

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
