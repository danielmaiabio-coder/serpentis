// ═══════════════════════════════════════════════════════════════
// APPS SCRIPT — PLANILHA DE COBRANÇA INDIVIDUAL
// Cole em: Extensões → Apps Script → Salvar → Implantar → Web App
// Acesso: Qualquer pessoa (incluindo anônimos)
// Usa sempre a PRIMEIRA aba da planilha (independente do nome dela — pode
// ser "Página1", "Agosto/26" etc.) com cabeçalhos: EMAIL, CODIGO_TRANSACAO,
// STATUS, TENTATIVAS, DATA_ATENDIMENTO, ULTIMA_VERIFICACAO, METODO_PAGAMENTO,
// VALOR_PAGO, DATA_PAGAMENTO, PARCELA_DE_LINHA
// ═══════════════════════════════════════════════════════════════

/**** CONFIGURAÇÃO ****/
const MAX_TENTATIVAS = 8;
const STATUS_ATRASADO = 'Atrasado';
const JANELA_MULTIPLAS_PARCELAS_HORAS = 48; // busca por e-mail: coleta TODAS as parcelas novas dentro dessa janela

// Status da Hotmart que ainda significam "aguardando", não é novidade
const STATUS_PENDENTES_HOTMART = ['WAITING_PAYMENT', 'PRINTED_BILLET', 'PROCESSING_TRANSACTION', 'UNDER_ANALISYS', 'STARTED', 'PRE_ORDER'];

// Status verificados na busca por e-mail (sem código de transação)
const STATUS_BUSCA_EMAIL = ['WAITING_PAYMENT', 'PRINTED_BILLET', 'APPROVED', 'COMPLETE', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'CHARGEBACK', 'EXPIRED'];

/**** GATILHOS (rode configurarGatilhos() uma vez manualmente) ****/
function configurarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'handleEdit' || f === 'verificarTodasPendentes') {
      ScriptApp.deleteTrigger(t);
    }
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('verificarTodasPendentes').timeBased().everyHours(12).create();
  Logger.log('Gatilhos criados: handleEdit (ao editar) e verificarTodasPendentes (a cada 12h).');
}

function handleEdit(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getIndex() !== 1) return; // so reage a edicoes na primeira aba
    if (e.range.getRow() === 1) return;

    var headerMap = getHeaderMap_(sheet);
    var col = e.range.getColumn();
    if (col !== headerMap['EMAIL'] && col !== headerMap['CODIGO_TRANSACAO']) return;

    verificarLinha_(sheet, e.range.getRow(), headerMap);
  } catch (err) {
    Logger.log('Erro no handleEdit: ' + err);
  }
}

function verificarTodasPendentes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var headerMap = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  var inicio = Date.now();
  var LIMITE_MS = 5 * 60 * 1000; // margem de segurança (Apps Script corta em 6 min)

  for (var row = 2; row <= lastRow; row++) {
    if (Date.now() - inicio > LIMITE_MS) {
      Logger.log('Perto do limite de execução, parando na linha ' + row + '. Continua no próximo gatilho.');
      break;
    }
    verificarLinha_(sheet, row, headerMap);
  }
}

/**** LÓGICA PRINCIPAL ****/
function verificarLinha_(sheet, row, headerMap) {
  function get(col) { return headerMap[col] ? sheet.getRange(row, headerMap[col]).getValue() : ''; }
  function set(col, val) { if (headerMap[col]) sheet.getRange(row, headerMap[col]).setValue(val); }

  var email = (get('EMAIL') || '').toString().trim();
  var codigo = (get('CODIGO_TRANSACAO') || '').toString().trim();
  if (!email && !codigo) return;

  var statusAtual = (get('STATUS') || '').toString().trim();
  if (statusAtual && statusAtual !== STATUS_ATRASADO) return; // já resolvido, não mexe mais

  var tentativas = Number(get('TENTATIVAS')) || 0;
  if (tentativas >= MAX_TENTATIVAS) return; // já bateu o limite

  var dataAtendimento = get('DATA_ATENDIMENTO');
  if (!dataAtendimento) {
    dataAtendimento = new Date();
    set('DATA_ATENDIMENTO', dataAtendimento);
  }
  var dataAtendimentoMs = new Date(dataAtendimento).getTime();

  if (codigo) {
    verificarPorCodigo_(row, get, set, codigo);
  } else {
    verificarPorEmail_(sheet, row, headerMap, get, set, email, dataAtendimentoMs, tentativas);
  }
}

