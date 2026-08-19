const { requireAuth } = require('../../lib/firebaseAuth');
const { zendeskFetch } = require('../../lib/zendeskClient');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  let authPayload;
  try {
    authPayload = await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }

  const { id, body, isPublic } = req.body || {};
  if (!id || !/^\d+$/.test(String(id))) { res.status(400).json({ error: 'id invalido' }); return; }
  if (!body || !String(body).trim()) { res.status(400).json({ error: 'resposta vazia' }); return; }

  try {
    const zres = await zendeskFetch(`/api/v2/tickets/${id}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        ticket: {
          comment: {
            body: String(body),
            public: isPublic !== false,
          },
        },
      }),
    });
    if (!zres.ok) {
      const detail = await zres.text();
      res.status(zres.status).json({ error: 'erro na api do zendesk', detail });
      return;
    }
    res.status(200).json({ ok: true, respondidoPor: authPayload.email || authPayload.sub });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
