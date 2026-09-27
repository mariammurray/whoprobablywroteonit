const loginBtn = document.getElementById('login-btn');
const accountControls = document.getElementById('account-controls');
const likedSongsBtn = document.getElementById('liked-songs-btn');
const browsePlaylistsBtn = document.getElementById('browse-playlists-btn');
const logoutBtn = document.getElementById('logout-btn');
const playlistPicker = document.getElementById('playlist-picker');
const form = document.getElementById('score-form');
const input = document.getElementById('playlist-input');
const modeToggle = document.getElementById('mode-toggle');
const toggleRow = document.getElementById('toggle-row');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const toggleLabels = document.querySelectorAll('.toggle-label');

const PENDING_ACTION_KEY = 'pending_playlist_input';

let lastResponse = null;

function currentMode() {
  return modeToggle.checked ? 'bandOnly' : 'real';
}

function updateToggleLabels() {
  const mode = currentMode();
  toggleLabels.forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
}

function ordinal(value) {
  const lastTwoDigits = value % 100;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13
    ? 'th'
    : value % 10 === 1
      ? 'st'
      : value % 10 === 2
        ? 'nd'
        : value % 10 === 3
          ? 'rd'
          : 'th';
  return `${value}${suffix}`;
}

function buildSongBlock(song) {
  const block = document.createElement('div');
  block.className = 'song-block';

  const title = document.createElement('div');
  title.className = 'song-title';
  title.textContent = song.title;

  const dots = document.createElement('div');
  dots.className = 'song-dots';
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', `${ordinal(song.position)} of ${song.totalWriters} writers`);
  for (let d = 1; d <= song.totalWriters; d++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (d === song.position ? ' dot-active' : '');
    dot.setAttribute('aria-hidden', 'true');
    dots.appendChild(dot);
  }

  block.append(title, dots);
  return block;
}

function render() {
  if (!lastResponse) return;
  const ranked = lastResponse[currentMode()].filter((r) => r.score > 0);

  resultsEl.innerHTML = '';
  ranked.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'result-row' + (row.isBandMember ? ' band-member-row' : '');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'result-header';
    header.setAttribute('aria-expanded', 'false');

    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'result-name' + (row.isBandMember ? ' band-member' : '');
    name.textContent = row.writer;

    const score = document.createElement('span');
    score.className = 'result-score';
    score.textContent = row.score.toFixed(2);

    header.append(rank, name, score);

    const details = document.createElement('div');
    details.className = 'result-details';
    details.id = `writer-details-${i}`;
    row.songs.forEach((song) => details.appendChild(buildSongBlock(song)));
    header.setAttribute('aria-controls', details.id);
    const updateHeaderLabel = (expanded) => {
      const action = expanded ? 'Hide' : 'Show';
      header.setAttribute(
        'aria-label',
        `${i + 1}. ${row.writer}, score ${row.score.toFixed(2)}. ${action} song and position details.`
      );
    };
    updateHeaderLabel(false);

    header.addEventListener('click', () => {
      const expanded = !li.classList.contains('expanded');
      li.classList.toggle('expanded', expanded);
      header.setAttribute('aria-expanded', String(expanded));
      updateHeaderLabel(expanded);
    });

    li.append(header, details);
    resultsEl.appendChild(li);
  });

  const count = lastResponse.oneDirectionCount;
  const countLabel = `${count} One Direction song${count === 1 ? '' : 's'}`;
  statusEl.textContent = count === 0
    ? 'No One Direction songs found in the playlist.'
    : ranked.length === 0
      ? `Found ${countLabel} in the playlist, but none had matching writer credits.`
      : `Found ${countLabel} in the playlist.`;
}

modeToggle.addEventListener('change', () => {
  updateToggleLabels();
  render();
});

function updateAccountUI() {
  const loggedIn = isLoggedIn();
  loginBtn.hidden = loggedIn;
  accountControls.hidden = !loggedIn;
  if (!loggedIn) playlistPicker.hidden = true;
}

function showResultsLoading() {
  resultsEl.innerHTML = '';
  resultsEl.setAttribute('aria-busy', 'true');
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('li');
    row.className = 'result-row skeleton-row';
    row.setAttribute('aria-hidden', 'true');
    row.innerHTML = '<div class="result-header"><span class="loading-skeleton skeleton-line"></span></div>';
    resultsEl.appendChild(row);
  }
}

function showPlaylistPickerLoading() {
  playlistPicker.replaceChildren();
  playlistPicker.setAttribute('aria-busy', 'true');
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('li');
    row.className = 'playlist-picker-skeleton';
    row.setAttribute('aria-hidden', 'true');
    row.innerHTML = '<span class="loading-skeleton skeleton-line"></span>';
    playlistPicker.appendChild(row);
  }
  playlistPicker.hidden = false;
}

loginBtn.addEventListener('click', () => {
  loginWithSpotify(SPOTIFY_CLIENT_ID);
});

