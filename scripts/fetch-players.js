const fs = require('fs');
const path = require('path');

const MFL_BASE = 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod/players';
const LIMIT = 1500;

// Records per output file. At MFL's current scale (~330k+ players, ~330
// bytes/record for the full "current" record) this keeps each chunk file
// well under GitHub's 100MB per-file limit, with plenty of headroom for
// the player count to keep growing.
const CHUNK_SIZE = process.env.CHUNK_SIZE ? parseInt(process.env.CHUNK_SIZE) : 50000;

// Where to read the PREVIOUS run's data from (to preserve the baseline).
// The workflow points this at a checkout of the "data" branch. If that
// branch doesn't exist yet (very first run), this directory won't exist
// and we correctly treat the baseline as empty.
const EXISTING_DATA_DIR = process.env.EXISTING_DATA_DIR
  ? path.resolve(process.env.EXISTING_DATA_DIR)
  : path.join(__dirname, '..', 'data');

// Where to write this run's fresh output. The workflow points this at a
// clean folder that becomes the entire content of a brand-new commit.
const OUTPUT_DATA_DIR = process.env.OUTPUT_DATA_DIR
  ? path.resolve(process.env.OUTPUT_DATA_DIR)
  : path.join(__dirname, '..', 'data');

const META_FILE = path.join(OUTPUT_DATA_DIR, 'last_updated.json');

async function fetchAllPlayers() {
  let allPlayers = [];
  let cursor = null;
  let page = 0;

  console.log('Starting MFL player fetch...');

  while (true) {
    let url = `${MFL_BASE}?limit=${LIMIT}&sorts=metadata.overall&sortsOrders=DESC`;
    if (cursor) url += `&beforePlayerId=${cursor}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`MFL API error: ${res.status}`);
    const data = await res.json();

    if (data.key && data.message) throw new Error(`MFL API: ${data.message}`);

    allPlayers.push(...data);
    page++;

    console.log(`Page ${page} | Players: ${allPlayers.length.toLocaleString()}`);

    if (data.length < LIMIT) {
      console.log(`Fetch complete. ${allPlayers.length.toLocaleString()} total players.`);
      break;
    }

    cursor = data[data.length - 1].id;
    await new Promise(r => setTimeout(r, 2000));
  }

  return allPlayers;
}

function transformPlayer(p) {
  const m = p.metadata || {};
  const club = p.activeContract?.club || {};
  const owner = p.ownedBy || {};
  const offerLabels = { 0: 'Not available', 1: 'Unspecified', 2: 'Open' };

  return {
    ID: p.id,
    first_name: m.firstName || '',
    last_name: m.lastName || '',
    overall: m.overall || 0,
    position: (m.positions || [])[0] || '',
    age: m.age || 0,
    nationality: (m.nationalities || [])[0] || '',
    foot: m.preferredFoot || '',
    pace: m.pace || 0,
    shooting: m.shooting || 0,
    passing: m.passing || 0,
    dribbling: m.dribbling || 0,
    defense: m.defense || 0,
    physical: m.physical || 0,
    club: club.name || '',
    club_division: club.division || null,
    owner: owner.name || '',
    wallet: owner.walletAddress || '',
    offer_status: offerLabels[p.offerStatus] ?? String(p.offerStatus ?? ''),
  };
}

// Keep the baseline file lean -- it only needs enough fields to compute deltas.
function slimForSos(p) {
  return {
    ID: p.ID,
    overall: p.overall,
    pace: p.pace,
    shooting: p.shooting,
    passing: p.passing,
    dribbling: p.dribbling,
    defense: p.defense,
    physical: p.physical,
  };
}

// --- Chunked read/write helpers -------------------------------------------

function manifestPath(dir, basename) {
  return path.join(dir, `${basename}_manifest.json`);
}
function chunkPath(dir, basename, i) {
  return path.join(dir, `${basename}_${i}.json`);
}

function loadChunked(dir, basename) {
  const mPath = manifestPath(dir, basename);
  if (!fs.existsSync(mPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    let all = [];
    for (let i = 0; i < manifest.chunks; i++) {
      const cPath = chunkPath(dir, basename, i);
      if (!fs.existsSync(cPath)) continue;
      all = all.concat(JSON.parse(fs.readFileSync(cPath, 'utf8')));
    }
    return all;
  } catch {
    console.warn(`Could not read existing ${basename}, starting fresh.`);
    return [];
  }
}

function writeChunked(dir, basename, records) {
  fs.mkdirSync(dir, { recursive: true });
  const chunkCount = Math.max(1, Math.ceil(records.length / CHUNK_SIZE));
  for (let i = 0; i < chunkCount; i++) {
    const slice = records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    fs.writeFileSync(chunkPath(dir, basename, i), JSON.stringify(slice));
  }
  fs.writeFileSync(manifestPath(dir, basename), JSON.stringify({
    chunks: chunkCount,
    total: records.length,
    chunk_size: CHUNK_SIZE,
  }));
  console.log(`Wrote ${basename}: ${records.length.toLocaleString()} records across ${chunkCount} file(s).`);
}

// --- Main --------------------------------------------------------------

async function main() {
  const players = await fetchAllPlayers();
  const transformed = players.map(transformPlayer);

  // 1. Current snapshot: fully replaced every run.
  writeChunked(OUTPUT_DATA_DIR, 'players_current', transformed);

  // 2. Baseline: only ADD players never seen before. Existing baseline
  //    entries are carried over untouched -- that's what keeps them a
  //    fixed "before" snapshot.
  const existingSos = loadChunked(EXISTING_DATA_DIR, 'players_sos');
  const existingIds = new Set(existingSos.map(p => p.ID));
  const newForSos = transformed.filter(p => !existingIds.has(p.ID)).map(slimForSos);
  const mergedSos = existingSos.concat(newForSos);
  writeChunked(OUTPUT_DATA_DIR, 'players_sos', mergedSos);
  console.log(newForSos.length
    ? `Added ${newForSos.length.toLocaleString()} new players to the baseline (now ${mergedSos.length.toLocaleString()} total).`
    : 'No new players to add to the baseline.');

  // 3. Record when this last ran successfully.
  fs.mkdirSync(OUTPUT_DATA_DIR, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify({
    updated_at: new Date().toISOString(),
    player_count: transformed.length,
  }));

  console.log('All done!');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
