/* ============================================================================
   Kosmos AI — single-page client (no build step, no dependencies)
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ───────────────────────────────────────────────────────────────────────── i18n */
const I18N = {
  ar: {
    dir: 'rtl',
    gateSub: 'مساحة محادثة محمية. أدخل كلمة السر للمتابعة.',
    password: 'كلمة السر',
    enter: 'دخول',
    staySignedIn: 'ابقني مسجلاً',
    wrongPassword: 'كلمة السر غير صحيحة.',
    tooMany: 'محاولات كثيرة. حاول بعد 10 دقائق.',
    networkError: 'تعذّر الاتصال بالخادم.',
    newChat: 'محادثة جديدة',
    chats: 'المحادثات',
    projects: 'المشاريع',
    signOut: 'خروج',
    modeChat: 'محادثة',
    modeCode: 'كود',
    modeExplain: 'شرح',
    modeDebug: 'تصحيح',
    welcomeTitle: 'كيف أساعدك اليوم؟',
    welcomeSub: 'نموذج LFM3-1.7B محلي — بلا واجهات خارجية',
    welcomeSubLong: 'محادثة، شرح، برمجة وتحليل — كل شيء يعمل محلياً بنموذج LFM3-1.7B من Liquid AI.',
    placeholder: 'اكتب رسالتك…',
    hint: 'Enter للإرسال · Shift+Enter لسطر جديد',
    you: 'أنت',
    assistant: 'Kosmos',
    copy: 'نسخ',
    copied: 'تم النسخ',
    regenerate: 'إعادة التوليد',
    openArtifact: 'فتح',
    run: 'تشغيل',
    download: 'تنزيل',
    thinking: 'يفكر…',
    stopped: 'توقف',
    emptyChats: 'لا محادثات بعد',
    delete: 'حذف',
    newProject: 'مشروع جديد',
    projectName: 'اسم المشروع',
    instructions: 'تعليمات المشروع',
    instructionsHint: 'تُضاف تلقائياً إلى كل محادثة داخل المشروع',
    knowledge: 'ملفات المعرفة',
    addDoc: 'إضافة نص',
    docName: 'اسم الملف',
    docText: 'ألصق محتوى الملف هنا…',
    save: 'حفظ',
    cancel: 'إلغاء',
    noProjects: 'لا مشاريع بعد',
    projectSaved: 'تم الحفظ',
    deleted: 'تم الحذف',
    attach: 'إرفاق',
    modelLoading: 'النموذج يُحمّل…',
    modelReady: 'جاهز',
    modelError: 'خطأ في المحرك',
    tokensPerSecond: 'توكن/ث',
    conversationDeleted: 'حُذفت المحادثة',
    confirmDeleteChat: 'حذف هذه المحادثة؟',
    confirmDeleteProject: 'حذف هذا المشروع؟',
    fileTooBig: 'الملف كبير جداً',
    filesAdded: 'أُضيف الملف',
    language: 'English',
    theme: 'المظهر',
    engineDown: 'المحرّك لا يعمل — تحقق من السجل',
    retry: 'إعادة المحاولة',
    project: 'مشروع'
  },
  en: {
    dir: 'ltr',
    gateSub: 'A private chat workspace. Enter the password to continue.',
    password: 'Password',
    enter: 'Enter',
    staySignedIn: 'Keep me signed in',
    wrongPassword: 'Wrong password.',
    tooMany: 'Too many attempts. Try again in 10 minutes.',
    networkError: 'Could not reach the server.',
    newChat: 'New chat',
    chats: 'Chats',
    projects: 'Projects',
    signOut: 'Sign out',
    modeChat: 'Chat',
    modeCode: 'Code',
    modeExplain: 'Explain',
    modeDebug: 'Debug',
    welcomeTitle: 'How can I help today?',
    welcomeSub: 'LFM3-1.7B running locally — no external APIs',
    welcomeSubLong: 'Chat, explain, code and analyse — all running locally on Liquid AI LFM3-1.7B.',
    placeholder: 'Send a message…',
    hint: 'Enter to send · Shift+Enter for a new line',
    you: 'You',
    assistant: 'Kosmos',
    copy: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    openArtifact: 'Open',
    run: 'Run',
    download: 'Download',
    thinking: 'Thinking…',
    stopped: 'Stopped',
    emptyChats: 'No chats yet',
    delete: 'Delete',
    newProject: 'New project',
    projectName: 'Project name',
    instructions: 'Project instructions',
    instructionsHint: 'Automatically added to every chat in this project',
    knowledge: 'Knowledge files',
    addDoc: 'Add text',
    docName: 'File name',
    docText: 'Paste the file contents here…',
    save: 'Save',
    cancel: 'Cancel',
    noProjects: 'No projects yet',
    projectSaved: 'Saved',
    deleted: 'Deleted',
    attach: 'Attach',
    modelLoading: 'Model loading…',
    modelReady: 'Ready',
    modelError: 'Engine error',
    tokensPerSecond: 'tok/s',
    conversationDeleted: 'Chat deleted',
    confirmDeleteChat: 'Delete this chat?',
    confirmDeleteProject: 'Delete this project?',
    fileTooBig: 'File is too large',
    filesAdded: 'File added',
    language: 'العربية',
    theme: 'Theme',
    engineDown: 'Engine is not running — check logs',
    retry: 'Retry',
    project: 'Project'
  }
};

