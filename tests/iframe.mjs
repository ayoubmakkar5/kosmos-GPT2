/** Login must work when the app is embedded in an iframe behind an HTTPS proxy. */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const H = { 'x-forwarded-proto': 'https', 'sec-fetch-dest': 'iframe' };
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const bad = (n, d) => { fail++; console.log('  ✗ ' + n + '  ' + d); };
const check = (n, c, d = '') => c ? ok(n) : bad(n, d);

console.log('\niframe + proxy cookie test\n');

// 1. login through a proxy that terminates TLS
const res = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...H },
  body: JSON.stringify({ password: 'Kosmos@2026', persistent: true })
});
const raw = res.headers.get('set-cookie') || '';
check('login succeeds behind the proxy', res.status === 200, `status ${res.status}`);
check('cookie is Secure (TLS terminated upstream)', /Secure/.test(raw), raw);
check('cookie is SameSite=None when framed', /SameSite=None/.test(raw), raw);
check('cookie is still HttpOnly', /HttpOnly/.test(raw));

const cookie = raw.split(';')[0];

// 2. the session actually works with that cookie
const me = await fetch(`${BASE}/api/me`, { headers: { cookie, ...H } });
const body = await me.json();
check('/api/me accepts the session', me.status === 200 && body.authed === true, `status ${me.status}`);
check('server echoes the cookie policy', body.cookie?.secure === true && body.cookie?.sameSite === 'None', JSON.stringify(body.cookie));

// 3. framing headers must not block an embed
const page = await fetch(`${BASE}/`, { headers: H });
check('no X-Frame-Options header', !page.headers.get('x-frame-options'), page.headers.get('x-frame-options') || '');
const csp = page.headers.get('content-security-policy') || '';
check('CSP allows framing', /frame-ancestors \*/.test(csp), csp);

// 4. over plain http the cookie must NOT be Secure, or browsers drop it
const plain = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'Kosmos@2026' })
});
const plainCookie = plain.headers.get('set-cookie') || '';
check('plain-http cookie is not Secure', !/Secure/.test(plainCookie), plainCookie);
check('plain-http cookie is SameSite=Lax', /SameSite=Lax/.test(plainCookie));

// 5. a chat turn still works inside the frame
const conv = await (await fetch(`${BASE}/api/conversations`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie, ...H },
  body: JSON.stringify({ mode: 'chat' })
})).json();
const chat = await (await fetch(`${BASE}/api/chat`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie, ...H },
  body: JSON.stringify({ conversationId: conv.id, message: 'Say OK', mode: 'chat', lang: 'en', maxTokens: 20 })
})).text();
check('chat streams inside the frame', chat.includes('event: done'), chat.slice(0, 80));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
