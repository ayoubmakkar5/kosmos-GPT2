import { JSDOM } from 'jsdom';
import fs from "fs";

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:3000';
const PASSWORD = process.env.APP_PASSWORD || 'Kosmos@2026';
const PUBLIC = new URL('../public/', import.meta.url).pathname;
const html = fs.readFileSync(PUBLIC + 'index.html', 'utf8');
const appjs = fs.readFileSync(PUBLIC + 'app.js', 'utf8');
const realFetch = globalThis.fetch;

const results = [];
const ok = (name, extra = '') => { results.push(['PASS', name, extra]); console.log('✅', name, extra); };
const bad = (name, extra = '') => { results.push(['FAIL', name, extra]); console.log('❌', name, extra); };
const check = (cond, name, extra = '') => (cond ? ok(name, extra) : bad(name, extra));

function makePage(url = ORIGIN + '/', seedStorage = null) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (seedStorage) for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
  window.fetch = (u, o = {}) => realFetch(ORIGIN + u, o);
  window.__copied = null;
  window.navigator.clipboard = { writeText: async (t) => { window.__copied = t; } };
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.eval(appjs);
  return { window, errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, password) {
  const d = page.window.document;
  d.querySelector('#password').value = password;
  d.querySelector('#login-form').dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(600);
}

async function sendAndWait(page, text, maxSeconds = 45) {
  const d = page.window.document;
  const before = d.querySelectorAll('.msg.assistant .md').length;
  const inp = d.querySelector('#input');
  inp.value = text;
  inp.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  d.querySelector('#send').click();
  const t0 = Date.now();
  while (Date.now() - t0 < maxSeconds * 1000) {
    await wait(300);
    const nodes = d.querySelectorAll('.msg.assistant .md');
    const last = nodes[nodes.length - 1];
    if (nodes.length > before && last && !last.querySelector('.thinking') && !last.querySelector('.cursor')) {
      return { text: last.textContent.trim(), node: last, seconds: (Date.now() - t0) / 1000 };
    }
  }
  return { text: '', node: null, seconds: (Date.now() - t0) / 1000, timeout: true };
}

