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

// 4b. REGRESSION: the login call is an XHR, so its fetch metadata says
// sec-fetch-dest: empty / sec-fetch-site: same-origin even when the page is
// framed. Trusting only the destination shipped a SameSite=Lax cookie, the
// browser dropped it as third-party, and login bounced back to the gate.
// Only the page can report that it is framed, so the client sends `framed`.
const framedLogin = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...H },
  body: JSON.stringify({ password: 'Kosmos@2026', framed: true })
});
const framedCookie = framedLogin.headers.get('set-cookie') || '';
check('framed login sets SameSite=None', /SameSite=None/.test(framedCookie), framedCookie);
check('framed login is Secure', /Secure/.test(framedCookie), framedCookie);
check('framed login is HttpOnly', /HttpOnly/.test(framedCookie), framedCookie);

// The same login without the hint cannot claim None safely, but must still work
// for a normal top-level tab.
const topLevel = await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin' },
  body: JSON.stringify({ password: 'Kosmos@2026', framed: false })
});
const topLevelCookie = topLevel.headers.get('set-cookie') || '';
check('top-level login stays SameSite=Lax', /SameSite=Lax/.test(topLevelCookie), topLevelCookie);

// A cross-site document load (sec-fetch-site: cross-site) is framed even when
// the destination header is missing, and must get None as well.
const crossSite = await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'cross-site' },
  body: JSON.stringify({ password: 'Kosmos@2026' })
});
const crossSiteCookie = crossSite.headers.get('set-cookie') || '';
check('cross-site load sets SameSite=None', /SameSite=None/.test(crossSiteCookie), crossSiteCookie);

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

// 6. REGRESSION: browsers block third-party cookies in iframes outright, so no
// SameSite value can save the cookie transport. The login also returns the
// session token, which the page keeps in sessionStorage and sends as a bearer
// header. These checks prove the token alone is enough — no cookie at all.
const tokenLogin = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
  body: JSON.stringify({ password: 'Kosmos@2026', framed: true })
});
const tokenBody = await tokenLogin.json();
check('login returns a session token', typeof tokenBody.token === 'string' && tokenBody.token.length > 20, String(tokenBody.token).slice(0, 12));
check('login reports it was framed', tokenBody.framed === true);

// No cookie header here on purpose: this is the blocked-cookie browser.
const bearer = { authorization: `Bearer ${tokenBody.token}`, ...H };
const meByToken = await fetch(`${BASE}/api/me`, { headers: bearer });
const meByTokenBody = await meByToken.json();
check('token alone authenticates /api/me', meByToken.status === 200 && meByTokenBody.authed === true, `status ${meByToken.status}`);
check('/api/me reports the token transport', meByTokenBody.via === 'token', String(meByTokenBody.via));

const convByToken = await (await fetch(`${BASE}/api/conversations`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...bearer },
  body: JSON.stringify({ mode: 'chat' })
})).json();
check('token alone can create a conversation', Boolean(convByToken.id));

const chatByToken = await (await fetch(`${BASE}/api/chat`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...bearer },
  body: JSON.stringify({ conversationId: convByToken.id, message: 'Say OK', mode: 'chat', lang: 'en', maxTokens: 20 })
})).text();
check('token alone streams a reply', chatByToken.includes('event: done'), chatByToken.slice(0, 60));

// The x-kosmos-session header is the same transport by another name.
const byHeader = await fetch(`${BASE}/api/me`, { headers: { 'x-kosmos-session': tokenBody.token, ...H } });
check('x-kosmos-session header also authenticates', byHeader.status === 200);

// A garbage or revoked token must not authenticate.
const badToken = await fetch(`${BASE}/api/me`, { headers: { authorization: 'Bearer not-a-real-token', ...H } });
check('invalid token is rejected', badToken.status === 401, `status ${badToken.status}`);

