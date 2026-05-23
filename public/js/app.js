// public/js/app.js — VOC System v3
// แก้ไขครบทั้ง 10 ข้อ

let currentStep = 1;
let currentUser = null;
let vocData = { cType: 'นักศึกษา', priority: 'medium', category: 'ข้อเสนอแนะหลักสูตร' };
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
//  CUSTOM MODAL SYSTEM (ข้อ 9 — alert สวยงาม ทุกแพลตฟอร์ม)
// ═══════════════════════════════════════════════════════════
function showAlert(icon, title, message, type = 'info') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'voc-overlay';
    overlay.innerHTML = `
      <div class="voc-modal-box">
        <span class="voc-modal-icon">${icon}</span>
        <div class="voc-modal-title">${title}</div>
        <div class="voc-modal-msg">${message}</div>
        <div class="voc-modal-btns">
          <button class="voc-btn-ok ${type === 'danger' ? 'danger' : ''}" id="voc-ok">ตกลง</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('voc-ok').onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };
  });
}

function showConfirm(icon, title, message, type = 'warning') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'voc-overlay';
    overlay.innerHTML = `
      <div class="voc-modal-box">
        <span class="voc-modal-icon">${icon}</span>
        <div class="voc-modal-title">${title}</div>
        <div class="voc-modal-msg">${message}</div>
        <div class="voc-modal-btns">
          <button class="voc-btn-cancel" id="voc-cancel">ยกเลิก</button>
          <button class="voc-btn-ok ${type === 'danger' ? 'danger' : ''}" id="voc-ok">ยืนยัน</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('voc-cancel').onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };
    document.getElementById('voc-ok').onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };
  });
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
    const nf = document.getElementById('v-name');
    if (nf && currentUser.firstname)
      nf.value = (currentUser.firstname||'') + ' ' + (currentUser.lastname||'');
  } else if (currentUser && currentUser.role === 'admin') {
    warning.classList.remove('hidden');
    warning.innerHTML = '<i class="fas fa-info-circle"></i><span>ผู้ดูแลระบบไม่สามารถแจ้งเรื่องได้</span>';
    formContent.classList.add('hidden');
  } else {
    warning.classList.remove('hidden');
    formContent.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════════════════════════
function saveSession(u)  { try { localStorage.setItem('voc_session', JSON.stringify(u)); } catch(e) {} }
function clearSession()  { try { localStorage.removeItem('voc_session'); } catch(e) {} }
function loadSession()   { try { const r = localStorage.getItem('voc_session'); return r ? JSON.parse(r) : null; } catch(e) { return null; } }

// ═══════════════════════════════════════════════════════════
//  AUTH — LOGIN USER
// ═══════════════════════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) { await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.innerHTML = 'กำลังเข้าสู่ระบบ...';
  try {
    const res = await api.post('/api/auth', { action: 'loginUser', username, password });
    if (res.success) {
      currentUser = res; saveSession(res); updateMenuForUser(); navigateTo('home');
    } else {
      await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ', res.message);
    }
  } catch (e) {
    await showAlert('❌','เกิดข้อผิดพลาด', e.message);
  } finally { btn.disabled = false; btn.innerHTML = 'ยืนยัน'; }
}

// ═══════════════════════════════════════════════════════════
//  AUTH — ADMIN LOGIN
// ═══════════════════════════════════════════════════════════
function showAdminLoginModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function hideAdminLoginModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function doAdminLogin() {
  const username = document.getElementById('admin-user').value.trim();
  const password = document.getElementById('admin-pass').value;
  if (!username || !password) { await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  const btn = document.getElementById('btn-admin-login');
  btn.disabled = true; btn.innerHTML = 'กำลังตรวจสอบ...';
  try {
    const res = await api.post('/api/auth', { action: 'loginAdmin', username, password });
    if (res.success) {
      currentUser = res; saveSession(res); hideAdminLoginModal(); updateMenuForAdmin(); navigateTo('admin-dashboard');
    } else {
      await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ', res.message);
    }
  } catch (e) {
    await showAlert('❌','เกิดข้อผิดพลาด', e.message);
  } finally { btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ'; }
}

// ═══════════════════════════════════════════════════════════
//  REGISTER — validation ครบถ้วน (ข้อ 1, 2)
// ═══════════════════════════════════════════════════════════
function clearFieldErrors() {
  document.querySelectorAll('#page-register .field-err').forEach(e => e.remove());
  document.querySelectorAll('#page-register input').forEach(el => el.classList.remove('input-error'));
}

function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add('input-error');
  const err = document.createElement('p');
  err.className = 'field-err';
  err.innerHTML = `<i class="fas fa-exclamation-circle"></i>${msg}`;
  el.parentNode.appendChild(err);
  el.focus();
}

// ── ข้อ 2: Password Strength ──
function checkPasswordStrength(pass) {
  let score = 0;
  if (pass.length >= 8)  score++;
  if (pass.length >= 12) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^a-zA-Z0-9]/.test(pass)) score++;
  return score; // 0-5
}