// Caminho com CODIGO_TRANSACAO: exato, sem ambiguidade, sem múltiplas parcelas.
function verificarPorCodigo_(row, get, set, codigo) {
  var item = null;
  var novidade = false;

  try {
    item = buscarPorCodigo_(codigo);
    if (item && STATUS_PENDENTES_HOTMART.indexOf(item.purchase.status) === -1) {
      novidade = true;
    }
  } catch (err) {
    Logger.log('Erro ao verificar linha ' + row + ' (código): ' + err);
    return; // não consome tentativa em erro de rede/API
  }

  var tentativas = (Number(get('TENTATIVAS')) || 0) + 1;
  set('TENTATIVAS', tentativas);
  set('ULTIMA_VERIFICACAO', new Date());

  if (novidade && item) {
    var p = item.purchase;
    set('STATUS', p.status);
    set('METODO_PAGAMENTO', p.payment ? p.payment.method : '');
    set('VALOR_PAGO', p.price ? p.price.value : '');
    var dataPg = p.approved_date || p.order_date;
    set('DATA_PAGAMENTO', dataPg ? new Date(dataPg) : '');
  } else {
    set('STATUS', STATUS_ATRASADO);
  }
}

// Caminho só com EMAIL: coleta TODAS as parcelas novas dentro da janela de 48h,
// cada uma vira uma linha nova no final da planilha (ver adicionarLinhaParcela_).
function verificarPorEmail_(sheet, row, headerMap, get, set, email, dataAtendimentoMs, tentativas) {
  var novasParcelas = [];

  try {
    novasParcelas = buscarTodasPorEmail_(email, dataAtendimentoMs);
  } catch (err) {
    Logger.log('Erro ao verificar linha ' + row + ' (email): ' + err);
    return; // não consome tentativa em erro de rede/API
  }

  tentativas += 1;
  set('TENTATIVAS', tentativas);
  set('ULTIMA_VERIFICACAO', new Date());

  var codigosExistentes = getTodosCodigosExistentes_(sheet, headerMap);
  novasParcelas.forEach(function (item) {
    var codTrans = item.purchase.transaction;
    if (!codTrans || codigosExistentes.indexOf(codTrans) !== -1) return; // já registrada, pula
    adicionarLinhaParcela_(sheet, headerMap, row, email, item);
    codigosExistentes.push(codTrans);
  });

  var horasDesdeAtendimento = (Date.now() - dataAtendimentoMs) / (1000 * 60 * 60);
  var totalParcelas = contarParcelasDaLinha_(sheet, headerMap, row);

  if (horasDesdeAtendimento >= JANELA_MULTIPLAS_PARCELAS_HORAS && totalParcelas > 0) {
    set('STATUS', 'Concluído - ' + totalParcelas + ' parcela(s) encontrada(s)');
    set('TENTATIVAS', MAX_TENTATIVAS); // trava, não reprocessa mais
  } else {
    set('STATUS', STATUS_ATRASADO); // ainda dentro da janela, ou nada encontrado ainda
  }
}

