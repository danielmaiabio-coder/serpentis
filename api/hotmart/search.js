const { requireAuth } = require('../../lib/firebaseAuth');
const { hotmartFetch } = require('../../lib/hotmartClient');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    await requireAuth(req);
  } catch (e) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }

  const q = req.query || {};
  const email = (q.email || '').trim();
  const name = (q.name || '').trim();
  const transaction = (q.transaction || '').trim();

  if (!email && !name && !transaction) {
    res.status(400).json({ error: 'informe email, nome ou codigo de transacao' });
    return;
  }

  const params = { max_results: 30 };
  if (email) params.buyer_email = email;
  if (name) params.buyer_name = name;
  if (transaction) params.transaction = transaction;

  try {
    const zres = await hotmartFetch('/payments/api/v1/sales/history', params);
    if (!zres.ok) {
      const detail = await zres.text();
      res.status(zres.status).json({ error: 'erro na api da hotmart', detail });
      return;
    }
    const data = await zres.json();
    const items = (data.items || []).map(it => ({
      transaction: it.purchase && it.purchase.transaction,
      status: it.purchase && it.purchase.status,
      valor: it.purchase && it.purchase.price && it.purchase.price.value,
      moeda: it.purchase && it.purchase.price && it.purchase.price.currency_code,
      metodo: it.purchase && it.purchase.payment && it.purchase.payment.method,
      assinatura: !!(it.purchase && it.purchase.is_subscription),
      dataCompra: it.purchase && it.purchase.order_date,
      dataAprovacao: it.purchase && it.purchase.approved_date,
      garantiaAte: it.purchase && it.purchase.warranty_expire_date,
      comprador: {
        nome: it.buyer && it.buyer.name,
        email: it.buyer && it.buyer.email,
      },
      produto: {
        id: it.product && it.product.id,
        nome: it.product && it.product.name,
      },
    }));
    res.status(200).json({ total: (data.page_info && data.page_info.total_results) || items.length, items });
  } catch (e) {
    res.status(500).json({ error: 'erro interno', detail: e.message });
  }
};