function updateStrengthBar() {
  const pass  = document.getElementById('reg-pass').value;
  const bar   = document.getElementById('pw-bar');
  const label = document.getElementById('pw-label');
  if (!bar) return;
  const score = checkPasswordStrength(pass);
  const levels = [
    { pct:'0%',   color:'#eee',    text:'' },
    { pct:'20%',  color:'#d00000', text:'อ่อนมาก' },
    { pct:'40%',  color:'#f77f00', text:'อ่อน' },
    { pct:'60%',  color:'#e7e71b', text:'พอใช้' },
    { pct:'80%',  color:'#40916c', text:'ดี' },
    { pct:'100%', color:'#2d6a4f', text:'แข็งแกร่งมาก' },
  ];
  const lv = levels[score] || levels[0];
  bar.style.width    = lv.pct;
  bar.style.background = lv.color;
  label.innerText    = lv.text;
  label.style.color  = lv.color;
}

function validateRegister() {
  clearFieldErrors();
  const firstname = document.getElementById('reg-firstname').value.trim();
  const lastname  = document.getElementById('reg-lastname').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const phone     = document.getElementById('reg-phone').value.trim();
  const username  = document.getElementById('reg-username').value.trim();
  const pass      = document.getElementById('reg-pass').value;
  const pass2     = document.getElementById('reg-pass2').value;

  if (!firstname) { showFieldError('reg-firstname','กรุณากรอกชื่อ'); return false; }
  if (!lastname)  { showFieldError('reg-lastname','กรุณากรอกนามสกุล'); return false; }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('reg-email','รูปแบบอีเมลไม่ถูกต้อง'); return false;
  }

  // ── ข้อ 1: ตรวจสอบเบอร์โทรศัพท์ ──
  if (phone) {
    if (!/^\d+$/.test(phone)) {
      showFieldError('reg-phone','เบอร์โทรต้องเป็นตัวเลขเท่านั้น'); return false;
    }
    if (phone.length < 9 || phone.length > 10) {
      showFieldError('reg-phone','เบอร์โทรต้องมี 9-10 หลัก'); return false;
    }
  }

  if (!username) { showFieldError('reg-username','กรุณากำหนดชื่อผู้ใช้'); return false; }
  if (username.length < 4) { showFieldError('reg-username','ชื่อผู้ใช้ต้องอย่างน้อย 4 ตัว'); return false; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { showFieldError('reg-username','ใช้ได้เฉพาะ a-z, 0-9 และ _'); return false; }

  // ── ข้อ 2: ตรวจสอบความปลอดภัยรหัสผ่าน ──
  if (!pass) { showFieldError('reg-pass','กรุณากรอกรหัสผ่าน'); return false; }
  if (pass.length < 8) { showFieldError('reg-pass','รหัสผ่านต้องอย่างน้อย 8 ตัว'); return false; }
  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(pass)) {
    showFieldError('reg-pass','ต้องมีทั้งตัวอักษรและตัวเลข'); return false;
  }
  if (checkPasswordStrength(pass) < 2) {
    showFieldError('reg-pass','รหัสผ่านอ่อนเกินไป กรุณาเพิ่มความซับซ้อน'); return false;
  }
  if (pass !== pass2) { showFieldError('reg-pass2','รหัสผ่านไม่ตรงกัน'); return false; }

  return true;
}

