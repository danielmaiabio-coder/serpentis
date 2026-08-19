const { requireAuth } = require('../../lib/firebaseAuth');
const { zendeskFetch } = require('../../lib/zendeskClient');

const VALID_STATUSES = new Set(['new', 'open', 'pending', 'hold', 'solved']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  let authPayload;
  try {
    authPayload = await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }

  const payload = req.body || {};
  const { id } = payload;
  if (!id || !/^\d+$/.test(String(id))) { res.status(400).json({ error: 'id invalido' }); return; }

  const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
  const temBody = payload.body && String(payload.body).trim();
  const temStatus = payload.status && VALID_STATUSES.has(payload.status);

  const ticketPayload = {};
  if (temBody) {
    ticketPayload.comment = { body: String(payload.body), public: payload.isPublic !== false };
  }
  if (temStatus) {
    ticketPayload.status = payload.status;
  }
  if (has('brand_id') && payload.brand_id) {
    ticketPayload.brand_id = Number(payload.brand_id);
  }
  if (has('group_id') && payload.group_id) {
    ticketPayload.group_id = Number(payload.group_id);
  }
  if (has('assignee_id')) {
    ticketPayload.assignee_id = payload.assignee_id ? Number(payload.assignee_id) : null;
  }

  if (Object.keys(ticketPayload).length === 0) {
    res.status(400).json({ error: 'nada para atualizar' });
    return;
  }

  try {
    const zres = await zendeskFetch(`/api/v2/tickets/${id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ ticket: ticketPayload }),
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
