// Spotify Authorization Code + PKCE flow — runs entirely in the browser, no client secret needed.
const AUTH_STORAGE_KEY = 'spotify_auth';
const APP_TOKEN_STORAGE_KEY = 'spotify_app_token';
const USER_SCOPES = 'playlist-read-private user-library-read';

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function sha256(plain) {
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

function readAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeAuth(auth) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

async function loginWithSpotify(clientId) {
  const codeVerifier = randomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const state = randomString(16);

  sessionStorage.setItem('pkce_verifier', codeVerifier);
  sessionStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: USER_SCOPES,
    redirect_uri: redirectUri(),
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCodeForToken(clientId, code) {
  const codeVerifier = sessionStorage.getItem('pkce_verifier');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Failed to exchange authorization code for a token');

  const data = await res.json();
  writeAuth({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
}

async function refreshAccessToken(clientId) {
  const auth = readAuth();
  if (!auth?.refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    client_id: clientId,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;

  const data = await res.json();
  const updated = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  writeAuth(updated);
  return updated.accessToken;
}

// call once on page load: handles the redirect back from Spotify, if any
async function handleAuthRedirect(clientId) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (!code && !error) return;

  // strip auth params from the URL so a refresh doesn't re-trigger the exchange
  window.history.replaceState({}, document.title, redirectUri());

  if (error) throw new Error(`Spotify login failed: ${error}`);

  const expectedState = sessionStorage.getItem('pkce_state');
  if (state !== expectedState) throw new Error('State mismatch during Spotify login');

  await exchangeCodeForToken(clientId, code);
}

async function getAccessToken(clientId) {
  const auth = readAuth();
  if (!auth) return null;
  if (Date.now() < auth.expiresAt) return auth.accessToken;
  return refreshAccessToken(clientId);
}

function isLoggedIn() {
  return !!readAuth();
}

function logout() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function readAppToken() {
  try {
    return JSON.parse(sessionStorage.getItem(APP_TOKEN_STORAGE_KEY));
  } catch {
    return null;
  }
}

// App-only token (Client Credentials flow) for reading PUBLIC playlists without any user login.
// Obtained from our own token proxy, which is the only place that holds the client secret.
async function getAppAccessToken() {
  const cached = readAppToken();
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;

  const res = await fetch(TOKEN_PROXY_URL);
  if (!res.ok) throw new Error('Could not get an app token to read the playlist');

  const data = await res.json();
  const token = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  sessionStorage.setItem(APP_TOKEN_STORAGE_KEY, JSON.stringify(token));
  return token.accessToken;
}