async function doRegister() {
  if (!validateRegister()) return;
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
      password:  document.getElementById('reg-pass').value,
    });
    if (res.success) {
      await showAlert('✅','ลงทะเบียนสำเร็จ','กรุณาเข้าสู่ระบบเพื่อใช้งาน');
      navigateTo('login');
    } else {
      await showAlert('❌','ไม่สำเร็จ', res.message);
    }
  } catch (e) {
    await showAlert('❌','เกิดข้อผิดพลาด', e.message);
  } finally { btn.disabled = false; btn.innerHTML = 'ยืนยันการลงทะเบียน'; }
}

// ═══════════════════════════════════════════════════════════
//  MENU
// ═══════════════════════════════════════════════════════════
function updateMenuForUser() {
  document.getElementById('main-nav').innerHTML = `
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')">คู่มือ</a>`;
  document.getElementById('right-menu').innerHTML = `
    <span class="user-badge" onclick="showProfile()" style="cursor:pointer;" title="ดูโปรไฟล์">
      <i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}
    </span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}

function updateMenuForAdmin() {
  document.getElementById('main-nav').innerHTML = `
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a>
    <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a>`;
  document.getElementById('right-menu').innerHTML = `
    <span class="user-badge"><i class="fas fa-shield-alt"></i>${currentUser.fullname||'Admin'}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}

async function doLogout() {
  const ok = await showConfirm('🚪','ออกจากระบบ','ต้องการออกจากระบบใช่หรือไม่?');
  if (!ok) return;
  currentUser = null; clearSession();
  document.getElementById('main-nav').innerHTML = `
    <a onclick="navigateTo('home')" id="nav-home" class="active">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')">คู่มือ</a>`;
  document.getElementById('right-menu').innerHTML = `
    <a onclick="navigateTo('login')" class="nav-menu" style="color:#fff;">เข้าสู่ระบบ</a>
    <a onclick="navigateTo('register')" class="btn-nav-active nav-menu">ลงทะเบียน</a>`;
  navigateTo('home');
}