/**** INTEGRAÇÃO HOTMART ****/
function getHotmartToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('hotmart_token');
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('HOTMART_CLIENT_ID');
  var clientSecret = props.getProperty('HOTMART_CLIENT_SECRET');
  var basic = props.getProperty('HOTMART_BASIC');

  if (!clientId || !clientSecret || !basic) {
    throw new Error('Credenciais da Hotmart não configuradas em Script Properties (HOTMART_CLIENT_ID, HOTMART_CLIENT_SECRET, HOTMART_BASIC).');
  }

  var url = 'https://api-sec-vlc.hotmart.com/security/oauth/token' +
    '?grant_type=client_credentials&client_id=' + encodeURIComponent(clientId) +
    '&client_secret=' + encodeURIComponent(clientSecret);

  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'Authorization': 'Basic ' + basic },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Falha ao autenticar na Hotmart (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }

  var data = JSON.parse(resp.getContentText());
  cache.put('hotmart_token', data.access_token, Math.max(60, data.expires_in - 60));
  return data.access_token;
}

function chamarSalesHistory_(params) {
  var token = getHotmartToken_();
  var query = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = 'https://developers.hotmart.com/payments/api/v1/sales/history?' + query;

  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    Logger.log('Erro Hotmart (' + resp.getResponseCode() + '): ' + resp.getContentText());
    return [];
  }

  var data = JSON.parse(resp.getContentText());
  return data.items || [];
}

function buscarPorCodigo_(codigo) {
  var items = chamarSalesHistory_({ transaction: codigo });
  return items.length ? items[0] : null;
}

// Retorna TODAS as transações novas (não só a melhor), deduplicadas por código,
// para permitir capturar múltiplas parcelas de um mesmo e-mail.
function buscarTodasPorEmail_(email, dataAtendimentoMs) {
  var vistos = {};
  var resultado = [];

  for (var i = 0; i < STATUS_BUSCA_EMAIL.length; i++) {
    var status = STATUS_BUSCA_EMAIL[i];
    var items = chamarSalesHistory_({ buyer_email: email, transaction_status: status, max_results: 10 });

    for (var j = 0; j < items.length; j++) {
      var p = items[j].purchase;
      var dataEvento = p.approved_date || p.order_date || 0;
      if (dataEvento > dataAtendimentoMs && p.transaction && !vistos[p.transaction]) {
        vistos[p.transaction] = true;
        resultado.push(items[j]);
      }
    }
    Utilities.sleep(150);
  }
  return resultado;
}

// Todos os códigos de transação já presentes na planilha (evita duplicar parcela já registrada)
function getTodosCodigosExistentes_(sheet, headerMap) {
  var col = headerMap['CODIGO_TRANSACAO'];
  if (!col) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var valores = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  return valores.map(function (r) { return (r[0] || '').toString().trim(); }).filter(function (v) { return v; });
}

// Adiciona uma linha nova no final da planilha para uma parcela encontrada via busca por e-mail
function adicionarLinhaParcela_(sheet, headerMap, linhaOrigem, email, item) {
  var novaLinha = sheet.getLastRow() + 1;
  var p = item.purchase;
  function set(col, val) { if (headerMap[col]) sheet.getRange(novaLinha, headerMap[col]).setValue(val); }

  set('EMAIL', email);
  set('CODIGO_TRANSACAO', p.transaction);
  set('STATUS', p.status);
  set('METODO_PAGAMENTO', p.payment ? p.payment.method : '');
  set('VALOR_PAGO', p.price ? p.price.value : '');
  var dataPg = p.approved_date || p.order_date;
  set('DATA_PAGAMENTO', dataPg ? new Date(dataPg) : '');
  set('TENTATIVAS', MAX_TENTATIVAS); // já resolvida, nunca mais reprocessa
  set('ULTIMA_VERIFICACAO', new Date());
  set('PARCELA_DE_LINHA', linhaOrigem);
}

// Conta quantas parcelas já foram registradas (linhas novas) para uma linha de origem
function contarParcelasDaLinha_(sheet, headerMap, linhaOrigem) {
  var col = headerMap['PARCELA_DE_LINHA'];
  if (!col) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var valores = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  var count = 0;
  valores.forEach(function (r) { if (Number(r[0]) === linhaOrigem) count++; });
  return count;
}

