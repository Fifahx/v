// public/js/app.js
// ─────────────────────────────────────────────────────────────
//  VOC System — Frontend JS (Vercel version)
//  แก้ไข:
//  1. cursor pointer ทุกจุดที่คลิกได้
//  2. validation ฟอร์ม register ครบถ้วน
//  3. mapping คอลัมน์ใหม่ (UserID, Username ย้าย, หมายเหตุ)
//  4. ปุ่ม Pin ticket ให้แสดงหน้าหลัก (admin)
//  5. Alert ยืนยันข้อมูลสำคัญ
// ─────────────────────────────────────────────────────────────

let currentStep = 1;
let currentUser = null;
let vocData     = { cType: 'นักศึกษา', priority: 'medium', category: 'ข้อเสนอแนะหลักสูตร' };

const ALL_PAGES = ['home','login','register','portal','tracking','admin-dashboard','admin-tickets'];

// ═══════════════════════════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════════════════════════
const api = {
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async get(url) {
    const res = await fetch(url);
    return res.json();
  },
};

// ═══════════════════════════════════════════════════════════
//  CONFIRM DIALOG — สำหรับการกระทำที่สำคัญ
//  แทน window.confirm เพื่อให้ดูสอดคล้องกับ UI
// ═══════════════════════════════════════════════════════════
function showConfirm(message, onConfirm) {
  // สร้าง overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.5);
    z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;
    box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:'Sarabun',sans-serif;
  `;
  box.innerHTML = `
    <div style="font-size:1.5rem;margin-bottom:12px;">⚠️</div>
    <p style="font-size:1rem;color:#333;margin-bottom:24px;line-height:1.6;">${message}</p>
    <div style="display:flex;gap:12px;justify-content:flex-end;">
      <button id="confirm-cancel" style="padding:10px 22px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.95rem;">ยกเลิก</button>
      <button id="confirm-ok" style="padding:10px 22px;border:none;border-radius:8px;background:#2d6a4f;color:#fff;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.95rem;font-weight:600;">ยืนยัน</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('confirm-cancel').onclick = () => document.body.removeChild(overlay);
  document.getElementById('confirm-ok').onclick = () => {
    document.body.removeChild(overlay);
    onConfirm();
  };
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════
function navigateTo(pageId) {
  if (pageId === 'portal' && !currentUser) pageId = 'login';

  ALL_PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.add('hidden');
  });
  document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.remove('hidden');
  const navEl = document.getElementById('nav-' + pageId);
  if (navEl) navEl.classList.add('active');

  if (pageId === 'portal')          { setupPortalView(); changeStep(1); }
  if (pageId === 'admin-dashboard') loadDashboard();
  if (pageId === 'admin-tickets')   loadAdminTickets('pending');
  if (pageId === 'tracking') {
    document.getElementById('track-result').innerHTML = '';
    document.getElementById('track-input').value = '';
    if (currentUser && currentUser.role !== 'admin') loadMyTickets();
  }
  if (pageId === 'home') loadPinnedTickets();
  window.scrollTo(0, 0);
}