// ═══════════════════════════════════════════════════════════
//  PROFILE (ข้อ 3)
// ═══════════════════════════════════════════════════════════
async function showProfile() {
  if (!currentUser) return;
  try {
    const res = await api.get(`/api/profile?username=${encodeURIComponent(currentUser.username)}`);
    const p   = res.success ? res.profile : currentUser;
    const initial = (p.firstname||'?')[0].toUpperCase();

    const overlay = document.createElement('div');
    overlay.className = 'voc-overlay';
    overlay.innerHTML = `
      <div class="voc-modal-box" style="max-width:480px;">
        <div class="profile-avatar">${initial}</div>
        <div class="voc-modal-title">${p.firstname||''} ${p.lastname||''}</div>
        <div style="text-align:center;margin-bottom:16px;">
          <span style="background:#e8f5e9;color:#2d6a4f;padding:3px 12px;border-radius:20px;font-size:.8rem;">
            <i class="fas fa-user"></i> ${p.username||''}
          </span>
        </div>
        <div class="profile-grid" style="margin-bottom:24px;">
          <div><div class="label">อีเมล</div><div class="value">${p.email||'-'}</div></div>
          <div><div class="label">เบอร์โทร</div><div class="value">${p.phone||'-'}</div></div>
          <div><div class="label">Line ID</div><div class="value">${p.lineId||'-'}</div></div>
          <div><div class="label">วันที่สมัคร</div><div class="value">${p.registeredAt||'-'}</div></div>
          <div><div class="label">สถานะ</div><div class="value">${p.status||'active'}</div></div>
        </div>
        <div class="voc-modal-btns">
          <button class="voc-btn-ok" id="voc-ok">ปิด</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('voc-ok').onclick = () => document.body.removeChild(overlay);
  } catch(e) {
    await showAlert('❌','เกิดข้อผิดพลาด', e.message);
  }
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
  el.classList.add('selected'); vocData[key] = val;
}

function toggleAnon() {
  document.getElementById('identity-fields').style.opacity =
    document.getElementById('isAnon').checked ? '0.3' : '1';
}

function prepareReview() {
  const subject = document.getElementById('v-subject').value.trim();
  const detail  = document.getElementById('v-detail').value.trim();
  if (!subject) { showAlert('⚠️','กรุณากรอกหัวข้อ','หัวข้อเรื่องเป็นข้อมูลจำเป็น'); return; }
  if (!detail)  { showAlert('⚠️','กรุณากรอกรายละเอียด','รายละเอียดเรื่องเป็นข้อมูลจำเป็น'); return; }
  const isAnon = document.getElementById('isAnon').checked;
  const name   = isAnon ? 'ไม่ระบุตัวตน' : document.getElementById('v-name').value;
  const pMap   = { high:'🔴 เร่งด่วน (24 ชม.)', medium:'🟡 ปานกลาง (3 วัน)', low:'🟢 ทั่วไป (7 วัน)' };
  document.getElementById('review-area').innerHTML = `
    <h3 style="margin-bottom:14px;border-bottom:1px solid #ccc;padding-bottom:10px;">ตรวจสอบข้อมูลก่อนส่ง</h3>
    <p><b>ประเภทผู้แจ้ง:</b> ${vocData.cType}</p>
    <p><b>การแสดงตัวตน:</b> ${name}</p>
    <p><b>ประเภทเรื่อง:</b> ${vocData.category}</p>
    <p><b>ความเร่งด่วน:</b> ${pMap[vocData.priority]||vocData.priority}</p>
    <p><b>หัวข้อ:</b> ${subject}</p>
    <p><b>รายละเอียด:</b> ${detail}</p>`;
  changeStep(4);
}

async function finalSubmit() {
  const ok = await showConfirm('📋','ยืนยันการส่งเรื่อง','ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้<br>ต้องการส่งเรื่องนี้ใช่หรือไม่?');
  if (!ok) return;
  const btn = document.getElementById('btn-final');
  btn.innerHTML = 'กำลังส่ง...'; btn.disabled = true;
  try {
    const res = await api.post('/api/submit', {
      customerType: vocData.cType,
      isAnon:       document.getElementById('isAnon').checked,
      name:         document.getElementById('v-name').value,
      studentId:    document.getElementById('v-sid').value,
      categories:   [vocData.category],
      priority:     vocData.priority,
      subject:      document.getElementById('v-subject').value,
      detail:       document.getElementById('v-detail').value,
      username:     currentUser ? currentUser.username : '',
    });
    if (res.success) {
      document.getElementById('step-content-4').classList.add('hidden');
      document.getElementById('success-area').classList.remove('hidden');
      document.getElementById('new-ticket-id').innerText = res.ticketId;
    } else {
      await showAlert('❌','ส่งไม่สำเร็จ', res.error||'เกิดข้อผิดพลาด');
    }
  } catch (e) {
    await showAlert('❌','เกิดข้อผิดพลาด', e.message);
  } finally { btn.innerHTML = 'ยืนยันการส่งเรื่อง'; btn.disabled = false; }
}

// ═══════════════════════════════════════════════════════════
//  PINNED TICKETS (หน้าหลัก)
// ═══════════════════════════════════════════════════════════
async function loadPinnedTickets() {
  const container = document.getElementById('pinned-tickets-section');
  if (!container) return;
  try {
    const res = await api.get('/api/tickets?action=pinned');
    if (res.success && res.tickets && res.tickets.length > 0) {
      container.classList.remove('hidden');
      const sc = { 'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject' };
      let html = `<div class="section-title" style="margin-bottom:12px;"><h2 style="font-size:1.05rem;color:var(--dgreen);"><i class="fas fa-thumbtack"></i> ประกาศ / สถานะที่น่าสนใจ</h2></div>`;
      res.tickets.forEach(t => {
        html += `<div class="ticket-card" style="margin-bottom:12px;">
          <div class="ticket-header"><span class="ticket-id">${t['Ticket ID']}</span><span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span></div>
          <div class="ticket-subject">${t['หัวข้อ']||'-'}</div>
          <div class="ticket-footer">
            <span><i class="fas fa-calendar"></i> ${t['วันที่แจ้ง']||''}</span>
            <span><i class="fas fa-user"></i> ${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
          </div>
          ${t['หมายเหตุ'] ? `<div class="ticket-feedback"><strong>หมายเหตุ:</strong> ${t['หมายเหตุ']}</div>` : ''}
        </div>`;
      });
      container.innerHTML = html;
    } else { container.classList.add('hidden'); }
  } catch(e) { container.classList.add('hidden'); }
}

// ═══════════════════════════════════════════════════════════
//  TRACKING (ข้อ 8 — ค้นหาได้เฉพาะ Ticket ID เท่านั้น)
// ═══════════════════════════════════════════════════════════
async function loadMyTickets() {
  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const res = await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`);
    if (res.success && res.tickets && res.tickets.length > 0) renderTicketCards(res.tickets);
    else resDiv.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">
      <i class="fas fa-inbox" style="font-size:2.5rem;color:#ccc;display:block;margin-bottom:12px;"></i>
      <p>คุณยังไม่มีประวัติการร้องเรียน</p>
      <button onclick="navigateTo('portal')" style="margin-top:16px;padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;">
        <i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่
      </button></div>`;
  } catch(e) { resDiv.innerHTML = `<p style='color:red;'>เกิดข้อผิดพลาด: ${e.message}</p>`; }
}

// ข้อ 8: ค้นหาเฉพาะ Ticket ID เท่านั้น — ลบการค้นหาด้วยชื่อออก
async function doTrack() {
  const val = document.getElementById('track-input').value.trim();
  if (!val) { await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอก Ticket ID เพื่อค้นหา'); return; }
  if (!val.toUpperCase().startsWith('VOC-')) {
    await showAlert('⚠️','รูปแบบไม่ถูกต้อง','กรุณากรอก Ticket ID ที่ขึ้นต้นด้วย VOC-<br>เช่น VOC-2568-0001<br><br><small style="color:#888;">เพื่อความปลอดภัยของข้อมูลส่วนบุคคล ระบบค้นหาได้เฉพาะ Ticket ID เท่านั้น</small>');
    return;
  }
  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังค้นหา...</p></div>';
  try {
    const res = await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val.toUpperCase())}`);
    if (res.success) renderTicketCards([res.ticket]);
    else resDiv.innerHTML = "<p style='color:red;text-align:center;padding:30px;'>ไม่พบหมายเลข Ticket ID นี้</p>";
  } catch(e) { resDiv.innerHTML = `<p style='color:red;'>เกิดข้อผิดพลาด: ${e.message}</p>`; }
}

