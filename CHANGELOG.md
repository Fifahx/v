# VOC System — บันทึกการแก้ไขและวิธี Integrate
## อัปเดตวันที่: พฤษภาคม 2568

---

## ข้อ 1: แก้ Bug "หมายเหตุทำให้ข้อมูลโผล่ที่คอลัมน์ R"

### สาเหตุที่แท้จริง
**Race Condition บน VOC_Counters sheet**

ใน `submit.js` บรรทัด 54:
```js
// ❌ โค้ดเดิม — ปัญหา
const [userId, ticketId] = await Promise.all([
  generateUserID(sheets), generateTicketId(sheets)
]);
```

`generateUserID()` และ `generateTicketId()` ทำงานพร้อมกันบน `VOC_Counters` sheet ทำให้:
1. ทั้งสองฟังก์ชัน อ่าน headers พร้อมกัน → `colIdx` ผิด
2. `generateUserID` เพิ่ม column `UserID_Counter` ไปที่ผิด index
3. `appendRow` ใน Sheets API ตีความ range ผิด → ข้อมูลเริ่มที่ column R แทน A

นอกจากนี้ `appendRow` เดิมใช้ `range: sheetName` (ไม่ระบุ column) → Sheets API อาจ append ที่ last used range

### วิธีแก้ (ใน `_sheets.js` และ `submit.js`)
```js
// ✅ โค้ดใหม่ _sheets.js
// 1. appendRow ระบุ column A ชัดเจน
await sheets.spreadsheets.values.append({
  range: `${sheetName}!A:A`,          // ← เพิ่ม !A:A
  insertDataOption: 'INSERT_ROWS',     // ← บังคับแทรกแถวใหม่
  ...
});

// 2. generateUserID ไม่ใช้ dynamic header (ป้องกัน race condition)
// นับ row จาก VOC_Users แทน counter
const validRows = data.slice(1).filter(r => r && r[0]);
return validRows.length + 1;
```

```js
// ✅ โค้ดใหม่ submit.js
// เรียก sequential ไม่ใช้ Promise.all
const userId   = await generateUserID(sheets);   // ← แยก await
const ticketId = await generateTicketId(sheets); // ← แยก await
```

### ไฟล์ที่ต้องแทนที่
- `api/_sheets.js` → ใช้ไฟล์ใหม่ที่แก้แล้ว
- `api/submit.js` → ใช้ไฟล์ใหม่ที่แก้แล้ว

---

## ข้อ 2: หน้า Report สำหรับ Admin (4 ประเภท)

### Backend
เพิ่มไฟล์ใหม่: `api/report.js`

Endpoint:
- `GET /api/report?type=service`   — สรุปการให้บริการ
- `GET /api/report?type=users`     — สรุปผู้ใช้บริการ
- `GET /api/report?type=duration`  — เวลาให้บริการสำเร็จ
- `GET /api/report?type=monthly`   — รายเดือน

### Frontend — วิธี Integrate

**1. เพิ่ม `api/report.js`** ลงใน project

**2. แก้ `app.js`** — เพิ่ม 'admin-report' ใน ALL_PAGES:
```js
const ALL_PAGES=['home','login','register','portal','tracking',
  'faq','admin-dashboard','admin-tickets','admin-reviews','superadmin',
  'admin-report'];  // ← เพิ่ม
```

**3. แก้ `navigateTo()` ใน app.js:**
```js
if(pageId==='admin-report') loadAdminReport('service');
```

**4. แก้ `updateMenuForAdmin()` ใน app.js:**
```js
document.getElementById('main-nav').innerHTML=`
  <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
  <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a>
  <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a>
  <a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a>
  <a onclick="navigateTo('admin-report')" id="nav-admin-report">📊 รายงาน</a>  ← เพิ่ม
  <a onclick="navigateTo('faq')" id="nav-faq">FAQ</a>`;
```
(ทำซ้ำกับ `updateMenuForSuperAdmin()` ด้วย)

**5. เพิ่ม HTML page ใน `index.html`** — คัดลอกส่วน `<div id="page-admin-report">` จาก `index-additions.html`

**6. เพิ่ม `<script>` ก่อนปิด `</body>`** — คัดลอกส่วน `<script>` จาก `index-additions.html`

**7. เพิ่ม functions ใน `app.js`** — คัดลอกทุกฟังก์ชันจาก `app-additions.js`

---

## ข้อ 3: หน้ารายงานรายบุคคล