function setupPortalView() {
  const warning     = document.getElementById('portal-login-warning');
  const formContent = document.getElementById('portal-form-content');
  if (currentUser && currentUser.role !== 'admin') {
    warning.classList.add('hidden');
    formContent.classList.remove('hidden');
    const nameField = document.getElementById('v-name');
    if (nameField && currentUser.firstname)
      nameField.value = (currentUser.firstname || '') + ' ' + (currentUser.lastname || '');
  } else if (currentUser && currentUser.role === 'admin') {
    warning.classList.remove('hidden');
    warning.innerHTML = '<i class="fas fa-info-circle"></i><span>ผู้ดูแลระบบไม่สามารถแจ้งเรื่องได้ กรุณาใช้งานผ่านเมนู <b>จัดการเรื่อง</b></span>';
    formContent.classList.add('hidden');
  } else {
    warning.classList.remove('hidden');
    formContent.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════════════════════════
function saveSession(user)  { try { localStorage.setItem('voc_session', JSON.stringify(user)); } catch(e) {} }
function clearSession()     { try { localStorage.removeItem('voc_session'); } catch(e) {} }
function loadSession()      { try { const r = localStorage.getItem('voc_session'); return r ? JSON.parse(r) : null; } catch(e) { return null; } }

// ═══════════════════════════════════════════════════════════
//  AUTH — LOGIN USER
// ═══════════════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }

  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.innerHTML = 'กำลังเข้าสู่ระบบ...';

  try {
    const res = await api.post('/api/auth', { action: 'loginUser', username, password });
    if (res.success) {
      currentUser = res;
      saveSession(res);
      updateMenuForUser();
      navigateTo('home');
    } else {
      alert(res.message);
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = 'ยืนยัน';
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH — LOGIN ADMIN
// ═══════════════════════════════════════════════════════════
function showAdminLoginModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function hideAdminLoginModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function doAdminLogin() {
  const username = document.getElementById('admin-user').value.trim();
  const password = document.getElementById('admin-pass').value;
  if (!username || !password) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }

  const btn = document.getElementById('btn-admin-login');
  btn.disabled = true; btn.innerHTML = 'กำลังตรวจสอบ...';

  try {
    const res = await api.post('/api/auth', { action: 'loginAdmin', username, password });
    if (res.success) {
      currentUser = res;
      saveSession(res);
      hideAdminLoginModal();
      updateMenuForAdmin();
      navigateTo('admin-dashboard');
    } else {
      alert(res.message);
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ';
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH — REGISTER (พร้อม validation เต็มรูปแบบ)
// ═══════════════════════════════════════════════════════════
function validateRegisterForm() {
  const firstname = document.getElementById('reg-firstname').value.trim();
  const lastname  = document.getElementById('reg-lastname').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const username  = document.getElementById('reg-username').value.trim();
  const pass      = document.getElementById('reg-pass').value;
  const pass2     = document.getElementById('reg-pass2').value;

  // ── ตรวจสอบช่องว่าง ──
  if (!firstname) { showFieldError('reg-firstname', 'กรุณากรอกชื่อ'); return false; }
  if (!lastname)  { showFieldError('reg-lastname',  'กรุณากรอกนามสกุล'); return false; }

  // ── ตรวจสอบรูปแบบอีเมล ──
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) { showFieldError('reg-email', 'กรุณากรอกอีเมล'); return false; }
  if (!emailRegex.test(email)) { showFieldError('reg-email', 'รูปแบบอีเมลไม่ถูกต้อง'); return false; }

  // ── ตรวจสอบ username ──
  if (!username) { showFieldError('reg-username', 'กรุณากำหนดชื่อผู้ใช้'); return false; }
  if (username.length < 4) { showFieldError('reg-username', 'ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร'); return false; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { showFieldError('reg-username', 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9 และ _ เท่านั้น'); return false; }

  // ── ตรวจสอบรหัสผ่าน ──
  if (!pass) { showFieldError('reg-pass', 'กรุณากรอกรหัสผ่าน'); return false; }
  if (pass.length < 8) { showFieldError('reg-pass', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return false; }
  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(pass)) {
    showFieldError('reg-pass', 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'); return false;
  }
  if (pass !== pass2) { showFieldError('reg-pass2', 'รหัสผ่านไม่ตรงกัน'); return false; }

  return true;
}

// ── แสดง error ใต้ช่อง input ──
function showFieldError(fieldId, message) {
  clearFieldErrors();
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.style.borderColor = '#d00000';
  field.style.boxShadow   = '0 0 0 3px rgba(208,0,0,.12)';

  const errEl = document.createElement('p');
  errEl.id        = 'field-error';
  errEl.innerText = '⚠ ' + message;
  errEl.style.cssText = 'color:#d00000;font-size:.82rem;margin-top:5px;margin-bottom:0;';
  field.parentNode.insertBefore(errEl, field.nextSibling);
  field.focus();
}

function clearFieldErrors() {
  const existing = document.getElementById('field-error');
  if (existing) existing.remove();
  document.querySelectorAll('#page-register input').forEach(el => {
    el.style.borderColor = '';
    el.style.boxShadow   = '';
  });
}

// ── real-time validation บน input ──
function attachRegisterListeners() {
  const fields = ['reg-firstname','reg-lastname','reg-email','reg-username','reg-pass','reg-pass2'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', clearFieldErrors);
  });
}

async function doRegister() {
  clearFieldErrors();
  if (!validateRegisterForm()) return;

  const pass = document.getElementById('reg-pass').value;

  const btn = document.getElementById('btn-register');
  btn.disabled = true; btn.innerHTML = 'กำลังลงทะเบียน...';

  try {
    const res = await api.post('/api/auth', {
      action:    'register',
      firstname: document.getElementById('reg-firstname').value.trim(),
      lastname:  document.getElementById('reg-lastname').value.trim(),
      email:     document.getElementById('reg-email').value.trim(),
      lineId:    document.getElementById('reg-line').value.trim(),
      phone:     document.getElementById('reg-phone').value.trim(),
      username:  document.getElementById('reg-username').value.trim(),
      password:  pass,
    });
    if (res.success) {
      alert('ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
      navigateTo('login');
    } else {
      alert('ไม่สำเร็จ: ' + res.message);
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = 'ยืนยันการลงทะเบียน';
  }
}

// ═══════════════════════════════════════════════════════════
//  MENU
// ═══════════════════════════════════════════════════════════
function updateMenuForUser() {
  document.getElementById('main-nav').innerHTML = `
    <a onclick="navigateTo('home')" id="nav-home" style="cursor:pointer;">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal" style="cursor:pointer;">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking" style="cursor:pointer;">ติดตามสถานะ</a>
    <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')" style="cursor:pointer;">คู่มือการใช้งาน</a>`;
  document.getElementById('right-menu').innerHTML = `
    <span class="user-badge"><i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i> ออก</a>`;
}

function updateMenuForAdmin() {
  document.getElementById('main-nav').innerHTML = `
    <a onclick="navigateTo('home')" id="nav-home" style="cursor:pointer;">หน้าหลัก</a>
    <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard" style="cursor:pointer;">สถิติ</a>
    <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets" style="cursor:pointer;">จัดการเรื่อง</a>`;
  document.getElementById('right-menu').innerHTML = `
    <span class="user-badge"><i class="fas fa-shield-alt"></i> ${currentUser.fullname}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i> ออก</a>`;
}

function doLogout() {
  showConfirm('ต้องการออกจากระบบใช่หรือไม่?', () => {
    currentUser = null;
    clearSession();
    document.getElementById('main-nav').innerHTML = `
      <a onclick="navigateTo('home')" id="nav-home" class="active" style="cursor:pointer;">หน้าหลัก</a>
      <a onclick="navigateTo('portal')" id="nav-portal" style="cursor:pointer;">แจ้งเรื่อง</a>
      <a onclick="navigateTo('tracking')" id="nav-tracking" style="cursor:pointer;">ติดตามสถานะ</a>
      <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')" style="cursor:pointer;">คู่มือการใช้งาน</a>`;
    document.getElementById('right-menu').innerHTML = `
      <a onclick="navigateTo('login')" class="nav-menu" style="color:#fff;cursor:pointer;">เข้าสู่ระบบ</a>
      <a onclick="navigateTo('register')" class="btn-nav-active nav-menu" style="cursor:pointer;">ลงทะเบียน</a>`;
    navigateTo('home');
  });
}

// ═══════════════════════════════════════════════════════════
//  VOC FORM
// ═══════════════════════════════════════════════════════════
function changeStep(step) {
  currentStep = step;
  for (let i = 1; i <= 4; i++) {
    document.getElementById('step-content-' + i).classList.add('hidden');
    document.getElementById('node' + i).classList.remove('active');
  }
  document.getElementById('success-area').classList.add('hidden');
  document.getElementById('step-content-' + step).classList.remove('hidden');
  for (let i = 1; i <= step; i++) document.getElementById('node' + i).classList.add('active');
}

function setOption(el, key, val) {
  el.parentElement.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  vocData[key] = val;
}

function toggleAnon() {
  document.getElementById('identity-fields').style.opacity =
    document.getElementById('isAnon').checked ? '0.3' : '1';
}

function prepareReview() {
  const subject = document.getElementById('v-subject').value.trim();
  const detail  = document.getElementById('v-detail').value.trim();
  if (!subject) { alert('กรุณากรอกหัวข้อเรื่อง'); return; }
  if (!detail)  { alert('กรุณากรอกรายละเอียด'); return; }

  const isAnon = document.getElementById('isAnon').checked;
  const name   = isAnon ? 'ไม่ระบุตัวตน' : document.getElementById('v-name').value;
  const pMap   = { high:'เร่งด่วน (24 ชม.)', medium:'ปานกลาง (3 วัน)', low:'ทั่วไป (7 วัน)' };
  document.getElementById('review-area').innerHTML = `
    <h3 style="margin-bottom:14px;border-bottom:1px solid #ccc;padding-bottom:10px;">ตรวจสอบข้อมูลก่อนส่ง</h3>
    <p><b>ประเภทผู้แจ้ง:</b> ${vocData.cType}</p>
    <p><b>การแสดงตัวตน:</b> ${name}</p>
    <p><b>ประเภทเรื่อง:</b> ${vocData.category}</p>
    <p><b>ความเร่งด่วน:</b> ${pMap[vocData.priority] || vocData.priority}</p>
    <p><b>หัวข้อ:</b> ${subject}</p>
    <p><b>รายละเอียด:</b> ${detail}</p>`;
  changeStep(4);
}

async function finalSubmit() {
  // ── Alert ยืนยันก่อนส่ง ──
  showConfirm(
    'ยืนยันการส่งเรื่องร้องเรียน?\nข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้',
    async () => {
      const btn = document.getElementById('btn-final');
      btn.innerHTML = 'กำลังส่งข้อมูล...'; btn.disabled = true;

      const payload = {
        customerType: vocData.cType,
        isAnon:       document.getElementById('isAnon').checked,
        name:         document.getElementById('v-name').value,
        studentId:    document.getElementById('v-sid').value,
        categories:   [vocData.category],
        priority:     vocData.priority,
        subject:      document.getElementById('v-subject').value,
        detail:       document.getElementById('v-detail').value,
        username:     currentUser ? currentUser.username : '',
      };

      try {
        const res = await api.post('/api/submit', payload);
        if (res.success) {
          document.getElementById('step-content-4').classList.add('hidden');
          document.getElementById('success-area').classList.remove('hidden');
          document.getElementById('new-ticket-id').innerText = res.ticketId;
        } else {
          alert('เกิดข้อผิดพลาด: ' + (res.error || ''));
        }
      } catch (e) {
        alert('ส่งข้อมูลไม่สำเร็จ: ' + e.message);
      } finally {
        btn.innerHTML = 'ยืนยันการส่งเรื่อง'; btn.disabled = false;
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════
//  PINNED TICKETS — แสดงบนหน้าหลัก
// ═══════════════════════════════════════════════════════════
async function loadPinnedTickets() {
  const container = document.getElementById('pinned-tickets-section');
  if (!container) return;

  try {
    const res = await api.get('/api/tickets?action=pinned');
    if (res.success && res.tickets && res.tickets.length > 0) {
      container.classList.remove('hidden');
      const statusClass = {
        'รอดำเนินการ':    'status-pending',
        'กำลังดำเนินการ': 'status-inprogress',
        'เสร็จสิ้น':      'status-success',
        'ปฏิเสธ':         'status-reject',
      };
      let html = `
        <div class="section-title" style="margin-bottom:16px;">
          <h2 style="font-size:1.1rem;color:var(--dgreen);">
            <i class="fas fa-thumbtack"></i> ประกาศ / สถานะที่น่าสนใจ
          </h2>
        </div>`;
      res.tickets.forEach(t => {
        const sc = statusClass[t['สถานะ']] || 'status-pending';
        html += `
        <div class="ticket-card" style="margin:0 0 12px 0;">
          <div class="ticket-header">
            <span class="ticket-id">${t['Ticket ID']}</span>
            <span class="status ${sc}">${t['สถานะ']}</span>
          </div>
          <div class="ticket-subject">${t['หัวข้อ'] || '-'}</div>
          <div class="ticket-footer">
            <span><i class="fas fa-calendar"></i> ${t['วันที่แจ้ง'] || ''}</span>
            <span><i class="fas fa-user"></i> ${t['ผู้รับผิดชอบ'] || 'รอมอบหมาย'}</span>
          </div>
          ${t['หมายเหตุ'] ? `<div class="ticket-feedback"><strong><i class="fas fa-comment-dots"></i> หมายเหตุ:</strong> ${t['หมายเหตุ']}</div>` : ''}
        </div>`;
      });
      container.innerHTML = html;
    } else {
      container.classList.add('hidden');
    }
  } catch (e) {
    container.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
//  TRACKING
// ═══════════════════════════════════════════════════════════
async function loadMyTickets() {
  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดประวัติของคุณ...</p></div>';
  try {
    const res = await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`);
    if (res.success && res.tickets && res.tickets.length > 0) {
      renderTicketCards(res.tickets);
    } else {
      resDiv.innerHTML = `
        <div style="text-align:center;padding:40px;color:#888;">
          <i class="fas fa-inbox" style="font-size:2.5rem;color:#ccc;margin-bottom:12px;display:block;"></i>
          <p>คุณยังไม่มีประวัติการร้องเรียน</p>
          <button onclick="navigateTo('portal')" style="margin-top:16px;padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;">
            <i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่
          </button>
        </div>`;
    }
  } catch (e) {
    resDiv.innerHTML = `<p style='color:red;'>เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}

async function doTrack() {
  const val = document.getElementById('track-input').value.trim();
  if (!val) { alert('กรุณากรอกข้อมูลเพื่อค้นหา'); return; }

  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังค้นหา...</p></div>';

  try {
    if (val.toUpperCase().startsWith('VOC-')) {
      const res = await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val)}`);
      if (res.success) renderTicketCards([res.ticket]);
      else resDiv.innerHTML = "<p style='color:red;text-align:center;'>ไม่พบหมายเลข Ticket ID นี้</p>";
    } else {
      const res = await api.get(`/api/tickets?action=search&q=${encodeURIComponent(val)}`);
      if (res.success && res.tickets.length > 0) renderTicketCards(res.tickets);
      else resDiv.innerHTML = "<p style='color:red;text-align:center;'>ไม่พบข้อมูลที่ค้นหา</p>";
    }
  } catch (e) {
    resDiv.innerHTML = `<p style='color:red;'>เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}

function renderTicketCards(tickets) {
  const resDiv = document.getElementById('track-result');
  const statusClass = {
    'รอดำเนินการ':    'status-pending',
    'กำลังดำเนินการ': 'status-inprogress',
    'เสร็จสิ้น':      'status-success',
    'ปฏิเสธ':         'status-reject',
  };
  let html = `<p style="color:#555;margin-bottom:15px;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t => {
    const sc       = statusClass[t['สถานะ']] || 'status-pending';
    const feedback = t['หมายเหตุ'];  // ← เปลี่ยนชื่อจาก "ผลการพิจารณา/Feedback"
    html += `
    <div class="ticket-card">
      <div class="ticket-header">
        <span class="ticket-id">${t['Ticket ID']}</span>
        <span class="status ${sc}">${t['สถานะ']}</span>
      </div>
      <div class="ticket-subject">${t['หัวข้อ'] || '-'}</div>
      <div class="ticket-detail">${t['รายละเอียด'] || ''}</div>
      <div class="ticket-footer">
        <span><i class="fas fa-calendar"></i> ${t['วันที่แจ้ง'] || ''}</span>
        <span><i class="fas fa-clock"></i> กำหนด: ${t['กำหนดตอบกลับ'] || '-'}</span>
        <span><i class="fas fa-user"></i> ${t['ผู้รับผิดชอบ'] || 'รอมอบหมาย'}</span>
      </div>
      ${feedback ? `<div class="ticket-feedback"><strong><i class="fas fa-comment-dots"></i> หมายเหตุ:</strong> ${feedback}</div>` : ''}
    </div>`;
  });
  resDiv.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  document.getElementById('dash-content').innerHTML =
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดข้อมูล...</p></div>';
  try {
    const res = await api.get('/api/dashboard');
    if (res.success) renderDashboard(res.stats);
    else document.getElementById('dash-content').innerHTML = '<p style="color:red;">โหลดข้อมูลไม่สำเร็จ</p>';
  } catch (e) {
    document.getElementById('dash-content').innerHTML = `<p style="color:red;">เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}

function renderDashboard(s) {
  const maxCat = Math.max(...Object.values(s.byCategory), 1);
  const maxCus = Math.max(...Object.values(s.byCustomer), 1);
  const maxMon = Math.max(...Object.values(s.byMonth), 1);
  let catBars = '', cusBars = '', monBars = '';
  Object.entries(s.byCategory).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    catBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxCat*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byCustomer).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    cusBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v/maxCus*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byMonth).sort().slice(-6).forEach(([k,v])=>{
    monBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill blue" style="width:${Math.round(v/maxMon*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  document.getElementById('dash-content').innerHTML = `
    <div class="dash-grid">
      <div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">เรื่องทั้งหมด</div></div>
      <div class="stat-card orange"><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">รอดำเนินการ</div></div>
      <div class="stat-card blue"><div class="stat-num" style="color:#3a86ff;">${s.inprogress}</div><div class="stat-label">กำลังดำเนินการ</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">เสร็จสิ้น</div></div>
    </div>
    <div class="dash-charts">
      <div class="chart-card"><h4><i class="fas fa-tags"></i> แยกตามประเภทเรื่อง</h4>${catBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
      <div class="chart-card"><h4><i class="fas fa-users"></i> แยกตามประเภทผู้แจ้ง</h4>${cusBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
    </div>
    <div class="chart-card"><h4><i class="fas fa-calendar-alt"></i> รายเดือน (6 เดือนล่าสุด)</h4>${monBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  ADMIN TICKET MANAGEMENT
// ═══════════════════════════════════════════════════════════
function setFilter(id) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('filter-' + id);
  if (el) el.classList.add('active');
}

async function loadAdminTickets(filter) {
  document.getElementById('admin-ticket-list').innerHTML =
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const res = await api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`);
    if (res.success) renderAdminTickets(res.tickets);
    else document.getElementById('admin-ticket-list').innerHTML = '<p style="color:red;">โหลดไม่สำเร็จ</p>';
  } catch (e) {
    document.getElementById('admin-ticket-list').innerHTML = `<p style="color:red;">เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}

function renderAdminTickets(tickets) {
  const container = document.getElementById('admin-ticket-list');
  if (!tickets.length) {
    container.innerHTML = '<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ccc;"></i><p style="margin-top:12px;">ไม่มีเรื่องในหมวดนี้</p></div>';
    return;
  }
  const statusColorClass = {'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
  const statusClass      = {'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const priorityLabel    = {'high':'เร่งด่วน','medium':'ปานกลาง','low':'ทั่วไป'};

  let html = `<p style="color:#666;margin-bottom:14px;font-size:.88rem;">แสดง ${tickets.length} รายการ</p>`;
  tickets.forEach(t => {
    const tid    = t['Ticket ID'];
    const uid    = t['UserID'] || '-';
    const sc     = statusColorClass[t['สถานะ']] || 'pending';
    const sTag   = statusClass[t['สถานะ']]      || 'status-pending';
    const pl     = priorityLabel[t['ความเร่งด่วน']] || t['ความเร่งด่วน'];
    const pc     = {'high':'p-high','medium':'p-medium','low':'p-low'}[t['ความเร่งด่วน']] || 'p-low';
    const isPinned = String(t['Pinned'] || '').toLowerCase() === 'true';
    html += `
    <div class="admin-ticket-card ${sc}" id="card-${tid}">
      <div class="admin-card-top">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="ticket-id" style="font-size:1rem;">${tid}</span>
          <span style="font-size:.75rem;color:#999;">UserID: ${uid}</span>
          <span class="priority-badge ${pc}">${pl}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="status ${sTag}">${t['สถานะ']}</span>
          <!-- ปุ่ม Pin แสดงบนหน้าหลัก -->
          <button
            id="pin-btn-${tid}"
            onclick="togglePin('${tid}', ${!isPinned})"
            title="${isPinned ? 'ยกเลิกการแสดงบนหน้าหลัก' : 'แสดงบนหน้าหลัก'}"
            style="padding:4px 10px;border-radius:8px;border:1px solid ${isPinned ? '#2d6a4f' : '#ccc'};
                   background:${isPinned ? '#e8f5e9' : '#fff'};cursor:pointer;
                   font-size:.78rem;color:${isPinned ? '#2d6a4f' : '#888'};
                   font-family:'Sarabun',sans-serif;white-space:nowrap;">
            <i class="fas fa-thumbtack"></i> ${isPinned ? 'แสดงอยู่' : 'แสดงหน้าหลัก'}
          </button>
        </div>
      </div>
      <div style="font-size:1rem;font-weight:600;margin-bottom:10px;">${t['หัวข้อ']||'-'}</div>
      <div class="admin-card-meta">
        <span><strong>ประเภทผู้แจ้ง:</strong> ${t['ประเภทผู้แจ้ง']||'-'}</span>
        <span><strong>ชื่อ:</strong> ${t['ชื่อ']||'-'}</span>
        <span><strong>รหัส/หน่วยงาน:</strong> ${t['รหัสนักศึกษา/หน่วยงาน']||'-'}</span>
        <span><strong>ประเภทเรื่อง:</strong> ${t['ประเภทเรื่อง']||'-'}</span>
        <span><strong>วันที่แจ้ง:</strong> ${t['วันที่แจ้ง']||'-'}</span>
        <span><strong>กำหนดตอบกลับ:</strong> ${t['กำหนดตอบกลับ']||'-'}</span>
      </div>
      <div class="detail-box">${t['รายละเอียด']||'(ไม่มีรายละเอียด)'}</div>
      ${t['หมายเหตุ'] ? `<div class="ticket-feedback" style="margin-bottom:14px;"><strong>หมายเหตุเดิม:</strong> ${t['หมายเหตุ']}</div>` : ''}
      <div class="update-row">
        <select id="status-${tid}">
          <option value="รอดำเนินการ"    ${t['สถานะ']==='รอดำเนินการ'    ?'selected':''}>รอดำเนินการ</option>
          <option value="กำลังดำเนินการ" ${t['สถานะ']==='กำลังดำเนินการ' ?'selected':''}>กำลังดำเนินการ</option>
          <option value="เสร็จสิ้น"      ${t['สถานะ']==='เสร็จสิ้น'      ?'selected':''}>เสร็จสิ้น</option>
          <option value="ปฏิเสธ"         ${t['สถานะ']==='ปฏิเสธ'         ?'selected':''}>ปฏิเสธ</option>
        </select>
        <input type="text" id="assignee-${tid}" placeholder="ผู้รับผิดชอบ" value="${t['ผู้รับผิดชอบ']||''}">
        <input type="text" id="feedback-${tid}" placeholder="หมายเหตุ" value="${t['หมายเหตุ']||''}">
        <button class="btn-update" onclick="submitUpdate('${tid}')"><i class="fas fa-save"></i> บันทึก</button>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

// ── Toggle Pin ──
async function togglePin(ticketId, newPinnedState) {
  const action = newPinnedState ? 'แสดง ticket นี้บนหน้าหลัก?' : 'ยกเลิกการแสดง ticket นี้บนหน้าหลัก?';
  showConfirm(action, async () => {
    try {
      const res = await api.post('/api/tickets', {
        action:   'togglePin',
        ticketId,
        pinned:   newPinnedState,
      });
      if (res.success) {
        const btn = document.getElementById(`pin-btn-${ticketId}`);
        if (btn) {
          btn.style.border      = `1px solid ${newPinnedState ? '#2d6a4f' : '#ccc'}`;
          btn.style.background  = newPinnedState ? '#e8f5e9' : '#fff';
          btn.style.color       = newPinnedState ? '#2d6a4f' : '#888';
          btn.title             = newPinnedState ? 'ยกเลิกการแสดงบนหน้าหลัก' : 'แสดงบนหน้าหลัก';
          btn.innerHTML         = `<i class="fas fa-thumbtack"></i> ${newPinnedState ? 'แสดงอยู่' : 'แสดงหน้าหลัก'}`;
          btn.setAttribute('onclick', `togglePin('${ticketId}', ${!newPinnedState})`);
        }
      } else {
        alert('ไม่สำเร็จ: ' + (res.message || ''));
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message);
    }
  });
}

// ── Update Ticket ──
async function submitUpdate(ticketId) {
  const newStatus = document.getElementById('status-'   + ticketId).value;
  const assignee  = document.getElementById('assignee-' + ticketId).value;
  const feedback  = document.getElementById('feedback-' + ticketId).value;

  // ── Alert ยืนยันก่อนบันทึก ──
  showConfirm(
    `ยืนยันการบันทึกข้อมูล Ticket ${ticketId}?\nสถานะใหม่: ${newStatus}`,
    async () => {
      const btn = document.querySelector(`#card-${ticketId} .btn-update`);
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;

      try {
        const res = await api.post('/api/tickets', {
          action: 'update', ticketId, newStatus, assignee, feedback,
        });
        if (res.success) {
          const card = document.getElementById('card-' + ticketId);
          card.style.transition = 'background .4s';
          card.style.background = '#d4edda';
          setTimeout(() => { card.style.background = ''; }, 1500);
          const sTag  = {'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
          const scTag = {'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
          card.querySelector('.status').className = 'status ' + (sTag[newStatus] || 'status-pending');
          card.querySelector('.status').innerText = newStatus;
          card.className = 'admin-ticket-card ' + (scTag[newStatus] || 'pending');
        } else {
          alert('บันทึกไม่สำเร็จ: ' + (res.message || ''));
        }
      } catch (e) {
        alert('เกิดข้อผิดพลาด: ' + e.message);
      } finally {
        btn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; btn.disabled = false;
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
window.onload = function () {
  // restore session
  const saved = loadSession();
  if (saved && saved.success) {
    currentUser = saved;
    if (saved.role === 'admin') updateMenuForAdmin();
    else                        updateMenuForUser();
  }
  // attach validation listeners
  attachRegisterListeners();
  // ไปหน้าแรก
  navigateTo('home');
};
