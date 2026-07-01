# MFL Pro Tracker — no-database rebuild (v2: chunked + branch-separated)

## Why this version exists
The first version of this kit committed one big `players_current.json` to
the repo. Turns out MFL has **338,246 players**, and the full file came out
to **105.91 MB** — over GitHub's hard 100 MB-per-file limit, so the daily
Action's push was rejected every time. On top of that, committing a file
that size to `main` every day would have bloated the repo by tens of GB a
year.

This version fixes both problems:
- **Chunking** — data is split into ~50,000-record files (about 15–16 MB
  each at current scale), safely under the limit with room for the player
  count to grow a lot before this needs revisiting.
- **A dedicated `data` branch** — instead of accumulating a new commit on
  `main` every day, the Action rebuilds the `data` branch from scratch each
  run and force-pushes it. That branch always contains just one commit —
  today's snapshot — so it never grows over time. Your `main` branch (the
  actual site code) is never touched by the daily runs at all.

Nothing about this changes what you, personally, have to do day-to-day —
it's still fully automatic. It only changes what the Action does internally.

## What's in this folder
- `index.html` — front end, now fetches chunked files from the `data`
  branch via `raw.githubusercontent.com` (auto-detects your username/repo
  from the page URL — no config needed if you're using the default
  `https://username.github.io/repo-name/` Pages URL)
- `scripts/fetch-players.js` — fetches MFL data, writes chunked JSON files
  plus a small manifest per dataset
- `.github/workflows/fetch-players.yml` — checks out `main` (for the
  script) and the existing `data` branch (to preserve the baseline), then
  publishes a fresh single-commit snapshot to `data`
- `README.md`

Notice there's no `data/` folder in this kit — data no longer lives on
`main` at all.

## If you already set up the first version
You only need to replace three files in your existing repo with the ones
in this folder — same method as before (edit each file on GitHub, or
delete and re-create at the same path, and paste in the new content):
- `index.html`
- `scripts/fetch-players.js`
- `.github/workflows/fetch-players.yml`

Everything else you already did still applies as-is:
- "Read and write permissions" for Actions — already set, no change needed
- GitHub Pages pointed at `main` — already set, no change needed (the site
  code still lives on `main`; only the data moved)

The old `data/players_current.json` / `players_sos.json` placeholder files
sitting on `main` from the first attempt are now unused — safe to delete
whenever you like, not urgent, not required for anything to work.

## Setup steps (from scratch)
If you're starting fresh rather than upgrading:

1. **Create the repo**, upload these 4 files/folders keeping the structure
   intact (`index.html`, `README.md`, `scripts/`, `.github/workflows/`).
2. **Settings → Actions → General → Workflow permissions → "Read and write
   permissions" → Save.**
3. **Settings → Pages → Source: Deploy from a branch → `main` / root →
   Save.**
4. **Actions tab → "Daily MFL Player Fetch" → Run workflow.** This is the
   deliberate one — whatever comes back becomes everyone's permanent
   "before" snapshot.
5. **Check it worked:**
   - The run turns green, log ends with something like "Wrote
     players_current: 338,246 records across 7 file(s)."
   - A new `data` branch now exists in your repo (branch dropdown near the
     top of the Code tab) with exactly one commit on it.
   - Your Pages URL shows real players and numbers.

## Ongoing operation — unchanged
Same as before: the Action runs itself daily at 01:00 UTC, no action from
you. `players_current` refreshes with today's stats; `players_sos` quietly
gets new players added while existing entries stay untouched. The only
reason to go back in is a red/failed run in the Actions tab, which will
have a log explaining why.
