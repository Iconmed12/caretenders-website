Cana - Project Notes for Claude Code
This file gives you (Claude Code) the context and rules for this project. Read it at the start of every session.
What this project is
Cana is a tender procurement platform for UK businesses. They find public sector tenders and use Cana to generate bid responses, with optional human expert review. Built by a solo founder who is not a deep technical developer, so explain things in plain English, no jargon. Launch planned February 2027. Pre-launch, no real customer data yet.
Stack
Netlify (auto-deploys from the main branch), Supabase (project ref igpjfpncfuawikoyzfcd), Stripe, Resend email (hello@getcana.co.uk). Front end is plain HTML/CSS/vanilla JS in public/. Back end is Netlify functions in netlify/functions/. Repo: github.com/Iconmed12/caretenders-website.
How we work
Show the change or design before building it. The founder reviews first and pushes back if things move too fast. Explain in plain English, short and clear. For anything risky (payments, auth, security, deletes, the generation engine), work on a branch, show the plan, get a clear yes before applying. One change at a time, validate before pushing. Never rush the founder into security work.
Hard rules
NO EM DASHES anywhere: not in code, comments, UI text, strings, or emails. Use commas, colons, or hyphens. Strict rule across the whole project.
Branding is "Cana", never "Cana AI". Flag any leftover "Cana AI".
Stripe must stay in £1 TEST mode until the founder explicitly says go live. Go-live amounts in pence: base bid 48000, expert review add-on 30000, review plus document completion add-on 100000. Do not change without explicit instruction.
No VAT in pricing for now (entity not VAT registered). An unused addVat function is kept for later.
Key code notes
Site auto-deploys from main. Netlify only builds previews from main, not branches, so merge to main to see changes live. After editing JS, run node --check before pushing. There is a checker at scripts/check-refs.js that should report PASS. If a JS file passes ~1000 lines, consider splitting it.
Supabase notes
The public (anon) key can READ and UPDATE but CANNOT DELETE rows by design. Any deletion must go through a server function using the SERVICE key (SUPABASE_SERVICE_KEY). Examples: clear-rejected.js, purge-rejected.js. Row-Level Security (RLS) is currently OFF on tables, a known gap planned for the admin security build closer to launch. Do not just enable RLS without setting up access rules first, it would break the app.
Generation engine
Netlify functions generate the tender responses using the Anthropic API, reading a knowledge base split by sector (care vs commercial, chosen by the tender's category). Needs credit in the Anthropic account. If answers come back as "Response unavailable", the likely cause is empty Anthropic credit, not a code bug.
Known open items (for closer to launch)
Admin security build (founder login, staff logins, lock knowledge base to owner only, enable Supabase RLS properly). Stripe go-live flip (the three amounts above) on the founder's say-so. Keep Anthropic credit topped up before real generation testing.