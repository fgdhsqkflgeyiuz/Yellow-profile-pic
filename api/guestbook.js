// ponytail: minimal serverless proxy for guestbook
const BIN_ID = process.env.GUESTBOOK_BIN || 'pja_' + Math.random().toString(36).substring(2, 15);

// Simple in-memory rate limiter
const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'global';
  const entry = rateLimit.get(key) || { count: 0, last: 0 };
  
  if (now - entry.last < 60000) { // 1 minute window
    if (entry.count >= 10) {
      return false; // Too many requests
    }
    entry.count++;
  } else {
    entry.count = 1;
    entry.last = now;
  }
  rateLimit.set(key, entry);
  return true;
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  // Only allow @ followed by alphanumeric, dots, underscores
  if (!/^@?[a-zA-Z0-9_.]{1,50}$/.test(username)) return false;
  // Basic XSS prevention
  if (/[<>&'"\/]/.test(username)) return false;
  return true;
}

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Trop de requêtes' });
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://www.jsonstore.io/${BIN_ID}`);
      const data = await response.json();
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(data);
    } catch (e) {
      res.status(200).json({ result: [] });
    }
  } else if (req.method === 'POST') {
    try {
      const { username } = req.body;
      if (!validateUsername(username)) {
        return res.status(400).json({ error: 'Nom invalide' });
      }
      
      const response = await fetch(`https://www.jsonstore.io/${BIN_ID}`);
      const data = await response.json();
      const list = data.result || [];
      list.push(username);
      
      await fetch(`https://www.jsonstore.io/${BIN_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list)
      });
      
      res.status(200).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  } else {
    res.status(405).json({ error: 'Méthode non autorisée' });
  }
}
