const loginGate = document.getElementById('login-gate');
const loginBtn = document.getElementById('login-btn');
const form = document.getElementById('score-form');
const input = document.getElementById('playlist-input');
const modeToggle = document.getElementById('mode-toggle');
const toggleRow = document.getElementById('toggle-row');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const tooltip = document.getElementById('tooltip');
const toggleLabels = document.querySelectorAll('.toggle-label');

let lastResponse = null;

function currentMode() {
  return modeToggle.checked ? 'bandOnly' : 'real';
}

function updateToggleLabels() {
  const mode = currentMode();
  toggleLabels.forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
}

function render() {
  if (!lastResponse) return;
  const ranked = lastResponse[currentMode()].filter((r) => r.score > 0);

  resultsEl.innerHTML = '';
  ranked.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'result-row';

    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'result-name' + (row.isBandMember ? ' band-member' : '');
    name.textContent = row.writer;

    const score = document.createElement('span');
    score.className = 'result-score';
    score.textContent = row.score.toFixed(2);

    li.append(rank, name, score);

    li.addEventListener('mouseenter', (e) => showTooltip(e, row.songs));
    li.addEventListener('mousemove', positionTooltip);
    li.addEventListener('mouseleave', hideTooltip);

    resultsEl.appendChild(li);
  });

  if (ranked.length === 0) {
    statusEl.textContent = 'No matching One Direction writer-credited songs found in that playlist.';
  } else {
    statusEl.textContent = `Matched ${lastResponse.trackCount} tracks in the playlist.`;
  }
}

function showTooltip(e, songs) {
  tooltip.textContent = songs.join(', ');
  tooltip.hidden = false;
  positionTooltip(e);
}

function positionTooltip(e) {
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

modeToggle.addEventListener('change', () => {
  updateToggleLabels();
  render();
});

loginBtn.addEventListener('click', () => {
  loginWithSpotify(SPOTIFY_CLIENT_ID);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const playlist = input.value.trim();
  if (!playlist) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  statusEl.textContent = 'Fetching playlist and crunching numbers...';
  resultsEl.innerHTML = '';

  try {
    const playlistId = extractPlaylistId(playlist);
    if (!playlistId) throw new Error("Couldn't recognize that as a Spotify playlist URL or ID");

    const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID);
    if (!accessToken) throw new Error('Your session expired — please log in again');

    await loadWeightTables();
    const tracks = await fetchPlaylistTracks(playlistId, accessToken);
    const real = scorePlaylist(tracks, 'real');
    const bandOnly = scorePlaylist(tracks, 'bandOnly');

    lastResponse = {
      trackCount: tracks.length,
      real: real.ranked,
      bandOnly: bandOnly.ranked,
      unmatched: real.unmatched,
    };
    render();
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

async function init() {
  updateToggleLabels();
  try {
    await handleAuthRedirect(SPOTIFY_CLIENT_ID);
  } catch (err) {
    statusEl.textContent = err.message;
  }

  if (isLoggedIn()) {
    loginGate.hidden = true;
    form.hidden = false;
    toggleRow.hidden = false;
  }
}

init();
