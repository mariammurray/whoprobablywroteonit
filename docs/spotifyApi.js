// Browser-side Spotify Web API helpers (playlist ID parsing + paginated track fetch).

function extractPlaylistId(input) {
  const trimmed = input.trim();

  let match = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([a-zA-Z0-9]+)/);
  if (match) return match[1];

  match = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (match) return match[1];

  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed;

  return null;
}

async function fetchPlaylistTracks(playlistId, accessToken) {
  const tracks = [];
  let url =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks` +
    '?fields=items(track(name,artists(name))),next&limit=100';

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404) throw new Error('Playlist not found (is it public?)');
    if (!res.ok) throw new Error(`Failed to fetch playlist (${res.status})`);

    const data = await res.json();
    for (const item of data.items || []) {
      if (!item.track) continue;
      tracks.push({
        name: item.track.name,
        artists: (item.track.artists || []).map((a) => a.name),
      });
    }
    url = data.next;
  }

  return tracks;
}
