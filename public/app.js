/* =========================================================
   Kosmos Code — front-end
   ========================================================= */
(() => {
  'use strict';

  // -------------------------------------------------------
  // Elements
  // -------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const gate = $('#gate');
  const app = $('#app');
  const loginForm = $('#login-form');
  const passwordInput = $('#password');
  const loginError = $('#login-error');
  const loginBtn = $('#login-btn');
  const messagesEl = $('#messages');
  const inputEl = $('#input');
  const sendBtn = $('#send');
  const segBtns = document.querySelectorAll('.seg-btn');
  const historyList = $('#history-list');
  const modelStatusText = $('#model-status-text');
  const modelStatusDot = document.querySelector('#model-status .dot');
  const engineBadgeState = $('#engine-badge-state');
  const statsBadge = $('#stats-badge');
  const sidebar = document.querySelector('.sidebar');

  // -------------------------------------------------------
  // i18n
  // -------------------------------------------------------
  const I18N = {
    ar: {
      tagline: 'مساعد البرمجة بالذكاء الاصطناعي · نموذج Qwen3 حقيقي يعمل محلياً',
      passwordLabel: 'كلمة السر',
      enter: 'دخول',
      protected: 'محمي بكلمة سر',
      brandSub: 'بيئة برمجة بالذكاء الاصطناعي',
      newChat: 'محادثة جديدة',
      history: 'المحادثات',
      modelTitle: 'النموذج',
      modelName: 'الاسم',
      modelQuant: 'التكميم',
      modelEngine: 'المشغّل',
      modelCtx: 'السياق',
      loading: 'جارٍ تحميل النموذج…',
      loadingShort: 'يحمّل…',
      ready: 'جاهز',
      readyShort: 'جاهز',
      logout: 'خروج',
      welcomeTitle: 'مساحة العمل',
      welcomeSub: 'اكتب طلبك وسيولّد النموذج الكود',
      modeCode: 'توليد كود',
      modeExplain: 'شرح',
      modeDebug: 'تصحيح',
      emptyTitle: 'ماذا نبرمج اليوم؟',
      emptyText: 'اطلب كوداً بلغتك المفضلة، أو الصق كوداً ليشرحه أو يصلح أخطاءه النموذج المحلي Qwen3.',
      placeholder: 'اكتب طلبك… مثال: اكتب دالة بايثون لحساب تسلسل فيبوناتشي مع اختبارات',
      send: 'إرسال',
      previewTitle: 'معاينة مباشرة',
      copy: 'نسخ', copied: 'تم النسخ ✓', download: 'تنزيل', run: 'تشغيل',
      you: 'أنت', assistant: 'Kosmos',
      thinking: 'النموذج يفكّر…',
      noHistory: 'لا توجد محادثات بعد',
      stopGen: 'إيقاف',
      regenerate: 'إعادة التوليد',
      modelLoading: 'النموذج يُحمَّل الآن على الخادم… سيبدأ الرد خلال لحظات.',
      newBadge: 'محادثة',
      errorGeneric: 'حدث خطأ. حاول مرة أخرى.',
      loggedOut: 'تم تسجيل الخروج',
      noModel: 'النموذج غير جاهز',
      prompts: [],
    },
    en: {
      tagline: 'AI coding assistant · real Qwen3 model running locally',
      passwordLabel: 'Password',
      enter: 'Sign in',
      protected: 'Password protected',
      brandSub: 'AI-powered coding workspace',
      newChat: 'New chat',
      history: 'Conversations',
      modelTitle: 'Model',
      modelName: 'Name',
      modelQuant: 'Quantization',
      modelEngine: 'Engine',
      modelCtx: 'Context',
      loading: 'Loading model…',
      loadingShort: 'loading…',
      ready: 'Ready',
      readyShort: 'ready',
      logout: 'Sign out',
      welcomeTitle: 'Workspace',
      welcomeSub: 'Describe what you need and the model writes the code',
      modeCode: 'Generate',
      modeExplain: 'Explain',
      modeDebug: 'Fix bugs',
      emptyTitle: 'What are we building today?',
      emptyText: 'Ask for code in any language, or paste code for the local Qwen3 model to explain or fix.',
      placeholder: 'Ask for code… e.g. write a Python function for the Fibonacci sequence with tests',
      send: 'Send',
      previewTitle: 'Live preview',
      copy: 'Copy', copied: 'Copied ✓', download: 'Download', run: 'Run',
      you: 'You', assistant: 'Kosmos',
      thinking: 'Model is thinking…',
      noHistory: 'No conversations yet',
      stopGen: 'Stop',
      regenerate: 'Regenerate',
      modelLoading: 'The model is loading on the server… the reply will start in a moment.',
      newBadge: 'Chat',
      errorGeneric: 'Something went wrong. Please try again.',
      loggedOut: 'Signed out',
      noModel: 'Model not ready',
      prompts: [],
    },
  };

  const SUGGESTION_PROMPTS = {
    ar: [
      'اكتب دالة بايثون لقراءة ملف CSV وتحليل أعمدته باستخدام pandas',
      'اكتب صفحة HTML وCSS لبطاقة تسجيل دخول عصرية مع تأثيرات حركة',
      'اكتب مكوّن React لعدّاد بسيط يحفظ القيمة في localStorage',
      'اشرح لي هذا الكود وابحث عن الأخطاء فيه:\n\nfunction sum(a){ return a.reduce((x,y)=>x+y) }',
    ],
    en: [
      'Write a Python function that reads a CSV file and analyzes its columns with pandas',
      'Write an HTML/CSS sign-in card with modern styling and animations',
      'Write a React component for a simple counter that persists in localStorage',
      'Explain this code and find the bugs:\n\nfunction sum(a){ return a.reduce((x,y)=>x+y) }',
    ],
  };

  let lang = 'ar';
  try {
    lang = localStorage.getItem('kosmos_lang') || 'ar';
  } catch {}
  const t = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en[k] || k);

  function applyLang(next) {
    lang = next;
    try {
      localStorage.setItem('kosmos_lang', lang);
    } catch {}
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (I18N[lang][key]) el.textContent = I18N[lang][key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll('.chip').forEach((chip, i) => {
      chip.textContent = SUGGESTION_PROMPTS[lang][i];
    });
    $('#lang-label').textContent = lang === 'ar' ? 'English' : 'العربية';
    updateEngineBadge();
  }

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  const state = {
    authed: false,
    model: { name: 'Qwen3-0.6B', quant: 'Q4_K_M', engine: 'llama.cpp', ctx: 4096 },
    engine: { ready: false, loading: true, error: null },
    conversations: [],
    currentId: null,
    mode: 'code',
    token: '',
    streaming: false,
    abort: null,
  };

  // -------------------------------------------------------
  // Markdown + code rendering
  // -------------------------------------------------------
  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const KEYWORDS = new Set(
    ('def class return if elif else for while in not and or import from as with try except finally ' +
      'lambda pass break continue yield global nonlocal assert del raise True False None print ' +
      'function const let var new typeof instanceof this async await yield throw catch switch case default ' +
      'do void int float double char bool string struct enum public private protected static final ' +
      'include select from where join inner left right group by order having insert update delete create ' +
      'table values into set null true false undefined export default extends implements interface type ' +
      'package go func chan defer range map struct fn impl match pub use mod self echo typedef sizeof ' +
      'elseif end then begin procedure declare').split(/\s+/)
  );

  function highlight(code, langName) {
    const l = (langName || '').toLowerCase();
    const hashComment = ['python', 'py', 'bash', 'sh', 'shell', 'yaml', 'yml', 'ruby', 'rb', 'toml', 'makefile', 'r'].includes(l);
    const parts = [];
    const re = new RegExp(
      [
        hashComment ? '#[^\\n]*' : null,
        '\\/\\/[^\\n]*', '\\/\\*[\\s\\S]*?\\*\\/', '--[^\\n]*',
        '`(?:\\\\.|[^`\\\\])*`', '"(?:\\\\.|[^"\\\\\\n])*"', "'(?:\\\\.|[^'\\\\\\n])*'",
        '\\b\\d+(?:\\.\\d+)?\\b',
        '[A-Za-z_$][\\w$]*(?=\\s*\\()',
        '[A-Za-z_$][\\w$]*',
      ]
        .filter(Boolean)
        .join('|'),
      'g'
    );
    let last = 0;
    let m;
    while ((m = re.exec(code))) {
      if (m.index > last) parts.push(escapeHtml(code.slice(last, m.index)));
      const tok = m[0];
      let cls = '';
      if (/^(#|\/\/|\/\*|--)/.test(tok)) cls = 'tk-com';
      else if (/^[`"']/.test(tok)) cls = 'tk-str';
      else if (/^\d/.test(tok)) cls = 'tk-num';
      else if (KEYWORDS.has(tok)) cls = 'tk-key';
      else if (code.slice(m.index + tok.length).trimStart().startsWith('(')) cls = 'tk-fn';
      parts.push(cls ? `<span class="${cls}">${escapeHtml(tok)}</span>` : escapeHtml(tok));
      last = m.index + tok.length;
    }
    parts.push(escapeHtml(code.slice(last)));
    return parts.join('');
  }

  // Strip Qwen3 reasoning blocks from the visible answer
  const THINK_OPEN_PREFIXES = ['<think', '<thin', '<thi', '<th', '<t'];
  function stripThinking(text) {
    let out = String(text).replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    const open = out.search(/<think\b/i);
    if (open >= 0) out = out.slice(0, open);
    for (const p of THINK_OPEN_PREFIXES) {
      if (out.endsWith(p) && out.length > p.length) {
        out = out.slice(0, -p.length);
        break;
      }
    }
    return out.replace(/^\s+/, '');
  }

  function renderMarkdown(raw) {
    const blocks = [];
    let text = String(raw || '').replace(/\r\n/g, '\n');
    // Extract fenced code blocks
    text = text.replace(/```([\w+#.-]*)\n?([\s\S]*?)```/g, (_, langName, code) => {
      const idx = blocks.length;
      blocks.push({ lang: (langName || '').trim(), code: code.replace(/\n$/, '') });
      return `\u0000BLOCK${idx}\u0000`;
    });

    let html = escapeHtml(text);

    // headings
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h2>$1</h2>');
    // bold / italic / inline code
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
    // links
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // blockquote
    html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    // lists
    html = html.replace(/(?:^|\n)((?:[-*+] .*(?:\n|$))+)/g, (m, group) => {
      const items = group.trim().split('\n').map((l) => `<li>${l.replace(/^[-*+]\s+/, '')}</li>`).join('');
      return `\n<ul>${items}</ul>`;
    });
    html = html.replace(/(?:^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m, group) => {
      const items = group.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\.\s+/, '')}</li>`).join('');
      return `\n<ol>${items}</ol>`;
    });
    // paragraphs
    html = html
      .split(/\n{2,}/)
      .map((chunk) => {
        const c = chunk.trim();
        if (!c) return '';
        if (/^<(h\d|ul|ol|blockquote|pre|table)/.test(c) || /^\u0000BLOCK\d+\u0000$/.test(c)) return c;
        return `<p>${c.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    // Re-inject code blocks
    html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (_, n) => {
      const b = blocks[Number(n)];
      const runnable = /^(html|htm|css|js|javascript)$/i.test(b.lang) || /^</.test(b.code.trim().slice(0, 1)) && b.lang === '';
      const id = `blk${Math.random().toString(36).slice(2, 8)}`;
      return `
<div class="code-block" data-lang="${escapeHtml(b.lang || 'text')}" data-code-id="${id}">
  <div class="code-head">
    <span class="lang">${escapeHtml(b.lang || 'code')}</span>
    <div class="code-tools">
      ${runnable ? `<button data-act="run">▶ ${t('run')}</button>` : ''}
      <button data-act="copy">⧉ ${t('copy')}</button>
      <button data-act="download">⤓ ${t('download')}</button>
    </div>
  </div>
  <pre><code>${highlight(b.code, b.lang)}</code></pre>
</div>`;
    });
    return html;
  }

  // Store raw code per rendered block for copy/run/download
  const codeStore = new Map();

  function hydrateCodeActions(container) {
    container.querySelectorAll('.code-block').forEach((block, i) => {
      if (block.dataset.hydrated) return;
      block.dataset.hydrated = '1';
      const codeEl = block.querySelector('code');
      const raw = codeEl.textContent;
      const langName = block.dataset.lang || 'text';
      const key = `${i}_${langName}_${raw.length}`;
      codeStore.set(key, { code: raw, lang: langName });
      block.querySelectorAll('.code-tools button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'copy') {
            navigator.clipboard.writeText(raw).then(() => {
              const original = btn.textContent;
              btn.textContent = `✓ ${t('copied')}`;
              setTimeout(() => (btn.textContent = original), 1500);
            });
          } else if (act === 'download') {
            const ext = {
              python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
              html: 'html', css: 'css', sql: 'sql', cpp: 'cpp', c: 'c', csharp: 'cs', cs: 'cs',
              php: 'php', java: 'java', go: 'go', rust: 'rs', bash: 'sh', sh: 'sh', json: 'json', yaml: 'yml',
            }[langName.toLowerCase()] || 'txt';
            const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `kosmos-code.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          } else if (act === 'run') {
            runCode(raw, langName);
          }
        });
      });
    });
  }

  function runCode(code, langName) {
    const modal = $('#preview-modal');
    const frame = $('#preview-frame');
    const l = langName.toLowerCase();
    let doc;
    if (l === 'html' || l === 'htm') {
      doc = code;
    } else if (l === 'css') {
      doc = `<!doctype html><html><head><style>${code}</style></head><body><h1>Heading</h1><p>Paragraph <a href="#">link</a></p><button>Button</button><div class="card">Card</div></body></html>`;
    } else {
      doc = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:ui-monospace,monospace;background:#0b1020;color:#d6e2ff;padding:14px;margin:0}
        .ok{color:#2ee6a8}.err{color:#ff6b6b}.log{color:#8894b3;border-bottom:1px dashed #1e2942;padding:4px 0}
      </style></head><body><div id="out"></div>
      <script>
        const out=document.getElementById('out');
        function print(cls,args){const d=document.createElement('div');d.className='log '+cls;d.textContent=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ');out.appendChild(d);}
        console.log=(...a)=>print('log',a);console.info=(...a)=>print('log',a);
        console.warn=(...a)=>print('log',a);console.error=(...a)=>print('err',a);
        window.onerror=(m)=>print('err',[m]);
        try{\n${code}\n}catch(e){print('err',[e.message])}
      <\/script></body></html>`;
    }
    frame.srcdoc = doc;
    modal.classList.remove('hidden');
  }

  // -------------------------------------------------------
  // Conversations
  // -------------------------------------------------------
  const STORE_KEY = 'kosmos_conversations_v1';

  function loadConversations() {
    try {
      state.conversations = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch {
      state.conversations = [];
    }
    if (!Array.isArray(state.conversations)) state.conversations = [];
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.conversations.slice(-30)));
    } catch {}
  }

  const currentConv = () => state.conversations.find((c) => c.id === state.currentId);

  // Session token fallback (used when cookies are blocked inside preview iframes)
  function getToken() {
    if (state.token) return state.token;
    try {
      return sessionStorage.getItem('kosmos_token') || localStorage.getItem('kosmos_token') || '';
    } catch {
      return '';
    }
  }
  function setToken(tok) {
    if (!tok) return;
    state.token = tok;
    try {
      localStorage.setItem('kosmos_token', tok);
      sessionStorage.setItem('kosmos_token', tok);
    } catch {}
  }
  function clearToken() {
    state.token = '';
    try {
      localStorage.removeItem('kosmos_token');
      sessionStorage.removeItem('kosmos_token');
    } catch {}
  }
  function apiFetch(url, opts = {}) {
    const tok = getToken();
    opts.credentials = 'same-origin';
    opts.headers = { ...(opts.headers || {}), 'Cache-Control': 'no-cache' };
    if (tok) opts.headers.Authorization = `Bearer ${tok}`;
    return fetch(url, opts);
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (!state.conversations.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = t('noHistory');
      historyList.appendChild(li);
      return;
    }
    [...state.conversations].reverse().forEach((conv) => {
      const li = document.createElement('li');
      if (conv.id === state.currentId) li.classList.add('active');
      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = conv.title || t('newBadge');
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        state.conversations = state.conversations.filter((c) => c.id !== conv.id);
        if (state.currentId === conv.id) newChat();
        saveConversations();
        renderHistory();
      });
      li.appendChild(txt);
      li.appendChild(del);
      li.addEventListener('click', () => openConversation(conv.id));
      historyList.appendChild(li);
    });
  }

  function newChat() {
    state.currentId = null;
    messagesEl.innerHTML = '';
    showEmptyState();
    renderHistory();
    inputEl.value = '';
    autoGrow();
    updateSendState();
    inputEl.focus();
  }

  function showEmptyState() {
    if (messagesEl.querySelector('.msg')) {
      messagesEl.querySelectorAll('.empty').forEach((e) => e.remove());
      return;
    }
    messagesEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'empty';
    wrap.id = 'empty-state';
    wrap.innerHTML = `
      <div class="empty-icon">⚡</div>
      <h2>${t('emptyTitle')}</h2>
      <p>${t('emptyText')}</p>
      <div class="suggestions">
        ${SUGGESTION_PROMPTS[lang].map((p) => `<button class="chip"></button>`).join('')}
      </div>`;
    wrap.querySelectorAll('.chip').forEach((chip, i) => {
      chip.textContent = SUGGESTION_PROMPTS[lang][i];
      chip.addEventListener('click', () => {
        inputEl.value = SUGGESTION_PROMPTS[lang][i];
        autoGrow();
        updateSendState();
        inputEl.focus();
      });
    });
    messagesEl.appendChild(wrap);
  }

  function openConversation(id) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return;
    state.currentId = id;
    messagesEl.innerHTML = '';
    conv.messages.forEach((m) => appendMessage(m.role, m.content, { store: false }));
    renderHistory();
    scrollToBottom();
    closeSidebarOnMobile();
  }

  function appendMessage(role, content, opts = {}) {
    messagesEl.querySelectorAll('.empty').forEach((e) => e.remove());
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '👤' : '⚡';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const head = document.createElement('div');
    head.className = 'msg-head';
    head.innerHTML = `<b>${role === 'user' ? t('you') : t('assistant')}</b><span>${
      role === 'assistant' ? `${state.model.name} · ${state.model.quant}` : new Date().toLocaleTimeString(lang === 'ar' ? 'ar-DZ' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    }</span>`;
    const body = document.createElement('div');
    body.className = 'md';
    if (role === 'user') {
      body.style.whiteSpace = 'pre-wrap';
      body.textContent = content;
    } else {
      body.innerHTML = content ? renderMarkdown(content) : '';
      hydrateCodeActions(body);
    }
    bubble.appendChild(head);
    bubble.appendChild(body);
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();

    if (opts.store !== false && state.currentId) {
      const conv = currentConv();
      if (conv) {
        conv.messages.push({ role, content });
        saveConversations();
      }
    }
    return { wrap, body };
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // -------------------------------------------------------
  // Chat streaming
  // -------------------------------------------------------
  function updateSendState() {
    if (state.streaming) {
      sendBtn.disabled = false;
      sendBtn.classList.add('stop');
      sendBtn.innerHTML = `<span>${t('stopGen')}</span> <b>■</b>`;
      return;
    }
    sendBtn.classList.remove('stop');
    sendBtn.innerHTML = `<span>${t('send')}</span> <b>➤</b>`;
    sendBtn.disabled = !inputEl.value.trim() || !state.engine.ready;
  }

  function buildUserContent(text) {
    const codeLang = $('#code-lang').value;
    if (codeLang && codeLang !== 'auto' && state.mode !== 'explain' && state.mode !== 'debug') {
      return `[Target language: ${codeLang}]\n${text}`;
    }
    return text;
  }

  async function sendMessage() {
    if (state.streaming) {
      if (state.abort) state.abort.abort();
      return;
    }
    const text = inputEl.value.trim();
    if (!text) return;
    if (!state.engine.ready) {
      appendMessage('assistant', t('modelLoading'));
      return;
    }

    if (!state.currentId) {
      const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      state.conversations.push({ id, title: text.slice(0, 60), messages: [], ts: Date.now() });
      state.currentId = id;
    }
    const conv = currentConv();
    const payloadMessages = [...conv.messages, { role: 'user', content: text }];

    appendMessage('user', text);
    inputEl.value = '';
    autoGrow();
    state.streaming = true;
    updateSendState();

    const { body } = appendMessage('assistant', '');
    body.innerHTML = '<div class="thinking"><i></i><i></i><i></i></div>';
    const headMsg = body.closest('.bubble').querySelector('.msg-head span');

    const controller = new AbortController();
    state.abort = controller;
    let full = '';
    let pending = false;

    const paint = () => {
      pending = false;
      body.innerHTML = renderMarkdown(stripThinking(full)) + '<span class="cursor"></span>';
      hydrateCodeActions(body);
      if (full.length > 40) scrollToBottom();
    };

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payloadMessages,
          mode: state.mode,
          lang,
          maxTokens: 700,
          temperature: 0.55,
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        state.authed = false;
        showGate();
        return;
      }
      if (!res.ok || !res.body) {
        let errInfo = {};
        try {
          errInfo = await res.json();
        } catch {}
        body.innerHTML = `<p style="color:var(--warn)">${escapeHtml(
          errInfo.message || (errInfo.error === 'model_loading' ? t('modelLoading') : t('errorGeneric'))
        )}</p>`;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            let evt;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (evt.delta) {
              full += evt.delta;
              if (!pending) {
                pending = true;
                requestAnimationFrame(paint);
              }
            } else if (evt.done) {
              if (evt.stats) {
                const s = evt.stats;
                headMsg.textContent = `${(s.tokens || 0)} tok · ${s.tokPerSec || '—'} tok/s · ${s.elapsed.toFixed(1)}s`;
                statsBadge.textContent = `${s.tokPerSec || '—'} tok/s`;
              }
            } else if (evt.error) {
              full += full ? `\n\n> ⚠ ${evt.message}` : `⚠ ${evt.message}`;
            }
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        full += full ? `\n\n> ⚠ ${t('errorGeneric')}` : `⚠ ${t('errorGeneric')}`;
      }
    } finally {
      state.streaming = false;
      state.abort = null;
      const clean = stripThinking(full);
      body.innerHTML = clean ? renderMarkdown(clean) : `<p class="muted">${t('errorGeneric')}</p>`;
      hydrateCodeActions(body);
      if (stripThinking(full)) {
        const c = currentConv();
        if (c) {
          c.messages.push({ role: 'assistant', content: stripThinking(full) });
          if (c.title && c.title.length > 60) c.title = c.title.slice(0, 60);
          saveConversations();
        }
        if (!state.currentId) {
          const id = `c_${Date.now()}`;
          state.conversations.push({ id, title: text.slice(0, 60), messages: [], ts: Date.now() });
          state.currentId = id;
        }
        renderHistory();
      }
      updateSendState();
      scrollToBottom();
    }
  }

  // -------------------------------------------------------
  // Engine status polling
  // -------------------------------------------------------
  function updateEngineBadge() {
    const ready = state.engine.ready;
    engineBadgeState.textContent = ready ? t('readyShort') : state.engine.error ? t('noModel') : t('loadingShort');
    modelStatusDot.className = `dot ${ready ? 'ok' : state.engine.error ? 'err' : ''}`;
    modelStatusText.textContent = ready ? t('ready') : state.engine.error ? state.engine.error.slice(0, 40) : t('loading');
    $('#engine-badge-model').textContent = state.model.name;
    updateSendState();
  }

  async function pollStatus() {
    try {
      const res = await apiFetch('/api/me');
      const data = await res.json();
      state.authed = data.authed;
      if (data.model) state.model = { ...state.model, ...data.model };
      if (data.engine) state.engine = data.engine;
      $('#m-name').textContent = state.model.name;
      $('#m-quant').textContent = state.model.quant;
      $('#m-ctx').textContent = state.model.ctx;
      $('#gate-model').textContent = `${state.model.name} · ${state.model.quant}`;
      updateEngineBadge();
      if (!state.engine.ready && !state.engine.error) setTimeout(pollStatus, 2500);
    } catch {
      setTimeout(pollStatus, 5000);
    }
  }

  // -------------------------------------------------------
  // Auth
  // -------------------------------------------------------
  function showGate() {
    gate.classList.remove('hidden');
    app.classList.add('hidden');
    setTimeout(() => passwordInput.focus(), 120);
  }

  function showApp() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    loadConversations();
    renderHistory();
    newChat();
    pollStatus();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginBtn.disabled = true;
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setToken(data.token || '');
        passwordInput.value = '';
        showApp();
      } else if (res.status === 429) {
        loginError.textContent = lang === 'ar' ? 'محاولات كثيرة، حاول بعد قليل.' : 'Too many attempts, try later.';
      } else {
        loginError.textContent = lang === 'ar' ? 'كلمة السر غير صحيحة' : 'Wrong password';
        passwordInput.select();
      }
    } catch {
      loginError.textContent = t('errorGeneric');
    } finally {
      loginBtn.disabled = false;
    }
  });

  $('#toggle-pw').addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.focus();
  });

  $('#logout').addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    state.authed = false;
    showGate();
  });

  // -------------------------------------------------------
  // UI events
  // -------------------------------------------------------
  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 210) + 'px';
  }

  inputEl.addEventListener('input', () => {
    autoGrow();
    updateSendState();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled || state.streaming) sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  segBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      segBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      const map = { code: 'welcomeSub', explain: 'modeExplain', debug: 'modeDebug' };
      $('#topbar-sub').textContent = btn.dataset.mode === 'code' ? t('welcomeSub') : t(map[state.mode]);
      inputEl.focus();
    })
  );

  $('#new-chat').addEventListener('click', () => {
    newChat();
    closeSidebarOnMobile();
  });

  $('#lang-toggle').addEventListener('click', () => {
    applyLang(lang === 'ar' ? 'en' : 'ar');
    if (!messagesEl.querySelector('.msg')) showEmptyState();
    updateEngineBadge();
  });

  $('#close-preview').addEventListener('click', () => {
    $('#preview-modal').classList.add('hidden');
    $('#preview-frame').srcdoc = '';
  });

  $('#preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') {
      $('#preview-modal').classList.add('hidden');
      $('#preview-frame').srcdoc = '';
    }
  });

  $('#menu-btn').addEventListener('click', () => {
    sidebar.classList.add('open');
    $('#mobile-overlay').classList.remove('hidden');
  });

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 860) {
      sidebar.classList.remove('open');
      $('#mobile-overlay').classList.add('hidden');
    }
  }
  $('#mobile-overlay').addEventListener('click', closeSidebarOnMobile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebarOnMobile();
      $('#preview-modal').classList.add('hidden');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      inputEl.focus();
    }
  });

  // -------------------------------------------------------
  // Boot
  // -------------------------------------------------------
  (async function boot() {
    applyLang(lang);
    updateSendState();
    try {
      const res = await apiFetch('/api/me');
      const data = await res.json();
      state.authed = data.authed;
      if (data.model) state.model = { ...state.model, ...data.model };
      if (data.engine) state.engine = data.engine;
      $('#m-name').textContent = state.model.name;
      $('#m-quant').textContent = state.model.quant;
      $('#m-ctx').textContent = state.model.ctx;
      $('#gate-model').textContent = `${state.model.name} · ${state.model.quant}`;
    } catch {}
    if (state.authed) showApp();
    else showGate();
    updateEngineBadge();
  })();
})();
