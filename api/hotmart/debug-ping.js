// Endpoint temporario de diagnostico — NAO faz parte da feature, existe so
// pra isolar se o erro "invalid_parameter" da Hotmart em producao vem do
// conteudo dos parametros (buyer_email etc) ou da origem/rede da chamada.
// Remover depois de diagnosticado.
const { hotmartFetch } = require('../../lib/hotmartClient');

module.exports = async function handler(req, res) {
  if (req.query.chave !== 'diag-choc-9f21') {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const modo = req.query.modo || 'sem_filtro';
  try {
    let params;
    if (modo === 'sem_filtro') params = { max_results: 1 };
    else if (modo === 'com_email') params = { max_results: 1, buyer_email: 'myllenac@outlook.com' };
    else params = { max_results: 1 };

    const zres = await hotmartFetch('/payments/api/v1/sales/history', params);
    const body = await zres.text();
    res.status(200).json({
      modo,
      status: zres.status,
      ok: zres.ok,
      body: body.slice(0, 1000),
    });
  } catch (e) {
    res.status(200).json({ modo, erro: e.message });
  }
};