const CHIPS = {
  ar: [
    { mode: 'chat', text: 'مرحبا! من أنت وماذا تستطيع أن تفعل؟' },
    { mode: 'explain', text: 'اشرح لي كيف يعمل الذكاء الاصطناعي ببساطة' },
    { mode: 'code', text: 'اكتب دالة بايثون للتحقق هل العدد زوجي' },
    { mode: 'debug', text: 'لماذا يظهر لي Uncaught TypeError في JavaScript؟' }
  ],
  en: [
    { mode: 'chat', text: 'Hi! Who are you and what can you do?' },
    { mode: 'explain', text: 'Explain how large language models work, simply' },
    { mode: 'code', text: 'Write a Python function that checks if a number is even' },
    { mode: 'debug', text: 'Why do I get Uncaught TypeError in JavaScript?' }
  ]
};

/* ─────────────────────────────────────────────────────────────────────── state */
const state = {
  lang: localStorage.getItem('kosmos.lang') || 'ar',
  theme: localStorage.getItem('kosmos.theme') || 'dark',
  mode: 'chat',
  conversations: [],
  projects: [],
  currentId: null,
  messages: [],
  attachments: [],
  streaming: false,
  abort: null,
  model: null,
  artifact: null,
  projectId: null
};

let t = I18N[state.lang];

