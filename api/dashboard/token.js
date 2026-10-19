const crypto = require('crypto');
const { requireAuth } = require('../../lib/firebaseAuth');

// Token curto (5 min) assinado com HS256 para o dashboard de cobranca embutido no Chocalho.
// O e-mail vem do Firebase ID Token ja validado no servidor, nunca do navegador.
function assinarTokenDashboard(user) {
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const corpo = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({
    iss: 'chocalho',
    aud: 'dashboard-hashtag',
    sub: user.sub,
    email: String(user.email || '').toLowerCase(),
    iat: agora,
    exp: agora + 300
  });
  const assinatura = crypto
    .createHmac('sha256', process.env.DASHBOARD_EMBED_JWT_SECRET)
    .update(corpo)
    .digest('base64url');
  return corpo + '.' + assinatura;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }
  if (!process.env.DASHBOARD_EMBED_JWT_SECRET) { res.status(503).json({ error: 'nao configurado' }); return; }

  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }
  if (!user.email) { res.status(403).json({ error: 'sem e-mail' }); return; }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ token: assinarTokenDashboard(user) });
};
