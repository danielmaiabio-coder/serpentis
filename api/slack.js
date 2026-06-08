const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

async function slackFetch(path, params = {}) {
  const url = new URL(`https://slack.com/api/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` }
  });
  return res.json();
}

async function slackPost(path, body) {
  const res = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SLACK_TOKEN) return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });

  const { action } = req.query;

  try {
    if (action === 'channels') {
      const data = await slackFetch('conversations.list', {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200
      });
      return res.json(data);
    }
    if (action === 'history') {
      const { channel, cursor } = req.query;
      const params = { channel, limit: 50 };
      if (cursor) params.cursor = cursor;
      const data = await slackFetch('conversations.history', params);
      return res.json(data);
    }
    if (action === 'users') {
      const data = await slackFetch('users.list', { limit: 200 });
      return res.json(data);
    }
    if (action === 'send' && req.method === 'POST') {
      const { channel, text } = req.body;
      const data = await slackPost('chat.postMessage', { channel, text });
      return res.json(data);
    }
    if (action === 'dms') {
      const data = await slackFetch('conversations.list', { types: 'im', limit: 100 });
      return res.json(data);
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
