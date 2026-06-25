// Vercel Serverless Function for Supabase guestbook
// Set SUPABASE_URL and SUPABASE_KEY in Vercel project settings
// Uses CommonJS for broader compatibility

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limiter: 10 requests per minute per IP
const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'global';
  const entry = rateLimit.get(key) || { count: 0, last: 0 };
  
  if (now - entry.last < 60000) {
    if (entry.count >= 10) return false;
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
  if (username.length > 50) return false;
  if (!/^@?[a-zA-Z0-9_.]+$/.test(username)) return false;
  if (/[<>&'"\/]/.test(username)) return false;
  return true;
}

module.exports = async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('guestbook')
        .select('username')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ result: data.map(row => row.username) });
    }
    else if (req.method === 'POST') {
      let body;
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        body = req.body;
      }
      const { username } = body;
      if (!validateUsername(username)) {
        return res.status(400).json({ error: 'Invalid username' });
      }
      
      const { error } = await supabase
        .from('guestbook')
        .insert([{ username }]);
      
      if (error) throw error;
      res.json({ success: true });
    }
    else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Supabase error:', error);
    res.status(500).json({ error: 'Server error: ' + (error.message || String(error)) });
  }
};