/* ───────────────────────────────────────────────────────────────────── helpers */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status === 401 && !path.startsWith('/login')) {
    showGate();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const err = new Error((json && (json.messageAr && state.lang === 'ar' ? json.messageAr : json.message)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ─────────────────────────────────────────────────────────── markdown → html */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

const KEYWORDS = {
  js: 'const let var function return if else for while class new import from export default await async try catch throw typeof instanceof this null true false undefined of in switch case break continue super extends yield static get set delete void',
  py: 'def return if elif else for while class import from as try except finally raise with lambda None True False and or not in is pass yield async await global nonlocal print self',
  ts: 'interface type enum implements private public readonly namespace declare abstract as satisfies keyof infer never unknown any',
  sh: 'if then else fi for do done while case esac function export local echo cd ls mkdir rm cp mv cat grep sed awk curl npm node sudo',
  go: 'func package import var const type struct interface return if else for range go defer chan map make new switch case break continue nil true false err',
  rust: 'fn let mut pub use struct enum impl trait match return if else for while loop in as const static mod crate self Self where dyn async await move ref',
  sql: 'select from where insert into values update set delete join left right inner outer on group by order having limit offset as and or not null distinct create table index alter drop union',
  css: 'color background display flex grid margin padding border font transition transform animation position top left right bottom width height',
  html: 'html head body div span a p ul li table tr td th form input button script style link meta'
};

function highlight(code, lang) {
  const esc2 = escapeHtml(code);
  const l = (lang || '').toLowerCase();
  const group = l === 'py' || l === 'python' ? 'py'
    : l === 'js' || l === 'javascript' || l === 'ts' || l === 'typescript' || l === 'jsx' || l === 'tsx' ? (l.startsWith('t') ? 'ts' : 'js')
    : l === 'sh' || l === 'bash' || l === 'shell' || l === 'zsh' ? 'sh'
    : l === 'go' ? 'go' : l === 'rust' || l === 'rs' ? 'rust'
    : l === 'sql' ? 'sql' : l === 'css' ? 'css' : l === 'html' || l === 'xml' ? 'html' : '';

  if (!group) return esc2;

  const words = (KEYWORDS[group] || '').split(' ').filter(Boolean);
  let out = esc2;

  if (group === 'html') {
    out = out.replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="tok-tag">$2</span>');
    out = out.replace(/([a-zA-Z-]+)=(&quot;.*?&quot;)/g, '<span class="tok-attr">$1</span>=<span class="tok-str">$2</span>');
    return out;
  }

  // strings, then comments, then numbers, then keywords
  out = out.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`[^`]*`)/g, '<span class="tok-str">$1</span>');
  if (group === 'py') out = out.replace(/(#.*)$/gm, '<span class="tok-com">$1</span>');
  else if (group === 'sql') out = out.replace(/(--.*)$/gm, '<span class="tok-com">$1</span>');
  else if (group !== 'css') out = out.replace(/(\/\/.*)$/gm, '<span class="tok-com">$1</span>');
  out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  if (words.length) {
    const re = new RegExp(`\\b(${words.join('|')})\\b`, 'g');
    out = out.replace(re, (m) => `<span class="tok-key">${m}</span>`);
  }
  return out;
}

function renderMarkdown(src) {
  const text = String(src || '').replace(/\r\n/g, '\n');
  const blocks = [];
  const stash = (html) => `\u0000BLOCK${blocks.push(html) - 1}\u0000`;

  // fenced code first (also handles an unterminated fence while streaming)
  let working = text.replace(/```([a-zA-Z0-9+#._-]*)\n?([\s\S]*?)(?:```|$)/g, (m, lang, code) => {
    const lg = (lang || '').trim();
    const body = code.replace(/\n$/, '');
    const id = `c${uid()}`;
    const label = lg || 'code';
    return stash(
      `<div class="code-card" data-code-id="${id}">` +
        `<div class="code-head"><span>${esc(label)}</span><div class="code-tools">` +
          `<button type="button" data-act="copy-code" data-target="${id}">${t.copy}</button>` +
          `<button type="button" data-act="open-code" data-target="${id}" data-lang="${esc(lg)}">${t.openArtifact}</button>` +
          `<button type="button" data-act="download-code" data-target="${id}" data-lang="${esc(lg)}">${t.download}</button>` +
        `</div></div>` +
        `<pre><code data-lang="${esc(lg)}">${highlight(body, lg)}</code></pre>` +
        `<textarea hidden data-src="${id}">${escapeHtml(body)}</textarea>` +
      `</div>`
    );
  });

  working = escapeHtml(working);

  // headings, hr, blockquote
  working = working.replace(/^###### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^##### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>')
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  // inline
  working = working
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

  // tables
  working = working.replace(/((?:^\|.*\|\s*$\n?){2,})/gm, (table) => {
    const rows = table.trim().split('\n').filter((r) => r.trim());
    if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1].trim())) return table;
    const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return '<table><thead><tr>' + head.map((h) => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
      body.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>';
  });

  // lists (simple, non-nested)
  working = working.replace(/(?:^[ \t]*[-*+][ \t]+.*(?:\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^[ \t]*[-*+][ \t]+/, ''));
    return '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  });
  working = working.replace(/(?:^[ \t]*\d+\.[ \t]+.*(?:\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^[ \t]*\d+\.[ \t]+/, ''));
    return '<ol>' + items.map((i) => `<li>${i}</li>`).join('') + '</ol>';
  });

  // paragraphs
  const out = working.split(/\n{2,}/).map((chunk) => {
    const c = chunk.trim();
    if (!c) return '';
    if (/^<(h\d|ul|ol|table|blockquote|hr|div|pre)/.test(c) || /^\u0000BLOCK\d+\u0000$/.test(c)) return c;
    return `<p>${c.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return out.replace(/\u0000BLOCK(\d+)\u0000/g, (m, i) => blocks[Number(i)]);
}

/* ─────────────────────────────────────────────────────────────────────── theme */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('kosmos.theme', state.theme);
}

/* ──────────────────────────────────────────────────────────────────── language */
function applyLang() {
  t = I18N[state.lang];
  document.documentElement.lang = state.lang;
  document.documentElement.dir = t.dir;
  localStorage.setItem('kosmos.lang', state.lang);

  $$('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
  $$('[data-lang-toggle]').forEach((b) => { b.textContent = t.language; });
  const input = $('#input');
  if (input) input.placeholder = t.placeholder;
  renderChips();
  renderConversationList();
  renderProjectsList();
  if (state.messages.length) renderMessages();
  else $('#messages').innerHTML = '';
  updateWelcome();
  updateModelBadge();
}

function updateWelcome() {
  const has = state.messages.length > 0;
  $('#welcome').hidden = has;
  $('#messages').style.display = has ? 'grid' : 'none';
}

function renderChips() {
  const box = $('#chips');
  if (!box) return;
  box.innerHTML = '';
  for (const chip of CHIPS[state.lang]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = chip.text;
    btn.addEventListener('click', () => {
      setMode(chip.mode);
      $('#input').value = chip.text;
      autosize();
      $('#input').focus();
      send();
    });
    box.appendChild(btn);
  }
}

/* ──────────────────────────────────────────────────────────────────────── auth */
function showGate() {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  document.body.dataset.screen = 'gate';
  setTimeout(() => $('#password')?.focus(), 60);
}

function showApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  document.body.dataset.screen = 'app';
}

async function checkAuth() {
  try {
    const me = await api('/me');
    state.model = me.model;
    showApp();
    updateModelBadge();
    await Promise.all([loadConversations(), loadProjects()]);
    if (state.conversations.length) {
      await openConversation(state.conversations[0].id);
    } else {
      newChat();
    }
  } catch (err) {
    if (err.message !== 'unauthorized') {
      console.warn(err);
      showGate();
    }
  }
}

/* ────────────────────────────────────────────────────────────────── model UI */
function updateModelBadge() {
  const m = state.model;
  const pulse = $('#modelPulse');
  const name = $('#modelName');
  const meta = $('#modelMeta');
  if (!m) return;
  name.textContent = m.name || 'LFM3-1.7B';
  const bits = [m.quant, `${m.context ? Math.round(m.context / 1024) + 'K' : ''} ctx`].filter(Boolean);
  meta.textContent = bits.join(' · ') || 'llama.cpp';
  pulse.className = 'pulse ' + (m.ready ? 'ready' : m.state === 'error' ? 'error' : 'loading');
  $('#modelBadge').title = m.ready
    ? `llama.cpp · ${m.context} ctx · ${m.loadSeconds}s load`
    : m.error || t.modelLoading;
  $('#gateModel').textContent = m.name || 'LFM3-1.7B';
}

async function pollModel() {
  try {
    const health = await api('/health');
    state.model = health.model;
    updateModelBadge();
    if (!health.model.ready && health.model.state !== 'error') setTimeout(pollModel, 2500);
  } catch { /* ignore */ }
}

/* ───────────────────────────────────────────────────────── conversations list */
async function loadConversations() {
  const res = await api('/conversations');
  state.conversations = res.items || [];
  renderConversationList();
}

function renderConversationList() {
  const box = $('#convList');
  if (!box) return;
  box.innerHTML = '';
  if (!state.conversations.length) {
    box.innerHTML = `<div class="sidebar-empty">${t.emptyChats}</div>`;
    return;
  }
  for (const conv of state.conversations) {
    const row = document.createElement('div');
    row.className = 'conv-item' + (conv.id === state.currentId ? ' is-active' : '');
    row.dataset.id = conv.id;
    row.innerHTML = `<span class="title">${esc(conv.title || 'New chat')}</span>` +
      `<button class="kill" type="button" data-act="delete-conv" data-id="${conv.id}" title="${t.delete}">✕</button>`;
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="delete-conv"]')) return;
      openConversation(conv.id);
      $('#sidebar').classList.remove('is-open');
    });
    box.appendChild(row);
  }
}

async function openConversation(cid) {
  if (state.streaming) return;
  try {
    const conv = await api(`/conversations/${cid}`);
    state.currentId = conv.id;
    state.messages = conv.messages || [];
    state.mode = conv.mode || 'chat';
    state.projectId = conv.projectId || null;
    setMode(state.mode, { silent: true });
    $('#chatTitle').textContent = conv.title;
    renderMessages();
    updateWelcome();
    renderConversationList();
    scrollToBottom(true);
  } catch (err) {
    if (err.status === 404) {
      await loadConversations();
      newChat();
    }
  }
}

function newChat() {
  // Starting a new chat mid-stream stops the stream instead of silently
  // ignoring the click — the partial answer is already saved server-side.
  if (state.streaming) {
    state.abort?.abort();
    state.streaming = false;
    setSendState('send');
  }
  state.currentId = null;
  state.messages = [];
  state.attachments = [];
  state.projectId = null;
  state.mode = 'chat';
  setMode('chat', { silent: true });
  $('#chatTitle').textContent = 'Kosmos AI';
  $('#chatSub').textContent = t.welcomeSub;
  $('#messages').innerHTML = '';
  renderAttachments();
  updateWelcome();
  renderConversationList();
  $('#input').focus();
}

async function deleteConversation(cid) {
  if (!confirm(t.confirmDeleteChat)) return;
  await api(`/conversations/${cid}`, { method: 'DELETE' });
  state.conversations = state.conversations.filter((c) => c.id !== cid);
  renderConversationList();
  toast(t.conversationDeleted);
  if (state.currentId === cid) {
    if (state.conversations.length) await openConversation(state.conversations[0].id);
    else newChat();
  }
}

/* ────────────────────────────────────────────────────────────── message view */
function messageNode(msg, index) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${msg.role === 'user' ? 'user' : 'assistant'}`;
  wrap.dataset.index = index;

  if (msg.role === 'user') {
    const role = document.createElement('div');
    role.className = 'msg-role';
    role.innerHTML = `<span class="avatar">${esc((t.you || 'U')[0])}</span><span>${t.you}</span>`;
    const bubble = document.createElement('div');
    bubble.className = 'user-bubble';
    bubble.textContent = msg.content;
    if (msg.attachments?.length) {
      const names = document.createElement('div');
      names.className = 'mono';
      names.style.marginTop = '6px';
      names.textContent = msg.attachments.map((a) => `📎 ${a.name}`).join(' · ');
      bubble.appendChild(names);
    }
    wrap.append(role, bubble);
    return wrap;
  }

  const role = document.createElement('div');
  role.className = 'msg-role';
  role.innerHTML = `<span class="avatar">K</span><span>${esc(msg.model || state.model?.name || t.assistant)}</span>`;

  const body = document.createElement('div');
  body.className = 'assistant-body';
  body.innerHTML = renderMarkdown(msg.content || '');

  wrap.append(role);

  if (msg.reasoning) {
    const det = document.createElement('details');
    det.className = 'reasoning';
    det.innerHTML = `<summary>${t.thinking}</summary><div class="reasoning-body">${escapeHtml(msg.reasoning)}</div>`;
    wrap.appendChild(det);
  }
  wrap.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML =
    `<button type="button" data-act="copy-msg" data-index="${index}">${t.copy}</button>` +
    (index === state.messages.length - 1 ? `<button type="button" data-act="regen" data-index="${index}">${t.regenerate}</button>` : '');
  wrap.appendChild(actions);

  if (msg.stats?.seconds) {
    const stat = document.createElement('div');
    stat.className = 'msg-stat mono';
    const parts = [`${msg.stats.seconds}s`];
    if (msg.stats.tokensPerSecond) parts.push(`${msg.stats.tokensPerSecond} ${t.tokensPerSecond}`);
    if (msg.aborted) parts.push(t.stopped);
    stat.textContent = parts.join(' · ');
    wrap.appendChild(stat);
  }
  return wrap;
}

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  state.messages.forEach((m, i) => box.appendChild(messageNode(m, i)));
}

function scrollToBottom(instant) {
  const el = $('#chatScroll');
  if (!el) return;
  if (instant) el.style.scrollBehavior = 'auto';
  el.scrollTop = el.scrollHeight;
  if (instant) requestAnimationFrame(() => { el.style.scrollBehavior = ''; });
}

/* ──────────────────────────────────────────────────────────────────── modes */
function setMode(mode, { silent = false } = {}) {
  state.mode = mode;
  $$('.mode-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
  if (!silent) {
    const subs = {
      chat: { ar: 'نموذج LFM3-1.7B محلي — بلا واجهات خارجية', en: 'LFM3-1.7B running locally — no external APIs' },
      code: { ar: 'وضع توليد الكود — اكتب ما تريد بناءه', en: 'Code mode — describe what to build' },
      explain: { ar: 'وضع الشرح — مفاهيم بأسلوب مبسّط', en: 'Explain mode — concepts, made simple' },
      debug: { ar: 'وضع التصحيح — ألصق الخطأ أو الكود', en: 'Debug mode — paste the error or code' }
    };
    $('#chatSub').textContent = (subs[mode] || subs.chat)[state.lang];
  }
  if (state.currentId) {
    api(`/conversations/${state.currentId}`, { method: 'PATCH', body: JSON.stringify({ mode }) }).catch(() => {});
  }
}

/* ─────────────────────────────────────────────────────────────── attachments */
const MAX_FILE = 12 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|js|mjs|cjs|ts|tsx|jsx|json|css|scss|html|htm|xml|svg|py|rb|php|java|c|h|cpp|hpp|cs|go|rs|swift|kt|sh|bash|zsh|sql|yml|yaml|toml|ini|cfg|env|log|csv|tex)$/i;

async function handleFiles(files) {
  for (const file of files) {
    logActivity('file', file.name);
    if (file.size > MAX_FILE) { toast(`${t.fileTooBig}: ${file.name}`); continue; }
    const isImage = /^image\/(png|jpe?g|webp|gif)$/i.test(file.type);
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (isImage) {
      const dataUrl = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(file);
      });
      state.attachments.push({ name: file.name, kind: 'image', size: file.size, dataUrl });
    } else if (isPdf) {
      // no PDF parser offline: tell the user honestly instead of pretending
      toast(state.lang === 'ar' ? 'ملفات PDF غير مدعومة بعد — ألصق النص' : 'PDF not supported yet — paste the text');
      continue;
    } else if (TEXT_EXT.test(file.name) || (file.type || '').startsWith('text/')) {
      const text = await file.text();
      state.attachments.push({ name: file.name, kind: 'text', size: file.size, text: text.slice(0, 60000) });
    } else {
      toast(state.lang === 'ar' ? 'نوع ملف غير مدعوم' : 'Unsupported file type');
      continue;
    }
  }
  renderAttachments();
}

