// Cloudflare Worker: issues short-lived app-only Spotify tokens (Client Credentials flow)
// so the browser can read PUBLIC playlists without any user login.
// The client secret lives only here as a Worker secret, never in browser code.

const SPOTIFY_CLIENT_ID = 'a5ebd8a96481431981679a28682f04fd';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

function corsHeaders(origin, allowedOrigin) {
  const allowOrigin = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to obtain app token' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const data = await tokenRes.json();
    return new Response(
      JSON.stringify({ access_token: data.access_token, expires_in: data.expires_in }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  },
};
