# VOC System — Vercel Deployment

## โครงสร้างไฟล์

```
voc-vercel/
├── vercel.json              ← routing config
├── package.json
├── api/                     ← Backend (Serverless Functions)
│   ├── _sheets.js           ← shared helper (Google Sheets client)
│   ├── auth.js              ← POST /api/auth   (login, register)
│   ├── submit.js            ← POST /api/submit (ส่งเรื่อง)
│   ├── tickets.js           ← GET/POST /api/tickets
│   └── dashboard.js         ← GET /api/dashboard
└── public/                  ← Frontend (static files)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## หลักการเปลี่ยนจาก Google Apps Script → Vercel

| Google Apps Script | Vercel |
|---|---|
| `google.script.run.loginUser(u,p)` | `POST /api/auth` `{action:'loginUser'}` |
| `google.script.run.handleSubmit(payload)` | `POST /api/submit` `{...payload}` |
| `google.script.run.getMyTicketsByUsername(u)` | `GET /api/tickets?action=byUsername&username=u` |
| `google.script.run.getTicketById(id)` | `GET /api/tickets?action=byId&id=VOC-xxx` |
| `google.script.run.getAllTickets(filter)` | `GET /api/tickets?action=all&filter=pending` |
| `google.script.run.updateTicket(...)` | `POST /api/tickets` `{action:'update',...}` |
| `google.script.run.getDashboardStats()` | `GET /api/dashboard` |

---

## ขั้นตอน Deploy

### 1. สร้าง Google Service Account
1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)
2. สร้าง Project ใหม่ (หรือใช้อันเดิม)
3. เปิด **Google Sheets API**
4. ไปที่ IAM → Service Accounts → สร้างใหม่
5. Download JSON key
6. แชร์ Google Sheet ให้ service account email (Editor permission)

### 2. ตั้ง Environment Variables ใน Vercel
```
GOOGLE_SERVICE_ACCOUNT_EMAIL = your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY            = -----BEGIN PRIVATE KEY-----\nMII...
SPREADSHEET_ID                = 1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw
```
> ⚠️ Private key ต้องใส่ `\n` แทน newline จริง

### 3. Deploy
```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## ทดสอบ Local
```bash
npm install
vercel dev
# เปิด http://localhost:3000
```
