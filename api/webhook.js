// api/webhook.js — Neonone donation webhook handler
// Add this file to your vercel-proxy project alongside api/neon.js
//
// In Neonone, set your webhook URL to:
//   https://project-v5dpc.vercel.app/api/webhook
// Method: POST
//
// OPTIONAL: Set a webhook secret in Neonone and add it as a
// Vercel environment variable named WEBHOOK_SECRET to verify requests.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret, X-Hub-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Optional secret verification ──────────────────────────────────────────
  // If you set a WEBHOOK_SECRET in Vercel env vars, we check it here.
  // In Neonone, set the same value as your webhook secret/token.
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const incoming =
      req.headers['x-webhook-secret'] ||
      req.headers['x-hub-signature'] ||
      req.headers['authorization']?.replace('Bearer ', '');
    if (incoming !== secret) {
      console.warn('Webhook: invalid secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // ── Log the incoming payload (helpful for debugging) ──────────────────────
  console.log('Webhook received:', JSON.stringify(req.body).slice(0, 500));

  // ── Connect to Neon and increment donation count ───────────────────────────
  const connString = process.env.NEON_CONNECTION_STRING;
  if (!connString) {
    return res.status(500).json({ error: 'NEON_CONNECTION_STRING not set' });
  }

  try {
    const url = new URL(
      connString
        .replace(/^postgresql:\/\//, 'https://')
        .replace(/^postgres:\/\//, 'https://')
    );
    const endpoint = `https://${url.hostname}/sql`;

    const neonRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connString,
      },
      body: JSON.stringify({
        query: `UPDATE fundraiser_state
                SET value = (value::int + 1)::text, updated_at = NOW()
                WHERE key = 'donation_count'
                RETURNING value`,
      }),
    });

    const data = await neonRes.json();
    const newCount = data.rows?.[0]?.value ?? 'unknown';
    console.log('Donation count updated to:', newCount);

    return res.status(200).json({
      success: true,
      donation_count: newCount,
    });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