/**** UTILITÁRIOS DE TESTE (rode manualmente pelo editor) ****/
function testarConexaoHotmart() {
  var token = getHotmartToken_();
  Logger.log('Conectado com sucesso! Token começa com: ' + token.substring(0, 12) + '...');
}

function verificarLinhaSelecionada() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var row = sheet.getActiveCell().getRow();
  var headerMap = getHeaderMap_(sheet);
  verificarLinha_(sheet, row, headerMap);
  Logger.log('Linha ' + row + ' verificada. Confira as colunas STATUS, TENTATIVAS etc.');
}

/**** AUXILIAR ****/
function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) {
    if (h) map[h.toString().trim()] = i + 1;
  });
  return map;
}

/**** WEB APP — recebe o "Novo Registro" enviado pelo portal Chocalho ****/
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var email = (params.email || '').trim();
    var codigo = (params.codigo || '').trim();

    if (!email && !codigo) {
      return resposta({ ok: false, erro: 'Email ou código obrigatório.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheets()[0];

    var headerMap = getHeaderMap_(sheet);
    var proximaLinha = sheet.getLastRow() + 1;

    if (headerMap['EMAIL']) sheet.getRange(proximaLinha, headerMap['EMAIL']).setValue(email);
    if (headerMap['CODIGO_TRANSACAO']) sheet.getRange(proximaLinha, headerMap['CODIGO_TRANSACAO']).setValue(codigo);
    if (headerMap['DATA_ATENDIMENTO']) sheet.getRange(proximaLinha, headerMap['DATA_ATENDIMENTO']).setValue(new Date());

    // Verifica na hora, em vez de depender só do gatilho onEdit — gatilhos onEdit
    // instalados nem sempre disparam para edicoes feitas via API (como este doPost),
    // entao sem isso a linha ficava parada ate a varredura periodica de 12h.
    try {
      verificarLinha_(sheet, proximaLinha, getHeaderMap_(sheet));
    } catch (verErr) {
      Logger.log('Erro ao verificar linha recem-criada: ' + verErr);
    }

    return resposta({ ok: true, linha: proximaLinha, aba: sheet.getName() });

  } catch (err) {
    return resposta({ ok: false, erro: err.message });
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'listar') {
    return listarRegistros_();
  }
  // Endpoint de teste — acesse a URL no navegador para verificar se está funcionando
  return resposta({ ok: true, status: 'Apps Script ativo e funcionando!' });
}

// Devolve todas as linhas da aba em JSON, para o portal Chocalho ler ao vivo
// (antes disso nao existia — o portal so lia um cache do Firestore que nunca era atualizado).
function listarRegistros_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheets()[0];

    var headerMap = getHeaderMap_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return resposta({ ok: true, registros: [] });

    var lastCol = sheet.getLastColumn();
    var valores = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    function col(row, nome) {
      var idx = headerMap[nome];
      return idx ? row[idx - 1] : '';
    }
    function fmtData(v) {
      if (!v) return '';
      if (Object.prototype.toString.call(v) === '[object Date]') {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      }
      return v.toString();
    }

    var registros = valores
      .filter(function (row) { return col(row, 'EMAIL') || col(row, 'CODIGO_TRANSACAO'); })
      .map(function (row) {
        return {
          email: col(row, 'EMAIL').toString(),
          codigo: col(row, 'CODIGO_TRANSACAO').toString(),
          status: col(row, 'STATUS').toString(),
          metodo: col(row, 'METODO_PAGAMENTO').toString(),
          valor: col(row, 'VALOR_PAGO').toString(),
          dataPag: fmtData(col(row, 'DATA_PAGAMENTO')),
          tentativas: col(row, 'TENTATIVAS').toString(),
          dataAtend: fmtData(col(row, 'DATA_ATENDIMENTO')),
        };
      });

    return resposta({ ok: true, registros: registros });
  } catch (err) {
    return resposta({ ok: false, erro: err.message });
  }
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
