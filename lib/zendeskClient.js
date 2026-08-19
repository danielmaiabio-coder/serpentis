function zendeskAuthHeader() {
  const { ZENDESK_EMAIL, ZENDESK_API_TOKEN } = process.env;
  const raw = `${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function zendeskUrl(path) {
  const { ZENDESK_SUBDOMAIN } = process.env;
  return `https://${ZENDESK_SUBDOMAIN}.zendesk.com${path}`;
}

async function zendeskFetch(path, options) {
  const res = await fetch(zendeskUrl(path), {
    ...options,
    headers: {
      Authorization: zendeskAuthHeader(),
      'Content-Type': 'application/json',
      ...(options && options.headers),
    },
  });
  return res;
}

module.exports = { zendeskAuthHeader, zendeskUrl, zendeskFetch };