### วิธีทำงาน
- เรียก `GET /api/report?type=user&username=xxx`
- แสดงเป็น modal popup (ไม่ต้องสร้างหน้าใหม่)
- มีปุ่ม "รายงานส่วนตัว" ใน Profile modal

### วิธี Integrate

**แก้ `showProfile()` ใน app.js** — เพิ่มบรรทัดนี้ท้าย try block:
```js
document.body.appendChild(o);
patchProfileModal(p.username || '');  // ← เพิ่มบรรทัดนี้
```

ฟังก์ชัน `patchProfileModal`, `showUserReportModal`, `renderUserReport` 
อยู่ใน `app-additions.js` แล้ว

---

## ข้อ 4: ไฟล์แนบผ่าน Google Drive

### วิธีทำงาน
1. User เลือกไฟล์ → frontend อ่านเป็น base64
2. ส่ง base64 พร้อม ticket ไปยัง API
3. `submit.js` upload ไปยัง Google Drive ผ่าน Drive API
4. บันทึก shareable URL ใน column R (FileURL)
5. ทั้ง user และ admin เห็นปุ่ม "เปิดดู" ที่กดได้

### Setup ที่ต้องทำเพิ่ม

**1. เพิ่ม scope ใน Google Service Account:**
ไปที่ Google Cloud Console → Service Account ที่ใช้อยู่
ไม่ต้อง generate key ใหม่ แต่ต้องแก้ scope ใน `getSheetsClient()`:
```js
scopes: [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',  // ← เพิ่ม
],
```

**2. (Optional) ตั้ง DRIVE_FOLDER_ID:**
สร้าง folder ใน Google Drive → share folder ให้ Service Account email
คัดลอก folder ID จาก URL แล้วใส่ใน Vercel Environment Variables:
```
DRIVE_FOLDER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs...
```

### ข้อจำกัด
- ขนาดไฟล์ 5 MB limit (Vercel serverless function body limit ~4.5MB)
- ไฟล์จะถูกเก็บใน Drive ของ Service Account
- ถ้าไม่มี scope drive.file → ระบบจะ fallback เก็บแค่ชื่อไฟล์แทน (ไม่ error)

### วิธี Integrate Frontend

**แทนที่ `handleFileSelect` เดิม** ด้วยเวอร์ชันใหม่จาก `app-additions.js`
**แทนที่ `finalSubmit` เดิม** ด้วยเวอร์ชันใหม่จาก `app-additions.js`

ฟังก์ชัน `buildFileAttachBlock` จะถูกเรียกใน `buildTicketCard` และ `renderAdminTickets`

**แก้ `buildTicketCard`** ส่วนไฟล์แนบ:
```js
// เดิม:
${fileInfo?`<div class="ticket-card-section">
  <div class="ticket-card-section-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</div>
  <div class="file-attach-display">
    ...
  </div>
</div>`:''}

// ใหม่: (เรียก helper)
${buildFileAttachBlock(fileInfo)}
```

**แก้ `renderAdminTickets`** ส่วน FileURL:
```js
// เดิม:
${t['FileURL']&&t['FileURL']!==''?`<div class="admin-file-box">
  <span class="admin-note-label">...</span>
  <div class="admin-file-text">${t['FileURL']}</div>
</div>`:''}

// ใหม่:
${buildAdminFileBlock(t['FileURL']||'')}
```

---

## สรุปไฟล์ที่เปลี่ยน

| ไฟล์ | การดำเนินการ | เหตุผล |
|------|-------------|--------|
| `api/_sheets.js` | แทนที่ทั้งหมด | แก้ bug appendRow + generateUserID |
| `api/submit.js` | แทนที่ทั้งหมด | แก้ race condition + Drive upload |
| `api/report.js` | **ไฟล์ใหม่** | รายงาน 4 ประเภท + รายบุคคล |
| `public/js/app.js` | เพิ่ม + แก้บางส่วน | Report page + file upload |
| `public/index.html` | เพิ่ม section | page-admin-report |

---

## การ Deploy ที่ Vercel

1. นำไฟล์ทั้งหมดขึ้น repository
2. Vercel จะ detect `api/report.js` เป็น serverless function อัตโนมัติ
3. ไม่ต้องแก้ `vercel.json` เพิ่มเติม (ถ้าใช้ config เดิม)
4. ถ้าต้องการ Drive upload ให้เพิ่ม `DRIVE_FOLDER_ID` ใน Environment Variables
