# Before ASH: briefing for the Student Life Office

**What it is.** A web app for Ashoka students: pick things to do before graduating, mark them done, and
share a page others can copy from. Free, no ads, no data sales, Ashoka only.

## Who can get in
- Sign-in is Google only, restricted to `@ashoka.edu.in`. Enforced three ways: the Google prompt, the server
  re-checking the verified email, and a database rule that rejects any other address.
- Every member accepts the Terms, Privacy and Community rules at sign-in; acceptance is recorded with a
  policy version.

## Content safety
- Named posts: automatic filter plus classifier before anyone else sees them.
- Anonymous posts: automatic checks plus a human read before publishing (48h typical, 5 days maximum;
  never auto-approved). Anonymous posting pauses sitewide if the queue backs up.
- Reports: three distinct reporters hide an item pending review. Members can block others.
- Appeals: one free-text appeal per hidden item, moved to the front of the queue.

## Oversight (what your office can see)
Designated staff get **read-only** access, behind two-factor authentication:
- **Overview**: member counts, activity, review backlog and oldest waiting item, reports, blocks, identity
  reveals, pending account deletions, server errors. Counts only.
- **Audit log**: every moderation action and every identity reveal (who acted and the written reason).
  Append-only.

Staff cannot see emails, private notes, post text, or who wrote an anonymous post, and cannot change anything.

## Identity reveal
Only the moderator, only with a written reason of at least 20 characters, and each reveal is permanently
logged. Reveal events are visible to oversight staff (actor and reason, not the person revealed).

## Privacy
DPDP Act 2023 as the baseline: access, correction, erasure (30-day recovery window), breach notice within
72 hours, 18-month inactivity purge. First-party analytics only; no third-party trackers. Sign-in is the only
third party (Google). Data lives in Supabase (Postgres).

## Monitoring
- `/api/health` (database) and `/api/health/inference` (moderation model): for an uptime monitor, 503 when down.
- Server errors are recorded and counted on the Overview page.
- Review backlog turns red when something has waited 2+ days (5+ for the oldest item).

## Operations: open items
- Name and contact for the grievance officer (set in environment; page warns until set).
- Names of Student Life staff to receive oversight access (`OVERSIGHT_HANDLES`), each enrolling an authenticator app.
- Succession: who runs this after the current maintainer graduates (the privacy page commits to a shutdown otherwise).
- Currently one moderator; agree a backup before launch.
- Account-deletion recovery emails are not yet sent (link shown on screen instead).
