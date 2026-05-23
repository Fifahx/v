# VOC System — Vercel (Updated)

## โครงสร้างไฟล์ทั้งหมด

```
voc-fix/
├── vercel.json
├── package.json
├── api/
│   ├── _sheets.js     ← shared helper (แก้ไข: UserID, column ใหม่)
│   ├── auth.js        ← login / register (ไม่เปลี่ยน)
│   ├── submit.js      ← ส่งเรื่องใหม่ (แก้ไข: UserID + column ใหม่)
│   ├── tickets.js     ← จัดการ ticket (แก้ไข: column ใหม่ + Pin feature)
│   └── dashboard.js   ← สถิติ (แก้ไข: column index ใหม่)
└── public/
    ├── index.html     ← (แก้ไข: cursor, รูป, pinned section, placeholder)
    ├── css/style.css  ← (แก้ไข: cursor:pointer, error state, pinned CSS)
    └── js/app.js      ← (แก้ไข: validation, pin, alert confirm, cursor)
```

---

## สิ่งที่แก้ไขในรอบนี้

### 1. Cursor ไม่เปลี่ยนรูป
- เพิ่ม `cursor: pointer !important` ใน CSS ครอบคลุมทุก element ที่คลิกได้
- เพิ่ม `style="cursor:pointer"` ใน nav links ทุกจุดใน `app.js`

### 2. รูปภาพไม่แสดง
- เพิ่ม `onerror="this.style.display='none'"` กัน error เวลา Discord link หมดอายุ
- ถ้าต้องการแก้ถาวร → อัปโหลดรูปไปไว้ใน `/public/images/` แล้วเปลี่ยน src

### 3. Validation ฟอร์ม Register
- ตรวจสอบช่องว่างทุกช่องที่จำเป็น
- ตรวจรูปแบบ email (regex)
- username: ต้องเป็น a-z/0-9/_ และอย่างน้อย 4 ตัว
- password: อย่างน้อย 8 ตัว ต้องมีทั้งตัวอักษรและตัวเลข
- ยืนยันรหัสผ่านต้องตรงกัน
- แสดง error ใต้ช่องที่ผิดทันที พร้อม real-time clear เมื่อพิมพ์ใหม่

### 4. โครงสร้าง Spreadsheet ใหม่
คอลัมน์ใหม่ (15 คอลัมน์ตามที่กำหนด):
`UserID | Ticket ID | Username | วันที่แจ้ง | ประเภทผู้แจ้ง | ชื่อ | รหัสนักศึกษา/หน่วยงาน | ประเภทเรื่อง | ความเร่งด่วน | หัวข้อ | รายละเอียด | สถานะ | ผู้รับผิดชอบ | กำหนดตอบกลับ | หมายเหตุ`

### 4.2 UserID (Primary Key)
- Auto-increment, unique, ไม่ซ้ำกัน
- เก็บ counter ใน VOC_Counters sheet คอลัมน์ `UserID_Counter`
- สร้างพร้อมกับ Ticket ID ทุกครั้งที่มีการส่งเรื่อง
- ใช้ค้นหาได้ผ่าน `GET /api/tickets?action=byUserId&userId=5`

### 5. Pin Ticket แสดงบนหน้าหลัก (Admin)
- admin กดปุ่ม "แสดงหน้าหลัก" ใน ticket card ได้เลย
- มี confirm dialog ก่อนทุกครั้ง
- ticket ที่ pin จะแสดงในส่วน "ประกาศ / สถานะที่น่าสนใจ" บนหน้าหลัก
- ผู้ใช้ทั่วไปเห็นได้โดยไม่ต้อง login

### 6. Alert ยืนยันข้อมูลสำคัญ
- Custom confirm dialog (แทน `window.confirm` ที่หน้าตาไม่สวย)
- บังคับกดยืนยันก่อน: ส่งเรื่อง, บันทึก ticket, pin/unpin, logout

---

## วิธีแก้ปัญหารูปภาพถาวร

Discord link หมดอายุได้ตลอด วิธีที่ดีที่สุดคืออัปโหลดรูปเข้าโปรเจกต์โดยตรง:

1. สร้างโฟลเดอร์ `public/images/`
2. วางไฟล์รูป เช่น `logo1.png` และ `logo2.png`
3. แก้ใน `index.html`:
```html
<img src="/images/logo1.png" alt="Logo Faculty">
<img src="/images/logo2.png" alt="Logo YRU">
```

---

## ⚠️ หมายเหตุเรื่อง Spreadsheet

ถ้า VOC_Tickets มีข้อมูลเก่าอยู่แล้ว (จาก Google Apps Script เดิม) โครงสร้างคอลัมน์จะต่างกัน
แนะนำให้:
- สร้าง Sheet ใหม่ชื่อ `VOC_Tickets` (ลบอันเก่าหรือเปลี่ยนชื่อก่อน)
- หรือ migrate ข้อมูลเก่าให้ตรงกับ column ใหม่ด้วยมือ

---

## Environment Variables (เหมือนเดิม)
```
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SPREADSHEET_ID
```
