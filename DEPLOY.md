# 🌍 نشر الموقع على الإنترنت

التطبيق مبني على **Node.js + llama.cpp + أوزان Qwen3-0.6B (GGUF)**، لذلك يحتاج استضافة
تدعم Docker أو Node مع ذاكرة **≥ 2 GB من RAM** (المرحلة الأولى من التحميل تحتاج ~1.5 GB).

> 🔐 لا تنسَ ضبط متغيّر البيئة `APP_PASSWORD` على الاستضافة، وإلا سيُستخدم الافتراضي
> `Kosmos@2026`.

---

## الخيار 1 — أي استضافة تدعم Docker (الأسهل والأنسب)

الـ `Dockerfile` الموجود في المستودع يبني llama.cpp، ينزّل أوزان Qwen3 الحقيقية،
ويشغّل الموقع على المنفذ `3000`.

```bash
docker build -t kosmos-code .
docker run -p 3000:3000 -e APP_PASSWORD='كلمتك-السرية' kosmos-code
```

على منصّات مثل **Render / Railway / Fly.io / Northflank / Koyeb**:

1. أنشئ خدمة جديدة من مستودع GitHub هذا.
2. اختر **Docker** (سيُكتشف `Dockerfile` تلقائياً).
3. أضف متغيّرات البيئة:
   * `APP_PASSWORD` = كلمة سرك
   * `SESSION_SECRET` = نص عشوائي طويل (اختياري لكن مستحسن)
4. الحجم الموصى به: **1 vCPU / 2 GB RAM** على الأقل.

### Render (Blueprint)

يوجد ملف `render.yaml` جاهز. من لوحة Render: **New → Blueprint → اختر هذا المستودع**،
ثم أدخل قيمة `APP_PASSWORD` عند الطلب.

### Fly.io

```bash
fly launch --no-deploy            # اختر اسم التطبيق
fly secrets set APP_PASSWORD='كلمتك-السرية'
fly deploy
```

### Railway

```bash
railway login
railway init
railway variables --set APP_PASSWORD='كلمتك-السرية'
railway up
```

---

## الخيار 2 — خادم VPS عادي (Ubuntu)

```bash
# على الخادم
sudo apt update && sudo apt install -y git cmake build-essential curl nodejs npm nginx
git clone <رابط-المستودع> kosmos-code && cd kosmos-code
bash scripts/build-llama.sh
bash scripts/download-model.sh

# خدمة systemd
sudo tee /etc/systemd/system/kosmos.service >/dev/null <<'EOF'
[Unit]
Description=Kosmos Code
After=network.target

[Service]
WorkingDirectory=/root/kosmos-code
Environment=PORT=3000
Environment=APP_PASSWORD=كلمتك-السرية
Environment=SESSION_SECRET=غيّر-هذا-النص
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now kosmos
```

ثم وكيل عكسي عبر Nginx (HTTPS):

```nginx
server {
  listen 80;
  server_name example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # مهم لبثّ الردود (SSE)
    proxy_read_timeout 300s;
  }
}
```

```bash
sudo certbot --nginx -d example.com
```

---

## ملاحظات الأداء

| المعالج | السرعة التقريبية |
|---|---|
| 2 vCPU | ~6–12 توكن/ثانية |
| 4 vCPU | ~15–25 توكن/ثانية |

النموذج `Qwen3-0.6B` يعمل على المعالج بكفاءة، والرد يبدأ عادةً بأقل من ثانية بعد التحميل
الأول (20–60 ثانية لتحميل الأوزان إلى الذاكرة).

---

## نشر المستودع على GitHub

المستودع الحالي: <https://github.com/ayoubmakkar5/kosmos-GPT2>

```bash
git add -A && git commit -m "Kosmos Code: AI coding site with local Qwen3 model"
git push origin HEAD
```

> ملف الأوزان `models/*.gguf` مستثنى من Git (462 MB). يُنزَّل تلقائياً بواسطة
> `scripts/download-model.sh` أو أثناء بناء صورة Docker.
