const fs = require('fs');
const path = require('path');

const MFL_BASE = 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod/players';
const LIMIT = 1500;

const DATA_DIR = path.join(__dirname, '..', 'data');
const CURRENT_FILE = path.join(DATA_DIR, 'players_current.json');
const SOS_FILE = path.join(DATA_DIR, 'players_sos.json');
const META_FILE = path.join(DATA_DIR, 'last_updated.json');

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

function loadExistingSos() {
  if (!fs.existsSync(SOS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(SOS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('Could not parse existing players_sos.json, starting fresh.');
    return [];
  }
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

async function main() {
  const players = await fetchAllPlayers();
  const transformed = players.map(transformPlayer);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 1. Overwrite the "current" snapshot every run -- this is today's live stats.
  fs.writeFileSync(CURRENT_FILE, JSON.stringify(transformed));
  console.log(`Wrote ${transformed.length.toLocaleString()} players to players_current.json`);

  // 2. Baseline file: only ADD players that have never been seen before.
  //    Existing baseline rows are never touched -- that's what makes them a fixed "before" snapshot.
  const existingSos = loadExistingSos();
  const existingIds = new Set(existingSos.map(p => p.ID));
  const newForSos = transformed.filter(p => !existingIds.has(p.ID)).map(slimForSos);

  if (newForSos.length) {
    const mergedSos = existingSos.concat(newForSos);
    fs.writeFileSync(SOS_FILE, JSON.stringify(mergedSos));
    console.log(`Added ${newForSos.length.toLocaleString()} new players to the baseline (now ${mergedSos.length.toLocaleString()} total).`);
  } else {
    fs.writeFileSync(SOS_FILE, JSON.stringify(existingSos));
    console.log('No new players to add to the baseline.');
  }

  // 3. Record when this last ran successfully, so the front end can show it.
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
