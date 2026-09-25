// Browser port of the scoring logic — loads precomputed weight tables via fetch instead of fs.
const BAND_MEMBERS = new Set(['Harry Styles', 'Louis Tomlinson', 'Liam Payne', 'Niall Horan', 'Zayn Malik']);

let realWeights = null;
let bandOnlyWeights = null;

// strips punctuation/case/common suffixes so Spotify track names line up with wiki titles
function normalizeTitle(raw) {
  return raw
    .toLowerCase()
    .replace(/\(feat\.[^)]*\)/g, '')
    .replace(/-\s*(live|acoustic|remix|bonus track|radio edit)[^-]*$/i, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'&\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadWeightTables() {
  if (realWeights && bandOnlyWeights) return;

  const [realRaw, bandRaw] = await Promise.all([
    fetch('data/writer_weights.json').then((r) => r.json()),
    fetch('data/writer_weights_band_only.json').then((r) => r.json()),
  ]);

  realWeights = new Map(realRaw.map((entry) => [normalizeTitle(entry.title), entry]));
  bandOnlyWeights = new Map(bandRaw.map((entry) => [normalizeTitle(entry.title), entry]));
}

function matchTrack(trackName, mode) {
  const table = mode === 'bandOnly' ? bandOnlyWeights : realWeights;
  return table.get(normalizeTitle(trackName)) || null;
}

// tracks: [{ name, artists: [names] }]
function scorePlaylist(tracks, mode) {
  const totals = new Map(); // writer -> score
  const contributions = new Map(); // writer -> Set(songTitle)
  const unmatched = [];

  for (const track of tracks) {
    const isOneDirection = track.artists.some((a) => a.toLowerCase() === 'one direction');
    if (!isOneDirection) continue;

    const entry = matchTrack(track.name, mode);
    if (!entry || Object.keys(entry.weights).length === 0) {
      unmatched.push(track.name);
      continue;
    }

    for (const [writer, weight] of Object.entries(entry.weights)) {
      totals.set(writer, (totals.get(writer) || 0) + weight);
      if (!contributions.has(writer)) contributions.set(writer, new Set());
      contributions.get(writer).add(entry.title);
    }
  }

  const ranked = [...totals.entries()]
    .map(([writer, score]) => ({
      writer,
      score,
      isBandMember: BAND_MEMBERS.has(writer),
      songs: [...contributions.get(writer)].sort(),
    }))
    .sort((a, b) => b.score - a.score);

  return { ranked, unmatched };
}
