# Cana security plan (planning document)

Status: PLANNING ONLY. Nothing in this document has been built yet.
Target: secure admin and app before launch (Feb 2027), carefully, one phase at a time.
Working style: each phase on a branch, before/after shown, explicit yes required, validate before push.

---

## What the current code actually does (the honest starting point)

- The admin "login" is not security. `public/admin-core.js` (line 3 and line 13) contains the
  passwords in plain text (`CareTenders2024!`, `CanaAdmin2024!`, `Cana2024!`). Anyone can read
  them via View Source. The password only hides a screen on the page; it does not protect
  anything underneath.
- The backend functions do not check who is calling. Functions like save-knowledge-base,
  save-tender, patch-tender, import-tenders, clear-rejected, purge-rejected can be triggered by
  anyone who knows the URL. The `Authorization: Bearer ...` inside them is Cana's own key for
  talking to the database, not a check on the visitor.
- The database key shipped in the browser is currently a master key. Because RLS (Row-Level
  Security) is off, the public anon key embedded in the site (cana-core.js line 608) can read
  and change rows across the tables directly, bypassing the app. This is the single biggest
  exposure.
- The AI generation endpoints are open. cana-core.js line 70 triggers generate-cana-background
  with just a job ID and company details, no proof of payment at the function itself. Fake
  requests could burn Anthropic credit.
- Two good things already exist that we will reuse. Customers already have real logins via
  Supabase Auth (login.html line 177), and stripe-webhook.js already does proper cryptographic
  signature verification (line 7). The building blocks for "verify the caller" are already here.

---

## The five pieces

### 1. A real login for the admin panel
- What it protects: the control room, tender import, knowledge base editing, deletions, and any
  customer data visible in the admin.
- How it works: replace the fake password-in-the-page with a real account. Two routes: (a) a
  dedicated admin user in Supabase Auth (same system customers already use), or (b) Netlify's
  built-in password protection / Identity. Either way, logging in produces a real signed token
  the backend can later check.
- Risk: LOW to MEDIUM. Self-contained and reversible.
- What could break: worst case you lock yourself out of admin, recoverable by redeploy or
  password reset. Does not touch the customer-facing site.
- Incremental or all-or-nothing: fully incremental. Build the new login next to the old one,
  test, then delete the old password.
- Dashboard work: yes. Create the admin account in the Supabase dashboard (route a), or configure
  protection in the Netlify dashboard (route b). Store any admin secret as a Netlify env var.
- Note: on its own this is only a locked door on one room. It is worthless until the backend
  functions also check the token (piece 2). These two are a pair.

### 2. Backend functions verify the caller
- What it protects: every action that writes, deletes, or spends money. This is what actually
  stops someone hitting the function URLs directly.
- How it works: each admin function checks for a valid admin token (or a shared secret) before
  doing anything, and returns "not allowed" otherwise, like stripe-webhook.js already rejects
  unsigned calls. Customer functions check the customer's Supabase token (the front end can
  already produce it).
- Risk: MEDIUM. The danger is a check that is too strict silently breaking a real feature.
- What could break: if a function gets a check but the front end is not updated to send the
  token, that feature stops working until both sides match. Each function must be changed
  together with the page that calls it.
- Incremental or all-or-nothing: incremental, one function at a time, test, move on. Start with
  the highest-value admin functions (knowledge base, import, deletes).
- Dashboard work: minimal. A shared admin secret as a Netlify env var for admin functions;
  customer functions need nothing new.

### 3. Enabling Supabase RLS safely
- What it protects: the database itself. Closes the "public key is a master key" hole so that
  even someone using the anon key directly can only touch what they are allowed to.
- How it works, and why order matters:
  1. First, move all server functions to the service key (a private key that bypasses RLS). This
     is why piece 2 groundwork comes first, so functions keep working when RLS turns on.
  2. Then write the access rules for each table in the Supabase SQL editor and test them while
     RLS is still off.
  3. Then turn RLS on one table at a time, checking the live site after each.
