const { requireAuth } = require('../../lib/firebaseAuth');
const { zendeskFetch } = require('../../lib/zendeskClient');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }

  const payload = req.body || {};
  const userId = payload.userId;
  const email = (payload.email || '').trim();

  if (!userId || !/^\d+$/.test(String(userId))) { res.status(400).json({ error: 'userId invalido' }); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'email invalido' }); return; }

  try {
    // verified:true evita que o Zendesk mande um e-mail de confirmacao pro aluno —
    // o agente ja confirmou esse e-mail na conversa, nao precisa reconfirmar com ele.
    const zres = await zendeskFetch(`/api/v2/users/${userId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ user: { email, verified: true } }),
    });
    if (!zres.ok) {
      const detail = await zres.text();
      res.status(zres.status).json({ error: 'erro na api do zendesk', detail });
      return;
    }
    const data = await zres.json();
    res.status(200).json({ ok: true, email: (data.user && data.user.email) || email });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
