/**
 * UI smoke test — drives the real front-end in jsdom against a live server.
 * Verifies: login gate, i18n switch, mode switching, sending a message,
 * streaming render, markdown/code rendering, artifact panel, sidebar.
 */
/**
 * Kosmos AI — UI suite (optional, needs jsdom).
 *
 *   npm i -D jsdom        # or: npm i jsdom --no-save
 *   node tests/ui.mjs     # against a server already running on :3000
 *
 * Drives the real public/app.js: login gate, i18n, modes, streaming,
 * markdown rendering, artifacts, projects.
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.PASSWORD || 'Kosmos@2026';

let pass = 0, fail = 0;
const issues = [];
const ok = (n, e = '') => { pass++; console.log(`  ✓ ${n}${e ? '  ' + e : ''}`); };
const bad = (n, d) => { fail++; issues.push(`${n} — ${d}`); console.log(`  ✗ ${n}  ${d}`); };
const check = (n, c, d = '') => c ? ok(n, d) : bad(n, d || 'failed');

async function main() {
  console.log('\nKosmos AI — UI suite (jsdom)\n');

  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));

  const dom = await JSDOM.fromURL(`${BASE}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom has no fetch streaming or clipboard; give it real ones
      window.fetch = (url, opts = {}) => {
        const u = String(url).startsWith('http') ? String(url) : `${BASE}${url}`;
        // share the cookie jar manually
        opts.headers = { ...(opts.headers || {}) };
        if (dom.state?.cookie) opts.headers.cookie = dom.state.cookie;
        return fetch(u, opts).then((res) => {
          const sc = res.headers.getSetCookie?.() || [];
          if (sc.length && dom.state) dom.state.cookie = sc[0].split(';')[0];
          return res;
        });
      };
      window.navigator.clipboard = { writeText: async () => {} };
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
      window.confirm = () => true;
    }
  });

  dom.state = { cookie: '' };
  const { window } = dom;
  const doc = window.document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => doc.querySelector(s);
  const waitFor = async (fn, ms = 15000, step = 100) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = fn(); if (v) return v; } catch { /* keep waiting */ }
      await sleep(step);
    }
    return null;
  };

  // ── boot
  await waitFor(() => doc.body.dataset.screen === 'gate', 8000);
  check('login gate renders on first visit', doc.body.dataset.screen === 'gate');
  check('login form exists', Boolean($('#loginForm')));
  check('Arabic RTL by default', doc.documentElement.dir === 'rtl');
  check('Arabic copy is applied', /كلمة السر/.test(doc.body.textContent), $('#password') ? '' : '');
  check('model name shown on the gate', Boolean($('#gateModel')));

  // ── wrong password
  $('#password').value = 'nope';
  $('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !$('#loginError').hidden, 6000);
  check('wrong password shows an error', !$('#loginError').hidden);

  // ── correct password
  $('#password').value = PASSWORD;
  $('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const appShown = await waitFor(() => doc.body.dataset.screen === 'app', 10000);
  check('correct password opens the app', Boolean(appShown));
  check('app shell is visible', !$('#app').hidden);
  check('sidebar rendered', Boolean($('#sidebar')));
  check('welcome screen rendered', Boolean($('#welcome')));
  check('4 mode buttons', doc.querySelectorAll('.mode-btn').length === 4, `${doc.querySelectorAll('.mode-btn').length} found`);
  check('chat mode is active by default', $('.mode-btn[data-mode="chat"]')?.classList.contains('is-active'));
  check('suggestion chips rendered', doc.querySelectorAll('.chip').length === 4, `${doc.querySelectorAll('.chip').length} chips`);
  check('model badge shows the model', Boolean($('#modelName')?.textContent));

  // ── language toggle
  const enBtn = doc.querySelector('[data-lang-toggle]');
  enBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  check('language toggle switches to LTR', doc.documentElement.dir === 'ltr', doc.documentElement.dir);
  check('English copy applied', /Password|Chats|New chat/.test(doc.body.textContent));
  enBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  check('toggle back to Arabic RTL', doc.documentElement.dir === 'rtl');

  // ── mode switching changes the subtitle
  const before = $('#chatSub').textContent;
  $('.mode-btn[data-mode="code"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  check('switching to code mode updates the header', $('#chatSub').textContent !== before);
  check('code mode button becomes active', $('.mode-btn[data-mode="code"]').classList.contains('is-active'));
  $('.mode-btn[data-mode="chat"]').dispatchEvent(new window.Event('click', { bubbles: true }));

  // ── send a message
  $('#input').value = 'اكتب دالة بايثون قصيرة للتحقق هل العدد زوجي';
  $('#input').dispatchEvent(new window.Event('input', { bubbles: true }));
  check('send button enabled once there is text', !$('#sendBtn').disabled);
  $('#input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

  const userBubble = await waitFor(() => doc.querySelector('.msg.user .user-bubble'), 8000);
  check('user message appears immediately', Boolean(userBubble));
  check('user message text is correct', /دالة بايثون/.test(userBubble?.textContent || ''));

  const streaming = await waitFor(() => doc.querySelector('#streamBody'), 6000);
  check('assistant placeholder appears', Boolean(streaming));

  const answer = await waitFor(() => {
    const body = doc.querySelector('#streamBody');
    const txt = body ? body.textContent.trim() : '';
    return txt.length > 8 ? txt : null;
  }, 60000);
  check('assistant answer streams in', Boolean(answer), `${(answer || '').length} chars`);
  check('welcome screen is hidden after the first message', $('#welcome').hidden);
  check('message list has 2 messages', doc.querySelectorAll('.msg').length === 2, `${doc.querySelectorAll('.msg').length}`);

  // finished state
  const finished = await waitFor(() => !doc.querySelector('#streamBody') && doc.querySelectorAll('.msg.assistant').length >= 1, 90000);
  check('streaming completes and re-renders', Boolean(finished));

  const codeCard = doc.querySelector('.code-card');
  if (codeCard) {
    ok('code block rendered as a card');
    check('code card has copy/open/download', codeCard.querySelectorAll('.code-tools button').length === 3);
    codeCard.querySelector('[data-act="open-code"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(400);
    check('artifact panel opens', !$('#artifact').hidden);
    check('artifact panel shows the code', ($('#artifactCode').textContent || '').length > 5);
    $('#artifactClose').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(200);
    check('artifact panel closes', $('#artifact').hidden);
  } else {
    ok('no code block this run (model answered in prose) — artifact test skipped');
  }

  // ── conversation list
  const conv = await waitFor(() => doc.querySelector('.conv-item'), 8000);
  check('conversation appears in the sidebar', Boolean(conv));
  check('conversation title is not the default', conv && !/New chat|محادثة جديدة/.test(conv.querySelector('.title').textContent));

  // ── new chat (wait until the stream has truly finished first)
  await waitFor(() => window.kosmos && window.kosmos.state.streaming === false, 90000);
  await sleep(300);
  $('#newChat').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  check('new chat clears the thread', doc.querySelectorAll('.msg').length === 0);
  check('welcome returns for a new chat', !$('#welcome').hidden);

  // ── projects view
  doc.querySelector('.nav-item[data-view="projects"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(400);
  check('projects view reveals its list', !$('#projectList').hidden);
  check('new-project button visible', !$('#newProjectBtn').hidden);
  $('#newProjectBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(300);
  check('project modal opens', !$('#projectModal').hidden);
  $('#closeProjectModal').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(200);
  check('project modal closes', $('#projectModal').hidden);

  // ── markdown rendering (calls the app's real renderer)
  {
    const md = window.renderMarkdown;
    check('renderMarkdown is reachable', typeof md === 'function');

    const code = md('Look:\n\n```python\ndef f(x):\n    return x + 1\n```\n\nDone.');
    check('fenced code becomes a code card', /class="code-card"/.test(code));
    check('code keeps its highlighting spans', /tok-key/.test(code), 'keywords coloured');
    check('code card exposes copy/open/download', (code.match(/data-act=/g) || []).length === 3);
    check('prose outside the fence is a paragraph', /<p>Look:<\/p>/.test(code));

    const html = md('```html\n<button onclick="x()">hi</button>\n```');
    check('html is escaped, not executed', html.includes('&lt;button') && !html.includes('<button onclick'));

    const xss = md('<img src=x onerror=alert(1)>');
    check('raw HTML in a message is escaped', !/<img/i.test(xss), xss.slice(0, 60));

    check('bold + italic work', /<strong>b<\/strong>/.test(md('**b**')) && /<em>i<\/em>/.test(md('*i*')));
    check('inline code works', /<code>x<\/code>/.test(md('use `x` here')));
    check('links open in a new tab', /target="_blank"/.test(md('[a](https://example.com)')));
    check('bare urls are linked', /<a href="https:\/\/example.com"/.test(md('see https://example.com')));
    check('unordered lists render', /<ul>/.test(md('- one\n- two')));
    check('ordered lists render', /<ol>/.test(md('1. one\n2. two')));
    check('headings render', /<h2>title<\/h2>/.test(md('## title')));
    check('tables render', /<table>/.test(md('| a | b |\n|---|---|\n| 1 | 2 |')));
    check('an unterminated fence still renders (streaming)', /class="code-card"/.test(md('```js\nconst a = 1')));

    // inject a rendered assistant message and exercise the artifact panel
    const box = $('#messages');
    const probe = doc.createElement('div');
    probe.className = 'msg assistant';
    probe.innerHTML = md('```javascript\nconsole.log("hi");\n```');
    box.appendChild(probe);
    const openBtn = probe.querySelector('[data-act="open-code"]');
    check('open button exists on a rendered block', Boolean(openBtn));
    openBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(300);
    check('artifact panel opens from a code block', !$('#artifact').hidden);
    check('artifact shows the code', /console\.log/.test($('#artifactCode').textContent || ''));
    check('artifact offers copy + download', Boolean($('#artifactCopy')) && Boolean($('#artifactDownload')));
    check('layout switches to two panes', $('#app').classList.contains('has-artifact'));
    $('#artifactClose').dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(200);
    check('artifact closes and layout resets', $('#artifact').hidden && !$('#app').classList.contains('has-artifact'));
    probe.remove();
  }

  // ── errors captured by the console
  const real = errors.filter((e) => !/Not implemented: navigation|Could not parse CSS|jsdom/i.test(e));
  check('no JS errors in the console', real.length === 0, real.slice(0, 2).join(' | '));

  const total = pass + fail;
  console.log(`\n${pass}/${total} checks passed`);
  if (fail) {
    console.log('Failures:');
    issues.forEach((i) => console.log('  · ' + i));
    process.exit(1);
  }
  console.log('All good.');
  dom.window.close();
}

main().catch((e) => { console.error('crashed:', e); process.exit(2); });