function renderAttachments() {
  const bar = $('#attachmentBar');
  bar.innerHTML = '';
  if (!state.attachments.length) { bar.hidden = true; return; }
  bar.hidden = false;
  state.attachments.forEach((a, i) => {
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    chip.innerHTML = `<span>${a.kind === 'image' ? '🖼️' : '📄'}</span><span class="name">${esc(a.name)}</span>` +
      `<button type="button" data-i="${i}" aria-label="remove">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      state.attachments.splice(i, 1);
      renderAttachments();
    });
    bar.appendChild(chip);
  });
}

/* ─────────────────────────────────────────────────────────────────── sending */
async function ensureConversation() {
  if (state.currentId) return state.currentId;
  const conv = await api('/conversations', {
    method: 'POST',
    body: JSON.stringify({ mode: state.mode, projectId: state.projectId })
  });
  state.currentId = conv.id;
  state.conversations.unshift({ id: conv.id, title: conv.title, mode: conv.mode, updatedAt: conv.updatedAt, messageCount: 0 });
  renderConversationList();
  return conv.id;
}

function appendAssistantPlaceholder() {
  const box = $('#messages');
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  wrap.id = 'streaming-msg';
  wrap.innerHTML =
    `<div class="msg-role"><span class="avatar">K</span><span>${esc(state.model?.name || 'Kosmos')}</span></div>` +
    `<div class="assistant-body" id="streamBody"><div class="typing"><span></span><span></span><span></span></div></div>`;
  box.appendChild(wrap);
  updateWelcome();
  scrollToBottom();
  return { wrap, body: $('#streamBody') };
}

async function send(presetText) {
  if (state.streaming) return;
  const input = $('#input');
  const text = (presetText ?? input.value).trim();
  if (!text && !state.attachments.length) return;

  input.value = '';
  autosize();

  const atts = state.attachments.slice();
  state.attachments = [];
  renderAttachments();

  rememberPrompt(text, state.mode);

  try {
    const cid = await ensureConversation();

    // optimistic user bubble
    state.messages.push({ id: uid(), role: 'user', content: text, attachments: atts.map((a) => ({ name: a.name, kind: a.kind, size: a.size })) });
    renderMessages();
    scrollToBottom();

    const { body } = appendAssistantPlaceholder();

    state.streaming = true;
    setSendState('stop');
    const controller = new AbortController();
    state.abort = controller;

    let acc = '';
    let reasoning = '';
    let rafPending = false;
    const paint = () => {
      rafPending = false;
      body.innerHTML = renderMarkdown(stableTail(acc)) + '<span class="caret"></span>';
      scrollToBottom();
    };

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
      body: JSON.stringify({
        conversationId: cid,
        message: text,
        mode: state.mode,
        lang: state.lang,
        thinking: false,
        attachments: atts,
        maxTokens: 1200
      })
    });

    if (!res.ok) {
      let err = {};
      try { err = await res.json(); } catch { /* ignore */ }
      throw new Error((state.lang === 'ar' && err.messageAr) || err.message || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        let payload;
        try { payload = JSON.parse(data); } catch { continue; }

        if (event === 'delta') {
          acc += payload.text;
          if (!rafPending) { rafPending = true; requestAnimationFrame(paint); }
        } else if (event === 'reasoning') {
          reasoning += payload.text;
        } else if (event === 'error') {
          throw new Error(payload.message || 'stream error');
        } else if (event === 'done') {
          acc = payload.content ?? acc;
          if (rafPending) { rafPending = false; }
          body.innerHTML = renderMarkdown(acc);
          scrollToBottom();
          reasoning = payload.reasoning ?? reasoning;
          if (payload.title) {
            $('#chatTitle').textContent = payload.title;
            const row = state.conversations.find((c) => c.id === cid);
            if (row) row.title = payload.title;
            renderConversationList();
          }
        }
      }
    }

    $('#streaming-msg')?.remove();
    state.messages.push({ role: 'assistant', content: acc, reasoning: reasoning || undefined, stats: { seconds: 0 } });
    renderMessages();
    updateWelcome();
    scrollToBottom();
    await loadConversations();
    state.currentId = cid;
    renderConversationList();
  } catch (err) {
    $('#streaming-msg')?.remove();
    if (err.name === 'AbortError') {
      // keep whatever streamed in
      renderMessages();
      toast(t.stopped);
    } else {
      const box = $('#messages');
      const note = document.createElement('div');
      note.className = 'err-note';
      note.textContent = err.message;
      box.appendChild(note);
      if (/unavailable|loading|غير جاهز/i.test(err.message)) setTimeout(pollModel, 1200);
    }
  } finally {
    state.streaming = false;
    state.abort = null;
    setSendState('send');
    updateWelcome();
  }
}

/**
 * Hide a tail that might be the start of a chat-template marker while tokens
 * are still arriving ("<|im_en" → "d|>"). The server does the same; doing it
 * here too keeps the visible text identical to the saved message.
 */
function stableTail(raw) {
  const s = String(raw || '');
  const open = s.lastIndexOf('<');
  if (open === -1) return s;
  const tail = s.slice(open);
  if (/^<\|?[A-Za-z_]*$/.test(tail) && tail.length < 16) return s.slice(0, open);
  return s;
}

function setSendState(kind) {
  const btn = $('#sendBtn');
  if (kind === 'stop') {
    btn.disabled = false;
    btn.classList.add('is-stop');
    btn.innerHTML = '■';
    btn.type = 'button';
  } else {
    btn.disabled = !$('#input').value.trim() && !state.attachments.length;
    btn.classList.remove('is-stop');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h13M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.type = 'submit';
  }
}

/* ───────────────────────────────────────────────────────────────── projects */
async function loadProjects() {
  try {
    const res = await api('/projects');
    state.projects = res.items || [];
    renderProjectsList();
  } catch { /* ignore */ }
}

function renderProjectsList() {
  const box = $('#projectList');
  if (!box) return;
  box.innerHTML = '';
  if (!state.projects.length) {
    box.innerHTML = `<div class="sidebar-empty">${t.noProjects}</div>`;
    return;
  }
  for (const p of state.projects) {
    const row = document.createElement('div');
    row.className = 'conv-item';
    row.innerHTML = `<span class="title">🗂 ${esc(p.name)}</span><span class="mono">${p.docCount || 0}</span>`;
    row.addEventListener('click', () => openProjectModal(p.id));
    box.appendChild(row);
  }
}

function openProjectModal(pid) {
  const project = state.projects.find((p) => p.id === pid) || null;
  const modal = $('#projectModal');
  const body = $('#projectBody');
  modal.hidden = false;

  body.innerHTML = '';
  const nameRow = document.createElement('div');
  nameRow.className = 'field-row';
  nameRow.innerHTML = `<label>${t.projectName}</label><input id="pName" value="${esc(project?.name || '')}" />`;

  const instrRow = document.createElement('div');
  instrRow.className = 'field-row';
  instrRow.innerHTML = `<label>${t.instructions} <span class="mono">(${t.instructionsHint})</span></label>` +
    `<textarea id="pInstr" rows="3"></textarea>`;

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.innerHTML = `<button class="btn-ghost" id="pSave">${t.save}</button>` +
    (project ? `<button class="btn-ghost btn-danger" id="pDelete">${t.delete}</button>` : '') +
    `<button class="btn-ghost" id="pClose">${t.cancel}</button>`;

  const knowledge = document.createElement('div');
  knowledge.className = 'field-row';
  knowledge.innerHTML = `<label>${t.knowledge}</label>`;

  const docList = document.createElement('div');
  docList.style.display = 'grid';
  docList.style.gap = '6px';

  const docForm = document.createElement('div');
  docForm.innerHTML =
    `<div class="field-row"><input id="dName" placeholder="${t.docName}" /></div>` +
    `<div class="field-row"><textarea id="dText" rows="4" placeholder="${t.docText}"></textarea></div>` +
    `<button class="btn-ghost" id="dAdd">${t.addDoc}</button>`;

  body.append(nameRow, instrRow, actions, knowledge, docList, docForm);

  const renderDocs = (docs) => {
    docList.innerHTML = '';
    if (!docs?.length) { docList.innerHTML = `<div class="mono">—</div>`; return; }
    for (const d of docs) {
      const row = document.createElement('div');
      row.className = 'doc-item';
      row.innerHTML = `<span class="doc-name">📄 ${esc(d.name)}</span><span class="mono">${d.size} B</span>`;
      const del = document.createElement('button');
      del.className = 'link-btn';
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        await api(`/projects/${pid}/docs/${d.id}`, { method: 'DELETE' });
        await loadProjects();
        const fresh = await api(`/projects/${pid}`);
        renderDocs(fresh.docs);
      });
      row.appendChild(del);
      docList.appendChild(row);
    }
  };

  const readDocs = async () => {
    if (project) {
      const fresh = await api(`/projects/${pid}`);
      renderDocs(fresh.docs);
    } else {
      renderDocs([]);
    }
  };

  if (project) api(`/projects/${pid}`).then((p) => { $('#pInstr').value = p.instructions || ''; }).catch(() => {});
  readDocs();

  $('#pClose').addEventListener('click', () => { modal.hidden = true; });

  $('#pSave').addEventListener('click', async () => {
    const payload = { name: $('#pName').value.trim() || 'Project', instructions: $('#pInstr').value };
    if (project) {
      await api(`/projects/${pid}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast(t.projectSaved);
      await loadProjects();
      modal.hidden = true;
    } else {
      const created = await api('/projects', { method: 'POST', body: JSON.stringify(payload) });
      await loadProjects();
      toast(t.projectSaved);
      modal.hidden = true;
      openProjectModal(created.id);
    }
  });

  if (project) {
    $('#pDelete').addEventListener('click', async () => {
      if (!confirm(t.confirmDeleteProject)) return;
      await api(`/projects/${pid}`, { method: 'DELETE' });
      await loadProjects();
      modal.hidden = true;
      toast(t.deleted);
    });
  }

  $('#dAdd').addEventListener('click', async () => {
    const name = $('#dName').value.trim() || 'note.txt';
    const text = $('#dText').value;
    if (!text.trim()) return;
    if (!project) { toast(t.save); return; }
    await api(`/projects/${pid}/docs`, { method: 'POST', body: JSON.stringify({ name, text }) });
    $('#dName').value = '';
    $('#dText').value = '';
    const fresh = await api(`/projects/${pid}`);
    renderDocs(fresh.docs);
    await loadProjects();
    toast(t.filesAdded);
  });
}

