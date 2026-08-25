// Sem cache de token entre requisicoes: em producao (Vercel) o mesmo container
// pode ficar "morno" e atender varias buscas diferentes reaproveitando o
// token guardado em memoria. O token da Hotmart parece nao tolerar bem esse
// reuso entre requisicoes distintas (formato incomum, comprimido/codificado,
// sugerindo algo vinculado a sessao/nonce) — os testes locais sempre usavam
// um token recem-emitido (processo novo a cada teste) e por isso nunca
// reproduziam o erro "invalid_parameter" visto em producao. Buscar um token
// novo a cada chamada custa uma requisicao extra, irrelevante pro volume de
// uma busca administrativa.
async function getHotmartToken() {
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
  return data.access_token;
}

// A API da Hotmart as vezes devolve um erro passageiro (ex: invalid_parameter
// generico, sem motivo real) mesmo com a chamada correta. Tenta de novo uma
// vez antes de desistir, sempre com um token recem-emitido (ver comentario
// acima sobre por que nao cacheamos).
async function hotmartFetch(path, params, _tentativaExtra) {
  const token = await getHotmartToken();
  const query = Object.keys(params || {})
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map(k => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = 'https://developers.hotmart.com' + path + (query ? '?' + query : '');
  console.log('[hotmart] request url:', url, '| token len:', token ? token.length : 0);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) {
    const body = await res.clone().text();
    console.error('[hotmart] resposta com erro. status:', res.status, '| body:', body.slice(0, 500));
  }
  if (!res.ok && !_tentativaExtra) {
    await new Promise(r => setTimeout(r, 700));
    return hotmartFetch(path, params, true);
  }
  return res;
}

module.exports = { getHotmartToken, hotmartFetch };
