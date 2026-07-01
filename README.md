# MFL Pro Tracker — no-database rebuild

This version drops Supabase entirely. The GitHub Action fetches player data
from MFL, writes it to two JSON files in the repo, and commits them. GitHub
Pages serves those files as plain static assets, and `index.html` fetches
them directly with `fetch()`. Nothing to sign up for, nothing that can be
paused, deleted, or lock you out — the repo *is* the database.

## What's in this folder
- `scripts/fetch-players.js` — fetches MFL data, writes `data/*.json`
- `.github/workflows/fetch-players.yml` — daily cron that runs the script and commits the result
- `index.html` — the front end, reads the JSON files directly
- `data/` — seed files (`[]`) so the site works before the first Action run

## Setup steps

### 1. Create the repo
Push all these files to a new GitHub repo, preserving the folder structure
(`scripts/`, `.github/workflows/`, `data/`, and `index.html` at the root).

### 2. Let Actions push commits
Go to your repo → Settings → Actions → General → scroll to "Workflow
permissions" → select **"Read and write permissions"** → Save.
This is the only settings change required — no secrets, no API keys, no
external accounts. The Action uses GitHub's own built-in token to commit.

### 3. Enable GitHub Pages
Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main` /
root. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

### 4. Run the Action once to seed the baseline
Repo → Actions tab → "Daily MFL Player Fetch" → Run workflow (the manual
`workflow_dispatch` trigger). This is the important one: whichever day you
run this first is the day that becomes everyone's permanent "before"
snapshot (`data/players_sos.json`). After that it runs automatically every
day at 01:00 UTC and only *adds* newly-seen players to the baseline — it
never overwrites existing baseline rows.

### 5. Check it worked
- Actions tab: the run should finish green, and its log will show
  "Wrote N players to players_current.json."
- Your repo should now have a new commit "Update player data YYYY-MM-DD"
  changing files under `data/`.
- Open your Pages URL — it should load real data instead of the seed `[]`
  files.

## Why this is simpler than the Supabase version
- **No account to lose access to.** The data lives in your own git history,
  which you already control.
- **No API keys to leak, rotate, or mismatch.** There's nothing to
  authenticate against.
- **No "project got paused" failure mode.** A GitHub Pages site and a
  scheduled Action don't expire from inactivity the way a free-tier hosted
  database can.
- Every piece of this (repo, Actions, Pages) is something you already have
  through your GitHub account — no new signups at all.

## One thing to keep an eye on
Every daily run commits a fresh `players_current.json`, so the repo's git
history will grow over time (roughly however big that file is, times 365 a
year). For a project this size that's very unlikely to be a real problem for
a long while, but if the repo ever starts feeling heavy, the fix is to have
the Action force-push the data to a dedicated branch that only ever holds
the latest snapshot, instead of accumulating history on `main`. Not needed
to get started — just something to know is there if it ever comes up.
