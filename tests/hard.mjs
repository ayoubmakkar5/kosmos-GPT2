import { JSDOM } from 'jsdom';
import fs from "fs";

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:3000';
const PASSWORD = process.env.APP_PASSWORD || 'Kosmos@2026';
const PUBLIC = new URL('../public/', import.meta.url).pathname;
const html = fs.readFileSync(PUBLIC + 'index.html', 'utf8');
const appjs = fs.readFileSync(PUBLIC + 'app.js', 'utf8');
const realFetch = globalThis.fetch;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, n, e = '') => { out.push(c); console.log(c ? '✅' : '❌', n, e); };

async function token() {
  const r = await realFetch(ORIGIN + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
  return (await r.json()).token;
}

console.log('=== A. استمرارية السياق داخل نفس المحادثة ===');
{
  const dom = new JSDOM(html, { url: ORIGIN + '/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (u, o = {}) => realFetch(ORIGIN + u, o);
  window.navigator.clipboard = { writeText: async () => {} };
  window.URL.createObjectURL = () => 'blob:stub';
  window.HTMLAnchorElement.prototype.click = function () {};
  window.eval(appjs);
  await wait(700);
  const d = window.document;
  d.querySelector('#password').value = PASSWORD;
  d.querySelector('#login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(500);

  async function send(text) {
    const before = d.querySelectorAll('.msg.assistant .md').length;
    const inp = d.querySelector('#input');
    inp.value = text;
    inp.dispatchEvent(new window.Event('input', { bubbles: true }));
    d.querySelector('#send').click();
    for (let i = 0; i < 120; i++) {
      await wait(300);
      const ns = d.querySelectorAll('.msg.assistant .md');
      const last = ns[ns.length - 1];
      if (ns.length > before && last && !last.querySelector('.cursor') && !last.querySelector('.thinking')) return last.textContent.trim();
    }
    return '';
  }
  const r1 = await send('My name is Sami. Answer with just: noted.');
  check(r1.length > 0, 'الرسالة الأولى وصلت', r1.slice(0, 40).replace(/\n/g, ' '));
  const r2 = await send('What is my name? Answer in one short sentence.');
  check(/sami/i.test(r2), 'النموذج يتذكّر السياق داخل المحادثة', r2.slice(0, 60).replace(/\n/g, ' '));
}

console.log('\n=== B. زر الإيقاف أثناء التوليد ===');
{
  const dom = new JSDOM(html, { url: ORIGIN + '/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (u, o = {}) => realFetch(ORIGIN + u, o);
  window.navigator.clipboard = { writeText: async () => {} };
  window.URL.createObjectURL = () => 'blob:stub';
  window.HTMLAnchorElement.prototype.click = function () {};
  window.eval(appjs);
  await wait(700);
  const d = window.document;
  d.querySelector('#password').value = PASSWORD;
  d.querySelector('#login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(500);
  const inp = d.querySelector('#input');
  inp.value = 'Write a very long Python tutorial with many examples.';
  inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  d.querySelector('#send').click();
  await wait(1400);
  const stopBtn = d.querySelector('#send');
  const wasStop = stopBtn.classList.contains('stop');
  stopBtn.click(); // stop
  await wait(900);
  const stopped = !d.querySelector('#send').classList.contains('stop');
  check(wasStop, 'الزر يتحول إلى "إيقاف" أثناء التوليد');
  check(stopped, 'الإيقاف يُنهي التوليد ويُعيد الزر لحالته');
  const r = await realFetch(ORIGIN + '/api/health');
  check((await r.json()).model_ready, 'النموذج سليم بعد الإيقاف');
  // a new request must still work right after
  const t = await token();
  const r2 = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'say ok' }], maxTokens: 20 }) });
  const txt = await r2.text();
  check(txt.includes('delta'), 'الخادم يخدم طلباً جديداً بعد الإيقاف');
}

console.log('\n=== C. طلبات متزامنة (3 مستخدمين في وقت واحد) ===');
{
  const t = await token();
  const bodies = ['say one', 'say two', 'say three'].map((c) =>
    realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ messages: [{ role: 'user', content: c }], maxTokens: 25 }) })
  );
  const t0 = Date.now();
  const responses = await Promise.all(bodies);
  const texts = await Promise.all(responses.map((r) => r.text()));
  check(responses.every((r) => r.status === 200), 'كل الطلبات المتزامنة رجعت 200');
  check(texts.every((x) => x.includes('"delta"') && x.includes('"done":true')), 'كل الطلبات المتزامنة أكملت التوليد', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log('\n=== D. مدخلات طويلة وحالات حدّية ===');
{
  const t = await token();
  const longCode = 'def f(x):\n    return x*2\n'.repeat(120);
  const r = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'explain briefly:\n' + longCode }], mode: 'explain', maxTokens: 60 }) });
  const txt = await r.text();
  check(r.status === 200 && txt.includes('delta'), 'مدخل طويل (~2400 حرف) يُعالج بنجاح');

  const r2 = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ messages: [] }) });
  check(r2.status === 400, 'رسائل فارغة → 400', String(r2.status));

  const r3 = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: 'not-json' });
  check(r3.status === 400, 'جسم غير صالح → 400', String(r3.status));

  const r4 = await realFetch(ORIGIN + '/api/chat', { method: 'GET', headers: { Authorization: `Bearer ${t}` } });
  check(r4.status === 405, 'طريقة غير مسموحة → 405', String(r4.status));

  const r5 = await realFetch(ORIGIN + '/../etc/passwd');
  check(r5.status === 404 || r5.status === 403 || r5.status === 200, 'محاولة Path traversal لا تكشف ملفات النظام', String(r5.status) + ' ');
  const body = await r5.text();
  check(!body.includes('root:x:'), 'لم يُسرّب /etc/passwd');
}

console.log('\n=== E. موارد الخادم ===');
{
  const r = await realFetch(ORIGIN + '/api/health');
  const h = await r.json();
  check(h.model_ready === true, 'النموذج ما زال محمّلاً', `load=${h.load_seconds}s`);
}

const fails = out.filter((x) => !x).length;
console.log(`\nالحصيلة: نجح ${out.length - fails} / ${out.length}`);
process.exit(fails ? 1 : 0);
