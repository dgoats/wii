// api/neon.js — Neon SQL proxy
// Deployed on Vercel. Accepts POST { query, params } from the browser,
// forwards to Neon over server-side HTTP (no CORS issues), returns results.

export default async function handler(req, res) {
  // Allow requests from any origin (your WordPress site, admin page, etc.)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, params = [] } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query' });
  }

  // Block anything that isn't a SELECT or UPDATE on fundraiser_state,
  // or the initial CREATE TABLE / INSERT for setup.
  const q = query.trim().toUpperCase();
  const allowed =
    q.startsWith('SELECT') ||
    q.startsWith('UPDATE FUNDRAISER_STATE') ||
    q.startsWith('CREATE TABLE') ||
    q.startsWith('INSERT INTO FUNDRAISER_STATE');

  if (!allowed) {
    return res.status(403).json({ error: 'Query not permitted' });
  }

  const connString = process.env.NEON_CONNECTION_STRING;
  if (!connString) {
    return res.status(500).json({ error: 'NEON_CONNECTION_STRING env var not set' });
  }

  // Derive the Neon HTTP endpoint from the connection string hostname
  let endpoint;
  try {
    const url = new URL(connString.replace(/^postgresql:\/\//, 'https://').replace(/^postgres:\/\//, 'https://'));
    endpoint = `https://${url.hostname}/sql`;
  } catch (e) {
    return res.status(500).json({ error: 'Invalid connection string format' });
  }

  try {
    const neonRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connString,
      },
      body: JSON.stringify({ query, params }),
    });

    const data = await neonRes.json();

    if (!neonRes.ok) {
      return res.status(neonRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