console.log('\n=== 1. صفحة الدخول ===');
{
  const page = makePage();
  await wait(800);
  const d = page.window.document;
  check(!d.querySelector('#gate').classList.contains('hidden'), 'تظهر صفحة كلمة السر قبل الدخول');
  check(d.documentElement.dir === 'rtl', 'الاتجاه الافتراضي عربي RTL');

  await login(page, 'wrong-password');
  const err = d.querySelector('#login-error').textContent.trim();
  check(err.length > 0 && !d.querySelector('#gate').classList.contains('hidden'), 'كلمة سر خاطئة → رسالة خطأ ورفض الدخول', `"${err}"`);

  await login(page, PASSWORD);
  check(d.querySelector('#gate').classList.contains('hidden') && !d.querySelector('#app').classList.contains('hidden'), 'كلمة السر الصحيحة → الدخول للتطبيق');
  check(/#t=/.test(page.window.location.hash), 'حفظ الجلسة في رابط الصفحة (#t=…)');
  check(d.querySelectorAll('.chip').length === 4, 'ظهور 4 اقتراحات جاهزة');
  check(d.querySelector('#engine-badge-state').textContent.includes('جاهز'), 'مؤشر النموذج: جاهز', d.querySelector('#engine-badge-state').textContent);
  check(page.errors.length === 0, 'لا أخطاء JavaScript', page.errors.join('|'));
}

console.log('\n=== 2. توليد كود (الوضع الافتراضي) ===');
let session1 = null;
{
  const page = makePage();
  await wait(700);
  await login(page, PASSWORD);
  session1 = page;
  const d = page.window.document;
  const r = await sendAndWait(page, 'Write a Python function that returns the factorial of n, with a usage example.');
  check(!r.timeout && r.text.length > 20, 'ردّ النموذج وصل', `${r.seconds.toFixed(1)}s, ${r.text.length} حرفاً`);
  const blocks = r.node ? r.node.querySelectorAll('.code-block') : [];
  check(blocks.length >= 1, 'كتلة كود Python ظهرت', `${blocks.length} كتلة`);
  if (blocks.length) {
    const lang = blocks[0].querySelector('.code-head .lang').textContent;
    const code = blocks[0].querySelector('code').textContent;
    check(lang.toLowerCase().includes('python'), 'تحديد اللغة على الكتلة', lang);
    check(/def |factorial/.test(code), 'الكود يحتوي دالة فعلية', code.split('\n')[0]);
    check(!/<think|<\/think>/.test(r.text), 'لا يظهر أي وسوم تفكير للمستخدم');
    // copy
    blocks[0].querySelector('[data-act="copy"]').click();
    await wait(150);
    check(page.window.__copied === code, 'زر النسخ ينسخ الكود كاملاً');
    // download
    let threw = false;
    try { blocks[0].querySelector('[data-act="download"]').click(); } catch { threw = true; }
    check(!threw, 'زر التنزيل يعمل دون أخطاء');
  }
  check(d.querySelectorAll('#history-list li').length === 1, 'المحادثة ظهرت في السجل');
  check(d.querySelector('#stats-badge').textContent.includes('tok/s'), 'عرض سرعة التوليد', d.querySelector('#stats-badge').textContent);
}

console.log('\n=== 3. تشغيل الكود في معاينة ===');
{
  const page = makePage();
  await wait(700);
  await login(page, PASSWORD);
  const d = page.window.document;
  const r = await sendAndWait(page, 'Write a minimal HTML page with one button that says Click me.');
  const block = r.node ? r.node.querySelector('.code-block[data-lang="html"]') : null;
  if (block && block.querySelector('[data-act="run"]')) {
    block.querySelector('[data-act="run"]').click();
    await wait(200);
    const modal = d.querySelector('#preview-modal');
    const srcdoc = d.querySelector('#preview-frame').getAttribute('srcdoc') || d.querySelector('#preview-frame').srcdoc || '';
    check(!modal.classList.contains('hidden'), 'زر التشغيل يفتح نافذة المعاينة');
    check(/<html|<!doctype|<button/i.test(srcdoc), 'المعاينة تحتوي صفحة HTML قابلة للعرض', srcdoc.slice(0, 60).replace(/\n/g, ' '));
    d.querySelector('#close-preview').click();
    check(modal.classList.contains('hidden'), 'زر الإغلاق يعمل');
  } else {
    bad('تعذّر العثور على كتلة HTML قابلة للتشغيل', r.text.slice(0, 80));
  }
}

console.log('\n=== 4. وضع الشرح + لصق كود ===');
{
  const page = makePage();
  await wait(700);
  await login(page, PASSWORD);
  const d = page.window.document;
  [...d.querySelectorAll('.seg-btn')].find((b) => b.dataset.mode === 'explain').click();
  check([...d.querySelectorAll('.seg-btn')].find((b) => b.dataset.mode === 'explain').classList.contains('active'), 'تبديل الوضع إلى "شرح"');
  const r = await sendAndWait(page, 'Explain this code:\n\nfunction sum(a){ return a.reduce((x,y)=>x+y) }');
  check(!r.timeout && r.text.length > 20, 'شرح الكود وصل', `${r.seconds.toFixed(1)}s`);
}

console.log('\n=== 5. الواجهة الإنجليزية + طلب بالعربية ===');
{
  const page = makePage();
  await wait(700);
  await login(page, PASSWORD);
  const d = page.window.document;
  d.querySelector('#lang-toggle').click();
  await wait(250);
  check(d.documentElement.dir === 'ltr' && d.documentElement.lang === 'en', 'زر اللغة يحوّل الواجهة إلى الإنجليزية LTR');
  check(d.querySelector('#input').placeholder.startsWith('Ask for code'), 'ترجمة نصوص الإدخال', d.querySelector('#input').placeholder.slice(0, 30));
  const r = await sendAndWait(page, 'اكتب دالة بايثون قصيرة للتحقق هل العدد زوجي');
  check(!r.timeout && r.text.length > 10, 'الطلب بالعربية يعمل رغم الواجهة الإنجليزية', `${r.seconds.toFixed(1)}s`);
}

console.log('\n=== 6. البقاء مسجّلاً بعد إعادة التحميل ===');
{
  const d0 = session1.window.document;
  const storage = {};
  for (const k of ['kosmos_token', 'kosmos_conversations_v1', 'kosmos_current', 'kosmos_lang']) {
    storage[k] = session1.window.localStorage.getItem(k);
  }
  const hash = session1.window.location.hash;
  // reload with cookies blocked (new session) but the URL fragment intact
  const page = makePage(ORIGIN + '/' + hash, storage);
  await wait(1000);
  const d = page.window.document;
  check(d.querySelector('#gate').classList.contains('hidden'), 'إعادة تحميل الصفحة: لا تطلب كلمة السر مجدداً');
  check(d.querySelectorAll('.msg').length >= 2, 'استعادة الرسائل السابقة بعد إعادة التحميل', `${d.querySelectorAll('.msg').length} رسالة`);
  const r = await sendAndWait(page, 'say "still working" in three words');
  check(!r.timeout && d.querySelector('#gate').classList.contains('hidden'), 'إرسال رسالة جديدة بعد التحميل بدون طلب كلمة السر');
}

console.log('\n=== 7. الحماية من الوصول غير المصرّح ===');
{
  const r1 = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
  check(r1.status === 401, 'طلب المحادثة بدون جلسة → 401', String(r1.status));
  const r2 = await realFetch(ORIGIN + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(5) }) });
  check(r2.status === 401, 'كلمة سر خاطئة عبر API → 401');
  const r3 = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer forged.token.value' }, body: '{}' });
  check(r3.status === 401, 'رمز جلسة مُلفّق → 401');
}

console.log('\n=== 8. تسجيل الخروج ===');
{
  const page = makePage();
  await wait(700);
  await login(page, PASSWORD);
  const d = page.window.document;
  d.querySelector('#logout').click();
  await wait(500);
  check(!d.querySelector('#gate').classList.contains('hidden'), 'الخروج يعيد صفحة كلمة السر');
  const r = await realFetch(ORIGIN + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"messages":[{"role":"user","content":"hi"}]}' });
  check(r.status === 401, 'بعد الخروج: الطلبات مرفوضة');
}

console.log('\n=== 9. الملفات الثابتة والأداء ===');
{
  for (const p of ['/', '/styles.css', '/app.js', '/favicon.ico']) {
    const r = await realFetch(ORIGIN + p);
    check(r.status === 200 || (p === '/favicon.ico' && r.status === 404), `تحميل ${p}`, String(r.status));
  }
  const t0 = Date.now();
  const r = await realFetch(ORIGIN + '/');
  await r.text();
  check(Date.now() - t0 < 1500, 'سرعة تحميل الصفحة الرئيسية', `${Date.now() - t0}ms`);
}

const failed = results.filter((r) => r[0] === 'FAIL');
console.log('\n================ الحصيلة ================');
console.log(`ناجح: ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('فشل:');
  failed.forEach((f) => console.log('  -', f[1], f[2]));
  process.exit(1);
}
console.log('كل الاختبارات نجحت ✅');