/* ───────────────────────────────────────────────────────────────── artifacts */
function openArtifact(codeEl) {
  const card = codeEl.closest('.code-card');
  const code = card.querySelector('code').textContent;
  const lang = card.querySelector('.code-tools [data-act="open-code"]').dataset.lang || 'text';
  const isWeb = /^(html|xml|svg)$/i.test(lang) || /^<!doctype html/i.test(code);

  state.artifact = { code, lang };
  const panel = $('#artifact');
  const tabs = $('#artifactTabs');
  panel.hidden = false;
  $('#app').classList.add('has-artifact');

  tabs.innerHTML = `<button type="button" class="is-active">${esc(lang || 'code')}</button>` +
    (isWeb ? `<button type="button" data-tab="preview">${t.run}</button>` : '');

  const showCode = () => {
    $('#artifactPreview').hidden = true;
    const pre = $('#artifactCode');
    pre.hidden = false;
    pre.innerHTML = `<code>${highlight(code, lang)}</code>`;
    $$('#artifactTabs button').forEach((b) => b.classList.toggle('is-active', !b.dataset.tab));
  };
  const showPreview = () => {
    $('#artifactCode').hidden = true;
    const frame = $('#artifactPreview');
    frame.hidden = false;
    frame.srcdoc = isWeb === true && !/^(svg)$/i.test(lang) && !/^<!doctype/i.test(code) && /<html/i.test(code) === false
      ? code
      : code;
    $$('#artifactTabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'preview'));
  };

  showCode();
  $$('#artifactTabs button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.tab === 'preview') showPreview(); else showCode();
  }));
}

