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

  try {
    const [bRes, gRes, aRes] = await Promise.all([
      zendeskFetch('/api/v2/brands.json'),
      zendeskFetch('/api/v2/groups.json?per_page=100'),
      zendeskFetch('/api/v2/users.json?role[]=agent&role[]=admin&per_page=100'),
    ]);
    if (!bRes.ok || !gRes.ok || !aRes.ok) {
      res.status(502).json({ error: 'erro ao buscar metadados do zendesk' });
      return;
    }
    const [bData, gData, aData] = await Promise.all([bRes.json(), gRes.json(), aRes.json()]);
    res.status(200).json({
      brands: (bData.brands || []).filter(b => b.active).map(b => ({ id: b.id, name: b.name })),
      groups: (gData.groups || []).map(g => ({ id: g.id, name: g.name })),
      agents: (aData.users || []).map(a => ({ id: a.id, name: a.name })),
    });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
