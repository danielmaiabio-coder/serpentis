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
      // Erro mais comum aqui: o e-mail ja pertence a OUTRO contato no Zendesk —
      // tipico de contato duplicado (ex: um registro veio do WhatsApp so com
      // telefone, outro veio por e-mail sem telefone, mesma pessoa). Busca quem
      // ja e' dono desse e-mail pra dar um erro util em vez de so repassar o JSON cru.
      let duplicado = null;
      if (zres.status === 422 && /DuplicateValue/i.test(detail)) {
        try {
          const sRes = await zendeskFetch(`/api/v2/users/search.json?query=email:${encodeURIComponent(email)}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            const outro = (sData.users || []).find((u) => String(u.id) !== String(userId));
            if (outro) duplicado = { id: outro.id, name: outro.name };
          }
        } catch (e2) { /* melhor esforco, ignora falha na busca */ }
      }
      res.status(zres.status).json({ error: 'erro na api do zendesk', detail, duplicado });
      return;
    }
    const data = await zres.json();
    res.status(200).json({ ok: true, email: (data.user && data.user.email) || email });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
