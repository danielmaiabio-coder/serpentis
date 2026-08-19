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

  const id = (req.query && req.query.id) || '';
  if (!id || !/^\d+$/.test(String(id))) {
    res.status(400).json({ error: 'id invalido' });
    return;
  }

  try {
    const [tRes, cRes] = await Promise.all([
      zendeskFetch(`/api/v2/tickets/${id}.json`),
      zendeskFetch(`/api/v2/tickets/${id}/comments.json`),
    ]);
    if (!tRes.ok) {
      const detail = await tRes.text();
      res.status(tRes.status).json({ error: 'erro na api do zendesk', detail });
      return;
    }
    const tData = await tRes.json();
    const cData = cRes.ok ? await cRes.json() : { comments: [] };

    let requesterName = null;
    if (tData.ticket && tData.ticket.requester_id) {
      const uRes = await zendeskFetch(`/api/v2/users/${tData.ticket.requester_id}.json`);
      if (uRes.ok) {
        const uData = await uRes.json();
        requesterName = (uData.user && uData.user.name) || null;
      }
    }

    const via = tData.ticket.via || {};
    res.status(200).json({
      ticket: {
        id: tData.ticket.id,
        subject: tData.ticket.subject,
        status: tData.ticket.status,
        priority: tData.ticket.priority,
        requester_name: requesterName,
        requester_id: tData.ticket.requester_id,
        brand_id: tData.ticket.brand_id,
        group_id: tData.ticket.group_id,
        assignee_id: tData.ticket.assignee_id,
        channel: via.channel || null,
        via_from: (via.source && via.source.from) || null,
        via_to: (via.source && via.source.to) || null,
        tags: tData.ticket.tags,
      },
      comments: (cData.comments || []).map(c => ({
        id: c.id,
        author_id: c.author_id,
        is_requester: c.author_id === tData.ticket.requester_id,
        channel: (c.via && c.via.channel) || null,
        body: c.plain_body || c.body,
        public: c.public,
        created_at: c.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
