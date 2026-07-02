// READ-ONLY TEST. This does not touch players_current, players_sos, or the
// data branch in any way, and writes nothing to disk. It exists purely to
// answer one question: can this environment successfully reach and page
// through MFL's listings API, and what does real data look like.

const MFL_LISTINGS_BASE = 'https://z519wdyajg.execute-api.us-east-1.amazonaws.com/prod/listings';
const LISTINGS_PAGE_SIZE = 50;

async function fetchAllListings() {
  let allListings = [];
  let cursor = null;
  let page = 0;
  const start = Date.now();

  console.log('TEST: starting isolated listings fetch (nothing will be saved or committed)...');

  while (true) {
    let url = `${MFL_LISTINGS_BASE}?limit=${LISTINGS_PAGE_SIZE}&type=PLAYER&status=AVAILABLE&view=full`;
    if (cursor) url += `&beforeListingId=${cursor}`;

    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error(`Network error reaching MFL listings API: ${e.message}`);
    }

    if (res.status === 403) {
      console.log('Got HTTP 403 (rate limited) -- backing off 60s and retrying...');
      await new Promise(r => setTimeout(r, 60000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from listings API`);

    const batch = await res.json();
    if (!Array.isArray(batch)) {
      throw new Error('Unexpected response shape (expected an array): ' + JSON.stringify(batch).slice(0, 300));
    }
    if (batch.length === 0) break;

    allListings.push(...batch);
    page++;
    if (page === 1 || page % 10 === 0) {
      console.log(`Page ${page} | Listings so far: ${allListings.length.toLocaleString()} | Elapsed: ${((Date.now() - start) / 1000).toFixed(0)}s`);
    }

    if (batch.length < LISTINGS_PAGE_SIZE) break;

    cursor = batch[batch.length - 1].listingResourceId;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, 600));
  }

  return allListings;
}

async function main() {
  const start = Date.now();
  const listings = await fetchAllListings();
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(0);

  const missingPlayerId = listings.filter(l => !l.player?.id).length;

  console.log('');
  console.log('=== TEST RESULTS ===');
  console.log('Total listings fetched:', listings.length.toLocaleString());
  console.log('Total time taken:', elapsedSec, 'seconds');
  console.log('Listings missing a usable player.id:', missingPlayerId);
  console.log('Sample listing (first one returned):');
  console.log(JSON.stringify(listings[0], null, 2));
  console.log('');
  console.log('This was a READ-ONLY test. Nothing was written to disk or committed anywhere.');
}

main().catch(err => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});
