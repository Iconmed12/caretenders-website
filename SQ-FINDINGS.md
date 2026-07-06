# SQ auto-fill: investigation findings

Status: DIAGNOSIS ONLY. No code changed. The feature remains paused.
Date of investigation: recorded during a security-hardening session.
Purpose: capture why the SQ (Selection Questionnaire) auto-fill/completion feature
fills fields incorrectly or leaves them blank, so we can decide later whether to
fix it. A dedicated session will scope any fix; nothing here is a commitment.

---

## What the feature is

It takes a council's blank SQ Word document (.docx) and tries to hand the customer
back a completed version, filled from their company profile plus AI-written
answers. It was hidden before launch because it filled some fields incorrectly and
left others blank, and handing a customer a partially-filled legal document is a
trust risk.

## The pieces (what is where)

- netlify/functions/extract-sq.js: Admin uploads the SQ .docx. AI reads it, lists
  the fields, tags each as auto_fill / ai_draft / client_confirm, stores the
  original doc + an HTML preview + the field list on the tender (sq_data).
- netlify/functions/complete-sq.js: Produces the answers. Applies canned defaults
  (insurance "Yes", safeguarding blurb, etc.), AI-writes the rest.
- netlify/functions/fill-sq-doc.js: Opens the original .docx and tries to drop each
  answer into the right table cell. This is fill Engine #1.
- netlify/functions/preview-sq-doc.js: Only renders the SQ as an on-screen preview.
  Not part of filling.
- netlify/functions/generate-cana-background.js (approx lines 447 to 545): A second,
  different fill engine used in the emailed flow. This is fill Engine #2.
- public/cana-sq.js line 455: The customer flow. The fill call is switched OFF with
  a hardcoded `if (false && ...)`, commented "SQ auto-fill paused for launch".

Two structural facts matter: there are TWO different fill engines that behave
differently, and the customer-facing one is hard-disabled.

## How it is supposed to work (plain English)

1. You upload a council's blank SQ Word doc. The AI scans it and lists every field
   to fill, tagging each as "pull from company profile", "AI writes this", or
   "client must personally confirm".
2. When a customer buys with SQ included, the system generates all the answers.
3. It re-opens the original Word file and tries to type each answer into the
   correct box.
4. It hands back the completed Word doc.

Step 3 is where it falls apart.

## Why it fills wrong or leaves blanks (the actual causes)

1. It finds the right box by GUESSING FROM WORDS, not by knowing. The AI stores
   each question shortened to under 60 characters (extract-sq.js line 71), i.e. a
   paraphrase, not the document's real wording. The filler then matches that
   paraphrase back to the real document by counting shared words, needing 2+ words
   in common (fill-sq-doc.js lines 153 to 163). That guessing fails two ways:
   - Blank: the paraphrase does not share enough words with the real row, so no
     match, so the box is left empty.
   - Wrong box: two questions share common words ("company", "experience",
     "provide"), so the answer lands in the wrong row.

2. It assumes every SQ has the same table shape. Both engines assume "question in
   the early cells, answer goes in the last cell (or the row below)". Real council
   SQs vary widely: answers to the right, below, in merged cells, tick-boxes,
   free-text boxes. When the layout differs it fills the wrong cell or misses it.
   Word docs have no reliable structure, so this is a genuinely hard problem.

3. There is a real bug in Engine #2. In generate-cana-background.js around line 518
   it uses a lookup table called QA_MAP that is never defined anywhere in the file.
   The moment it reaches a normal question row it crashes, the crash is silently
   caught, and the rest of the document is left unfilled. So even where this engine
   runs it fills almost nothing.

4. It only reads the first 10,000 characters of the SQ (extract-sq.js line 61).
   Longer questionnaires lose every field past that point; those sections are never
   filled.

5. It asserts things that may not be true. complete-sq.js hardcodes "Yes" for
   insurance, GDPR, equality, safeguarding, modern slavery, IR35, and guesses SME
   status from staff count. On a legally-binding document, stating things that
   might be false is exactly the trust risk we flagged.

## Is it fixable, and how hard

Yes, but not with a quick patch.

- The QA_MAP crash (cause 3) is an easy bug fix on its own, but fixing it only
  re-enables a fundamentally unreliable engine. Not worth doing alone.
- The core problem (causes 1 and 2), reliably placing answers into arbitrary
  council Word tables by word-guessing, is the hard part and the reason the output
  cannot be trusted.

Three realistic paths:

- Option A, quick patch: fix QA_MAP, tighten matching. Effort: hours. Result: still
  guesses, still blanks/wrong on varied docs. Not trustworthy enough to unpause.
- Option B, identity-based fill plus "flag, don't guess": capture each field's
  EXACT location in the doc at extract time (not a paraphrase); only fill boxes it
  is confident about; leave anything uncertain as a visible [INSERT: ...] flag for
  the client. Effort: a few days. Result: much more reliable, and the failure mode
  becomes "clearly marked as incomplete" instead of "confidently wrong". Removes the
  legal-doc trust risk.
- Option C, confirmed template mapping: you/admin confirm the field-to-box mapping
  once per SQ format, then fills are exact. Effort: more build plus an admin step
  per new format. Result: most reliable, more work.

Recommendation if revived: Option B. The single most important change is not the
matching, it is the philosophy: never fill what it is not sure of, leave a bold
[INSERT] flag instead (exactly what the bid-response engine already does). That
turns "partially-filled legal document with wrong answers" into "mostly-filled
document with clearly-marked gaps for the client to complete", which is honest and
safe to hand over.

## Bottom line

It is not one broken thing. It is a fragile design (word-guessing plus rigid layout
assumptions), plus a real crash bug (undefined QA_MAP), plus a risky "assume Yes"
habit. Fixable, but the trustworthy version is a proper few-days piece of work
centred on "fill only what is certain, flag the rest", not a one-line fix. Leave it
paused until we decide Option B is worth that effort.

## Open item to confirm when revived

Confirm whether the emailed flow (generate-cana-background, gated by includeSq) can
still run for a real purchase, or whether includeSq is effectively disabled too.
The front-end fill path (fill-sq-doc via cana-sq.js) is hard-disabled by `if(false)`;
Engine #2 would crash on QA_MAP if reached. Either way the customer does not
currently receive a properly filled SQ, which is consistent with why it was paused.
