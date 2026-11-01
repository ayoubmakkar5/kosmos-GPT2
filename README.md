# ⚡ Kosmos Code — مساعد البرمجة بالذكاء الاصطناعي

موقع برمجة كامل بالذكاء الاصطناعي، **محمي بكلمة سر**، ويشغّل **نموذج Qwen3 حقيقي** (الأوزان
الحقيقية لـ `Qwen/Qwen3-0.6B` بصيغة GGUF بكمّية `Q4_K_M`، ~484 ميغابايت) على **llama.cpp**
محلياً على المعالج — بدون أي واجهة API خارجية، أي أن النموذج يعمل فعلياً على الخادم.

> A password-protected AI coding web app powered by a **real local Qwen3 model**
> (`Qwen3-0.6B`, Q4_K_M GGUF) running on **llama.cpp**. No external AI API is used:
> inference happens on this machine.

---

## ✨ المزايا

| | |
|---|---|
| 🔐 **حماية بكلمة سر** | صفحة دخول، جلسة موقّعة بـ HMAC في كوكي `HttpOnly`، تحديد محاولات الدخول (10 محاولات / 10 دقائق لكل IP) |
| 🧠 **نموذج حقيقي** | `Qwen3-0.6B-Q4_K_M.gguf` يعمل عبر `llama-server` (متوافق مع OpenAI) |
| ⚡ **بثّ مباشر** | الرد يظهر حرفاً بحرف عبر SSE مع إحصاءات `tok/s` |
| 💬 **مساحة عمل** | محادثات محفوظة، أوضاع: توليد كود / شرح / تصحيح أخطاء، اختيار لغة الهدف |
| 🎨 **تلوين وتنسيق** | Markdown + تلوين برمجي للكود |
| 📋 **أدوات الكود** | نسخ، تنزيل الملف، و**تشغيل مباشر** لـ HTML/CSS/JS في معاينة معزولة (sandbox) |
| 🌐 **عربي/إنجليزي** | واجهة كاملة RTL/LTR مع زر تبديل |

---

## 🚀 التشغيل

```bash
# 1) بناء llama.cpp (مرة واحدة فقط — يأخذ بضع دقائق على CPU)
bash scripts/build-llama.sh

# 2) تنزيل أوزان النموذج الحقيقية (مرة واحدة، ~484MB، مع تحقّق SHA-256)
bash scripts/download-model.sh

# 3) تشغيل الموقع
APP_PASSWORD='كلمة_السر_الخاصة_بك' npm start
```

ثم افتح: <http://localhost:3000>

كلمة السر الافتراضية إن لم تضبط `APP_PASSWORD`: **`Kosmos@2026`**

> ⚠️ يُنصح دائماً بضبط `APP_PASSWORD` و`SESSION_SECRET` في بيئة الإنتاج.

---

## 🔧 متغيّرات البيئة

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3000` | منفذ الموقع |
| `HOST` | `0.0.0.0` | عنوان الاستماع |
| `APP_PASSWORD` | `Kosmos@2026` | كلمة سر الدخول (تُخزَّن كبصمة SHA-256 في الذاكرة) |
| `SESSION_SECRET` | عشوائي | مفتاح توقيع الجلسات (ثبّته لتبقى الجلسات بعد إعادة التشغيل) |
| `MODEL_PATH` | `models/Qwen3-0.6B-Q4_K_M.gguf` | مسار ملف GGUF |
| `MODEL_NAME` | `Qwen3-0.6B` | الاسم المعروض |
| `MODEL_QUANT` | `Q4_K_M` | التكميم المعروض |
| `CTX_SIZE` | `4096` | حجم السياق |
| `LLAMA_PORT` | `8080` | منفذ `llama-server` الداخلي |
| `LLAMA_SERVER_BIN` | `llama.cpp/build/bin/llama-server` | مسار ملف llama-server |

---

## 🧩 كيف يعمل

```
متصفح  ──HTTPS──▶  server.js (Node, صفر اعتماديات)
                     │  ├─ /api/login   → تحقّق كلمة السر + كوكي جلسة HMAC
                     │  ├─ /api/chat    → SSE بثّ الردود
                     │  └─ /api/me      → حالة النموذج
                     └── HTTP 127.0.0.1:8080 ──▶ llama-server ──▶ Qwen3-0.6B-Q4_K_M.gguf
```

* قالب المحادثة المستخدم هو قالب Qwen3 الأصلي (`<|im_start|>…<|im_end|>` مع `/no_think`).
* لا توجد أي اعتمادية على npm: الخادم مبني على `node:http` فقط.

## 📁 بنية المشروع

```
server.js               خادم Node (مصادقة + بثّ + تشغيل النموذج)
public/index.html       واجهة الموقع
public/styles.css       التصميم (داكن، RTL/LTR)
public/app.js           منطق الواجهة (بثّ، Markdown، تلوين، معاينة)
scripts/build-llama.sh  بناء llama.cpp
scripts/download-model.sh تنزيل أوزان Qwen3 الحقيقية والتحقق منها
models/                 ملف GGUF (غير مرفوع إلى Git)
```

## 🔐 ملاحظات أمنية

* كلمة السر تُقارن عبر بصمة SHA-256 بمقارنة زمنية ثابتة (`timingSafeEqual`).
* كوكي الجلسة `HttpOnly` + `SameSite=Lax`، ويُضاف `Secure` تلقائياً عند HTTPS.
* حدّ أقصى لحجم الطلب، وتحديد معدّل محاولات الدخول.
* معاينة الكود تعمل داخل `iframe` مع `sandbox="allow-scripts"` (بدون وصول للصفحة الأصلية).

## 📜 الترخيص

MIT — أوزان النموذج مملوكة لـ Alibaba Qwen وتخضع لترخيص Apache-2.0.