- Risk: HIGH. This is the one to be most careful with.
- What could break: flip RLS on for a table without the right rules and the anon key instantly
  loses access; anything relying on it (customer dashboards, tender lists, the vault, the admin
  panel) can go blank or fail for everyone, live.
- Incremental or all-or-nothing: in-between. You can go table by table (incremental), but each
  table is a hard switch. Saving grace: RLS can be toggled off again instantly, so it is
  recoverable if done table by table at a quiet time.
- Dashboard work: heavy. The most Supabase-dashboard-intensive piece: writing and testing
  policies, toggling RLS per table. Confirm the service key is set as a Netlify env var (per
  CLAUDE.md it already is).

### 4. Locking the AI generation endpoints
- What it protects: Anthropic credit, i.e. real money. Stops strangers running generations and
  stops the same paid job being re-run repeatedly.
- How it works: before spending any credit, the generation function looks up the job, confirms it
  came from a verified payment and is in a "pending, not yet processed" state, and flips it to
  "processing" so it cannot be replayed. Later add a token/secret check on top.
- Risk: MEDIUM, but the low-risk version (the job-state check) is a good safe first step.
- What could break: too strict and a genuinely paid customer does not get their documents.
  Pre-launch with no real customers, real-world impact today is low, which makes now a good time
  to build it.
- Incremental or all-or-nothing: incremental. Start with the server-side job-state check, add
  stronger verification later.
- Dashboard work: little to none. Possibly one shared secret as a Netlify env var.

### 5. Individual staff logins (later phase)
- What it protects: accountability and least privilege. Each person has their own account that
  can be switched off, and the knowledge base can be locked to owner-only.
- How it works: build on pieces 1 and 2. Each staff member is their own Supabase user with a role
  (owner vs staff), and functions check the role, not just "is an admin."
- Risk: MEDIUM. Getting roles wrong could give a staffer too much access or lock someone out, but
  it is admin-side and does not touch customers.
- Incremental or all-or-nothing: incremental, add people and roles gradually.
- Dashboard work: yes, create staff users and assign roles in the Supabase dashboard, likely with
  a small roles table.

---

## Recommended order

| Phase | Work | Risk | Why here |
|------|------|------|----------|
| 0 | Audit and classify every function (public / customer / admin / cron) and decide which key each should use | None (read-only) | De-risks everything after it; no change to live site |
| 1 | Real admin login plus admin-function verification (pieces 1 and 2, admin subset) | Low to Med | Closes the widest-open door; the two only work as a pair |
| 2 | Lock generation endpoints, job-state check first (piece 4) | Med (low-risk version) | Protects money; independent, can move earlier if credit-burn worries you |
| 3 | Customer-function verification plus move server functions to the service key (piece 2 customer subset plus RLS prep) | Med | Groundwork that makes RLS safe |
| 4 | Enable RLS table by table (piece 3) | HIGH | Do last, after functions bypass via service key and rules are tested; most preparation, quiet-time rollout |
| 5 | Individual staff logins and roles (piece 5) | Med | Builds on 1 and 2; not needed until closer to launch |

Key dependency: RLS (phase 4) is safe only after the server functions have been moved to the
service key (done in phase 3). Turning RLS on before that would break the site. That is the one
ordering mistake that hurts.

Safe to do incrementally: pieces 1, 2, 4, 5, and even RLS if done one table at a time with testing.
Most all-or-nothing: RLS per individual table, a hard switch on each one.

---

## Bottom line
The biggest exposure is the database being wide open to the public key (fixed by RLS, phase 4),
but that is also the riskiest change, which is why it goes last with the most prep. The quickest
meaningful win is phases 1 to 2: a real admin login plus function checks, which shuts the most
obviously open door with low risk. Phase 2 (generation lock) is worth doing soon purely to protect
Anthropic credit.

Next action agreed: start Phase 1 (admin login) in a fresh session where it can be tested properly.