function renderTicketCards(tickets) {
  const resDiv = document.getElementById('track-result');
  const sc = { 'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject' };
  let html = `<p style="color:#555;margin-bottom:15px;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t => {
    html += `<div class="ticket-card" style="margin-bottom:16px;">
      <div class="ticket-header"><span class="ticket-id">${t['Ticket ID']}</span><span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span></div>
      <div class="ticket-subject">${t['หัวข้อ']||'-'}</div>
      <div class="ticket-detail">${t['รายละเอียด']||''}</div>
      <div class="ticket-footer">
        <span><i class="fas fa-calendar"></i> ${t['วันที่แจ้ง']||''}</span>
        <span><i class="fas fa-clock"></i> กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span>
        <span><i class="fas fa-user"></i> ${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
      </div>
      ${t['หมายเหตุ'] ? `<div class="ticket-feedback"><strong><i class="fas fa-comment-dots"></i> หมายเหตุ:</strong> ${t['หมายเหตุ']}</div>` : ''}
    </div>`;
  });
  resDiv.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
//  ADMIN DASHBOARD (ข้อ 4, 5, 6)
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  document.getElementById('dash-content').innerHTML =
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดข้อมูล...</p></div>';
  try {
    const res = await api.get('/api/dashboard');
    if (res.success) renderDashboard(res.stats);
    else document.getElementById('dash-content').innerHTML = '<p style="color:red;">โหลดไม่สำเร็จ</p>';
  } catch(e) { document.getElementById('dash-content').innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

function renderDashboard(s) {
  const maxCat = Math.max(...Object.values(s.byCategory), 1);
  const maxCus = Math.max(...Object.values(s.byCustomer), 1);
  const maxMon = Math.max(...Object.values(s.byMonth), 1);
  let catBars='', cusBars='', monBars='', urgentHtml='';

  Object.entries(s.byCategory).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    catBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxCat*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byCustomer).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    cusBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v/maxCus*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byMonth).sort().slice(-6).forEach(([k,v])=>{
    monBars += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill blue" style="width:${Math.round(v/maxMon*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });

  // ข้อ 6: แสดง ticket เร่งด่วนที่ยังไม่เสร็จ
  if (s.urgentTickets && s.urgentTickets.length > 0) {
    urgentHtml = `<div class="urgent-banner">
      <h4><i class="fas fa-exclamation-triangle"></i> ⚠️ มี ${s.urgentTickets.length} เรื่องเร่งด่วนที่ยังไม่ได้ดำเนินการ</h4>
      ${s.urgentTickets.map(t=>`
        <div class="urgent-item">
          <span class="priority-badge p-high">🔴 เร่งด่วน</span>
          <strong>${t.ticketId}</strong>
          <span>${t.subject}</span>
          <span style="margin-left:auto;color:#888;font-size:.8rem;">กำหนด: ${t.due||'-'}</span>
        </div>`).join('')}
    </div>`;
  }

  // ข้อ 5 + 6: สรุปความเร่งด่วน
  const prioritySummary = `
    <div class="priority-stat-grid">
      <div class="pstat-card high">
        <div class="pstat-num" style="color:#d00000;">${s.byPriority.high||0}</div>
        <div class="pstat-label">🔴 เร่งด่วน (24 ชม.)</div>
      </div>
      <div class="pstat-card medium">
        <div class="pstat-num" style="color:#b25f00;">${s.byPriority.medium||0}</div>
        <div class="pstat-label">🟡 ปานกลาง (3 วัน)</div>
      </div>
      <div class="pstat-card low">
        <div class="pstat-num" style="color:#2d6a4f;">${s.byPriority.low||0}</div>
        <div class="pstat-label">🟢 ทั่วไป (7 วัน)</div>
      </div>
    </div>`;

  // ข้อ 4: อัตราความสำเร็จ
  const successRate = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
  const activeRate  = s.total > 0 ? Math.round(((s.pending + s.inprogress) / s.total) * 100) : 0;

  document.getElementById('dash-content').innerHTML = `
    ${urgentHtml}
    <div class="dash-grid">
      <div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">เรื่องทั้งหมด</div></div>
      <div class="stat-card orange"><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">รอดำเนินการ</div></div>
      <div class="stat-card blue"><div class="stat-num" style="color:#3a86ff;">${s.inprogress}</div><div class="stat-label">กำลังดำเนินการ</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">เสร็จสิ้น</div></div>
    </div>

    <div class="chart-card" style="margin-bottom:20px;">
      <h4><i class="fas fa-tachometer-alt"></i> ภาพรวมระบบ</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;margin-top:8px;">
        <div>
          <div style="font-size:1.8rem;font-weight:700;color:#2d6a4f;">${successRate}%</div>
          <div style="font-size:.8rem;color:#888;">อัตราสำเร็จ</div>
          <div class="bar-track" style="margin-top:6px;"><div class="bar-fill" style="width:${successRate}%"></div></div>
        </div>
        <div>
          <div style="font-size:1.8rem;font-weight:700;color:#f77f00;">${activeRate}%</div>
          <div style="font-size:.8rem;color:#888;">กำลังดำเนินการ</div>
          <div class="bar-track" style="margin-top:6px;"><div class="bar-fill orange" style="width:${activeRate}%"></div></div>
        </div>
        <div>
          <div style="font-size:1.8rem;font-weight:700;color:#d00000;">${s.rejected||0}</div>
          <div style="font-size:.8rem;color:#888;">ปฏิเสธ</div>
        </div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:20px;">
      <h4><i class="fas fa-fire"></i> สรุปตามความเร่งด่วน</h4>
      ${prioritySummary}
    </div>

    <div class="dash-charts">
      <div class="chart-card"><h4><i class="fas fa-tags"></i> แยกตามประเภทเรื่อง</h4>${catBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
      <div class="chart-card"><h4><i class="fas fa-users"></i> แยกตามประเภทผู้แจ้ง</h4>${cusBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
    </div>
    <div class="chart-card"><h4><i class="fas fa-calendar-alt"></i> รายเดือน (6 เดือนล่าสุด)</h4>${monBars||'<p style="color:#999;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  ADMIN TICKET MANAGEMENT (ข้อ 6, 7)
// ═══════════════════════════════════════════════════════════
function setFilter(id) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('filter-'+id);
  if (el) el.classList.add('active');
}

async function loadAdminTickets(filter) {
  document.getElementById('admin-ticket-list').innerHTML =
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const [ticketsRes, notifyRes] = await Promise.all([
      api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`),
      api.get('/api/notify?action=getEmail'),
    ]);
    const currentEmail = notifyRes.success ? (notifyRes.email||'') : '';
    if (ticketsRes.success) renderAdminTickets(ticketsRes.tickets, currentEmail);
    else document.getElementById('admin-ticket-list').innerHTML = '<p style="color:red;">โหลดไม่สำเร็จ</p>';
  } catch(e) { document.getElementById('admin-ticket-list').innerHTML = `<p style="color:red;">${e.message}</p>`; }
}

async function saveNotifyEmail() {
  const email = document.getElementById('notify-email-input').value.trim();
  if (!email) { await showAlert('⚠️','กรุณากรอก email','กรุณากรอก email ที่ต้องการรับการแจ้งเตือน'); return; }
  const btn = document.getElementById('btn-save-notify');
  btn.disabled = true; btn.innerHTML = 'กำลังบันทึก...';
  try {
    const res = await api.post('/api/notify', { action: 'setEmail', email });
    if (res.success) await showAlert('✅','บันทึกสำเร็จ',`จะส่งแจ้งเตือนไปที่ ${email}`);
    else await showAlert('❌','ไม่สำเร็จ', res.message);
  } catch(e) { await showAlert('❌','เกิดข้อผิดพลาด', e.message); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> บันทึก'; }
}

function renderAdminTickets(tickets, currentEmail) {
  const container = document.getElementById('admin-ticket-list');
  const priorityOrder = { high:0, medium:1, low:2 };

  // ข้อ 6: เรียงตามความเร่งด่วนก่อน
  tickets.sort((a,b) => {
    const pa = priorityOrder[a['ความเร่งด่วน']] ?? 99;
    const pb = priorityOrder[b['ความเร่งด่วน']] ?? 99;
    return pa - pb;
  });

  const scColor = {'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
  const scTag   = {'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const pLabel  = {'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pClass  = {'high':'p-high','medium':'p-medium','low':'p-low'};

  // ข้อ 7: กล่องตั้งค่า email แจ้งเตือน
  let html = `
    <div class="notify-box">
      <h4><i class="fas fa-bell"></i> ตั้งค่า Email รับแจ้งเตือน Ticket ใหม่</h4>
      <div class="notify-row">
        <input type="email" id="notify-email-input" placeholder="admin@gmail.com" value="${currentEmail}">
        <button class="btn-notify" id="btn-save-notify" onclick="saveNotifyEmail()">
          <i class="fas fa-save"></i> บันทึก
        </button>
      </div>
      ${currentEmail ? `<p style="font-size:.8rem;color:#2d6a4f;margin-top:8px;"><i class="fas fa-check-circle"></i> กำลังส่งแจ้งเตือนไปที่ ${currentEmail}</p>` : ''}
    </div>`;

  if (!tickets.length) {
    container.innerHTML = html + '<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ccc;"></i><p style="margin-top:12px;">ไม่มีเรื่องในหมวดนี้</p></div>';
    return;
  }

  html += `<p style="color:#666;margin-bottom:14px;font-size:.88rem;">แสดง ${tickets.length} รายการ (เรียงตามความเร่งด่วน)</p>`;

  tickets.forEach(t => {
    const tid      = t['Ticket ID'];
    const priority = t['ความเร่งด่วน'] || 'low';
    const isHigh   = priority === 'high';
    const isPinned = String(t['Pinned']||'').toLowerCase() === 'true';

    html += `
    <div class="admin-ticket-card ${scColor[t['สถานะ']]||'pending'} ${isHigh ? 'priority-high' : ''}" id="card-${tid}">
      <div class="admin-card-top">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${isHigh ? '<span style="font-size:1.1rem;" title="เร่งด่วนมาก">🚨</span>' : ''}
          <span class="ticket-id" style="font-size:1rem;">${tid}</span>
          <span style="font-size:.72rem;color:#aaa;">ID:${t['UserID']||'-'}</span>
          <span class="priority-badge ${pClass[priority]||'p-low'}">${pLabel[priority]||priority}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="status ${scTag[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span>
          <button id="pin-btn-${tid}" onclick="togglePin('${tid}',${!isPinned})"
            style="padding:3px 9px;border-radius:8px;border:1px solid ${isPinned?'#2d6a4f':'#ccc'};
            background:${isPinned?'#e8f5e9':'#fff'};cursor:pointer;font-size:.75rem;
            color:${isPinned?'#2d6a4f':'#888'};font-family:'Sarabun',sans-serif;">
            <i class="fas fa-thumbtack"></i> ${isPinned?'แสดงอยู่':'ปักหมุด'}
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

async function togglePin(ticketId, newState) {
  const ok = await showConfirm('📌', newState?'ปักหมุดบนหน้าหลัก':'ยกเลิกการปักหมุด',
    newState ? 'ticket นี้จะแสดงบนหน้าหลักให้ผู้ใช้ทั่วไปเห็น' : 'ยกเลิกการแสดง ticket นี้บนหน้าหลัก');
  if (!ok) return;
  try {
    const res = await api.post('/api/tickets', { action:'togglePin', ticketId, pinned: newState });
    if (res.success) {
      const btn = document.getElementById(`pin-btn-${ticketId}`);
      if (btn) {
        btn.style.border     = `1px solid ${newState?'#2d6a4f':'#ccc'}`;
        btn.style.background = newState ? '#e8f5e9' : '#fff';
        btn.style.color      = newState ? '#2d6a4f' : '#888';
        btn.innerHTML        = `<i class="fas fa-thumbtack"></i> ${newState?'แสดงอยู่':'ปักหมุด'}`;
        btn.setAttribute('onclick', `togglePin('${ticketId}',${!newState})`);
      }
    }
  } catch(e) { await showAlert('❌','เกิดข้อผิดพลาด', e.message); }
}

async function submitUpdate(ticketId) {
  const newStatus = document.getElementById('status-'+ticketId).value;
  const assignee  = document.getElementById('assignee-'+ticketId).value;
  const feedback  = document.getElementById('feedback-'+ticketId).value;
  const ok = await showConfirm('💾','ยืนยันการบันทึก',
    `Ticket: <strong>${ticketId}</strong><br>สถานะใหม่: <strong>${newStatus}</strong>`, 'warning');
  if (!ok) return;
  const btn = document.querySelector(`#card-${ticketId} .btn-update`);
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const res = await api.post('/api/tickets', { action:'update', ticketId, newStatus, assignee, feedback });
    if (res.success) {
      const card = document.getElementById('card-'+ticketId);
      card.style.transition = 'background .4s'; card.style.background = '#d4edda';
      setTimeout(() => { card.style.background = ''; }, 1500);
      const sTag  = {'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
      const scTag = {'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
      card.querySelector('.status').className = 'status '+(sTag[newStatus]||'status-pending');
      card.querySelector('.status').innerText = newStatus;
      card.className = `admin-ticket-card ${scTag[newStatus]||'pending'}`;
    } else { await showAlert('❌','บันทึกไม่สำเร็จ', res.message||''); }
  } catch(e) { await showAlert('❌','เกิดข้อผิดพลาด', e.message); }
  finally { btn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; btn.disabled = false; }
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
    else updateMenuForUser();
  }
  // real-time password strength
  const pwInput = document.getElementById('reg-pass');
  if (pwInput) pwInput.addEventListener('input', updateStrengthBar);
  // clear errors on input
  document.querySelectorAll('#page-register input').forEach(el =>
    el.addEventListener('input', clearFieldErrors));
  navigateTo('home');
};
