let tokenCache = null;
let tokenExpiry = 0;

async function getHotmartToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache;

  const { HOTMART_CLIENT_ID, HOTMART_CLIENT_SECRET, HOTMART_BASIC } = process.env;
  if (!HOTMART_CLIENT_ID || !HOTMART_CLIENT_SECRET || !HOTMART_BASIC) {
    throw new Error('Credenciais da Hotmart nao configuradas.');
  }

  const url = 'https://api-sec-vlc.hotmart.com/security/oauth/token' +
    '?grant_type=client_credentials&client_id=' + encodeURIComponent(HOTMART_CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(HOTMART_CLIENT_SECRET);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + HOTMART_BASIC },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error('Falha ao autenticar na Hotmart (' + res.status + '): ' + detail);
  }
  const data = await res.json();
  tokenCache = data.access_token;
  tokenExpiry = Date.now() + Math.max(60, (data.expires_in || 300) - 60) * 1000;
  return tokenCache;
}

// A API da Hotmart as vezes devolve um erro passageiro (ex: invalid_parameter
// generico, sem motivo real) mesmo com a chamada correta. Tenta de novo uma
// vez antes de desistir, e forca renovar o token se a falha foi 401.
async function hotmartFetch(path, params, _tentativaExtra) {
  const token = await getHotmartToken();
  const query = Object.keys(params || {})
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map(k => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = 'https://developers.hotmart.com' + path + (query ? '?' + query : '');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok && !_tentativaExtra) {
    if (res.status === 401) { tokenCache = null; tokenExpiry = 0; }
    await new Promise(r => setTimeout(r, 700));
    return hotmartFetch(path, params, true);
  }
  return res;
}

module.exports = { getHotmartToken, hotmartFetch };
