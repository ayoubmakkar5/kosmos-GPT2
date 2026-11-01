'use strict';
/**
 * Password gate + server-side sessions.
 *
 * - One shared password (APP_PASSWORD), compared case-insensitively so an
 *   Arabic keyboard layout or caps-lock cannot lock the owner out.
 * - Sessions live in data/sessions.json and are addressed by an HttpOnly cookie
 *   holding a 32-byte random token. The token is *opaque*: no user data is
 *   encoded in it, so nothing leaks if a cookie is logged.
 * - Optional "stay signed in" switches the cookie to a 30-day Max-Age.
 * - Brute-force guard: N failures per IP per 10 minutes.
 */
const crypto = require('crypto');
const config = require('./config');

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) {
    // still burn a comparison to keep timing flat-ish
    crypto.timingSafeEqual(Buffer.alloc(ab.length || 1), Buffer.alloc(ab.length || 1));
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function passwordMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const norm = (s) => s.normalize('NFKC').trim().toLowerCase();
  return timingSafeEqualStr(norm(candidate), norm(config.password));
}

class Sessions {
  constructor(store) {
    this.store = store;
    this.data = store.data; // { items: { token: session } }
    if (!this.data.items) this.data.items = {};
  }

  _prune() {
    const now = Date.now();
    const items = this.data.items;
    for (const [token, s] of Object.entries(items)) {
      if (!s || s.expiresAt <= now) delete items[token];
    }
  }

  create({ persistent = false, ua = '', ip = '' } = {}) {
    this._prune();
    const max = config.session.maxSessions;
    const tokens = Object.keys(this.data.items);
    if (tokens.length >= max) {
      // evict the oldest session
      tokens
        .map((t) => [t, this.data.items[t].createdAt || 0])
        .sort((a, b) => a[1] - b[1])
        .slice(0, tokens.length - max + 1)
        .forEach(([t]) => delete this.data.items[t]);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const ttl = (persistent ? 30 * 24 : config.session.ttlHours) * 3600 * 1000;
    const session = {
      token,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + ttl,
      persistent: Boolean(persistent),
      ua: String(ua).slice(0, 180),
      ip: String(ip).slice(0, 60)
    };
    this.data.items[token] = session;
    this.store.save();
    return session;
  }

  get(token) {
    if (!token || typeof token !== 'string') return null;
    const s = this.data.items[token];
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      delete this.data.items[token];
      this.store.save();
      return null;
    }
    // sliding window: extend by the session's own TTL at most once per hour
    if (Date.now() - (s.lastSeenAt || 0) > 3600 * 1000) {
      s.lastSeenAt = Date.now();
      s.expiresAt = Date.now() + (s.persistent ? 30 * 24 : config.session.ttlHours) * 3600 * 1000;
      this.store.save();
    }
    return s;
  }

  destroy(token) {
    if (this.data.items[token]) {
      delete this.data.items[token];
      this.store.save();
      return true;
    }
    return false;
  }

  count() {
    this._prune();
    return Object.keys(this.data.items).length;
  }
}

class LoginGuard {
  constructor() {
    this.hits = new Map(); // ip -> { count, resetAt }
  }

  /** Remaining attempts for this IP (0 means "blocked right now"). */
  blocked(ip) {
    const max = config.session.loginMaxAttempts;
    const rec = this.hits.get(ip);
    if (!rec) return max;
    if (Date.now() > rec.resetAt) {
      this.hits.delete(ip);
      return max;
    }
    return Math.max(0, max - rec.count);
  }

  fail(ip) {
    const now = Date.now();
    const rec = this.hits.get(ip);
    if (!rec || now > rec.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + config.session.loginWindowMs });
      return;
    }
    rec.count += 1;
  }

  reset(ip) {
    this.hits.delete(ip);
  }
}

// ------------------------------------------------------------------ cookies
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/', secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${path}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  parts.push(`SameSite=${sameSite}`);
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge)}`);
  return parts.join('; ');
}

/**
 * How the browser will reach us — decides the cookie policy.
 *
 *  - direct HTTPS            → Secure, SameSite=None (needed only if embedded)
 *  - behind HTTPS proxy      → Secure, SameSite=Lax
 *  - plain HTTP (LAN/dev)    → no Secure, SameSite=Lax
 *
 * A `Secure` cookie on an http:// origin is silently dropped by every browser,
 * which would make the login appear to succeed and then bounce straight back to
 * the gate — so this must be decided per request, not baked in.
 */
function cookiePolicy(req, { framed = false } = {}) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = forwarded ? forwarded === 'https' : Boolean(req.socket.encrypted);
  // SameSite=None requires Secure; only use it when we are actually on TLS.
  //
  // "Embedded" has to be detected from two signals, not one. A document load
  // inside an iframe reports sec-fetch-dest: iframe, but the login call is an
  // XHR and reports sec-fetch-dest: empty — while sec-fetch-site still says
  // cross-site. Checking only the destination marked the session cookie Lax,
  // which the browser then dropped as a third-party cookie, so the password was
  // accepted and the app bounced straight back to the gate with no error.
  const dest = String(req.headers['sec-fetch-dest'] || '');
  const site = String(req.headers['sec-fetch-site'] || '');
  const embedded = framed || dest === 'iframe' || dest === 'frame' || site === 'cross-site';
  const sameSite = secure && embedded ? 'None' : 'Lax';
  return { secure, sameSite: secure ? sameSite : 'Lax' };
}

module.exports = { Sessions, LoginGuard, passwordMatches, parseCookies, serializeCookie, cookiePolicy };