logoutBtn.addEventListener('click', () => {
  logout();
  playlistPicker.hidden = true;
  playlistPicker.innerHTML = '';
  updateAccountUI();
});

async function scoreAndRender(tracks) {
  await loadWeightTables();
  const real = scorePlaylist(tracks, 'real');
  const bandOnly = scorePlaylist(tracks, 'bandOnly');

  lastResponse = {
    oneDirectionCount: real.oneDirectionCount,
    real: real.ranked,
    bandOnly: bandOnly.ranked,
    unmatched: real.unmatched,
  };
  render();
}

async function runWithStatus(label, task) {
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  statusEl.textContent = label;
  statusEl.dataset.loading = 'true';
  showResultsLoading();
  try {
    await task();
  } catch (err) {
    statusEl.textContent = err.message;
    resultsEl.replaceChildren();
  } finally {
    submitBtn.disabled = false;
    delete statusEl.dataset.loading;
    resultsEl.removeAttribute('aria-busy');
  }
}

likedSongsBtn.addEventListener('click', () => {
  playlistPicker.hidden = true;
  runWithStatus('Fetching Liked Songs...', async () => {
    const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID);
    if (!accessToken) throw new Error('Your session expired — please log in again');
    const tracks = await fetchLikedSongsTracks(accessToken);
    await scoreAndRender(tracks);
  });
});

browsePlaylistsBtn.addEventListener('click', async () => {
  const showing = !playlistPicker.hidden;
  if (showing) {
    playlistPicker.hidden = true;
    return;
  }

  showPlaylistPickerLoading();

  try {
    const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID);
    if (!accessToken) throw new Error('Your session expired — please log in again');
    const playlists = await fetchUserPlaylists(accessToken);

    playlistPicker.removeAttribute('aria-busy');
    playlistPicker.replaceChildren();
    if (playlists.length === 0) {
      const emptyMessage = document.createElement('li');
      emptyMessage.className = 'picker-loading';
      emptyMessage.textContent = 'No playlists found.';
      playlistPicker.appendChild(emptyMessage);
      return;
    }

    playlists.forEach((playlist) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picker-item';
      btn.textContent = `${playlist.name} (${playlist.trackCount} tracks)`;
      btn.addEventListener('click', () => {
        playlistPicker.hidden = true;
        input.value = playlist.id;
        runWithStatus('Fetching playlist and crunching numbers...', async () => {
          const token = await getAccessToken(SPOTIFY_CLIENT_ID);
          const tracks = await fetchPlaylistTracks(playlist.id, token);
          await scoreAndRender(tracks);
        });
      });
      li.appendChild(btn);
      playlistPicker.appendChild(li);
    });
  } catch (err) {
    playlistPicker.removeAttribute('aria-busy');
    const errorMessage = document.createElement('li');
    errorMessage.className = 'picker-loading';
    errorMessage.textContent = err.message;
    playlistPicker.replaceChildren(errorMessage);
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const playlist = input.value.trim();
  if (!playlist) return;
  input.value = '';

  await runWithStatus('Fetching playlist and crunching numbers...', async () => {
    const playlistId = extractPlaylistId(playlist);
    if (!playlistId) throw new Error("Couldn't recognize that as a Spotify playlist URL or ID");

    // Keep token-proxy failures distinct from playlist access errors.
    const appToken = await getAppAccessToken();
    let tracks;
    try {
      tracks = await fetchPlaylistTracks(playlistId, appToken);
    } catch (err) {
      if (![401, 403, 404].includes(err.status)) throw err;

      // App-only tokens cannot access private playlists; retry with the user's token.
      if (!isLoggedIn()) {
        sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({ type: 'playlist', playlistId }));
        loginWithSpotify(SPOTIFY_CLIENT_ID);
        return;
      }

      const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID);
      if (!accessToken) throw new Error('Your session expired — please log in again');
      tracks = await fetchPlaylistTracks(playlistId, accessToken);
    }
    await scoreAndRender(tracks);
  });
});

async function resumePendingAction() {
  const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_ACTION_KEY);

  const pending = JSON.parse(raw);
  if (pending.type !== 'playlist') return;

  input.value = pending.playlistId;
  await runWithStatus('Fetching playlist and crunching numbers...', async () => {
    const accessToken = await getAccessToken(SPOTIFY_CLIENT_ID);
    if (!accessToken) throw new Error('Your session expired — please log in again');
    const tracks = await fetchPlaylistTracks(pending.playlistId, accessToken);
    await scoreAndRender(tracks);
  });
}

async function init() {
  updateToggleLabels();
  toggleRow.hidden = false;

  try {
    await handleAuthRedirect(SPOTIFY_CLIENT_ID);
  } catch (err) {
    statusEl.textContent = err.message;
  }

  updateAccountUI();
  await resumePendingAction();
}

init();

