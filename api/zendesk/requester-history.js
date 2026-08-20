const { requireAuth } = require('../../lib/firebaseAuth');
const { zendeskFetch } = require('../../lib/zendeskClient');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }

  const requesterId = (req.query && req.query.requester_id) || '';
  const excludeId = (req.query && req.query.exclude_id) || '';
  if (!requesterId || !/^\d+$/.test(String(requesterId))) {
    res.status(400).json({ error: 'requester_id invalido' });
    return;
  }

  try {
    const zres = await zendeskFetch(`/api/v2/users/${requesterId}/tickets/requested.json?sort_by=updated_at&sort_order=desc`);
    if (!zres.ok) {
      const detail = await zres.text();
      res.status(zres.status).json({ error: 'erro na api do zendesk', detail });
      return;
    }
    const data = await zres.json();
    const tickets = (data.tickets || [])
      .filter(t => String(t.id) !== String(excludeId))
      .map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        updated_at: t.updated_at,
        created_at: t.created_at,
      }));
    res.status(200).json({ tickets });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
