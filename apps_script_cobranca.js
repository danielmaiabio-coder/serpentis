// ═══════════════════════════════════════════════════════════════
// APPS SCRIPT — PLANILHA DE COBRANÇA INDIVIDUAL
// Cole em: Extensões → Apps Script → Salvar → Implantar → Web App
// Acesso: Qualquer pessoa (incluindo anônimos)
// ═══════════════════════════════════════════════════════════════

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const email = (params.email || '').trim();
    const codigo = (params.codigo || '').trim();

    if (!email && !codigo) {
      return resposta({ ok: false, erro: 'Email ou código obrigatório.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Abre a aba do mês atual (primeira aba à esquerda = índice 0)
    const mesAtual = MESES[new Date().getMonth()];
    let sheet = ss.getSheetByName(mesAtual);
    
    // Se não existir aba com o nome do mês, usa a primeira aba
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }

    // Encontra próxima linha vazia (coluna A = EMAIL)
    const ultimaLinha = sheet.getLastRow();
    const proximaLinha = ultimaLinha + 1;

    // Preenche Email (col A) e Código de Transação (col B)
    sheet.getRange(proximaLinha, 1).setValue(email);   // EMAIL
    sheet.getRange(proximaLinha, 2).setValue(codigo);  // CODIGO_TRANSACAO

    // Registra data de atendimento automaticamente (col J)
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    sheet.getRange(proximaLinha, 10).setValue(hoje);  // DATA_ATENDIMENTO

    return resposta({ ok: true, linha: proximaLinha, aba: sheet.getName() });

  } catch(err) {
    return resposta({ ok: false, erro: err.message });
  }
}

function doGet(e) {
  // Endpoint de teste — acesse a URL no browser para verificar se está funcionando
  return resposta({ ok: true, status: 'Apps Script ativo e funcionando!' });
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