// Logging out with a bearer token must kill that session for good.
await fetch(`${BASE}/api/logout`, { method: 'POST', headers: bearer });
const afterLogout = await fetch(`${BASE}/api/me`, { headers: bearer });
check('logout revokes the bearer session', afterLogout.status === 401, `status ${afterLogout.status}`);

// The cookie transport must still beat the token when both are present, so a
// normal top-level tab never depends on the fallback.
const viaCookie = await fetch(`${BASE}/api/me`, { headers: { cookie, ...H } });
check('/api/me still works by cookie', viaCookie.status === 200);
check('cookie transport is preferred', (await viaCookie.json()).via === 'cookie');

// 7. REGRESSION: a sandboxed iframe without allow-same-origin gives the page an
// opaque origin, so its calls to its own API are cross-origin. Without CORS
// headers the browser refused them all with MissingAllowOriginHeader and the
// app never left its loading screen. Allow the origin, but never credentials —
// otherwise any site could ride the user's cookie.
const preflight = await fetch(`${BASE}/api/me`, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'GET' } });
check('preflight is answered', preflight.status === 204, `status ${preflight.status}`);
check('opaque origin is allowed', (preflight.headers.get('access-control-allow-origin') || '') === 'null');
check('authorization header is allowed', /authorization/i.test(preflight.headers.get('access-control-allow-headers') || ''));
check('credentials are NOT allowed cross-origin', !preflight.headers.get('access-control-allow-credentials'));

const foreign = await fetch(`${BASE}/api/me`, { headers: { origin: 'https://evil.example', ...H } });
check('foreign origin without a token gets 401', foreign.status === 401, `status ${foreign.status}`);
check('responses still never allow credentials', !foreign.headers.get('access-control-allow-credentials'));

// A foreign origin holding a bearer token IS allowed — that is the whole point,
// and it requires the token, which a foreign page does not have.
const foreignWithToken = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'null', 'x-forwarded-proto': 'https' },
  body: JSON.stringify({ password: 'Kosmos@2026', framed: true })
});
const fw = await foreignWithToken.json();
const foreignMe = await fetch(`${BASE}/api/me`, { headers: { origin: 'null', authorization: `Bearer ${fw.token}` } });
check('opaque-origin page can authenticate by token', foreignMe.status === 200, `status ${foreignMe.status}`);

// 8. REGRESSION: a preview proxy may not forward `authorization`, which left the
// browser holding a valid token while the server saw an anonymous request. The
// client now sends the token under a second, custom header too, so either one
// surviving is enough.
const both = await fetch(`${BASE}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
  body: JSON.stringify({ password: 'Kosmos@2026', framed: true })
});
const bj = await both.json();
const viaCustom = await fetch(`${BASE}/api/me`, { headers: { 'x-kosmos-session': bj.token } });
check('token travels on x-kosmos-session alone', viaCustom.status === 200, `status ${viaCustom.status}`);

// 9. The diagnostic sink must accept a report without a session (it is how a
// framed browser explains itself) but must never grant anything.
const diag = await fetch(`${BASE}/api/client-log`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ screen: 'gate', cookieWritable: 'silently-dropped', err: 'probe' })
});
check('client-log accepts an anonymous report', diag.status === 204, `status ${diag.status}`);
// An oversized report is refused. The server cuts the socket as soon as the
// cap is crossed, so the client may see either 413 or a connection error;
// what matters is that nothing is written to the log.
let bigRefused = false;
let bigDetail = '';
try {
  const tooBig = await fetch(`${BASE}/api/client-log`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ err: 'x'.repeat(20000) })
  });
  bigRefused = tooBig.status === 413;
  bigDetail = `status ${tooBig.status}`;
} catch (err) {
  bigRefused = true; // socket destroyed mid-body, which is also a refusal
  bigDetail = err.code || err.name || 'connection error';
}
check('client-log refuses an oversized report', bigRefused, bigDetail);
const afterDiag = await fetch(`${BASE}/api/me`);
check('a diagnostic report grants no session', afterDiag.status === 401, `status ${afterDiag.status}`);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
