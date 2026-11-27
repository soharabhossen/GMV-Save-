// GMV Save backend: node server.js
const express = require('express'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.APP_SECRET;
if (!ADMIN_PASSWORD || !SECRET) { console.error('Set ADMIN_PASSWORD and APP_SECRET env variables.'); process.exit(1); }

const FILE = path.join(__dirname, 'data', 'config.json');
const AKEY = crypto.scryptSync(SECRET, 'gmv-salt', 32);
const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'];
const DEFAULT = {
  keys: Object.fromEntries(PLATFORMS.map(p => [p, { key: '', endpoint: '', locked: false }])),
  ads: { enabled: false, seconds: 5, links: [] },
  brand: { name: 'GMV Save', tagline: '', logo: '', primary: '#6366f1', font: 'Cinzel' }
};

function enc(t) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', AKEY, iv);
  const d = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
function dec(s) { if (!s) return ''; try { const [iv, tag, d] = s.split('.').map(x => Buffer.from(x, 'base64'));
  const c = crypto.createDecipheriv('aes-256-gcm', AKEY, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); } catch { return ''; } }

function readCfg() { try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { return structuredClone(DEFAULT); } }
function writeCfg(c) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(c, null, 2)); }

// ---- auth (signed token, 12h) ----
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const makeToken = () => { const e = Date.now() + 12 * 3600e3; return e + '.' + sign('' + e); };
function auth(req, res, next) {
  const [e, s] = (req.headers.authorization || '').replace('Bearer ', '').split('.');
  const ok = e && s && Date.now() < +e && s.length === 64 && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sign(e)));
  ok ? next() : res.status(401).json({ error: 'Unauthorized' });
}
let fails = 0, lockUntil = 0;

const app = express();
app.use(express.json({ limit: '3mb' }));app.use(express.static(path.join(__dirname, 'public')));

// ---- public ----
app.get('/api/config', (req, res) => { const c = readCfg();
  res.json({ brand: c.brand, ads: { enabled: c.ads.enabled, seconds: c.ads.seconds, links: c.ads.links } }); });

app.get('/api/download', async (req, res) => {
  const { url, quality } = req.query, c = readCfg();
  try {
    const host = new URL(url).hostname.toLowerCase();
    const p = host.includes('youtu') ? 'youtube' : host.includes('tiktok') ? 'tiktok' : host.includes('instagram') ? 'instagram' : (host.includes('facebook') || host.includes('fb.')) ? 'facebook' : null;
    if (!p) return res.status(400).json({ error: 'Unsupported link' });
    const k = c.keys[p], key = dec(k.key);
    if (!k.endpoint || !key) return res.status(503).json({ error: p + ' API not configured' });
    const r = await fetch(k.endpoint + (k.endpoint.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url) + '&quality=' + encodeURIComponent(quality || ''),
      { headers: { 'x-api-key': key, Authorization: 'Bearer ' + key } });
    if (!r.ok) return res.status(502).json({ error: 'Provider error ' + r.status });
    const d = await r.json();
    const link = d.download_url || d.url || d.link;
    link ? res.json({ download_url: link }) : res.status(502).json({ error: 'No link from provider' });
  } catch { res.status(400).json({ error: 'Bad request' }); }
});

// ---- admin ----
app.post('/api/admin/login', async (req, res) => {
  if (Date.now() < lockUntil) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  const a = Buffer.from(sign(String(req.body.password || ''))), b = Buffer.from(sign(ADMIN_PASSWORD));
  if (crypto.timingSafeEqual(a, b)) { fails = 0; return res.json({ token: makeToken() }); }
  if (++fails >= 5) { lockUntil = Date.now() + 60e3; fails = 0; }
  res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/admin/config', auth, (req, res) => { const c = readCfg();
  const keys = Object.fromEntries(PLATFORMS.map(p => { const k = dec(c.keys[p].key);
    return [p, { endpoint: c.keys[p].endpoint, locked: c.keys[p].locked, masked: k ? '••••••••' + k.slice(-4) : '' }]; }));
  res.json({ keys, ads: c.ads, brand: c.brand }); });

app.put('/api/admin/keys/:p', auth, (req, res) => {
  const p = req.params.p; if (!PLATFORMS.includes(p)) return res.sendStatus(404);
  const c = readCfg(), k = c.keys[p], { key, endpoint, locked } = req.body;
  if (typeof locked === 'boolean' && key === undefined && endpoint === undefined) { k.locked = locked; }
  else { if (k.locked) return res.status(423).json({ error: 'Key is locked. Unlock first.' });
    if (key) k.key = enc(String(key).trim()); if (typeof endpoint === 'string') k.endpoint = endpoint.trim(); }
  writeCfg(c); res.json({ ok: true });
});

app.put('/api/admin/ads', auth, (req, res) => { const c = readCfg(), a = req.body;
  c.ads = { enabled: !!a.enabled, seconds: Math.min(30, Math.max(1, +a.seconds || 5)),
    links: (a.links || []).slice(0, 20).map(l => ({ title: String(l.title || '').slice(0, 80), url: String(l.url || ''), image: String(l.image || '') }))
      .filter(l => /^https?:\/\//.test(l.url)) };
  writeCfg(c); res.json({ ok: true }); });

app.put('/api/admin/brand', auth, (req, res) => { const c = readCfg(), b = req.body;
  c.brand = { name: String(b.name || 'GMV Save').slice(0, 40), tagline: String(b.tagline || '').slice(0, 80),
    logo: String(b.logo || '').slice(0, 2.5e6), primary: /^#[0-9a-f]{6}$/i.test(b.primary) ? b.primary : '#6366f1',
    font: ['Cinzel', 'Playfair Display', 'Poppins', 'Montserrat', 'Hind Siliguri', 'Lobster'].includes(b.font) ? b.font : 'Cinzel' };
  writeCfg(c); res.json({ ok: true }); });


app.listen(PORT, () => console.log('GMV Save running on :' + PORT));