function closeArtifact() {
  $('#artifact').hidden = true;
  $('#app').classList.remove('has-artifact');
  state.artifact = null;
}

/* ─────────────────────────────────────────────────────────────────── handlers */
function autosize() {
  const el = $('#input');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 210)}px`;
  const btn = $('#sendBtn');
  if (btn && !state.streaming) btn.disabled = !el.value.trim() && !state.attachments.length;
}

function codeBlockText(id) {
  const src = document.querySelector(`[data-src="${id}"]`);
  if (src) return src.value;
  const code = document.querySelector(`[data-code-id="${id}"] code`);
  return code ? code.textContent : '';
}

function wireGlobalEvents() {
  // language toggle
  document.addEventListener('click', (e) => {
    const langBtn = e.target.closest('[data-lang-toggle]');
    if (langBtn) {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      applyLang();
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.act;

    if (act === 'delete-conv') {
      deleteConversation(actBtn.dataset.id).catch(() => {});
      return;
    }
    if (act === 'copy-code') {
      const text = codeBlockText(actBtn.dataset.target);
      navigator.clipboard.writeText(text).then(() => toast(t.copied), () => {});
      return;
    }
    if (act === 'download-code') {
      const text = codeBlockText(actBtn.dataset.target);
      const lang = actBtn.dataset.lang || 'txt';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kosmos-${Date.now()}.${/^(html|xml|svg)$/i.test(lang) ? 'html' : lang === 'python' ? 'py' : lang || 'txt'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return;
    }
    if (act === 'open-code') {
      openArtifact(actBtn.closest('.code-card').querySelector('code'));
      return;
    }
    if (act === 'copy-msg') {
      const idx = Number(actBtn.dataset.index);
      navigator.clipboard.writeText(state.messages[idx]?.content || '').then(() => toast(t.copied), () => {});
      return;
    }
    if (act === 'regen') {
      const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
      if (lastUser) send(lastUser.content);
      return;
    }
  });

  // login
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const errBox = $('#loginError');
    errBox.hidden = true;
    btn.disabled = true;
    try {
      await api('/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#password').value, persistent: $('#persistent').checked })
      });
      $('#password').value = '';
      showApp();
      await checkAuth();
    } catch (err) {
      errBox.hidden = false;
      errBox.textContent = err.status === 429 ? t.tooMany : (err.body && state.lang === 'ar' && err.body.messageAr) || t.wrongPassword;
      $('#password').select();
    } finally {
      btn.disabled = false;
    }
  });

  // logout
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
    showGate();
  });

  // composer
  const form = $('#composer');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.streaming) { state.abort?.abort(); return; }
    send();
  });

  const input = $('#input');
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!state.streaming) send();
    }
  });

  $('#sendBtn').addEventListener('click', (e) => {
    if (state.streaming) {
      e.preventDefault();
      state.abort?.abort();
    }
  });

  // attachments
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => {
    handleFiles([...e.target.files]).catch(() => {});
    e.target.value = '';
  });

  // drag & drop
  const dropZone = $('#chatScroll');
  ['dragover', 'drop'].forEach((type) => dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'drop' && e.dataTransfer?.files?.length) handleFiles([...e.dataTransfer.files]);
  }));

  // paste image
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });

  // modes
  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // new chat
  $('#newChat').addEventListener('click', () => { newChat(); $('#sidebar').classList.remove('is-open'); });

  // sidebar nav
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => {
    const view = b.dataset.view;
    $$('.nav-item').forEach((x) => x.classList.toggle('is-active', x === b));
    $('#convList').hidden = view !== 'chat';
    $('#projectList').hidden = view !== 'projects';
    $('#newProjectBtn').hidden = view !== 'projects';
    if (view === 'projects') loadProjects();
  }));

  // projects
  $('#closeProjectModal').addEventListener('click', () => { $('#projectModal').hidden = true; });
  $('#projectModal').addEventListener('click', (e) => {
    if (e.target.id === 'projectModal') $('#projectModal').hidden = true;
  });

  // mobile sidebar
  $('#openSidebar').addEventListener('click', () => $('#sidebar').classList.add('is-open'));
  $('#closeSidebar').addEventListener('click', () => $('#sidebar').classList.remove('is-open'));

  // artifact tools
  $('#artifactClose').addEventListener('click', closeArtifact);
  $('#artifactCopy').addEventListener('click', () => {
    if (state.artifact) navigator.clipboard.writeText(state.artifact.code).then(() => toast(t.copied), () => {});
  });
  $('#artifactDownload').addEventListener('click', () => {
    if (!state.artifact) return;
    const ext = /^(html|xml|svg)$/i.test(state.artifact.lang) ? 'html' : (state.artifact.lang || 'txt');
    const blob = new Blob([state.artifact.code], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kosmos-${Date.now()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#projectModal').hidden) $('#projectModal').hidden = true;
      else if (state.artifact) closeArtifact();
      else if (state.streaming) state.abort?.abort();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      newChat();
    }
  });

  // new project button lives in the markup so i18n can translate it
  $('#newProjectBtn').addEventListener('click', () => openProjectModal(null));

  // theme follows the OS on first visit
  if (!localStorage.getItem('kosmos.theme')) {
    state.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme();
}

/* ────────────────────────────────────────────── activity log + prompts */
// A small local "activity" trail: files you touched and prompts you sent, so the
// sidebar can offer them back. Stored in localStorage only — nothing leaves the
// browser.
function logActivity(kind, label) {
  try {
    const key = 'kosmos.activity';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    items.unshift({ kind, label: String(label).slice(0, 120), at: Date.now() });
    localStorage.setItem(key, JSON.stringify(items.slice(0, 60)));
  } catch { /* storage full or blocked */ }
}

function readActivity() {
  try {
    return JSON.parse(localStorage.getItem('kosmos.activity') || '[]');
  } catch {
    return [];
  }
}

function rememberPrompt(text, mode) {
  try {
    const key = 'kosmos.prompts';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const entry = { text: String(text).slice(0, 300), mode, at: Date.now() };
    const dedup = items.filter((i) => i.text !== entry.text);
    dedup.unshift(entry);
    localStorage.setItem(key, JSON.stringify(dedup.slice(0, 30)));
  } catch { /* ignore */ }
}

function readPrompts() {
  try {
    return JSON.parse(localStorage.getItem('kosmos.prompts') || '[]');
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────── boot */
// A tiny debug handle: inspect the client from the console, and lets the
// automated UI test assert on real state instead of guessing from the DOM.
window.kosmos = { state, renderMarkdown, I18N };

async function boot() {
  applyTheme();
  applyLang();
  wireGlobalEvents();
  renderChips();
  updateWelcome();
  await checkAuth();
  pollModel();
}

boot();
