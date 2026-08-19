const crypto = require('crypto');

const PROJECT_ID = 'ninho-de-cobra';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certsCache = null;
let certsExpiry = 0;

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

async function getGoogleCerts() {
  if (certsCache && Date.now() < certsExpiry) return certsCache;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('falha ao buscar certificados do Google');
  certsCache = await res.json();
  certsExpiry = Date.now() + 60 * 60 * 1000;
  return certsCache;
}

// Verifica um Firebase ID Token sem precisar do Admin SDK / service account —
// valida assinatura RS256 contra as chaves publicas do Google e confere claims.
async function verifyFirebaseToken(idToken) {
  if (!idToken) throw new Error('token ausente');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('token malformado');

  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));

  if (header.alg !== 'RS256') throw new Error('algoritmo inesperado');
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('token expirado');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('issuer invalido');
  if (payload.aud !== PROJECT_ID) throw new Error('audience invalida');
  if (!payload.sub) throw new Error('token sem uid');

  const certs = await getGoogleCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error('chave de assinatura desconhecida');

  const publicKey = crypto.createPublicKey(pem);
  const signedData = parts[0] + '.' + parts[1];
  const signature = base64UrlDecode(parts[2]);
  const valid = crypto.verify('RSA-SHA256', Buffer.from(signedData), publicKey, signature);
  if (!valid) throw new Error('assinatura invalida');

  return payload; // payload.sub = uid, payload.email, etc.
}

async function requireAuth(req) {
  const header = req.headers.authorization || '';
  const idToken = header.replace(/^Bearer\s+/i, '');
  return verifyFirebaseToken(idToken);
}

module.exports = { verifyFirebaseToken, requireAuth };
