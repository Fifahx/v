// public/js/app.js — VOC System v6 (Modular)
// Entry point — global state + init
// ใช้ ES Modules import จาก session.js, api.js, ui.js, validation.js, router.js
'use strict';

import { saveSession, loadSession, clearSession, loadToken } from './session.js';
import { api } from './api.js';
import { showAlert, showConfirm } from './ui.js';
import { validateRegister, updateStrengthBar, clearFieldErrors } from './validation.js';
import { navigateTo, _doNavigate, registerRouterCallbacks, closeMobileNav, toggleMobileNav } from './router.js';

// ════ EARLY GLOBAL BINDING ════
// expose globals ทันทีที่ module โหลด — ก่อน window.onload เสมอ
// Turnstile widget render ตอน DOMContentLoaded แล้วเรียก window.onTurnstileSuccess
// ถ้ารอ window.onload จะไม่มี callback → ปุ่มไม่ enable ตลอดกาล
window.navigateTo = (...a) => navigateTo(...a);
window.scrollToManual = (...a) => scrollToManual(...a);
window.toggleMobileNav = (...a) => toggleMobileNav(...a);
window.closeMobileNav = (...a) => closeMobileNav(...a);
window.onTurnstileSuccess = (token) => onTurnstileSuccess(token);
window.onTurnstileExpire = () => onTurnstileExpire();
window.onTurnstileError = () => onTurnstileError();
let currentUser = null;
let currentStep = 1;
let ratingSelection = 0;
let vocData = { cType: 'นักศึกษา', priority: 'medium', category: 'ข้อเสนอแนะหลักสูตร' };
let attachedFile = null;
let currentReportType = 'service';
let currentSATab = 'news';
let _newsCache = [];
let _saNewsCache = [];
let _turnstileToken = '';
let _turnstileReady = false;

const SUBMIT_COOLDOWN_MS = 5 * 60 * 1000;
function isClientRateLimited() { try { return Date.now() - Number(localStorage.getItem('voc_last_submit') || 0) < SUBMIT_COOLDOWN_MS; } catch (e) { return false; } }
function markClientSubmit() { try { localStorage.setItem('voc_last_submit', String(Date.now())); } catch (e) { } }
function clientCooldownRemaining() { try { const rem = Math.ceil((SUBMIT_COOLDOWN_MS - (Date.now() - Number(localStorage.getItem('voc_last_submit') || 0))) / 60000); return rem > 0 ? rem : 0; } catch (e) { return 0; } }

// ════ TURNSTILE ════
function onTurnstileSuccess(token) { _turnstileToken = token; _turnstileReady = true; const btn = document.getElementById('btn-final'); const st = document.getElementById('turnstile-status'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> ยืนยันการส่งเรื่องร้องเรียน'; } if (st) { st.className = 'turnstile-status-msg turnstile-ok'; st.innerHTML = '<i class="fas fa-check-circle"></i> ยืนยันตัวตนสำเร็จ'; } }
function onTurnstileExpire() { _turnstileToken = ''; _turnstileReady = false; const btn = document.getElementById('btn-final'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-shield-alt"></i> กรุณายืนยันอีกครั้ง'; } }
function onTurnstileError() { _turnstileToken = ''; _turnstileReady = false; const st = document.getElementById('turnstile-status'); if (st) { st.className = 'turnstile-status-msg turnstile-err'; st.innerHTML = '<i class="fas fa-times-circle"></i> ไม่สามารถโหลด CAPTCHA ได้'; } }
function resetTurnstile() { _turnstileToken = ''; _turnstileReady = false; const btn = document.getElementById('btn-final'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-shield-alt"></i> ยืนยันการส่งเรื่อง (รอการยืนยัน)'; } try { if (window.turnstile) window.turnstile.reset('#cf-turnstile-widget'); } catch (e) { } }

// ════ DROPDOWN ════
function toggleDropdown(id) { const menu = document.getElementById(id); if (!menu) return; const isOpen = menu.classList.contains('open'); document.querySelectorAll('.voc-dropdown-menu.open').forEach(m => m.classList.remove('open')); document.querySelectorAll('.voc-dropdown-arrow.rotated').forEach(a => a.classList.remove('rotated')); if (!isOpen) { menu.classList.add('open'); const wrap = menu.closest('.voc-dropdown-wrap'); if (wrap) { const arrow = wrap.querySelector('.voc-dropdown-arrow'); if (arrow) arrow.classList.add('rotated'); } } }
function selectReportType(type, label, iconCls, btn) { document.querySelectorAll('#report-type-dropdown .voc-dropdown-item').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); const lbl = document.getElementById('report-type-label'); const ico = document.getElementById('report-type-icon'); if (lbl) lbl.textContent = label; if (ico) ico.className = iconCls; document.getElementById('report-type-dropdown')?.classList.remove('open'); loadReport(type); }
function selectTicketFilter(filter, label, btn) { document.querySelectorAll('#ticket-filter-dropdown .voc-dropdown-item').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); const lbl = document.getElementById('ticket-filter-label'); if (lbl) lbl.textContent = label; document.getElementById('ticket-filter-dropdown')?.classList.remove('open'); loadAdminTickets(filter); setFilter(filter === 'pending' ? 'pending' : filter === 'all' ? 'all' : filter === 'เสร็จสิ้น' ? 'done' : filter === 'ปฏิเสธ' ? 'rejected' : 'inprogress'); }

// ════ AUTH ════
function showAdminLoginModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function hideAdminLoginModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function doLogin() {
  const u = document.getElementById('login-user').value.trim(), p = document.getElementById('login-pass').value;
  if (!u || !p) { await showAlert('กรุณากรอกข้อมูล', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  const btn = document.getElementById('btn-login'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';
  try { const res = await api.post('/api/auth', { action: 'loginUser', username: u, password: p }); if (res.success) { currentUser = res; saveSession(res); updateMenuForUser(); const after = sessionStorage.getItem('voc_after_login'); if (after) { sessionStorage.removeItem('voc_after_login'); navigateTo(after); } else navigateTo('home'); } else await showAlert('เข้าสู่ระบบไม่สำเร็จ', res.message); }
  catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
  finally { btn.disabled = false; btn.innerHTML = 'ยืนยัน'; }
}

async function doAdminLogin() {
  const u = document.getElementById('admin-user').value.trim(), p = document.getElementById('admin-pass').value;
  if (!u || !p) { await showAlert('กรุณากรอกข้อมูล', ''); return; }
  const btn = document.getElementById('btn-admin-login'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังตรวจสอบ...';
  try { const res = await api.post('/api/auth', { action: 'loginAdmin', username: u, password: p }); if (res.success) { currentUser = res; saveSession(res); hideAdminLoginModal(); if (res.role === 'superadmin') { updateMenuForSuperAdmin(); navigateTo('superadmin'); } else { updateMenuForAdmin(); navigateTo('admin-dashboard'); } } else await showAlert('เข้าสู่ระบบไม่สำเร็จ', res.message); }
  catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
  finally { btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ'; }
}

async function doRegister() {
  if (!validateRegister()) return;
  const btn = document.getElementById('btn-register'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังลงทะเบียน...';
  try { const res = await api.post('/api/auth', { action: 'register', firstname: document.getElementById('reg-firstname').value.trim(), lastname: document.getElementById('reg-lastname').value.trim(), email: document.getElementById('reg-email').value.trim(), lineId: document.getElementById('reg-line').value.trim(), phone: document.getElementById('reg-phone').value.trim(), username: document.getElementById('reg-username').value.trim(), password: document.getElementById('reg-pass').value }); if (res.success) { await showAlert('ลงทะเบียนสำเร็จ', 'กรุณาเข้าสู่ระบบเพื่อใช้งาน'); navigateTo('login'); } else await showAlert('ไม่สำเร็จ', res.message); }
  catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
  finally { btn.disabled = false; btn.innerHTML = 'ยืนยันการลงทะเบียน'; }
}

async function doLogout() {
  if (!await showConfirm('ออกจากระบบ', 'ต้องการออกจากระบบใช่หรือไม่?')) return;
  currentUser = null; clearSession();
  _updateAdminFab(false); // แสดง FAB กลับมาหลัง logout
  _clearAdminPageContent(); // ล้าง admin content ออกจาก DOM เมื่อ logout
  _resetMenuToGuest();
  navigateTo('home');
}

// ── Admin FAB visibility ──────────────────────────────────────────────────
// ซ่อนปุ่ม floating เมื่อ login เป็น admin/superadmin แล้ว (ไม่จำเป็นต้องแสดง)
// แสดงกลับมาเมื่อ logout
function _updateAdminFab(hide) {
  const fab = document.getElementById('admin-fab');
  if (!fab) return;
  if (hide) fab.classList.add('hidden-fab');
  else fab.classList.remove('hidden-fab');
}

// ════ MENU ════
function updateMenuForUser() {
  _updateAdminFab(true); // user login แล้ว — ซ่อน FAB ด้วย (ไม่ต้องการ admin login)
  document.getElementById('main-nav').innerHTML = `<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a><a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a><a onclick="scrollToManual()" id="nav-manual">คู่มือ</a><a onclick="navigateTo('faq')" id="nav-faq">คำถามที่พบบ่อย</a>`;
  document.getElementById('right-menu').innerHTML = `<span class="user-badge header-auth-desktop" onclick="showProfile()" title="โปรไฟล์"><i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="showProfile()" aria-label="โปรไฟล์" title="โปรไฟล์"><i class="fas fa-user-circle"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}
function updateMenuForAdmin() {
  _updateAdminFab(true); // ซ่อน FAB — admin login แล้ว ไม่ต้องแสดงอีก
  _initAdminPageContent('admin');
  document.getElementById('main-nav').innerHTML = `<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a><a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a><a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a><a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a><a onclick="navigateTo('faq')" id="nav-faq">FAQ</a>`;
  document.getElementById('right-menu').innerHTML = `<span class="user-badge header-auth-desktop"><i class="fas fa-shield-alt"></i>${currentUser.fullname || 'Admin'}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ (Admin)"><i class="fas fa-shield-alt"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}
function updateMenuForSuperAdmin() {
  _updateAdminFab(true); // ซ่อน FAB — superadmin login แล้ว
  _initAdminPageContent('superadmin');
  document.getElementById('main-nav').innerHTML = `<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a><a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a><a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a><a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a><a onclick="navigateTo('superadmin')" id="nav-superadmin">⚙️ ระบบ</a>`;
  document.getElementById('right-menu').innerHTML = `<span class="user-badge superadmin-badge header-auth-desktop"><i class="fas fa-crown" style="color:#f0a500;"></i>${currentUser.fullname || 'SuperAdmin'}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ (SuperAdmin)"><i class="fas fa-crown" style="color:#f0a500;"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}

// ==== NAVIGATION คู่มือ Scroll - start ════
// ฟังก์ชันเพื่อ scroll ไปยังส่วน manual — navigate ไป home ถ้าอยู่หน้าอื่น
function scrollToManual() {
  const targetId = 'manual-grid-ID';
  const targetElement = document.getElementById(targetId);
  const homePage = document.getElementById('page-home');

  // กรณีที่ 1: Element พบและ page-home visible
  if (targetElement && homePage && !homePage.classList.contains('hidden')) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // กรณีที่ 2: อยู่หน้าอื่น ต้อง navigate ไป home ก่อน
  else {
    // Navigate ไปที่ home
    if (typeof navigateTo === 'function') {
      navigateTo('home');
    }

    // Polling หา element หลังจาก navigate
    const checkExist = setInterval(() => {
      const dynamicTarget = document.getElementById(targetId);
      const dHomePage = document.getElementById('page-home');
      // ตรวจสอบว่า element พบและ page-home visible
      if (dynamicTarget && dHomePage && !dHomePage.classList.contains('hidden')) {
        clearInterval(checkExist);
        // หน่วงเวลาให้ layout render เสร็จสิ้น
        setTimeout(() => {
          dynamicTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }, 50);

    // Timeout ที่ 5 วินาที
    setTimeout(() => {
      clearInterval(checkExist);
    }, 5000);
  }
}
// ==== NAVIGATION btn คู่มือ Scroll - end ════

// ════ ROLE-BASED DOM INJECTION ════
// inject skeleton HTML เข้า admin pages เฉพาะเมื่อ login เป็น admin/superadmin
// เมื่อ logout → ลบ innerHTML ทิ้งเพื่อป้องกัน user เห็น
function _initAdminPageContent(role) {
  // dash-content
  const dc = document.getElementById('dash-content');
  if (dc && !dc.innerHTML.trim()) dc.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';

  // admin-ticket-list
  const tl = document.getElementById('admin-ticket-list');
  if (tl && !tl.innerHTML.trim()) tl.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';

  // review-content
  const rc = document.getElementById('review-content');
  if (rc && !rc.innerHTML.trim()) rc.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';

  // report-content
  const rpc = document.getElementById('report-content');
  if (rpc && !rpc.innerHTML.trim()) rpc.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';

  // superadmin-content — เฉพาะ superadmin เท่านั้น
  if (role === 'superadmin') {
    const sc = document.getElementById('superadmin-content');
    if (sc && !sc.innerHTML.trim()) sc.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  }
}

function _clearAdminPageContent() {
  // ล้าง content ทั้งหมดออกจาก DOM เมื่อ logout
  // เพื่อป้องกัน user เห็น admin data หลัง logout
  ['dash-content', 'admin-ticket-list', 'review-content',
    'report-content', 'superadmin-content', 'user-report-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
}



// ════ COMPLAINT TYPE MODAL ════
function showComplaintTypeModal(callback) {
  const o = document.createElement('div'); o.className = 'voc-overlay'; o.id = 'complaint-type-overlay';
  o.innerHTML = `<div class="voc-modal-box complaint-type-modal" style="max-width:520px;"><div style="text-align:center;margin-bottom:6px;"><span style="font-size:2.2rem;"></span></div><div class="voc-modal-title">เลือกประเภทการร้องเรียน</div><div class="complaint-type-cards"><div class="complaint-type-card" id="ctype-oneway">
  <div class="ctype-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="30" fill="var(--primary)" class="bi bi-file-earmark-text" viewBox="0 0 16 16">
      <path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/>
      <path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
    </svg>
  </div>
  <div class="ctype-title">ร้องเรียนทางเดียว</div></div><div class="complaint-type-card" id="ctype-track">
  <div class="ctype-icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="30" fill="var(--primary)" class="bi bi-clipboard-check" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0"></path>
      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"></path>
      <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"></path>
    </svg>
  </div><div class="ctype-title">ร้องเรียนแบบติดตามผล</div></div></div><div id="ctype-confirm-area" style="display:none;margin-top:18px;"><div class="ctype-confirm-msg" id="ctype-confirm-msg"></div><div class="voc-modal-btns" style="margin-top:12px;"><button class="voc-btn-ok" id="ctype-confirm-btn">ยืนยัน</button></div></div><div style="margin-top:14px;text-align:center;"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('complaint-type-overlay'))" style="font-size:.82rem;padding:7px 18px;">ยกเลิก</button></div></div>`;
  document.body.appendChild(o);
  function selectType(type) {
    document.getElementById('ctype-oneway').classList.toggle('selected', type === 'oneway');
    document.getElementById('ctype-track').classList.toggle('selected', type === 'track');
    const area = document.getElementById('ctype-confirm-area'); const msg = document.getElementById('ctype-confirm-msg'); const btn = document.getElementById('ctype-confirm-btn');
    if (type === 'oneway') { msg.innerHTML = `<div class="ctype-confirm-warn"><i class="fas fa-exclamation-triangle"></i> <strong>จะไม่สามารถติดตามสถานะได้</strong></div>`; btn.textContent = 'ยืนยัน - แจ้งเรื่องโดยไม่ Login'; btn.onclick = () => { document.body.removeChild(o); callback('oneway'); }; }
    else { msg.innerHTML = `<div class="ctype-confirm-ok"><i class="fas fa-check-circle"></i> <strong>จะถูกนำไปยังหน้าเข้าสู่ระบบก่อน</strong></div>`; btn.textContent = 'ยืนยัน - ไปเข้าสู่ระบบ'; btn.onclick = () => { document.body.removeChild(o); callback('track'); }; }
    area.style.display = 'block';
  }
  window.resetComplaintTypeSelection = function () { document.getElementById('ctype-oneway').classList.remove('selected'); document.getElementById('ctype-track').classList.remove('selected'); document.getElementById('ctype-confirm-area').style.display = 'none'; };
  document.getElementById('ctype-oneway').addEventListener('click', () => selectType('oneway'));
  document.getElementById('ctype-track').addEventListener('click', () => selectType('track'));
}

// ════ PORTAL VIEW ════
function setupPortalView() {
  const oldBanner = document.getElementById('guest-mode-banner'); if (oldBanner) oldBanner.remove();
  const w = document.getElementById('portal-login-warning'); const f = document.getElementById('portal-form-content');
  if (currentUser && currentUser.role === 'user') {
    w.classList.add('hidden'); f.classList.remove('hidden');
    // กรอกชื่อให้อัตโนมัติจากข้อมูล login
    const nf = document.getElementById('v-name'); if (nf && currentUser.firstname) nf.value = (currentUser.firstname || '') + ' ' + (currentUser.lastname || '');
    // ซ่อน panel "แสดงตัวตน" เพราะระบบรู้ตัวตนแล้วจาก session — แสดงเฉพาะ guest เท่านั้น
    const idPanel = document.getElementById('identity-panel-step1'); if (idPanel) idPanel.classList.add('hidden');
    // reset isAnon ให้ false เสมอเมื่อ login
    const anonCb = document.getElementById('isAnon'); if (anonCb) anonCb.checked = false;
    const idFields = document.getElementById('identity-fields');
    if (idFields) { idFields.style.opacity = ''; idFields.style.pointerEvents = ''; idFields.querySelectorAll('input').forEach(el => { el.disabled = false; }); }
  }
  else if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin')) { w.classList.remove('hidden'); w.innerHTML = '<i class="fas fa-info-circle"></i><span>เจ้าหน้าที่ไม่สามารถแจ้งเรื่องได้</span>'; f.classList.add('hidden'); }
  else { w.classList.remove('hidden'); f.classList.add('hidden'); }
}
function setupGuestPortalView() {
  const w = document.getElementById('portal-login-warning');
  const f = document.getElementById('portal-form-content');
  if (w) w.classList.add('hidden');
  if (!f) return;

  f.classList.remove('hidden');

  // ลบ badge เก่าออกก่อน (ป้องกัน duplicate)
  const oldBadge = document.getElementById('guest-mode-banner');
  if (oldBadge) oldBadge.remove();

  // วาง badge แจ้งเตือนเล็กๆ บนสุดของฟอร์ม — กด X ปิดได้
  const b = document.createElement('div');
  b.id = 'guest-mode-banner';
  b.className = 'guest-notify-badge';
  b.innerHTML = `
    <div class="guest-banner-inner">
      <div class="guest-banner-left">
        <i class="fas fa-user-circle guest-banner-icon"></i>
        <div class="guest-banner-text">
          <div class="guest-banner-title">คุณยังไม่ได้เข้าสู่ระบบ</div>
          <div class="guest-banner-sub">จะ<strong>ไม่สามารถติดตามสถานะ</strong>ได้หลังส่งเรื่อง</div>
        </div>
      </div>
      <div class="guest-banner-btns">
        <button class="guest-btn-login" onclick="navigateTo('login')">
          <i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ
        </button>
        <button class="guest-btn-cont" onclick="dismissGuestBanner()">
          <i class="fas fa-bullhorn"></i> แจ้งเรื่องโดยไม่ login
        </button>
      </div>
    </div>`;
  f.insertBefore(b, f.firstChild);

  // แสดง panel "แสดงตัวตน" กลับมาสำหรับ guest (อาจถูกซ่อนจาก setupPortalView)
  const idPanel = document.getElementById('identity-panel-step1'); if (idPanel) idPanel.classList.remove('hidden');

  changeStep(1);
}
function dismissGuestBanner() {
  const b = document.getElementById('guest-mode-banner');
  if (b) b.remove();
}

// ════ PROFILE ════
async function showProfile() {
  if (!currentUser) return;
  try {
    const res = await api.get(`/api/profile?username=${encodeURIComponent(currentUser.username)}`);
    const p = res.success ? res.profile : currentUser; const ini = (p.firstname || '?')[0].toUpperCase();
    const o = document.createElement('div'); o.className = 'voc-overlay'; o.id = 'profile-overlay';
    o.innerHTML = `<div class="voc-modal-box" style="max-width:500px;"><div class="profile-avatar">${ini}</div><div class="voc-modal-title">${p.firstname || ''} ${p.lastname || ''}</div><div style="text-align:center;margin-bottom:16px;"><span style="background:#e8f5e9;color:#2d6a4f;padding:3px 14px;border-radius:20px;font-size:.8rem;font-weight:700;">@${p.username || ''}</span></div><div style="border:1.5px solid #e0f0e8;border-radius:10px;padding:14px 16px;margin-bottom:18px;"><div style="display:flex;flex-direction:column;gap:10px;"><div><div class="label" style="margin-bottom:4px;">📧 อีเมล</div><input class="profile-edit-field" id="pe-email" value="${p.email || ''}" placeholder="email@example.com"></div><div><div class="label" style="margin-bottom:4px;">📱 เบอร์โทรศัพท์</div><input class="profile-edit-field" id="pe-phone" value="${p.phone || ''}" placeholder="0xxxxxxxxx" maxlength="10"></div><div><div class="label" style="margin-bottom:4px;">💬 Line ID</div><input class="profile-edit-field" id="pe-line" value="${p.lineId || ''}" placeholder="Line ID"></div></div></div><div style="text-align:center;margin-bottom:14px;"><button onclick="showUserReport('${p.username || ''}')" style="width:100%;padding:10px;background:#f0faf5;border:1.5px solid var(--dgreen);border-radius:10px;color:var(--dgreen);font-family:'Sarabun',sans-serif;font-size:.92rem;font-weight:700;cursor:pointer;"><i class="fas fa-chart-pie"></i> ดูรายงานสรุปการใช้บริการของฉัน</button></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('profile-overlay'))">ปิด</button><button class="voc-btn-ok" onclick="saveProfile('${p.username || ''}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`;
    document.body.appendChild(o);
  } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
}
async function saveProfile(username) {
  const email = document.getElementById('pe-email').value.trim(); const phone = document.getElementById('pe-phone').value.trim(); const lineId = document.getElementById('pe-line').value.trim();
  try { const res = await api.patch('/api/profile', { username, email, phone, lineId }); if (res.success) { await showAlert('บันทึกสำเร็จ', 'อัปเดตข้อมูลเรียบร้อยแล้ว'); const o = document.getElementById('profile-overlay'); if (o) document.body.removeChild(o); } else await showAlert('ไม่สำเร็จ', res.message); }
  catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
}

// ════ VOC FORM ════
function changeStep(step) {
  currentStep = step;
  // ซ่อนทุก step content
  for (let i = 1; i <= 4; i++) {
    document.getElementById('step-content-' + i)?.classList.add('hidden');
    const node = document.getElementById('node' + i);
    if (node) {
      node.classList.remove('active', 'done');
      const labels = ['ระบุตัวตน', 'เรื่องที่แจ้ง', 'รายละเอียด', 'ยืนยัน'];
      if (i < step) {
        // ขั้นที่ผ่านมาแล้ว → CSS จัดการ checkmark ด้วย .done::after { content:'✓' }
        node.classList.add('done');
        node.innerHTML = '<span>' + labels[i - 1] + '</span>';
      } else if (i === step) {
        node.classList.add('active');
        node.innerHTML = i + '<span>' + labels[i - 1] + '</span>';
      } else {
        node.innerHTML = i + '<span>' + labels[i - 1] + '</span>';
      }
    }
  }
  document.getElementById('success-area')?.classList.add('hidden');
  document.getElementById('step-content-' + step)?.classList.remove('hidden');
  // อัปเดต data-step เพื่อให้ connector line CSS ทำงาน
  document.querySelector('.step-progress')?.setAttribute('data-step', step);
  if (step !== 4) {
    resetTurnstile();
  } else {
    // step 4 — render Turnstile widget ถ้ายังไม่ได้ render
    const _tryRenderTurnstile = () => {
      const widget = document.getElementById('cf-turnstile-widget');
      if (!widget) return;
      const alreadyHasIframe = widget.querySelector('iframe');
      if (alreadyHasIframe) return; // render แล้ว ไม่ต้องทำอีก
      if (window.turnstile) {
        window.turnstile.render('#cf-turnstile-widget', {
          sitekey: widget.dataset.sitekey,
          callback: window.onTurnstileSuccess,
          'expired-callback': window.onTurnstileExpire,
          'error-callback': window.onTurnstileError,
          theme: 'light',
          language: 'th',
        });
      }
    };
    // ลอง render ทันที แล้วก็ลองอีกครั้งเผื่อ API ยังโหลดไม่เสร็จ
    setTimeout(_tryRenderTurnstile, 50);
    setTimeout(_tryRenderTurnstile, 500);
    setTimeout(_tryRenderTurnstile, 1500);
  }
}

function setOption(el, key, val) { el.parentElement.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); vocData[key] = val; }
function toggleAnon() {
  const isAnon = document.getElementById('isAnon').checked;
  const fields = document.getElementById('identity-fields');
  if (!fields) return;
  fields.style.opacity = isAnon ? '0.35' : '1';
  fields.style.pointerEvents = isAnon ? 'none' : '';
  fields.querySelectorAll('input').forEach(el => { el.disabled = isAnon; if (isAnon) el.value = ''; });
}
function handleFileSelect(inputEl) {
  // Legacy: ไม่ใช้แล้ว — ใช้ link input แทน
}

// ════ FILE UPLOAD (Step 3) ════
function switchFileTab(tab) {
  document.getElementById('file-panel-link').style.display = tab === 'link' ? '' : 'none';
  document.getElementById('file-panel-upload').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('tab-link').classList.toggle('active', tab === 'link');
  document.getElementById('tab-upload').classList.toggle('active', tab === 'upload');
  // reset ฝั่งที่ไม่ได้ใช้
  if (tab === 'link') { attachedFile = null; clearFileUpload(); }
  if (tab === 'upload') { const li = document.getElementById('v-file-link'); if (li) li.value = ''; }
}

function handleFileUploadSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showAlert('ไฟล์ใหญ่เกินไป', 'ขนาดไฟล์ต้องไม่เกิน 10 MB');
    input.value = ''; return;
  }
  attachedFile = file;
  document.getElementById('file-upload-label').textContent = file.name;
  document.getElementById('file-upload-name').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  document.getElementById('file-upload-preview').style.display = '';
}

function clearFileUpload() {
  attachedFile = null;
  const inp = document.getElementById('v-file-input');
  if (inp) inp.value = '';
  const label = document.getElementById('file-upload-label');
  if (label) label.textContent = 'เลือกรูปภาพหรือ PDF (สูงสุด 10 MB)';
  const preview = document.getElementById('file-upload-preview');
  if (preview) preview.style.display = 'none';
}

async function uploadAttachedFile() {
  if (!attachedFile) return null;
  const prog = document.getElementById('file-upload-progress');
  if (prog) prog.style.display = '';
  try {
    const fd = new FormData();
    fd.append('file', attachedFile);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success && data.url) return data.url;
    throw new Error(data.error || 'อัพโหลดไม่สำเร็จ');
  } finally {
    if (prog) prog.style.display = 'none';
  }
}

function prepareReview() {
  const subject = document.getElementById('v-subject')?.value.trim(); const detail = document.getElementById('v-detail')?.value.trim(); const note = document.getElementById('v-note')?.value.trim() || '';
  if (!subject) { showAlert('กรุณากรอกหัวข้อ', ''); return; } if (!detail) { showAlert('กรุณากรอกรายละเอียด', ''); return; }
  const isAnon = document.getElementById('isAnon')?.checked; const name = isAnon ? 'ไม่ระบุตัวตน' : (document.getElementById('v-name')?.value || '-'); const sid = isAnon ? '-' : (document.getElementById('v-sid')?.value || '-');
  const pMap = { high: { label: '🔴 เร่งด่วน', sub: 'ภายใน 24 ชม.', cls: 'high' }, medium: { label: '🟡 ปานกลาง', sub: 'ภายใน 3 วัน', cls: 'medium' }, low: { label: '🟢 ทั่วไป', sub: 'ภายใน 7 วัน', cls: 'low' } };
  const pInfo = pMap[vocData.priority] || pMap.medium; const detailHtml = detail.replace(/\n/g, '<br>');
  const _rl = document.getElementById('v-file-link')?.value.trim() || '';
  const _fileLinkHtml = _rl && _rl.startsWith('http') ? `<div class="review-section"><div class="review-section-title">・ลิงก์ไฟล์แนบ</div><div style="padding:10px 14px;background:#f5f5f5;border-radius:8px;"><a href="${_rl}" target="_blank" style="color:#2d6a4f;word-break:break-all;font-size:.87rem;"><i class="fas fa-external-link-alt"></i> ${_rl}</a></div></div>` : '';
  const _fileObjUrl = attachedFile ? URL.createObjectURL(attachedFile) : '';
  const _fileUploadHtml = attachedFile ? `<div class="review-section"><div class="review-section-title">・ไฟล์แนบ</div><div style="padding:10px 14px;background:#f5f5f5;border-radius:8px;display:flex;align-items:center;gap:10px;"><i class="fas fa-file-alt" style="color:#2d6a4f;font-size:1.1rem;"></i><div><a href="${_fileObjUrl}" target="_blank" rel="noopener" style="font-size:.87rem;font-weight:600;color:#2d6a4f;word-break:break-all;text-decoration:none;">${attachedFile.name} <i class="fas fa-external-link-alt" style="font-size:.75rem;"></i></a><div style="font-size:.78rem;color:#888;margin-top:2px;">${(attachedFile.size / 1024 / 1024).toFixed(2)} MB</div></div></div></div>` : '';
  document.getElementById('review-area').innerHTML = `<div class="review-card"><div class="review-card-header"><h3>ตรวจสอบข้อมูลก่อนส่ง</h3></div><div class="review-section"><div class="review-section-title">👤 ข้อมูลผู้แจ้ง</div><div class="review-row"><span class="ri">・</span><span class="rl">ประเภท</span><span class="rv">${vocData.cType}</span></div><div class="review-row"><span class="ri">・</span><span class="rl">ชื่อ-นามสกุล</span><span class="rv">${name}</span></div><div class="review-row"><span class="ri">・</span><span class="rl">รหัส/หน่วยงาน</span><span class="rv">${sid}</span></div></div><div class="review-section"><div class="review-section-title">📂 รายละเอียดเรื่อง</div><div class="review-row"><span class="ri">・</span><span class="rl">ประเภทเรื่อง</span><span class="rv">${vocData.category}</span></div><div class="review-row"><span class="ri">・</span><span class="rl">ความเร่งด่วน</span><span class="rv"><span class="priority-pill ${pInfo.cls}">${pInfo.label}</span><small style="color:#999;margin-left:6px;">${pInfo.sub}</small></span></div><div class="review-row"><span class="ri">・</span><span class="rl">หัวข้อ</span><span class="rv" style="font-weight:700;">${subject}</span></div></div><div class="review-section"><div class="review-section-title">・ รายละเอียด</div><div style="background:#f8faf9;border-radius:10px;padding:14px;font-size:.9rem;color:#444;line-height:1.75;border-left:3px solid var(--dgreen);">${detailHtml}</div></div>${note ? `<div class="review-section"><div class="review-section-title">・ หมายเหตุ</div><div style="background:#fffbf0;border-radius:10px;padding:12px 14px;font-size:.88rem;color:#555;border-left:3px solid #f77f00;">${note}</div></div>` : ''}${_fileLinkHtml}${_fileUploadHtml}<div style="background:#e8f5e9;border-radius:10px;padding:12px 16px;margin:16px 24px;font-size:.82rem;color:#2d6a4f;"><i class="fas fa-info-circle"></i> ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้</div></div>`;
  changeStep(4);
}

async function finalSubmit() {
  if (!currentUser && isClientRateLimited()) { await showAlert('กรุณารอสักครู่', `กรุณารออีก ${clientCooldownRemaining()} นาที`); return; }
  // ถ้า onTurnstileSuccess ถูกเรียกแล้วแต่ _turnstileReady ยัง false (race condition)
  // ให้ fallback อ่าน token จาก widget DOM โดยตรง
  if (!_turnstileReady || !_turnstileToken) {
    const _widgetEl = document.querySelector('#cf-turnstile-widget [name="cf-turnstile-response"]');
    const _domToken = _widgetEl ? _widgetEl.value : '';
    if (_domToken && _domToken.length > 10) {
      _turnstileToken = _domToken;
      _turnstileReady = true;
    }
  }
  const _hasTurnstileWidget = !!document.getElementById('cf-turnstile-widget');
  if (_hasTurnstileWidget && (!_turnstileReady || !_turnstileToken)) {
    await showAlert('กรุณายืนยันตัวตน', 'กรุณายืนยัน CAPTCHA ก่อนส่งเรื่อง');
    return;
  }
  if (!await showConfirm('ยืนยันการส่งเรื่อง', 'ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้')) return;
  const btn = document.getElementById('btn-final'); btn.disabled = true;
  let submitted = false; // ← flag: ถ้า true แล้ว finally จะไม่ re-enable ปุ่ม
  try {
    // ใช้ link ที่ user กรอกโดยตรง แทนการ upload
    let fileUrl = '';
    if (attachedFile) {
      fileUrl = await uploadAttachedFile() || '';
    } else {
      const _linkInput = document.getElementById('v-file-link');
      fileUrl = (_linkInput && _linkInput.value.trim().startsWith('http'))
        ? _linkInput.value.trim() : '';
    }
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...';
    const res = await api.post('/api/submit', { customerType: vocData.cType, isAnon: document.getElementById('isAnon').checked, name: document.getElementById('v-name').value, studentId: document.getElementById('v-sid').value, categories: [vocData.category], priority: vocData.priority, subject: document.getElementById('v-subject').value, detail: document.getElementById('v-detail').value, userNote: document.getElementById('v-note')?.value.trim() || '', fileUrl, username: currentUser ? currentUser.username : 'guest', turnstileToken: _turnstileToken || 'bypass-no-widget' });
    if (res.success) {
      submitted = true; // ← mark ว่าส่งสำเร็จแล้ว finally จะไม่แตะปุ่ม
      markClientSubmit(); resetTurnstile(); attachedFile = null;
      document.getElementById('step-content-4')?.classList.add('hidden');
      document.getElementById('success-area')?.classList.remove('hidden');
      document.getElementById('new-ticket-id').innerText = res.ticketId;
    } else {
      await showAlert('ส่งไม่สำเร็จ', res.error || res.message || 'เกิดข้อผิดพลาด');
    }
  } catch (e) {
    await showAlert('เกิดข้อผิดพลาด', e.message);
  } finally {
    // re-enable ปุ่มเฉพาะกรณีที่ยังไม่สำเร็จ (error/cancel)
    // ถ้า submitted=true → ปุ่มอยู่ใน step-4 ที่ซ่อนแล้ว ไม่ต้อง restore
    if (!submitted) {
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> ยืนยันการส่งเรื่อง (รอการยืนยัน)';
      btn.disabled = true; // ← disable ไว้เพราะ Turnstile ถูก reset แล้ว ต้องยืนยันใหม่
    }
  }
}

// ════ PROGRESS BAR ════
function buildProgressBar(status) {
  const steps = [
    { label: 'รับเรื่อง', icon: 'fas fa-inbox' },
    { label: 'ตรวจสอบข้อมูล', icon: 'fas fa-search' },
    { label: 'มอบหมายผู้ดูแล', icon: 'fas fa-user-check' },
    { label: 'กำลังดำเนินการ', icon: 'fas fa-cog' },
    { label: 'เสร็จสิ้น', icon: 'fas fa-check-circle' },
  ];
  const statusMap = {
    'รอดำเนินการ': 1,
    'กำลังดำเนินการ': 3,
    'รอตรวจสอบ': 2,
    'เสร็จสิ้น': 4,
    'ปฏิเสธ': -1,
  };
  if (status === 'ปฏิเสธ') {
    return '<div class="prog-rejected"><i class="fas fa-times-circle"></i> ไม่รับดำเนินการ / ปฏิเสธคำร้อง</div>';
  }
  const cur = statusMap[status] !== undefined ? statusMap[status] : 0;
  const isDoneAll = cur >= steps.length - 1;
  const pct = cur <= 0 ? 0 : Math.round((cur / (steps.length - 1)) * 100);
  let stepsHtml = '';
  steps.forEach(function (step, i) {
    const isDone = i < cur || isDoneAll;
    const isActive = i === cur && !isDoneAll;
    const cls = isDone ? 'done' : (isActive ? 'active' : '');
    const dotInner = isDone
      ? '<i class="fas fa-check"></i>'
      : '<i class="' + step.icon + '"></i>';
    stepsHtml += '<div class="prog-step">'
      + '<div class="prog-dot ' + cls + '">' + dotInner + '</div>'
      + '<div class="prog-label ' + cls + '">' + step.label + '</div>'
      + '</div>';
  });
  return '<div class="ticket-progress">'
    + '<div class="progress-steps">'
    + '<div class="progress-fill-bar" style="width:' + pct + '%"></div>'
    + stepsHtml
    + '</div></div>';
}

// ════ NEWS ════
async function loadNewsStrip() {
  const container = document.getElementById('news-strip-section'); if (!container) return;
  try {
    const res = await api.get('/api/news');
    if (res.success && res.news && res.news.length > 0) {
      _newsCache = res.news; container.classList.remove('hidden');
      const tagClass = { ทั่วไป: 'news-tag-default', ด่วน: 'news-tag-urgent', ข้อมูล: 'news-tag-info', กิจกรรม: 'news-tag-event' };
      let itemsHtml = '';
      res.news.forEach((n, idx) => {
        const tc = tagClass[n.tag] || 'news-tag-default'; const short = n.content.length > 120 ? n.content.substring(0, 120) + '...' : n.content; const imgHtml = n.imageUrl ? `<div style="height:120px;overflow:hidden;border-radius:8px;margin-bottom:10px;"><img src="${n.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"></div>` : ''; const viewImgBtn = n.imageUrl ? `<button class="news-view-img-btn" onclick="event.stopPropagation();showNewsImage('${n.imageUrl.replace(/'/g, '&#39;')}','${(n.title || '').replace(/'/g, '&#39;')}')"><i class="fas fa-image"></i></button>` : '';
        itemsHtml += `<div class="news-strip-item" onclick="showNewsDetail(${idx})">${imgHtml}<div class="news-strip-item-meta"><span class="news-tag-pill ${tc}">${n.tag || 'ทั่วไป'}</span><span class="news-date" style="font-size:.73rem;color:#bbb;"><i class="fas fa-clock"></i> ${n.date || ''}</span>${viewImgBtn}</div><div class="news-strip-item-title">${n.title}</div><div class="news-strip-item-content">${short}</div></div>`;
      });
      let dotsHtml = ''; if (res.news.length > 1) res.news.forEach((_, i) => { dotsHtml += `<button class="news-strip-dot${i === 0 ? ' active' : ''}" data-idx="${i}" onclick="newsScrollTo(${i})"></button>`; });
      container.innerHTML = `<div class="news-section-wrap"><div class="news-section-header"><i class="fas fa-newspaper"></i> ข่าวสารและประกาศ<span style="margin-left:auto;font-size:.78rem;color:#aaa;font-weight:400;">${res.news.length} รายการ</span></div><div class="news-strip-scroll-wrap" id="news-scroll-wrap"><div class="news-strip-inner" id="news-strip-inner">${itemsHtml}</div></div>${dotsHtml ? `<div class="news-strip-dots">${dotsHtml}</div>` : ''}</div>`;
    } else container.classList.add('hidden');
  } catch (e) { container.classList.add('hidden'); }
}
window.newsScrollTo = function (idx) { const wrap = document.getElementById('news-scroll-wrap'); const items = document.querySelectorAll('.news-strip-item'); if (!wrap || !items[idx]) return; wrap.scrollTo({ left: idx * (items[0].offsetWidth + 14), behavior: 'smooth' }); };
window.showNewsDetail = function (idx) { const n = _newsCache[idx]; if (!n) return; const existing = document.getElementById('news-detail-overlay'); if (existing) document.body.removeChild(existing); const overlay = document.createElement('div'); overlay.className = 'voc-overlay'; overlay.id = 'news-detail-overlay'; const imgBlock = n.imageUrl ? `<div style="text-align:center;margin-bottom:18px;"><img src="${n.imageUrl}" alt="" style="max-width:100%;max-height:280px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'"></div>` : ''; const contentHtml = (n.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); overlay.innerHTML = `<div class="voc-modal-box" style="max-width:680px;max-height:85vh;overflow-y:auto;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;"><div><span class="news-tag">${n.tag || 'ทั่วไป'}</span><div style="font-size:.8rem;color:#aaa;margin-top:6px;"><i class="fas fa-clock"></i> ${n.date || ''}</div></div><button onclick="document.body.removeChild(document.getElementById('news-detail-overlay'))" style="background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;">✕</button></div>${imgBlock}<h3 style="font-size:1.15rem;color:var(--dgreen);margin-bottom:14px;">${n.title}</h3><div style="font-size:.93rem;color:#444;line-height:1.85;">${contentHtml}</div></div>`; overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); }); document.body.appendChild(overlay); };

window.showNewsImage = function (imgUrl, title) {
  const existing = document.getElementById('news-img-overlay'); if (existing) document.body.removeChild(existing);
  const o = document.createElement('div'); o.className = 'voc-overlay'; o.id = 'news-img-overlay';
  o.innerHTML = `<div class="voc-modal-box" style="max-width:800px;padding:16px;text-align:center;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span style="font-size:.9rem;color:#555;font-weight:600;">${title}</span>
      <button onclick="document.body.removeChild(document.getElementById('news-img-overlay'))" style="background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;">✕</button>
    </div>
    <img src="${imgUrl}" alt="${title}" style="max-width:100%;max-height:75vh;border-radius:10px;object-fit:contain;" onerror="this.parentElement.innerHTML+='<p style=\'color:#d00;margin-top:12px;\'>โหลดรูปไม่ได้</p>'">
    <div style="margin-top:12px;">
      <a href="${imgUrl}" target="_blank" style="font-size:.82rem;color:#2d6a4f;"><i class="fas fa-external-link-alt"></i> เปิดในแท็บใหม่</a>
    </div>
  </div>`;
  o.addEventListener('click', e => { if (e.target === o) document.body.removeChild(o); });
  document.body.appendChild(o);
};

// ════ PINNED TICKETS ════
async function loadPinnedTickets() {
  const container = document.getElementById('pinned-tickets-section'); if (!container) return;
  try {
    const res = await api.get('/api/tickets?action=pinned');
    if (res.success && res.tickets && res.tickets.length > 0) {
      container.classList.remove('hidden');
      const sc = { 'รอดำเนินการ': 'status-pending', 'กำลังดำเนินการ': 'status-inprogress', 'เสร็จสิ้น': 'status-success', 'ปฏิเสธ': 'status-reject', 'รอตรวจสอบ': 'status-review' };
      const pLabel = { 'high': '🔴 เร่งด่วน', 'medium': '🟡 ปานกลาง', 'low': '🟢 ทั่วไป' };
      const pChip = { 'high': 'red', 'medium': 'orange', 'low': 'green' };
      let html = `<div class="section-title" style="margin-bottom:14px;"><h2 style="font-size:1.05rem;"><i class="fas fa-thumbtack" style="color:var(--dgreen);"></i> ประกาศ / ติดตามสถานะ</h2></div>`;
      res.tickets.forEach(t => {
        const comments = t['Comments'] || ''; const commentEntries = comments ? comments.split('\n---\n').filter(c => c.trim()) : [];
        const lastEntry = commentEntries.length ? commentEntries[commentEntries.length - 1] : '';
        const commentText = lastEntry ? lastEntry.replace(/^\[.*?\]\s*.*?:\s*/, '').trim() : '';
        const commentMeta = lastEntry ? (lastEntry.match(/^\[(.*?)\]/) || ['', ''])[1] : '';
        const priority = t['ความเร่งด่วน'] || 'medium'; const detailText = t['รายละเอียด'] || '';
        const detailShort = detailText.length > 200 ? detailText.substring(0, 200) + '...' : detailText;
        html += `<div class="pinned-card"><div class="pinned-card-header"><div><div class="pinned-card-title">${t['หัวข้อ'] || '-'}</div><div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">${t['ประเภทเรื่อง'] ? `<span class="chip blue" style="font-size:.73rem;"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>` : ''}${priority ? `<span class="chip ${pChip[priority] || 'gray'}" style="font-size:.73rem;">${pLabel[priority] || priority}</span>` : ''}</div></div><span class="status ${sc[t['สถานะ']] || 'status-pending'}">${t['สถานะ'] || '-'}</span></div>${detailText ? `<div class="pinned-detail-box"><div class="pinned-detail-label"><i class="fas fa-align-left"></i> รายละเอียด</div><div class="pinned-detail-text" id="pin-detail-${t['Ticket ID']}">${detailShort.replace(/\n/g, '<br>')}</div>${detailText.length > 200 ? `<button class="btn-expand" onclick="expandPinDetail('${t['Ticket ID']}',this)">ดูเพิ่มเติม ▼</button>` : ''}</div>` : ''}<div class="pinned-card-body">${buildProgressBar(t['สถานะ'])}</div><div class="pinned-card-footer"><span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง'] || ''}</span><span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ'] || '-'}</span><span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ'] || 'รอมอบหมาย'}</span></div>${commentText ? `<div class="pinned-comment-box"><div class="pinned-comment-meta"><i class="fas fa-comment-dots"></i> ความคิดเห็นล่าสุด${commentMeta ? ` · ${commentMeta}` : ''}</div><div class="pinned-comment-text">${commentText}</div></div>` : ''}</div>`;
      });
      container.innerHTML = html;
    } else container.classList.add('hidden');
  } catch (e) { container.classList.add('hidden'); }
}

// ════ TRACKING ════
async function loadMyTickets() {
  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try { const res = await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`); if (res.success && res.tickets && res.tickets.length > 0) await renderTicketCards(res.tickets, true); else resDiv.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;display:block;margin-bottom:12px;"></i><p style="margin-bottom:16px;">คุณยังไม่มีประวัติการร้องเรียน</p><button onclick="navigateTo('portal')" style="padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;font-weight:700;"><i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่</button></div>`; }
  catch (e) { resDiv.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}
async function doTrack() {
  const val = document.getElementById('track-input').value.trim();
  if (!val) { await showAlert('กรุณากรอก Ticket ID', 'ตัวอย่าง: VOC-2568-XXXXXXXX'); return; }
  if (!val.toUpperCase().startsWith('VOC-')) { await showAlert('รูปแบบไม่ถูกต้อง', 'กรุณากรอก Ticket ID ที่ขึ้นต้นด้วย VOC-'); return; }
  const resDiv = document.getElementById('track-result');
  resDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังค้นหา...</p></div>';
  try { const res = await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val.toUpperCase())}`); if (res.success) { const isOwner = currentUser && currentUser.role === 'user' && String(res.ticket['Username'] || '').toLowerCase() === String(currentUser.username || '').toLowerCase(); await renderTicketCards([res.ticket], isOwner); } else resDiv.innerHTML = `<p style="color:#d00000;text-align:center;padding:30px;"><i class="fas fa-search"></i> ไม่พบ Ticket ID นี้</p>`; }
  catch (e) { resDiv.innerHTML = `<p style="color:red;">${e.message}</p>`; }
}
function expandPinDetail(ticketId, btn) { const el = document.getElementById('pin-detail-' + ticketId); if (!el) return; api.get('/api/tickets?action=byId&id=' + encodeURIComponent(ticketId)).then(res => { if (res.success && res.ticket) { el.innerHTML = (res.ticket['รายละเอียด'] || '').replace(/\n/g, '<br>'); if (btn) btn.style.display = 'none'; } }); }
function expandDetail(ticketId, encodedText) { const el = document.getElementById('detail-' + ticketId); if (!el) return; el.innerText = decodeURIComponent(encodedText); const btn = el.nextElementSibling; if (btn && btn.classList.contains('btn-expand')) btn.style.display = 'none'; }

// ════ TICKET CARD ════
function buildTicketCard(t, showRating = false) {
  const sc = { 'รอดำเนินการ': 'status-pending', 'กำลังดำเนินการ': 'status-inprogress', 'เสร็จสิ้น': 'status-success', 'ปฏิเสธ': 'status-reject', 'รอตรวจสอบ': 'status-review' };
  const pLabel = { 'high': '🔴 เร่งด่วน', 'medium': '🟡 ปานกลาง', 'low': '🟢 ทั่วไป' };
  const pChipCls = { 'high': 'red', 'medium': 'orange', 'low': 'green' };
  const isDone = t['สถานะ'] === 'เสร็จสิ้น'; const comments = t['Comments'] || ''; const commentEntries = comments ? comments.split('\n---\n').filter(c => c.trim()) : [];
  const userNote = t['หมายเหตุผู้ใช้'] || ''; const fileInfo = t['FileURL'] || '';
  const detailFull = t['รายละเอียด'] || ''; const detailShort = detailFull.length > 150 ? detailFull.substring(0, 150) + '...' : detailFull; const needExpand = detailFull.length > 150;
  return `<div class="ticket-card"><div class="ticket-card-header"><div><div class="ticket-id"><i class="fas fa-ticket-alt" style="font-size:.75rem;margin-right:4px;"></i>${t['Ticket ID'] || '-'}</div><div class="ticket-subject" style="margin-top:4px;">${t['หัวข้อ'] || '-'}</div></div><span class="status ${sc[t['สถานะ']] || 'status-pending'}">${t['สถานะ'] || '-'}</span></div><div class="ticket-card-body"><div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-info-circle"></i> ข้อมูลการแจ้ง</div><div class="ticket-meta-chips">${t['ประเภทเรื่อง'] ? `<span class="chip blue"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>` : ''}${t['ความเร่งด่วน'] ? `<span class="chip ${pChipCls[t['ความเร่งด่วน']] || 'gray'}">${pLabel[t['ความเร่งด่วน']] || t['ความเร่งด่วน']}</span>` : ''}${t['ประเภทผู้แจ้ง'] ? `<span class="chip gray"><i class="fas fa-user"></i>${t['ประเภทผู้แจ้ง']}</span>` : ''}</div></div><div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-align-left"></i> รายละเอียด</div><div class="ticket-detail-text" id="detail-${t['Ticket ID']}">${needExpand ? detailShort : detailFull}</div>${needExpand ? `<button class="btn-expand" onclick="expandDetail('${t['Ticket ID']}','${encodeURIComponent(detailFull)}')">ดูเพิ่มเติม ▼</button>` : ''}</div>${userNote ? `<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</div><div class="user-note-box" style="white-space:pre-wrap;line-height:1.75;">${userNote}</div></div>` : ''} ${fileInfo ? `<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</div><div class="file-attach-display">${fileInfo.startsWith('https://') ? `<a href="${fileInfo}" target="_blank" rel="noopener" style="color:var(--dgreen);font-weight:700;text-decoration:none;"><i class="fas fa-external-link-alt"></i> ${fileInfo} </a>` : `<i class="fas fa-file-alt" style="color:var(--dgreen);"></i><span style="font-size:.9rem;color:#555;">${fileInfo}</span>`}</div></div>` : ''}<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-tasks"></i> ความคืบหน้า</div>${buildProgressBar(t['สถานะ'])}</div>${commentEntries.length ? `<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-comment-dots"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div><div class="comments-log">${commentEntries.map((c, idx) => { const mm = c.match(/^\[(.*?)\]\s*(.*?):/); const timestamp = mm ? mm[1] : '', author = mm ? mm[2] : ''; const text = c.replace(/^\[.*?\].*?:\s*/, '').trim(); const isLatest = idx === commentEntries.length - 1; return `<div class="comment-entry ${isLatest ? 'comment-latest' : ''}"><div class="comment-meta">${isLatest ? '<span class="comment-new-badge">ใหม่</span>' : ''}${author ? `<strong style="color:#2d6a4f;">${author}</strong> · ` : ''}<i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp || 'ไม่ระบุเวลา'}</div><div class="comment-text">${text}</div></div>`; }).join('')}</div></div>` : ''} ${showRating && isDone ? buildRatingBox(t['Ticket ID']) : ''}</div><div class="ticket-card-footer"><span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง'] || '-'}</span><span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ'] || '-'}</span><span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ'] || 'รอมอบหมาย'}</span></div></div>`;
}

async function renderTicketCards(tickets, showRating = false) {
  const resDiv = document.getElementById('track-result'); let ratedSet = new Set();
  if (showRating && currentUser) { try { const ratedRes = await Promise.all(tickets.filter(t => t['สถานะ'] === 'เสร็จสิ้น').map(t => api.get(`/api/ratings?action=byTicket&id=${encodeURIComponent(t['Ticket ID'] || '')}`))); ratedRes.forEach((res, idx) => { if (res.success && res.ratings && res.ratings.length > 0) { const tid = tickets.filter(t => t['สถานะ'] === 'เสร็จสิ้น')[idx]['Ticket ID']; if (res.ratings.some(r => String(r.username || '').toLowerCase() === String(currentUser.username || '').toLowerCase())) ratedSet.add(tid); } }); } catch (e) { } }
  let html = `<p style="color:#888;margin-bottom:16px;font-size:.88rem;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t => { const canRate = showRating && t['สถานะ'] === 'เสร็จสิ้น' && !ratedSet.has(t['Ticket ID']); html += buildTicketCard(t, canRate); });
  resDiv.innerHTML = html;
}

// ════ RATING ════
function buildRatingBox(ticketId) { return `<div class="rating-box" id="rbox-${ticketId}"><h4>ให้คะแนนการบริการ</h4><div class="star-row" id="stars-${ticketId}">${[1, 2, 3, 4, 5].map(i => `<button class="star-btn dim" onclick="selectStar('${ticketId}',${i})">⭐</button>`).join('')}</div><textarea class="rating-comment" id="rc-${ticketId}" rows="2" placeholder="ความคิดเห็น (ไม่บังคับ)"></textarea><button class="btn-rate" onclick="submitRating('${ticketId}')"><i class="fas fa-paper-plane"></i> ส่งคะแนน</button></div>`; }
function selectStar(tid, score) { ratingSelection = score; const row = document.getElementById('stars-' + tid); if (!row) return; row.querySelectorAll('.star-btn').forEach((b, i) => { b.classList.toggle('lit', i < score); b.classList.toggle('dim', i >= score); b.style.transform = i < score ? 'scale(1.1)' : 'scale(1)'; }); }
async function submitRating(ticketId) { if (!ratingSelection) { await showAlert('กรุณาเลือกคะแนน', ''); return; } const comment = document.getElementById('rc-' + ticketId)?.value.trim(); try { const res = await api.post('/api/ratings', { ticketId, username: currentUser?.username || '', score: ratingSelection, comment }); if (res.success) { const box = document.getElementById('rbox-' + ticketId); if (box) box.innerHTML = `<div style="text-align:center;padding:16px;color:#2d6a4f;font-weight:700;">✅ ขอบคุณสำหรับ ${'⭐'.repeat(ratingSelection)} คะแนน</div>`; ratingSelection = 0; } else await showAlert('แจ้งเตือน', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }

// ════ FAQ ════
async function loadFaq() { const container = document.getElementById('faq-content'); if (!container) return; container.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>'; try { const res = await api.get('/api/faq'); if (res.success) renderFaq(res.faqs || []); else container.innerHTML = '<p style="color:red;">โหลด FAQ ไม่สำเร็จ</p>'; } catch (e) { container.innerHTML = `<p style="color:red;">${e.message}</p>`; } }
function renderFaq(faqs, query = '') { const container = document.getElementById('faq-content'); const filtered = query ? faqs.filter(f => f.question.toLowerCase().includes(query.toLowerCase()) || f.answer.toLowerCase().includes(query.toLowerCase())) : faqs; if (!filtered.length) { container.innerHTML = '<p style="text-align:center;color:#aaa;padding:30px;">ไม่พบคำถามที่ค้นหา</p>'; return; } const groups = {}; filtered.forEach(f => { const cat = f.category || 'ทั่วไป'; if (!groups[cat]) groups[cat] = []; groups[cat].push(f); }); let html = '<div class="faq-list">'; Object.entries(groups).forEach(([cat, items]) => { html += `<div class="faq-category-label"><i class="fas fa-folder-open"></i> ${cat}</div>`; items.forEach(f => { html += `<div class="faq-item" id="faq-${f.faqId}"><div class="faq-question" onclick="toggleFaq('${f.faqId}')"><span>${f.question}</span><i class="fas fa-chevron-down"></i></div><div class="faq-answer">${f.answer}</div></div>`; }); }); html += '</div>'; container.innerHTML = html; }
function toggleFaq(id) { const item = document.getElementById('faq-' + id); if (item) item.classList.toggle('open'); }
function searchFaq() { const q = document.getElementById('faq-search')?.value.trim() || ''; const container = document.getElementById('faq-content'); container.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>'; api.get('/api/faq').then(res => { if (res.success) renderFaq(res.faqs || [], q); }); }

// ════ REPORT ════
function printReport() {
  if (!window._lastReportData) { showAlert('รายงานยังไม่โหลด', 'กรุณาเลือกประเภทรายงานและรอข้อมูลโหลดก่อนพิมพ์'); return; }
  const rptNames = { service: 'สรุปการให้บริการ', users: 'ผู้ใช้บริการ', duration: 'เวลาให้บริการ', monthly: 'สรุปรายเดือน' };
  const now = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const r = window._lastReportData;
  const typ = currentReportType;
  let body = '';

  const tblStyle = `style="width:100%;border-collapse:collapse;font-size:.88rem;margin-top:12px;"`;
  const thStyle = `style="background:#2d6a4f;color:#fff;padding:8px 10px;text-align:left;"`;
  const tdStyle = `style="padding:7px 10px;border-bottom:1px solid #e0e0e0;"`;
  const tdR = `style="padding:7px 10px;border-bottom:1px solid #e0e0e0;text-align:right;"`;
  const secTitle = t => `<h3 style="color:#2d6a4f;margin:22px 0 6px;font-size:1rem;border-left:4px solid #2d6a4f;padding-left:10px;">${t}</h3>`;

  if (typ === 'service') {
    const statRows = Object.entries(r.byStatus || {}).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td ${tdStyle}>${k}</td><td ${tdR}>${v}</td><td ${tdR}>${r.total ? Math.round(v / r.total * 100) : 0}%</td></tr>`).join('');
    const catRows = Object.entries(r.byCategory || {}).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td ${tdStyle}>${k}</td><td ${tdR}>${v}</td><td ${tdR}>${r.total ? Math.round(v / r.total * 100) : 0}%</td></tr>`).join('');
    const priRows = [['เร่งด่วน', r.byPriority?.high || 0], ['ปานกลาง', r.byPriority?.medium || 0], ['ทั่วไป', r.byPriority?.low || 0]]
      .map(([k, v]) => `<tr><td ${tdStyle}>${k}</td><td ${tdR}>${v}</td><td ${tdR}>${r.total ? Math.round(v / r.total * 100) : 0}%</td></tr>`).join('');
    body = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        ${[['ทั้งหมด', r.total, '#1b4332'], ['เสร็จสิ้น', r.done, '#2d6a4f'], ['รอ/ดำเนินการ', r.pending, '#f77f00'], ['ปฏิเสธ', r.rejected, '#d00000']].map(([l, v, c]) => `<div style="border:2px solid ${c};border-radius:10px;padding:12px;text-align:center;"><div style="font-size:1.8rem;font-weight:800;color:${c};">${v}</div><div style="font-size:.78rem;color:#666;">${l}</div></div>`).join('')}
      </div>
      <div style="background:#e8f5e9;border-radius:8px;padding:10px 16px;margin-bottom:16px;">อัตราความสำเร็จ: <strong style="color:#2d6a4f;font-size:1.2rem;">${r.successRate}%</strong></div>
      ${secTitle('สถานะทั้งหมด')}
      <table ${tblStyle}><tr><th ${thStyle}>สถานะ</th><th ${thStyle} style="text-align:right;">จำนวน</th><th ${thStyle} style="text-align:right;">%</th></tr>${statRows}</table>
      ${secTitle('ประเภทเรื่อง')}
      <table ${tblStyle}><tr><th ${thStyle}>ประเภท</th><th ${thStyle} style="text-align:right;">จำนวน</th><th ${thStyle} style="text-align:right;">%</th></tr>${catRows}</table>
      ${secTitle('ความเร่งด่วน')}
      <table ${tblStyle}><tr><th ${thStyle}>ระดับ</th><th ${thStyle} style="text-align:right;">จำนวน</th><th ${thStyle} style="text-align:right;">%</th></tr>${priRows}</table>`;
  } else if (typ === 'users') {
    const rows = (r.users || []).map((u, i) => `<tr><td ${tdStyle}>${i + 1}</td><td ${tdStyle}><strong>${u.username}</strong></td><td ${tdR}>${u.total}</td><td ${tdR}>${u.done}</td><td ${tdR}>${u.pending}</td><td ${tdR}>${u.successRate}%</td><td ${tdStyle}>${u.topCategory || '-'}</td></tr>`).join('');
    body = `${secTitle('รายชื่อผู้ใช้บริการ')}
      <table ${tblStyle}><tr><th ${thStyle}>#</th><th ${thStyle}>ผู้ใช้</th><th ${thStyle} style="text-align:right;">ทั้งหมด</th><th ${thStyle} style="text-align:right;">เสร็จ</th><th ${thStyle} style="text-align:right;">รอ</th><th ${thStyle} style="text-align:right;">%สำเร็จ</th><th ${thStyle}>หมวดบ่อยสุด</th></tr>${rows || '<tr><td colspan="7" style="padding:12px;color:#bbb;">ไม่มีข้อมูล</td></tr>'}</table>`;
  } else if (typ === 'duration') {
    const rows = (r.items || []).slice(0, 30).map(d => `<tr><td ${tdStyle} style="color:#2d6a4f;font-weight:700;">${d.ticketId}</td><td ${tdStyle}>${d.subject}</td><td ${tdStyle}>${{ high: 'เร่งด่วน', medium: 'ปานกลาง', low: 'ทั่วไป' }[d.priority] || d.priority}</td><td ${tdR}>${d.hours} ชม.</td></tr>`).join('');
    body = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
        ${[['เรื่องที่เสร็จ', r.total, '#2d6a4f'], ['เวลาเฉลี่ยรวม', (r.avgHours || '-') + ' ชม.', '#3a86ff'], ['เวลาเฉลี่ยเร่งด่วน', (r.avgByPriority?.high || '-') + ' ชม.', '#d00000']].map(([l, v, c]) => `<div style="border:2px solid ${c};border-radius:10px;padding:12px;text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:${c};">${v}</div><div style="font-size:.78rem;color:#666;">${l}</div></div>`).join('')}
      </div>
      ${secTitle('รายการเวลาให้บริการ (สูงสุด 30 รายการ)')}
      <table ${tblStyle}><tr><th ${thStyle}>Ticket ID</th><th ${thStyle}>หัวข้อ</th><th ${thStyle}>ความเร่งด่วน</th><th ${thStyle} style="text-align:right;">เวลา</th></tr>${rows || '<tr><td colspan="4" style="padding:12px;color:#bbb;">ไม่มีข้อมูล</td></tr>'}</table>`;
  } else if (typ === 'monthly') {
    const months = r.months || [];
    const rows = months.map(m => `<tr><td ${tdStyle}>${m.month}</td><td ${tdR}>${m.total}</td><td ${tdR}>${m.done}</td><td ${tdR}>${m.pending}</td><td ${tdR}>${m.rejected}</td><td ${tdR}>${m.total ? Math.round(m.done / m.total * 100) : 0}%</td></tr>`).join('');
    body = `${secTitle('สรุปรายเดือน')}
      <table ${tblStyle}><tr><th ${thStyle}>เดือน</th><th ${thStyle} style="text-align:right;">ทั้งหมด</th><th ${thStyle} style="text-align:right;">เสร็จ</th><th ${thStyle} style="text-align:right;">รอ</th><th ${thStyle} style="text-align:right;">ปฏิเสธ</th><th ${thStyle} style="text-align:right;">%สำเร็จ</th></tr>${rows || '<tr><td colspan="6" style="padding:12px;color:#bbb;">ไม่มีข้อมูล</td></tr>'}</table>`;
  }

  const printWin = window.open('', '_blank', 'width=960,height=720');
  printWin.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>VOC รายงาน — ${rptNames[typ] || ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Sarabun',sans-serif;background:#fff;color:#222;padding:28px 36px;}
    .print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2d6a4f;padding-bottom:14px;margin-bottom:20px;}
    .print-header h1{font-size:1.35rem;color:#2d6a4f;font-weight:800;}
    .print-header p{font-size:.82rem;color:#666;margin-top:3px;}
    .print-meta{text-align:right;font-size:.78rem;color:#888;line-height:1.7;}
    .print-footer{margin-top:32px;border-top:1px solid #e0e0e0;padding-top:10px;font-size:.75rem;color:#aaa;text-align:center;}
    @media print{body{padding:12px 16px;} button{display:none!important;}}
  </style></head><body>
  <div class="print-header">
    <div>
      <h1>VOC System — ${rptNames[typ] || 'รายงาน'}</h1>
      <p>คณะวิทยาศาสตร์เทคโนโลยีและการเกษตร · มหาวิทยาลัยราชภัฏยะลา</p>
    </div>
    <div class="print-meta">
      <div>วันที่พิมพ์: ${now}</div>
      <div>ผู้พิมพ์: ${window.currentUser?.fullname || window.currentUser?.username || 'admin'}</div>
    </div>
  </div>
  ${body}
  <div class="print-footer">VOC System | คณะวิทยาศาสตร์เทคโนโลยีและการเกษตร มหาวิทยาลัยราชภัฏยะลา</div>
  <script>setTimeout(function(){window.print();},600);<\/script>
  </body></html>`);
  printWin.document.close();
}

async function loadReport(type) {
  window._currentReportType = type || currentReportType;
  currentReportType = type || 'service';
  const _rc = document.getElementById('report-content');
  if (_rc) _rc.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  const _rptNames = { service: 'สรุปการให้บริการ', users: 'ผู้ใช้บริการ', duration: 'เวลาให้บริการ', monthly: 'รายเดือน' };
  const _rptIcons = { service: 'fas fa-clipboard-list', users: 'fas fa-users', duration: 'fas fa-stopwatch', monthly: 'fas fa-calendar-alt' };
  const _lbl = document.getElementById('report-type-label'); const _ico = document.getElementById('report-type-icon');
  if (_lbl) _lbl.textContent = _rptNames[currentReportType] || 'รายงาน'; if (_ico) _ico.className = _rptIcons[currentReportType] || 'fas fa-clipboard-list';
  const box = document.getElementById('report-content'); if (!box) return;
  box.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดรายงาน...</p></div>';
  try { const res = await api.get('/api/report?type=' + currentReportType); if (!res.success) { box.innerHTML = '<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>'; return; } window._lastReportData = res.report; if (currentReportType === 'service') renderReportService(res.report, box); if (currentReportType === 'users') renderReportUsers(res.report, box); if (currentReportType === 'duration') renderReportDuration(res.report, box); if (currentReportType === 'monthly') renderReportMonthly(res.report, box); }
  catch (e) { box.innerHTML = `<p style="color:red;padding:20px;">${e.message}</p>`; }
}

function renderReportService(r, box) {
  const statusRows = Object.entries(r.byStatus || {}).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;font-weight:700;">${v}</td><td style="text-align:right;color:#888;">${r.total ? Math.round(v / r.total * 100) : 0}%</td></tr>`).join('');
  const catRows = Object.entries(r.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => { const p = r.total ? Math.round(v / r.total * 100) : 0; return `<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${p}%"></div></div><span class="rpt-bar-count">${v}</span></div>`; }).join('');
  const priRows = [['🔴 เร่งด่วน', r.byPriority?.high || 0, '#d00000'], ['🟡 ปานกลาง', r.byPriority?.medium || 0, '#f77f00'], ['🟢 ทั่วไป', r.byPriority?.low || 0, '#2d6a4f']]
    .map(([k, v, c]) => `<tr><td>${k}</td><td style="text-align:right;font-weight:700;color:${c};">${v}</td><td style="text-align:right;color:#888;">${r.total ? Math.round(v / r.total * 100) : 0}%</td></tr>`).join('');

  box.innerHTML = `
    <div class="rpt-kpi-grid">
      <div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 ทั้งหมด</div></div>
      <div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div>
      <div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00">${r.pending}</div><div class="rpt-kpi-label">⏳ รอ/ดำเนินการ</div></div>
      <div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div>
    </div>
    <div class="rpt-success-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;">
        <span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span>
      </div>
      <div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div>
    </div>
    <div class="rpt-three-col">
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-list-ul"></i> สถานะทั้งหมด</div>
        <table class="rpt-table"><tr><th>สถานะ</th><th>จำนวน</th><th>%</th></tr>${statusRows}</table>
      </div>
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-exclamation-circle"></i> ความเร่งด่วน</div>
        <table class="rpt-table"><tr><th>ระดับ</th><th>จำนวน</th><th>%</th></tr>${priRows}</table>
        <div class="rpt-donut-wrap" style="margin-top:16px;">
          <canvas id="rpt-donut-pri" width="120" height="120"></canvas>
        </div>
      </div>
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่อง (Top 8)</div>
        ${catRows || '<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}
      </div>
    </div>`;
  requestAnimationFrame(function () {
    _drawDonut('rpt-donut-pri',
      [{ value: r.byPriority ? r.byPriority.high || 0 : 0 },
      { value: r.byPriority ? r.byPriority.medium || 0 : 0 },
      { value: r.byPriority ? r.byPriority.low || 0 : 0 }],
      ['#d00000', '#f77f00', '#2d6a4f']);
  });
}
function renderReportUsers(r, box) { const rows = (r.users || []).map((u, i) => `<tr><td style="color:#888;font-size:.82rem;">${i + 1}</td><td><strong>${u.username}</strong></td><td style="text-align:center;">${u.total}</td><td style="text-align:center;color:#2d6a4f;font-weight:700;">${u.done}</td><td style="text-align:center;color:#f77f00;">${u.pending}</td><td style="text-align:center;">${u.successRate}%</td><td style="font-size:.8rem;color:#666;">${u.topCategory}</td><td><button onclick="showUserReport('${u.username}')" style="padding:4px 10px;background:var(--dgreen);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.76rem;">รายงาน</button></td></tr>`).join(''); box.innerHTML = `<div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-users"></i> รายชื่อผู้ใช้บริการ</div><table class="rpt-table"><tr><th>#</th><th>ผู้ใช้</th><th>ทั้งหมด</th><th>เสร็จ</th><th>รอ</th><th>%สำเร็จ</th><th>หมวดบ่อยสุด</th><th></th></tr>${rows || '<tr><td colspan="8" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`; }
function renderReportDuration(r, box) { const rows = (r.items || []).slice(0, 20).map(d => `<tr><td style="font-size:.8rem;color:#2d6a4f;font-weight:700;">${d.ticketId}</td><td style="font-size:.82rem;">${d.subject}</td><td>${d.priority}</td><td style="text-align:right;font-weight:700;">${d.hours} ชม.</td></tr>`).join(''); const avgLabel = h => h !== null ? h + ' ชม.' : '-'; box.innerHTML = `<div class="rpt-kpi-grid"><div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">🎯 เรื่องที่เสร็จแล้ว</div></div><div class="rpt-kpi blue"><div class="rpt-kpi-num" style="color:#3a86ff;">${avgLabel(r.avgHours)}</div><div class="rpt-kpi-label">⏱️ เวลาเฉลี่ยรวม</div></div></div><div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-list"></i> รายการล่าสุด</div><table class="rpt-table"><tr><th>Ticket</th><th>หัวข้อ</th><th>ความเร่งด่วน</th><th>เวลา</th></tr>${rows || '<tr><td colspan="4" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`; }
function renderReportMonthly(r, box) { const months = r.months || []; const maxTotal = Math.max(...months.map(m => m.total), 1); const bars = months.map(m => { const pct = Math.round(m.total / maxTotal * 100); return `<div class="rpt-month-row"><div class="rpt-month-label">${m.month}</div><div style="flex:1;"><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div></div><div class="rpt-month-count">${m.total}</div></div>`; }).join(''); box.innerHTML = `<div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-chart-bar"></i> จำนวน Ticket รายเดือน</div>${bars || '<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>`; }

async function showUserReport(username) { const po = document.getElementById('profile-overlay'); if (po) document.body.removeChild(po); navigateTo('user-report'); const box = document.getElementById('user-report-content'); box.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>'; try { const res = await api.get('/api/report?type=userSummary&username=' + encodeURIComponent(username)); if (!res.success) { box.innerHTML = '<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>'; return; } renderUserReport(res.report, box); } catch (e) { box.innerHTML = `<p style="color:red;padding:20px;">${e.message}</p>`; } }
function closeUserReport() { if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin')) navigateTo('admin-report'); else navigateTo('tracking'); }
function renderUserReport(r, box) { const scClass = { 'รอดำเนินการ': 'status-pending', 'กำลังดำเนินการ': 'status-inprogress', 'เสร็จสิ้น': 'status-done', 'ปฏิเสธ': 'status-rejected' }; const catEntries = Object.entries(r.byCategory || {}).sort((a, b) => b[1] - a[1]); const maxCat = Math.max(...catEntries.map(e => e[1]), 1); const catBars = catEntries.map(([k, v]) => `<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${Math.round(v / maxCat * 100)}%"></div></div><span class="rpt-bar-count">${v}</span></div>`).join(''); const ticketRows = (r.recentTickets || []).map(t => `<tr><td style="font-size:.78rem;color:#2d6a4f;font-weight:700;">${t.ticketId}</td><td style="font-size:.83rem;">${t.subject}</td><td><span class="status ${scClass[t.status] || 'status-pending'}" style="font-size:.72rem;">${t.status}</span></td><td style="font-size:.78rem;color:#888;">${t.date}</td></tr>`).join(''); box.innerHTML = `<div class="rpt-kpi-grid"><div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 รวมทั้งหมด</div></div><div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f;">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div><div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00;">${r.pending}</div><div class="rpt-kpi-label">⏳ รอดำเนินการ</div></div><div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000;">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div></div><div class="rpt-success-bar-wrap"><div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;"><span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span></div><div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div></div><div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่องที่แจ้ง</div>${catBars || '<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div><div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-history"></i> ประวัติคำร้องล่าสุด</div><table class="rpt-table"><tr><th>Ticket ID</th><th>หัวข้อ</th><th>สถานะ</th><th>วันที่</th></tr>${ticketRows || '<tr><td colspan="4" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`; }

// ════ ADMIN DASHBOARD ════
async function loadDashboard() {
  document.getElementById('dash-content').innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>';
  try {
    const [dr, sr] = await Promise.all([api.get('/api/dashboard'), api.get('/api/ratings?action=summary')]);
    if (dr.success) {
      window._dashStats = dr.stats; // เก็บไว้ใช้ตอน drill-down
      renderDashboard(dr.stats, sr.summary || { avg: 0, total: 0 });
    } else {
      document.getElementById('dash-content').innerHTML = '<p style="color:red;">โหลดไม่สำเร็จ</p>';
    }
  } catch (e) {
    document.getElementById('dash-content').innerHTML = `<p style="color:red;">${e.message}</p>`;
  }
}

function _drawDonut(canvasId, data, colors, opts) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 8, ri = r * 0.58;
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); return; }
  let angle = -Math.PI / 2;
  const segs = []; // เก็บ start/end angle ของแต่ละชิ้น เพื่อใช้ตรวจ click
  data.forEach((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    segs.push({ start: angle, end: angle + slice, index: i, value: d.value });
    angle += slice;
  });
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

  // ── ทำให้ donut คลิกได้: หา segment ตาม mouse angle ──
  if (opts && opts.onClick) {
    canvas.style.cursor = 'pointer';
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX, my = (e.clientY - rect.top) * scaleY;
      const dx = mx - cx, dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ri || dist > r) return; // คลิกนอกวง donut
      let a = Math.atan2(dy, dx);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const seg = segs.find(s => a >= s.start && a <= s.end);
      if (seg && seg.value > 0) opts.onClick(seg.index);
    };
  }
}

// ── ฟิลเตอร์ ticket ฝั่ง client ตาม field/value แล้วเปิด drill-down panel ──
function _dashFilterTickets(predicate) {
  const all = (window._dashStats && window._dashStats.urgentTickets) || [];
  return all; // fallback เผื่อไม่มี allTickets cache (ดูฟังก์ชัน _dashDrilldown ด้านล่าง — ใช้ API จริงแทน)
}

// ── เปิด panel แสดงรายการ ticket ของหมวดที่กด พร้อมหัวข้อ/จำนวน ──
async function _dashDrilldown(title, filterFn, queryHint) {
  // ปิด panel เดิมถ้ามี
  const existing = document.getElementById('dash-drilldown-overlay');
  if (existing) document.body.removeChild(existing);

  const overlay = document.createElement('div');
  overlay.className = 'dash-drilldown-overlay';
  overlay.id = 'dash-drilldown-overlay';
  overlay.innerHTML = `<div class="dash-drilldown-panel">
    <div class="dash-drilldown-head">
      <h3>${title}</h3>
      <span class="dd-count" id="dd-count">...</span>
      <button class="dash-drilldown-close" id="dd-close"><i class="fas fa-times"></i></button>
    </div>
    <div class="dash-drilldown-body" id="dd-body">
      <div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>
    </div>
    <div class="dash-drilldown-foot">
      <button id="dd-goto"><i class="fas fa-inbox"></i> ไปที่หน้าจัดการเรื่องร้องเรียน</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };
  document.getElementById('dd-close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('dd-goto').onclick = () => {
    close();
    navigateTo('admin-tickets');
    setTimeout(() => loadAdminTickets(queryHint || 'all'), 150);
  };

  // โหลด ticket ทั้งหมดมา filter ฝั่ง client (ใช้ endpoint เดิมที่มีอยู่)
  try {
    const tr = await api.get('/api/tickets?action=all&filter=all');
    const tickets = (tr.tickets || []).filter(filterFn);
    document.getElementById('dd-count').textContent = `${tickets.length} เรื่อง`;
    const body = document.getElementById('dd-body');
    if (!tickets.length) {
      body.innerHTML = '<div class="dd-empty"><i class="fas fa-inbox" style="font-size:2rem;color:#ddd;display:block;margin-bottom:10px;"></i>ไม่มีข้อมูลในหมวดนี้</div>';
      return;
    }
    const pLabel = { high: '🔴 เร่งด่วน', medium: '🟡 ปานกลาง', low: '🟢 ทั่วไป' };
    body.innerHTML = tickets.slice(0, 50).map(t => `
      <div class="dd-ticket-item">
        <div class="dd-ticket-top">
          <span class="dd-ticket-id">${t['Ticket ID'] || ''}</span>
          <span class="status status-${{ 'รอดำเนินการ': 'pending', 'กำลังดำเนินการ': 'inprogress', 'เสร็จสิ้น': 'success', 'ปฏิเสธ': 'reject' }[t['สถานะ']] || 'pending'}" style="font-size:.68rem;padding:2px 9px;">${t['สถานะ'] || ''}</span>
        </div>
        <div class="dd-ticket-subject">${(t['หัวข้อ'] || '').slice(0, 90)}</div>
        <div class="dd-ticket-meta">
          <span><i class="fas fa-tag"></i> ${t['ประเภทเรื่อง'] || '—'}</span>
          <span>${pLabel[String(t['ความเร่งด่วน'] || '').toLowerCase()] || ''}</span>
          <span><i class="far fa-calendar"></i> ${(t['วันที่แจ้ง'] || '').split(' ')[0] || '—'}</span>
        </div>
      </div>`).join('');
    if (tickets.length > 50) {
      body.innerHTML += `<div style="text-align:center;color:#aaa;font-size:.8rem;padding:10px;">...และอีก ${tickets.length - 50} เรื่อง</div>`;
    }
  } catch (e) {
    document.getElementById('dd-body').innerHTML = `<p style="color:red;text-align:center;">${e.message}</p>`;
  }
}

function renderDashboard(s, rs) {
  const mxC = Math.max(...Object.values(s.byCategory || { 0: 1 }), 1);
  const mxU = Math.max(...Object.values(s.byCustomer || { 0: 1 }), 1);
  let catB = '', cusB = '', urgH = '';
  const successRate = s.total ? Math.round(s.done / s.total * 100) : 0;
  const inprogress = s.inprogress || 0;

  // ── แถบประเภทเรื่อง: คลิกได้ ──
  Object.entries(s.byCategory || {}).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    const pct = Math.round(v / mxC * 100);
    const safeKey = k.replace(/'/g, "\\'");
    catB += `<div class="bar-row clickable" onclick="_dashDrilldown('ประเภท: ${k}', t => t['ประเภทเรื่อง']==='${safeKey}', 'all')"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  // ── แถบประเภทผู้แจ้ง: คลิกได้ ──
  Object.entries(s.byCustomer || {}).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    const safeKey = k.replace(/'/g, "\\'");
    cusB += `<div class="bar-row clickable" onclick="_dashDrilldown('ผู้แจ้ง: ${k}', t => t['ประเภทผู้แจ้ง']==='${safeKey}', 'all')"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v / mxU * 100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  if (s.urgentTickets?.length) urgH = `<div class="urgent-banner"><h4><i class="fas fa-exclamation-triangle"></i> ⚠️ ${s.urgentTickets.length} เรื่องเร่งด่วนยังไม่เสร็จ</h4>${s.urgentTickets.map(t => `<div class="urgent-item"><span class="priority-badge p-high">🔴 เร่งด่วน</span><strong>${t.ticketId}</strong><span style="flex:1;">${t.subject}</span></div>`).join('')}</div>`;

  // สร้าง monthly mini-bars จาก byMonth
  const monthEntries = Object.entries(s.byMonth || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const mxM = Math.max(...monthEntries.map(e => e[1]), 1);
  const monthBars = monthEntries.map(([k, v]) => `<div class="dash-mini-bar-col"><div class="dash-mini-bar-fill" style="height:${Math.round(v / mxM * 100)}%"></div><div class="dash-mini-bar-label">${k.split('/')[0]}/${String(parseInt(k.split('/')[1]) - 543).slice(-2)}</div><div class="dash-mini-bar-val">${v}</div></div>`).join('');

  const starFull = Math.round(rs.avg || 0);
  const stars = [1, 2, 3, 4, 5].map(i => `<i class="${i <= starFull ? 'fas' : 'far'} fa-star" style="color:#f0a500;font-size:1.1rem;"></i>`).join('');

  // ── Headline ring (success rate) — วาดด้วย conic-gradient (CSS ล้วน) ──
  const ringDeg = Math.round(successRate * 3.6);

  document.getElementById('dash-content').innerHTML = `
${urgH}

<!-- ══ HEADLINE: สรุปภาพรวมแบบ Google Forms responses tab ══ -->
<div class="dash-headline">
  <div class="dash-headline-ring-wrap">
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="9"/>
      <circle cx="48" cy="48" r="40" fill="none" stroke="#fff" stroke-width="9"
        stroke-dasharray="${2 * Math.PI * 40}" stroke-dashoffset="${2 * Math.PI * 40 * (1 - successRate / 100)}"
        stroke-linecap="round" transform="rotate(-90 48 48)" style="transition:stroke-dashoffset 1s ease;"/>
    </svg>
    <div class="dash-headline-ring-num"><span>${successRate}%</span><span>สำเร็จ</span></div>
  </div>
  <div class="dash-headline-mid">
    <h3><i class="fas fa-chart-line"></i> ภาพรวมระบบรับฟังเสียงลูกค้า</h3>
    <p>จากทั้งหมด ${s.total} เรื่อง ดำเนินการเสร็จสิ้นแล้ว ${s.done} เรื่อง
    ${inprogress > 0 ? `กำลังดำเนินการ ${inprogress} เรื่อง` : ''}
    ${s.pending > 0 ? ` และรอดำเนินการอีก ${s.pending} เรื่อง` : ''}</p>
  </div>
  <div class="dash-headline-mini">
    <div class="dash-headline-mini-item"><b>${rs.avg || '-'}</b><span><i class="fas fa-star" style="color:#ffd700;"></i> คะแนนเฉลี่ย</span></div>
    <div class="dash-headline-mini-item"><b>${s.byPriority?.high || 0}</b><span>🔴 เร่งด่วน</span></div>
    <div class="dash-headline-mini-item"><b>${Object.keys(s.byCategory || {}).length}</b><span>ประเภทเรื่อง</span></div>
  </div>
</div>

<!-- ══ STAT CARDS: คลิกดูรายละเอียดแต่ละสถานะ ══ -->
<div class="dash-grid-5">
  <div class="stat-card clickable" onclick="_dashDrilldown('Ticket ทั้งหมด', t => true, 'all')"><div class="stat-icon" style="background:#e8f5e9;"><i class="fas fa-inbox" style="color:#2d6a4f;"></i></div><div class="stat-num">${s.total}</div><div class="stat-label">ทั้งหมด</div></div>
  <div class="stat-card clickable orange" onclick="_dashDrilldown('รอดำเนินการ', t => t['สถานะ']==='รอดำเนินการ', 'pending')"><div class="stat-icon" style="background:#fff8e1;"><i class="fas fa-hourglass-half" style="color:#f77f00;"></i></div><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">รอดำเนินการ</div></div>
  <div class="stat-card clickable blue" onclick="_dashDrilldown('กำลังดำเนินการ', t => t['สถานะ']==='กำลังดำเนินการ', 'กำลังดำเนินการ')"><div class="stat-icon" style="background:#e3f2fd;"><i class="fas fa-cog" style="color:#3a86ff;"></i></div><div class="stat-num" style="color:#3a86ff;">${inprogress}</div><div class="stat-label">กำลังดำเนินการ</div></div>
  <div class="stat-card clickable" onclick="_dashDrilldown('เสร็จสิ้น', t => t['สถานะ']==='เสร็จสิ้น', 'เสร็จสิ้น')"><div class="stat-icon" style="background:#e8f5e9;"><i class="fas fa-check-circle" style="color:#2d6a4f;"></i></div><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">เสร็จสิ้น</div></div>
  <div class="stat-card clickable red" onclick="_dashDrilldown('ปฏิเสธ', t => t['สถานะ']==='ปฏิเสธ', 'all')"><div class="stat-icon" style="background:#fde8e8;"><i class="fas fa-times-circle" style="color:#d00000;"></i></div><div class="stat-num" style="color:#d00000;">${s.rejected || 0}</div><div class="stat-label">ปฏิเสธ</div></div>
</div>

<!-- ══ SECTION 1: สถานะ + ความเร่งด่วน (สมดุล 2 คอลัมน์) ══ -->
<div class="dash-section-2col">
  <div class="chart-card clickable-chart">
    <h4><i class="fas fa-chart-pie"></i> สัดส่วนสถานะ <span class="dash-tip">คลิกที่ชิ้น/รายการเพื่อดูรายละเอียด</span></h4>
    <div class="donut-wrap">
      <canvas id="donut-status" width="160" height="160"></canvas>
      <div class="donut-legend">
        <div class="dl-item clickable" onclick="_dashDrilldown('รอดำเนินการ', t => t['สถานะ']==='รอดำเนินการ', 'pending')"><span class="dl-dot" style="background:#f77f00;"></span>รอดำเนินการ <b>${s.pending}</b></div>
        <div class="dl-item clickable" onclick="_dashDrilldown('กำลังดำเนินการ', t => t['สถานะ']==='กำลังดำเนินการ', 'กำลังดำเนินการ')"><span class="dl-dot" style="background:#3a86ff;"></span>กำลังดำเนินการ <b>${inprogress}</b></div>
        <div class="dl-item clickable" onclick="_dashDrilldown('เสร็จสิ้น', t => t['สถานะ']==='เสร็จสิ้น', 'เสร็จสิ้น')"><span class="dl-dot" style="background:#2d6a4f;"></span>เสร็จสิ้น <b>${s.done}</b></div>
        <div class="dl-item clickable" onclick="_dashDrilldown('ปฏิเสธ', t => t['สถานะ']==='ปฏิเสธ', 'all')"><span class="dl-dot" style="background:#d00000;"></span>ปฏิเสธ <b>${s.rejected || 0}</b></div>
      </div>
    </div>
  </div>
  <div class="chart-card clickable-chart">
    <h4><i class="fas fa-chart-pie"></i> สัดส่วนความเร่งด่วน <span class="dash-tip">คลิกที่ชิ้น/รายการเพื่อดูรายละเอียด</span></h4>
    <div class="donut-wrap">
      <canvas id="donut-priority" width="160" height="160"></canvas>
      <div class="donut-legend">
        <div class="dl-item clickable" onclick="_dashDrilldown('เร่งด่วน', t => String(t['ความเร่งด่วน']||'').toLowerCase()==='high', 'all')"><span class="dl-dot" style="background:#d00000;"></span>เร่งด่วน <b>${s.byPriority?.high || 0}</b></div>
        <div class="dl-item clickable" onclick="_dashDrilldown('ปานกลาง', t => String(t['ความเร่งด่วน']||'').toLowerCase()==='medium', 'all')"><span class="dl-dot" style="background:#f77f00;"></span>ปานกลาง <b>${s.byPriority?.medium || 0}</b></div>
        <div class="dl-item clickable" onclick="_dashDrilldown('ทั่วไป', t => String(t['ความเร่งด่วน']||'').toLowerCase()==='low', 'all')"><span class="dl-dot" style="background:#2d6a4f;"></span>ทั่วไป <b>${s.byPriority?.low || 0}</b></div>
      </div>
    </div>
  </div>
</div>

<!-- ══ SECTION 2: ประเภทเรื่อง + ประเภทผู้แจ้ง (สมดุล 2 คอลัมน์) ══ -->
<div class="dash-section-2col">
  <div class="chart-card clickable-chart">
    <h4><i class="fas fa-tags"></i> ประเภทเรื่อง <span class="dash-tip">คลิกแถบเพื่อดูรายละเอียด</span></h4>
    ${catB || '<p style="color:#bbb;padding:20px 0;">ยังไม่มีข้อมูล</p>'}
  </div>
  <div class="chart-card clickable-chart">
    <h4><i class="fas fa-users"></i> ประเภทผู้แจ้ง <span class="dash-tip">คลิกแถบเพื่อดูรายละเอียด</span></h4>
    ${cusB || '<p style="color:#bbb;padding:20px 0;">ยังไม่มีข้อมูล</p>'}
  </div>
</div>

<!-- ══ SECTION 3: timeline เต็มความกว้าง + satisfaction sidebar ══ -->
<div class="dash-section-2col" style="grid-template-columns: 2fr 1fr;">
  <div class="chart-card">
    <h4><i class="fas fa-chart-bar"></i> Ticket รายเดือน (6 เดือนล่าสุด)</h4>
    <div class="dash-mini-bars">${monthBars || '<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>
  </div>
  <div class="chart-card" style="text-align:center;">
    <h4 style="justify-content:center;"><i class="fas fa-star"></i> ความพึงพอใจ</h4>
    <div style="font-size:2.8rem;font-weight:800;color:var(--dgreen);line-height:1.2;">${rs.avg || '-'}</div>
    <div style="margin:6px 0;">${stars}</div>
    <div style="font-size:.83rem;color:#888;margin-bottom:12px;">${rs.total || 0} รีวิว</div>
    <div class="donut-wrap" style="justify-content:center;">
      <canvas id="donut-rating" width="120" height="120"></canvas>
    </div>
    <button onclick="navigateTo('admin-reviews')" style="margin-top:12px;padding:7px 16px;background:var(--dgreen);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.85rem;">ดูรีวิวทั้งหมด</button>
  </div>
</div>`;

  // วาด donut หลังจาก DOM render เสร็จ (rAF ป้องกัน canvas null) — พร้อม onClick แต่ละชิ้น
  requestAnimationFrame(function () {
    _drawDonut('donut-status',
      [{ value: s.pending }, { value: inprogress }, { value: s.done }, { value: s.rejected || 0 }],
      ['#f77f00', '#3a86ff', '#2d6a4f', '#d00000'],
      {
        onClick: (i) => {
          const map = [
            ['รอดำเนินการ', t => t['สถานะ'] === 'รอดำเนินการ', 'pending'],
            ['กำลังดำเนินการ', t => t['สถานะ'] === 'กำลังดำเนินการ', 'กำลังดำเนินการ'],
            ['เสร็จสิ้น', t => t['สถานะ'] === 'เสร็จสิ้น', 'เสร็จสิ้น'],
            ['ปฏิเสธ', t => t['สถานะ'] === 'ปฏิเสธ', 'all'],
          ][i];
          if (map) _dashDrilldown(map[0], map[1], map[2]);
        }
      });
    _drawDonut('donut-priority',
      [{ value: s.byPriority ? s.byPriority.high || 0 : 0 },
      { value: s.byPriority ? s.byPriority.medium || 0 : 0 },
      { value: s.byPriority ? s.byPriority.low || 0 : 0 }],
      ['#d00000', '#f77f00', '#2d6a4f'],
      {
        onClick: (i) => {
          const map = [
            ['เร่งด่วน', t => String(t['ความเร่งด่วน'] || '').toLowerCase() === 'high'],
            ['ปานกลาง', t => String(t['ความเร่งด่วน'] || '').toLowerCase() === 'medium'],
            ['ทั่วไป', t => String(t['ความเร่งด่วน'] || '').toLowerCase() === 'low'],
          ][i];
          if (map) _dashDrilldown(map[0], map[1], 'all');
        }
      });
    var dist = rs.dist || {};
    _drawDonut('donut-rating',
      [5, 4, 3, 2, 1].map(function (i) { return { value: dist[i] || 0 }; }),
      ['#2d6a4f', '#40916c', '#f0a500', '#f77f00', '#d00000']);
  });
}


// ════ ADMIN TICKETS ════
function setFilter(id) { document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); const e = document.getElementById('filter-' + id); if (e) e.classList.add('active'); }
async function loadAdminTickets(filter) { document.getElementById('admin-ticket-list').innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>'; try { const tr = await api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`); if (tr.success) renderAdminTickets(tr.tickets); else document.getElementById('admin-ticket-list').innerHTML = '<p style="color:red;">โหลดไม่สำเร็จ</p>'; } catch (e) { document.getElementById('admin-ticket-list').innerHTML = `<p style="color:red;">${e.message}</p>`; } }

function renderAdminTickets(tickets) {
  const container = document.getElementById('admin-ticket-list');
  const po = { 'high': 0, 'medium': 1, 'low': 2 }; tickets.sort((a, b) => (po[a['ความเร่งด่วน']] ?? 9) - (po[b['ความเร่งด่วน']] ?? 9));
  const scColor = { 'รอดำเนินการ': 'pending', 'กำลังดำเนินการ': 'inprogress', 'เสร็จสิ้น': 'done', 'ปฏิเสธ': 'rejected' };
  const scTag = { 'รอดำเนินการ': 'status-pending', 'กำลังดำเนินการ': 'status-inprogress', 'เสร็จสิ้น': 'status-success', 'ปฏิเสธ': 'status-reject' };
  const pLabel = { 'high': '🔴 เร่งด่วน', 'medium': '🟡 ปานกลาง', 'low': '🟢 ทั่วไป' };
  const pClass = { 'high': 'p-high', 'medium': 'p-medium', 'low': 'p-low' };
  const categories = [...new Set(tickets.map(t => t['ประเภทเรื่อง']).filter(Boolean))].sort();
  let html = '';
  if (categories.length) { html += `<div class="voc-dropdown-wrap" id="admin-cat-filter"><button class="voc-dropdown-btn" onclick="toggleDropdown('admin-cat-dd')" type="button"><i class="fas fa-filter"></i><span id="admin-cat-label">ทั้งหมด</span><i class="fas fa-chevron-down voc-dropdown-arrow"></i></button><div class="voc-dropdown-menu" id="admin-cat-dd"><button class="voc-dropdown-item active" data-cat="all" onclick="filterByCategory('all',this)"><i class="fas fa-list" style="font-size:.75rem;color:#888;"></i> ทั้งหมด</button>${categories.map(c => `<button class="voc-dropdown-item" data-cat="${c.replace(/"/g, '&quot;')}" onclick="filterByCategory('${c.replace(/'/g, "&#39;")}',this)">${c}</button>`).join('')}</div></div>`; }
  if (!tickets.length) { container.innerHTML = html + '<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ไม่มีเรื่อง</p></div>'; return; }
  html += `<p style="color:#888;margin-bottom:14px;font-size:.85rem;" id="admin-ticket-count">แสดง ${tickets.length} รายการ</p>`;
  tickets.forEach(t => {
    const tid = t['Ticket ID'], pr = t['ความเร่งด่วน'] || 'low', isHigh = pr === 'high';
    const isPinned = String(t['Pinned'] || '').toLowerCase() === 'true';
    const comments = t['Comments'] || ''; const commentEntries = comments ? comments.split('\n---\n').filter(c => c.trim()) : [];
    const detail = t['รายละเอียด'] || '(ไม่มีรายละเอียด)'; const detailShort = detail.length > 200 ? detail.substring(0, 200) + '...' : detail; const needExpand = detail.length > 200;
    html += `<div class="admin-ticket-card ${scColor[t['สถานะ']] || 'pending'} ${isHigh ? 'priority-high' : ''}" id="card-${tid}" data-category="${(t['ประเภทเรื่อง'] || '').replace(/"/g, '&quot;')}">
      <div class="admin-card-top"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">${isHigh ? '<span>🚨</span>' : ''}<span class="ticket-id" style="font-size:.96rem;">${tid}</span><span class="priority-badge ${pClass[pr] || 'p-low'}">${pLabel[pr] || pr}</span></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span class="status ${scTag[t['สถานะ']] || 'status-pending'}">${t['สถานะ']}</span><button id="pin-btn-${tid}" onclick="togglePin('${tid}',${!isPinned})" style="padding:3px 9px;border-radius:8px;border:1px solid ${isPinned ? '#2d6a4f' : '#ddd'};background:${isPinned ? '#e8f5e9' : '#fff'};font-size:.74rem;color:${isPinned ? '#2d6a4f' : '#aaa'};font-family:'Sarabun',sans-serif;"><i class="fas fa-thumbtack"></i>${isPinned ? 'แสดงอยู่' : 'ปักหมุด'}</button>${currentUser && currentUser.role === 'superadmin' ? `<button onclick="deleteTicket('${tid}')" style="padding:3px 9px;border-radius:8px;border:1px solid #f5c6c6;background:#fff5f5;font-size:.74rem;color:#d00000;font-family:'Sarabun',sans-serif;"><i class="fas fa-trash-alt"></i> ลบ</button>` : ''}</div></div>
      <div style="font-size:.97rem;font-weight:700;margin-bottom:10px;">${t['หัวข้อ'] || '-'}</div>
      <div class="admin-card-meta"><span><strong>ประเภทผู้แจ้ง:</strong> ${t['ประเภทผู้แจ้ง'] || '-'}</span><span><strong>ชื่อ:</strong> ${t['ชื่อ'] || '-'}</span><span><strong>ประเภทเรื่อง:</strong> ${t['ประเภทเรื่อง'] || '-'}</span><span><strong>วันที่แจ้ง:</strong> ${t['วันที่แจ้ง'] || '-'}</span><span><strong>กำหนดตอบกลับ:</strong> ${t['กำหนดตอบกลับ'] || '-'}</span><span><strong>ผู้รับผิดชอบ:</strong> ${t['ผู้รับผิดชอบ'] || '-'}</span></div>
      ${t['หมายเหตุผู้ใช้'] ? `<div class="admin-user-note"><span class="admin-note-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</span><div class="admin-note-text">${t['หมายเหตุผู้ใช้']}</div></div>` : ''}
      ${t['FileURL'] ? `<div class="admin-file-box"><span class="admin-note-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</span><div>${t['FileURL'].startsWith('https://') ? `<a href="${t['FileURL']}" target="_blank" rel="noopener" style="color:var(--dgreen);font-weight:700;text-decoration:none;"><i class="fas fa-external-link-alt"></i> ${t['FileURL']}</a>` : t['FileURL']}</div></div>` : ''}
      <div class="detail-box" id="adm-detail-${tid}">${needExpand ? detailShort : detail}${needExpand ? `<button class="btn-expand" onclick="expandAdminDetail('${tid}','${encodeURIComponent(detail)}')">ดูเพิ่มเติม ▼</button>` : ''}</div>
      ${commentEntries.length ? `<div style="margin-bottom:12px;"><div style="font-size:.75rem;font-weight:700;color:#aaa;text-transform:uppercase;margin-bottom:8px;"><i class="fas fa-comments"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div><div class="comments-log">${commentEntries.map((c, idx) => { const mm = c.match(/^\[(.*?)\]\s*(.*?):/); const timestamp = mm ? mm[1] : '', author = mm ? mm[2] : ''; const text = c.replace(/^\[.*?\].*?:\s*/, '').trim(); const isLatest = idx === commentEntries.length - 1; return `<div class="comment-entry ${isLatest ? 'comment-latest' : ''}"><div class="comment-meta">${isLatest ? '<span class="comment-new-badge">ใหม่</span>' : ''}${author ? `<strong style="color:#2d6a4f;">${author}</strong> · ` : ''}<i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp || 'ไม่ระบุเวลา'}</div><div class="comment-text">${text}</div></div>`; }).join('')}</div></div>` : ''}
      <div class="comment-add-box"><div style="font-size:.78rem;color:#2d6a4f;font-weight:700;margin-bottom:6px;"><i class="fas fa-plus-circle"></i> เพิ่มความคิดเห็น</div><textarea id="new-comment-${tid}" rows="2" placeholder="พิมพ์ความคิดเห็น..."></textarea><button class="btn-comment" onclick="addComment('${tid}')"><i class="fas fa-paper-plane"></i> ส่งความคิดเห็น</button></div>
      <div class="update-row" style="margin-top:10px;"><select id="status-${tid}" data-prev="${t['สถานะ'] || 'รอดำเนินการ'}" onchange="onStatusSelectChange('${tid}',this)"><option value="รอดำเนินการ" ${t['สถานะ'] === 'รอดำเนินการ' ? 'selected' : ''}>รอดำเนินการ</option><option value="กำลังดำเนินการ" ${t['สถานะ'] === 'กำลังดำเนินการ' ? 'selected' : ''}>กำลังดำเนินการ</option><option value="รอตรวจสอบ" ${t['สถานะ'] === 'รอตรวจสอบ' ? 'selected' : ''}>รอตรวจสอบ</option><option value="เสร็จสิ้น" ${t['สถานะ'] === 'เสร็จสิ้น' ? 'selected' : ''}>เสร็จสิ้น</option><option value="ปฏิเสธ" ${t['สถานะ'] === 'ปฏิเสธ' ? 'selected' : ''}>ปฏิเสธ</option></select><input type="text" id="assignee-${tid}" placeholder="ระบุผู้รับผิดชอบ" value="${t['ผู้รับผิดชอบ'] || ''}"><button class="btn-update" onclick="submitUpdate('${tid}')"><i class="fas fa-save"></i> บันทึก</button></div>
    </div>`;
  });
  container.innerHTML = html;
}

function filterByCategory(cat, btn) { document.querySelectorAll('#admin-cat-dd .voc-dropdown-item').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); const label = document.getElementById('admin-cat-label'); if (label) label.textContent = btn ? btn.textContent.trim() : 'ทั้งหมด'; document.getElementById('admin-cat-dd')?.classList.remove('open'); const cards = document.querySelectorAll('.admin-ticket-card[data-category]'); let shown = 0; cards.forEach(card => { const match = cat === 'all' || card.dataset.category === cat; card.style.display = match ? '' : 'none'; if (match) shown++; }); const countEl = document.getElementById('admin-ticket-count'); if (countEl) countEl.textContent = `แสดง ${shown} รายการ${cat !== 'all' ? ` (กรอง: ${cat})` : ''}`; }
function expandAdminDetail(tid, enc) { const el = document.getElementById('adm-detail-' + tid); if (!el) return; el.innerHTML = decodeURIComponent(enc); }

async function addComment(ticketId) { const commentEl = document.getElementById('new-comment-' + ticketId); const comment = commentEl?.value.trim(); if (!comment) { await showAlert('กรุณาพิมพ์ความคิดเห็น', ''); return; } try { const res = await api.post('/api/tickets', { action: 'addComment', ticketId, comment, author: currentUser?.fullname || currentUser?.username || 'ผู้ดูแล' }); if (res.success) { if (commentEl) commentEl.value = ''; await showAlert('บันทึกความคิดเห็นสำเร็จ', ''); loadAdminTickets(document.querySelector('.filter-btn.active')?.id?.replace('filter-', '') || 'pending'); } else await showAlert('ไม่สำเร็จ', res.message || ''); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
async function togglePin(tid, ns) { if (!await showConfirm(ns ? 'ปักหมุด' : 'ยกเลิกปักหมุด', ns ? 'คุณต้องการปักหมุดไปยังหน้าหลักหรือไม่?' : 'คุณต้องการยกเลิกการปักหมุดออกจากหน้าหลักหรือไม่?')) return; try { const res = await api.post('/api/tickets', { action: 'togglePin', ticketId: tid, pinned: ns }); if (res.success) { const btn = document.getElementById(`pin-btn-${tid}`); if (btn) { btn.style.border = `1px solid ${ns ? '#2d6a4f' : '#ddd'}`; btn.style.background = ns ? '#e8f5e9' : '#fff'; btn.style.color = ns ? '#2d6a4f' : '#aaa'; btn.innerHTML = `<i class="fas fa-thumbtack"></i>${ns ? 'แสดงอยู่' : 'ปักหมุด'}`; btn.setAttribute('onclick', `togglePin('${tid}',${!ns})`); } } } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
// เมื่อเจ้าหน้าที่เปลี่ยนสถานะผ่าน dropdown → ถาม alert ยืนยันทันที
// ถ้ายืนยัน จะบันทึกสถานะ (พร้อมผู้รับผิดชอบปัจจุบัน) ให้เลย โดยไม่ต้องกดปุ่ม "บันทึก" อีก
// ถ้ายกเลิก จะคืนค่า dropdown กลับเป็นสถานะเดิม
async function onStatusSelectChange(tid, selectEl) {
  const ns = selectEl.value;
  const prev = selectEl.dataset.prev || ns;
  if (ns === prev) return;

  const ok = await showConfirm('ยืนยันการเปลี่ยนสถานะ', `คุณต้องการอัพเดทสถานะเป็น "<strong>${ns}</strong>" หรือไม่?`);
  if (!ok) {
    selectEl.value = prev; // ยกเลิก → คืนค่าเดิม
    return;
  }
  selectEl.dataset.prev = ns;
  await submitUpdate(tid, true); // true = ยืนยันแล้วจาก dropdown, ไม่ต้องถามซ้ำ
}

async function submitUpdate(tid, skipConfirm) {
  // ตรวจสอบ token ก่อน — ถ้าไม่มีให้แจ้งเตือนทันที
  const _tok = loadToken();
  if (!_tok) {
    await showAlert('กรุณาเข้าสู่ระบบใหม่', 'Session หมดอายุ กรุณา Login ใหม่อีกครั้ง');
    return;
  }
  const selectEl = document.getElementById('status-' + tid);
  const ns = selectEl.value;
  const as = document.getElementById('assignee-' + tid).value;
  if (!skipConfirm) {
    if (!await showConfirm('ยืนยันการอัปเดตสถานะ', `คุณต้องการอัปเดตสถานะเป็น <strong style="color:var(--dgreen);">'${ns}'</strong> หรือไม่?<br><small style="color:#888;">Ticket: ${tid}</small>`)) return;
  }
  const btn = document.querySelector(`#card-${tid} .btn-update`);
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
  try {
    const res = await api.post('/api/tickets', { action: 'update', ticketId: tid, newStatus: ns, assignee: as });
    if (res.success) {
      if (selectEl) selectEl.dataset.prev = ns;
      const card = document.getElementById('card-' + tid);
      if (card) {
        // อัปเดต badge สถานะมุมขวาบน
        const scTag = { 'รอดำเนินการ': 'status-pending', 'กำลังดำเนินการ': 'status-inprogress', 'รอตรวจสอบ': 'status-review', 'เสร็จสิ้น': 'status-done', 'ปฏิเสธ': 'status-rejected' };
        const badge = card.querySelector('.admin-card-top .status');
        if (badge) { badge.textContent = ns; badge.className = `status ${scTag[ns] || 'status-pending'}`; }
        // อัปเดต ผู้รับผิดชอบ ใน footer ของ card (ถ้ามี)
        if (as) {
          const assigneeEl = card.querySelector('.card-assignee');
          if (assigneeEl) assigneeEl.textContent = as;
        }
        // flash เขียวสั้นๆ แจ้งว่าสำเร็จ
        card.style.transition = 'background .4s';
        card.style.background = '#d4edda';
        setTimeout(() => { card.style.background = ''; }, 1500);
      }
    } else {
      // ถ้า 401 → token หมดอายุ ให้แจ้งเตือนชัดเจน
      const msg = (res.message || '').includes('กรุณาเข้าสู่ระบบ') || (res.message || '').includes('token')
        ? 'Session หมดอายุ กรุณา Login ใหม่'
        : res.message || 'บันทึกไม่สำเร็จ';
      await showAlert('บันทึกไม่สำเร็จ', msg);
    }
  } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); }
  finally { if (btn) { btn.innerHTML = '<i class="fas fa-save"></i> บันทึก'; btn.disabled = false; } }
}
async function deleteTicket(tid) { if (!await showConfirm('ลบ Ticket', `ต้องการลบ <strong>${tid}</strong>?<br><small style="color:#d00000;">ไม่สามารถเรียกคืนได้</small>`, 'danger')) return; try { const res = await api.post('/api/tickets', { action: 'deleteTicket', ticketId: tid }); if (res.success) { const card = document.getElementById('card-' + tid); if (card) { card.style.transition = 'opacity .4s'; card.style.opacity = '0'; setTimeout(() => card.remove(), 400); } await showAlert('ลบสำเร็จ', `Ticket ${tid} ถูกลบแล้ว`); } else await showAlert('ลบไม่สำเร็จ', res.message || ''); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }

// ════ ADMIN REVIEWS ════
async function loadReviews() { const container = document.getElementById('review-content'); if (!container) return; container.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>'; try { const [ar, sr] = await Promise.all([api.get('/api/ratings?action=all'), api.get('/api/ratings?action=summary')]); renderReviews(ar.ratings || [], sr.summary || { avg: 0, total: 0, dist: {} }); } catch (e) { container.innerHTML = `<p style="color:red;">${e.message}</p>`; } }
function renderReviews(ratings, summary) { const container = document.getElementById('review-content'); const avg = summary.avg || 0, total = summary.total || 0; let html = `<div class="rating-summary"><div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;"><div style="text-align:center;"><div class="rating-avg">${avg}</div><div style="font-size:1.4rem;margin:6px 0;">${'⭐'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div><div style="font-size:.82rem;color:#888;">${total} รีวิว</div></div></div></div>`; if (!ratings.length) { container.innerHTML = html + '<div class="no-tickets"><i class="fas fa-star" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ยังไม่มีรีวิว</p></div>'; return; } ratings.forEach(r => { const stars = '⭐'.repeat(r.score) + '☆'.repeat(5 - r.score); html += `<div style="background:#fff;border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:12px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;"><div><span style="font-weight:700;color:var(--dgreen);font-family:monospace;">${r.ticketId}</span><span style="font-size:1.1rem;margin-left:8px;">${stars}</span></div><span style="font-size:.78rem;color:#aaa;">${r.date || ''}</span></div><div style="font-size:.83rem;color:#aaa;"><i class="fas fa-user"></i> ${r.username || 'ไม่ระบุ'}</div>${r.comment ? `<div style="background:#f8f8f8;border-radius:8px;padding:10px 12px;font-size:.87rem;color:#444;margin-top:8px;">${r.comment}</div>` : ''}</div>`; }); container.innerHTML = html; }

// ════ SUPERADMIN ════
async function loadSuperAdmin() { showSATab('news'); }
function showSATab(tab) { currentSATab = tab; if (tab === 'news') loadSANews(); if (tab === 'faq') loadSAFaq(); if (tab === 'admins') loadSAAdmins(); }
function _saTabsHtml() { return `<div class="sa-tabs"><button class="sa-tab ${currentSATab === 'news' ? 'active' : ''}" onclick="showSATab('news')"><i class="fas fa-newspaper"></i> ข่าวสาร</button><button class="sa-tab ${currentSATab === 'faq' ? 'active' : ''}" onclick="showSATab('faq')"><i class="fas fa-question-circle"></i> FAQ</button><button class="sa-tab ${currentSATab === 'admins' ? 'active' : ''}" onclick="showSATab('admins')"><i class="fas fa-user-shield"></i> เจ้าหน้าที่</button></div>`; }
function _saBannerHtml() { return `<div class="superadmin-banner"><i class="fas fa-crown"></i><div><strong>เจ้าหน้าที่ระดับสูง</strong><br><small>จัดการข่าวสาร FAQ และการตั้งค่าระบบ</small></div></div>`; }

async function loadSAAdmins() { const container = document.getElementById('superadmin-content'); if (!container) return; try { const res = await api.post('/api/auth', { action: 'listAdmins' }); renderSAAdmins(res.admins || []); } catch (e) { document.getElementById('superadmin-content').innerHTML = `<p style="color:red;">${e.message}</p>`; } }
function renderSAAdmins(admins) { const container = document.getElementById('superadmin-content'); let html = _saBannerHtml() + _saTabsHtml(); html += `<div class="news-manager-form"><h4><i class="fas fa-user-plus"></i> เพิ่ม เจ้าหน้าที่ ใหม่</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div class="form-group" style="margin-bottom:0;"><label>Username *</label><input type="text" id="new-admin-user" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>รหัสผ่าน *</label><input type="password" id="new-admin-pass" placeholder="อย่างน้อย 8 ตัว" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>ชื่อแสดง</label><input type="text" id="new-admin-name" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>อีเมล</label><input type="email" id="new-admin-email" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div></div><button class="btn-add-news" style="margin-top:14px;" onclick="addAdmin()"><i class="fas fa-plus"></i> เพิ่ม Admin</button></div>`; admins.forEach(a => { html += `<div class="news-manager-card" style="display:flex;align-items:center;gap:14px;"><div style="width:44px;height:44px;background:var(--dgreen);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.1rem;flex-shrink:0;">${(a.fullname || a.username || 'A')[0].toUpperCase()}</div><div style="flex:1;"><div style="font-weight:700;">${a.fullname || a.username}</div><div style="font-size:.82rem;color:#aaa;font-family:monospace;">${a.username} · ${a.email || 'ไม่มีอีเมล'}</div></div><span style="font-size:.75rem;padding:3px 10px;border-radius:8px;background:${a.status === 'active' ? '#e8f5e9' : '#fde8e8'};color:${a.status === 'active' ? '#2d6a4f' : '#d00000'};font-weight:700;">${a.status === 'active' ? 'ใช้งาน' : 'ระงับ'}</span></div>`; }); container.innerHTML = html; }
async function addAdmin() { const u = document.getElementById('new-admin-user')?.value.trim(); const p = document.getElementById('new-admin-pass')?.value; const n = document.getElementById('new-admin-name')?.value.trim(); const e = document.getElementById('new-admin-email')?.value.trim(); if (!u || !p) { await showAlert('ข้อมูลไม่ครบ', 'กรุณากรอก Username และรหัสผ่าน'); return; } if (p.length < 8) { await showAlert('รหัสผ่านสั้นเกิน', 'รหัสผ่านต้องอย่างน้อย 8 ตัว'); return; } try { const res = await api.post('/api/auth', { action: 'addAdmin', username: u, password: p, fullname: n, email: e }); if (res.success) { await showAlert('เพิ่ม Admin สำเร็จ', res.message);['new-admin-user', 'new-admin-pass', 'new-admin-name', 'new-admin-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); loadSAAdmins(); } else await showAlert('ไม่สำเร็จ', res.message); } catch (err) { await showAlert('เกิดข้อผิดพลาด', err.message); } }

async function loadSANews() { const container = document.getElementById('superadmin-content'); if (!container) return; try { const res = await api.get('/api/news'); renderSANews(res.news || []); } catch (e) { document.getElementById('superadmin-content').innerHTML = `<p style="color:red;">${e.message}</p>`; } }
function renderSANews(news) { _saNewsCache = news; const container = document.getElementById('superadmin-content'); const tagOpts = ['ทั่วไป', 'ด่วน', 'ข้อมูล', 'กิจกรรม']; let html = _saBannerHtml() + _saTabsHtml(); html += `<div class="news-manager-form"><h4><i class="fas fa-plus-circle"></i> เพิ่มข่าวสารใหม่</h4><div class="form-group"><label>หัวเรื่อง *</label><input type="text" id="news-title" placeholder="หัวเรื่องข่าว"></div><div class="form-group"><label>เนื้อหา *</label><textarea id="news-content" rows="4" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;"></textarea></div><div class="form-group"><label>Tag</label><select id="news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${tagOpts.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div><div class="form-group"><label>URL รูปภาพ</label><input type="url" id="news-image-url" placeholder="https://..." style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;"></div><button class="btn-add-news" onclick="addNews()"><i class="fas fa-plus"></i> เพิ่มข่าว</button></div>`; news.forEach(n => { const short = n.content.length > 100 ? n.content.substring(0, 100) + '...' : n.content; html += `<div class="news-manager-card" style="display:flex;align-items:flex-start;">${n.imageUrl ? `<img src="${n.imageUrl}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-right:12px;flex-shrink:0;" onerror="this.style.display='none'">` : ''}<div style="flex:1;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;"><div><span class="news-tag">${n.tag || 'ทั่วไป'}</span><strong>${n.title}</strong></div><div style="display:flex;gap:6px;"><button class="btn-edit-news" onclick="editNews(${news.indexOf(n)})"><i class="fas fa-edit"></i> แก้ไข</button><button class="btn-delete" onclick="deleteNews('${n.newsId}')"><i class="fas fa-trash"></i> ลบ</button></div></div><div style="font-size:.86rem;color:#666;">${short}</div></div></div>`; }); container.innerHTML = html; }
function handleNewsImageSelect(input, previewId, b64Id) { const file = input.files?.[0]; const previewEl = document.getElementById(previewId); const b64El = document.getElementById(b64Id); if (!file) { if (previewEl) previewEl.style.display = 'none'; if (b64El) b64El.value = ''; return; } if (file.size > 3 * 1024 * 1024) { showAlert('ไฟล์ใหญ่เกินไป', 'ขนาดรูปไม่เกิน 3 MB'); input.value = ''; return; } const reader = new FileReader(); reader.onload = e => { if (b64El) b64El.value = e.target.result; if (previewEl) { previewEl.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:140px;border-radius:8px;object-fit:cover;">`; previewEl.style.display = 'block'; } }; reader.readAsDataURL(file); }
function clearNewsImg(inputId, previewId, b64Id) { const inp = document.getElementById(inputId); if (inp) inp.value = ''; const prev = document.getElementById(previewId); if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; } const b64 = document.getElementById(b64Id); if (b64) b64.value = ''; }
async function addNews() { const title = document.getElementById('news-title')?.value.trim(); const content = document.getElementById('news-content')?.value.trim(); const tag = document.getElementById('news-tag')?.value; const imageUrl = document.getElementById('news-image-url')?.value.trim() || ''; if (!title || !content) { await showAlert('กรุณากรอกข้อมูล', ''); return; } try { const res = await api.post('/api/news', { action: 'add', title, content, tag, imageUrl, author: currentUser?.username || 'admin' }); if (res.success) { document.getElementById('news-title').value = ''; document.getElementById('news-content').value = ''; const u = document.getElementById('news-image-url'); if (u) u.value = ''; await showAlert('เพิ่มข่าวสำเร็จ', ''); loadSANews(); } else await showAlert('ไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
function editNews(idx) { const n = _saNewsCache[idx]; if (!n) { showAlert('เกิดข้อผิดพลาด', 'ไม่พบข้อมูลข่าว'); return; } const tagOpts = ['ทั่วไป', 'ด่วน', 'ข้อมูล', 'กิจกรรม']; const overlay = document.createElement('div'); overlay.className = 'voc-overlay'; overlay.id = 'edit-news-overlay'; overlay.innerHTML = `<div class="voc-modal-box" style="max-width:600px;"><div class="voc-modal-title"><i class="fas fa-edit"></i> แก้ไขข่าวสาร</div><div class="form-group"><label>หัวเรื่อง *</label><input type="text" id="edit-news-title" value="${(n.title || '').replace(/"/g, '&quot;')}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group"><label>เนื้อหา *</label><textarea id="edit-news-content" rows="5" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;box-sizing:border-box;">${n.content || ''}</textarea></div><div class="form-group"><label>Tag</label><select id="edit-news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${tagOpts.map(t => `<option value="${t}" ${t === n.tag ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="form-group"><label>URL รูปภาพ</label><input type="url" id="edit-news-image-url" value="${n.imageUrl || ''}" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;"></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('edit-news-overlay'))">ยกเลิก</button><button class="voc-btn-ok" onclick="updateNews('${n.newsId}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`; document.body.appendChild(overlay); }
async function updateNews(newsId) { const title = document.getElementById('edit-news-title')?.value.trim(); const content = document.getElementById('edit-news-content')?.value.trim(); const tag = document.getElementById('edit-news-tag')?.value; const imageUrl = document.getElementById('edit-news-image-url')?.value.trim() || ''; if (!title || !content) { await showAlert('กรุณากรอกข้อมูล', ''); return; } try { const res = await api.post('/api/news', { action: 'update', newsId, title, content, tag, imageUrl }); if (res.success) { const o = document.getElementById('edit-news-overlay'); if (o) document.body.removeChild(o); await showAlert('แก้ไขสำเร็จ', ''); loadSANews(); } else await showAlert('ไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
function clearExistingImg() { const ex = document.getElementById('edit-news-image-existing'); if (ex) ex.value = ''; }
async function deleteNews(newsId) { if (!await showConfirm('ลบข่าว', 'ต้องการลบข่าวนี้ใช่หรือไม่?', 'danger')) return; try { const res = await api.post('/api/news', { action: 'delete', newsId }); if (res.success) loadSANews(); else await showAlert('ลบไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }

async function loadSAFaq() { const container = document.getElementById('superadmin-content'); if (!container) return; try { const res = await api.get('/api/faq'); renderSAFaq(res.faqs || []); } catch (e) { document.getElementById('superadmin-content').innerHTML = `<p style="color:red;">${e.message}</p>`; } }
function renderSAFaq(faqs) { const container = document.getElementById('superadmin-content'); const catOpts = ['การใช้งาน', 'ความเร่งด่วน', 'ความปลอดภัย', 'ระบบ', 'ทั่วไป']; let html = _saBannerHtml() + _saTabsHtml(); html += `<div class="news-manager-form"><h4><i class="fas fa-plus-circle"></i> เพิ่มคำถามใหม่</h4><div class="form-group"><label>หมวดหมู่</label><select id="faq-cat-new" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${catOpts.map(c => `<option>${c}</option>`).join('')}</select></div><div class="form-group"><label>คำถาม *</label><input type="text" id="faq-q-new" placeholder="คำถาม..."></div><div class="form-group"><label>คำตอบ *</label><textarea id="faq-a-new" rows="3" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;" placeholder="คำตอบ..."></textarea></div><button class="btn-add-news" onclick="addFaq()"><i class="fas fa-plus"></i> เพิ่มคำถาม</button></div><p style="font-size:.85rem;color:#888;margin-bottom:14px;">FAQ ทั้งหมด ${faqs.length} รายการ</p>`; faqs.forEach(f => { html += `<div class="news-manager-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;"><div><span class="chip gray" style="margin-right:6px;">${f.category}</span><strong>${f.question}</strong></div><div style="display:flex;gap:6px;"><button class="btn-edit-news" onclick='editFaq(${JSON.stringify(f)})'><i class="fas fa-edit"></i> แก้ไข</button><button class="btn-delete" onclick="deleteFaq('${f.faqId}')"><i class="fas fa-trash"></i> ลบ</button></div></div><div style="font-size:.86rem;color:#666;">${f.answer}</div></div>`; }); container.innerHTML = html; }
function editFaq(f) { const catOpts = ['การใช้งาน', 'ความเร่งด่วน', 'ความปลอดภัย', 'ระบบ', 'ทั่วไป']; const overlay = document.createElement('div'); overlay.className = 'voc-overlay'; overlay.id = 'edit-faq-overlay'; overlay.innerHTML = `<div class="voc-modal-box" style="max-width:580px;"><div class="voc-modal-title"><i class="fas fa-edit"></i> แก้ไขคำถาม FAQ</div><div class="form-group"><label>หมวดหมู่</label><select id="edit-faq-cat" style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;margin-top:4px;">${catOpts.map(c => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>คำถาม *</label><input type="text" id="edit-faq-q" value="${(f.question || '').replace(/"/g, '&quot;')}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group"><label>คำตอบ *</label><textarea id="edit-faq-a" rows="5" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;box-sizing:border-box;">${f.answer || ''}</textarea></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('edit-faq-overlay'))">ยกเลิก</button><button class="voc-btn-ok" onclick="updateFaq('${f.faqId}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`; document.body.appendChild(overlay); }
async function updateFaq(faqId) { const category = document.getElementById('edit-faq-cat')?.value; const question = document.getElementById('edit-faq-q')?.value.trim(); const answer = document.getElementById('edit-faq-a')?.value.trim(); if (!question || !answer) { await showAlert('กรุณากรอกข้อมูล', ''); return; } try { const res = await api.post('/api/faq', { action: 'update', faqId, category, question, answer }); if (res.success) { const o = document.getElementById('edit-faq-overlay'); if (o) document.body.removeChild(o); await showAlert('แก้ไขสำเร็จ', ''); loadSAFaq(); } else await showAlert('ไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
async function addFaq() { const cat = document.getElementById('faq-cat-new')?.value; const q = document.getElementById('faq-q-new')?.value.trim(); const a = document.getElementById('faq-a-new')?.value.trim(); if (!q || !a) { await showAlert('กรุณากรอกข้อมูล', ''); return; } try { const res = await api.post('/api/faq', { action: 'add', category: cat, question: q, answer: a }); if (res.success) { await showAlert('เพิ่มสำเร็จ', ''); loadSAFaq(); } else await showAlert('ไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }
async function deleteFaq(faqId) { if (!await showConfirm('ลบคำถาม', '', 'danger')) return; try { const res = await api.post('/api/faq', { action: 'delete', faqId }); if (res.success) loadSAFaq(); else await showAlert('ลบไม่สำเร็จ', res.message); } catch (e) { await showAlert('เกิดข้อผิดพลาด', e.message); } }

function _resetMenuToGuest() {
  const nav = document.getElementById('main-nav');
  const right = document.getElementById('right-menu');
  if (nav) nav.innerHTML = `
    <a onclick="navigateTo('home')"     id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('portal')"   id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="navigateTo('faq')"      id="nav-faq">คำถามที่พบบ่อย</a>`;
  if (right) right.innerHTML = `
    <a onclick="navigateTo('login')"    class="nav-menu header-auth-desktop" style="color:rgba(255,255,255,.85);font-size:.85rem;"> เข้าสู่ระบบ</a>
    <a onclick="navigateTo('register')" class="btn-nav-active nav-menu header-auth-desktop">ลงทะเบียน</a>
    <button class="header-auth-mobile" onclick="navigateTo('login')" aria-label="เข้าสู่ระบบ" title="เข้าสู่ระบบ"><i class="fas fa-user-circle"></i></button>
    <button class="header-auth-mobile header-auth-mobile--register" onclick="navigateTo('register')" aria-label="ลงทะเบียน" title="ลงทะเบียน"><i class="fas fa-user-plus"></i></button>`;
}

// ════ INIT ════
function _registerCallbacks() {
  registerRouterCallbacks({
    get currentUser() { return currentUser; },
    onSessionExpired() {
      // Bug #2 fix: ต้อง reset ทั้ง state และ menu ไม่ใช่แค่ currentUser
      currentUser = null;
      _resetMenuToGuest();
    },
    setupPortalView, setupGuestPortalView, changeStep,
    showComplaintTypeModal, loadDashboard,
    loadReport: () => loadReport(currentReportType),
    loadAdminTickets: (f) => loadAdminTickets(f || 'pending'),
    loadReviews, loadSuperAdmin, loadFaq,
    loadPinnedTickets, loadNewsStrip, loadMyTickets,
  });
}

function _exposeGlobals() {
  const G = window;
  G.navigateTo = navigateTo; G.toggleMobileNav = toggleMobileNav; G.closeMobileNav = closeMobileNav;
  G.doLogin = doLogin; G.doAdminLogin = doAdminLogin; G.doRegister = doRegister; G.doLogout = doLogout;
  G.showAdminLoginModal = showAdminLoginModal; G.hideAdminLoginModal = hideAdminLoginModal;
  G.showSuperAdminLoginModal = showAdminLoginModal;
  G.showProfile = showProfile; G.saveProfile = saveProfile;
  G.changeStep = changeStep; G.setOption = setOption; G.toggleAnon = toggleAnon;
  G.handleFileSelect = handleFileSelect; G.prepareReview = prepareReview; G.finalSubmit = finalSubmit;
  G.onTurnstileSuccess = onTurnstileSuccess; G.onTurnstileExpire = onTurnstileExpire;
  G.onTurnstileError = onTurnstileError; G.resetTurnstile = resetTurnstile;
  G.doTrack = doTrack; G.expandDetail = expandDetail; G.expandPinDetail = expandPinDetail;
  G.submitRating = submitRating; G.selectStar = selectStar;
  G.loadFaq = loadFaq; G.searchFaq = searchFaq; G.toggleFaq = toggleFaq;
  G.loadAdminTickets = loadAdminTickets; G.addComment = addComment; G.togglePin = togglePin;
  G.submitUpdate = submitUpdate; G.deleteTicket = deleteTicket; G.onStatusSelectChange = onStatusSelectChange;
  G._dashDrilldown = _dashDrilldown; G.loadDashboard = loadDashboard;
  G.filterByCategory = filterByCategory; G.expandAdminDetail = expandAdminDetail;
  G.selectTicketFilter = selectTicketFilter; G.setFilter = setFilter;
  G.loadReport = loadReport; G.selectReportType = selectReportType;
  G.printReport = printReport; G.showUserReport = showUserReport; G.closeUserReport = closeUserReport;
  G.loadSuperAdmin = loadSuperAdmin; G.showSATab = showSATab;
  G.addNews = addNews; G.editNews = editNews; G.updateNews = updateNews; G.deleteNews = deleteNews;
  G.addFaq = addFaq; G.editFaq = editFaq; G.updateFaq = updateFaq; G.deleteFaq = deleteFaq;
  G.addAdmin = addAdmin; G.handleNewsImageSelect = handleNewsImageSelect;
  G.clearNewsImg = clearNewsImg; G.clearExistingImg = clearExistingImg;
  G.toggleDropdown = toggleDropdown; G.dismissGuestBanner = dismissGuestBanner;
  G.switchFileTab = switchFileTab;
  G.handleFileUploadSelect = handleFileUploadSelect;
  G.clearFileUpload = clearFileUpload;
  G.resetComplaintTypeSelection = () => { };
  G.mgmtSlide = (dir) => { if (window._mgmtGoTo) window._mgmtGoTo(dir); };
  // accessibility — ensure these are always exposed (also set by IIFE below)
  if (!G.changeFontSize) G.changeFontSize = (d) => console.warn('[a11y] changeFontSize not ready', d);
  if (!G.switchLang) G.switchLang = (l) => console.warn('[a11y] switchLang not ready', l);
}

window.onload = function () {
  // Restore session ก่อนทุกอย่าง เพื่อให้ currentUser พร้อมก่อน callbacks ถูกเรียก
  const saved = loadSession();
  if (saved) {
    currentUser = saved;
  }

  _registerCallbacks(); // register callbacks หลังจาก currentUser ถูก set แล้ว
  _exposeGlobals();

  if (saved) {
    if (saved.role === 'superadmin') updateMenuForSuperAdmin();
    else if (saved.role === 'admin') updateMenuForAdmin();
    else updateMenuForUser();
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.voc-dropdown-wrap')) {
      document.querySelectorAll('.voc-dropdown-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.voc-dropdown-arrow.rotated').forEach(a => a.classList.remove('rotated'));
    }
  });

  const loginPairs = [['login-user', 'login-pass', doLogin], ['admin-user', 'admin-pass', doAdminLogin]];
  loginPairs.forEach(([f1, f2, fn]) => { const e1 = document.getElementById(f1); const e2 = document.getElementById(f2); if (e1) e1.addEventListener('keydown', e => { if (e.key === 'Enter' && e2) e2.focus(); }); if (e2) e2.addEventListener('keydown', e => { if (e.key === 'Enter') fn(); }); });

  const regFields = ['reg-firstname', 'reg-lastname', 'reg-email', 'reg-phone', 'reg-username', 'reg-pass', 'reg-pass2'];
  regFields.forEach((id, idx) => { const el = document.getElementById(id); if (!el) return; el.addEventListener('input', clearFieldErrors); if (idx < regFields.length - 1) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const nx = document.getElementById(regFields[idx + 1]); if (nx) nx.focus(); } }); });
  const pw = document.getElementById('reg-pass'); if (pw) pw.addEventListener('input', updateStrengthBar);
  const lastReg = document.getElementById('reg-pass2'); if (lastReg) lastReg.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  const ti = document.getElementById('track-input'); if (ti) ti.addEventListener('keydown', e => { if (e.key === 'Enter') doTrack(); });
  const fs = document.getElementById('faq-search'); if (fs) fs.addEventListener('keydown', e => { if (e.key === 'Enter') searchFaq(); });

  if (window.initMgmtSlider) window.initMgmtSlider();
  navigateTo('home');
};

// ════ MGMT SLIDER (ต้องอยู่หลัง INIT section เพื่อให้ window.initMgmtSlider พร้อมก่อน onload) ════
(function () {
  const MGMT_PEOPLE = [
    { img: '/img/คณะผู้บริหารคณะวิทย์/wilaiwan.png', name: 'ผศ.ดร.วิไลวัลย์ แก้วตาทิพย์', pos: 'คณบดีคณะวิทยาศาสตร์เทคโนโลยีและการเกษตร' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/ดาว.png', name: 'ผศ.ดร.ปัทมา พิศภักดิ์', pos: 'รองคณบดีฝ่ายบริหารและเครือข่ายสัมพันธ์' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/ely(nw).png', name: 'ผศ.ดร.อีลีหย๊ะ สนิโซ', pos: 'รองคณบดีฝ่ายวิจัย บริการวิชาการและกิจการนักศึกษา' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/อาบีดีน.png', name: 'ผศ.ดร.อาบีดีน ดะแซสาเมาะ', pos: 'รองคณบดีฝ่ายวิชาการและพัฒนาคุณภาพบัณฑิต' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/1759376222_.png', name: 'นางอธิพร สมจิตต์', pos: 'รักษาการในตำแหน่งผู้อำนวยการสำนักงานคณบดี' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/zl.png', name: 'ผศ.ดร.อิมรอน มีชัย', pos: 'ผู้ช่วยคณบดี ฝ่ายการสรรหานักศึกษาเชิงรุก' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/Screenshot 2025_09_24 153629.png', name: 'ผศ.รอมลี เจะดอเลาะ', pos: 'ผู้ช่วยคณบดี ฝ่ายการประเมินผลกระทบการบริการวิชาการ' },
    { img: '/img/คณะผู้บริหารคณะวิทย์/Gemini_Generated_Image_z9sopgz9sopgz9so_removebg_preview.png', name: 'อ.ดร.อดุลย์สมาน สุขแก้ว', pos: 'ผู้ช่วยคณบดี ฝ่ายงานวิเทศสัมพันธ์และการสื่อสารองค์กร' },
  ];
  let current = 0, timer = null, slides = [];

  function buildSlides() {
    const track = document.getElementById('mgmt-h-track'); if (!track) return;
    track.innerHTML = '';
    slides = MGMT_PEOPLE.map(p => {
      const div = document.createElement('div'); div.className = 'mgmt-h-item';
      div.innerHTML = `<img class="mgmt-h-img" src="${p.img}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="mgmt-h-img-fallback" style="display:none;"><i class="fas fa-user-tie"></i></div>`;
      track.appendChild(div); return div;
    });
    updateInfo(0);
  }
  function updateInfo(idx) {
    const nameEl = document.getElementById('mgmt-h-name'); const posEl = document.getElementById('mgmt-h-pos');
    if (!nameEl || !posEl) return;
    const p = MGMT_PEOPLE[idx]; if (!p) return;
    nameEl.style.opacity = '0'; posEl.style.opacity = '0';
    setTimeout(() => { nameEl.textContent = p.name; posEl.textContent = p.pos; nameEl.style.opacity = '1'; posEl.style.opacity = '1'; }, 220);
  }
  function buildDots() {
    const dotsEl = document.getElementById('mgmt-dots'); if (!dotsEl) return; dotsEl.innerHTML = '';
    MGMT_PEOPLE.forEach((_, i) => { const d = document.createElement('div'); d.className = 'mgmt-dot' + (i === 0 ? ' active' : ''); d.onclick = () => goTo(i); dotsEl.appendChild(d); });
  }
  function updateDots() {
    const dotsEl = document.getElementById('mgmt-dots'); if (!dotsEl) return;
    dotsEl.querySelectorAll('.mgmt-dot').forEach((d, i) => d.classList.toggle('active', i === current));
  }
  function goTo(idx) {
    if (!slides.length) return;
    current = (idx + MGMT_PEOPLE.length) % MGMT_PEOPLE.length;
    const track = document.getElementById('mgmt-h-track');
    if (track) track.style.transform = `translateX(-${current * 100}%)`;
    updateDots(); updateInfo(current);
  }
  function startAuto() { stopAuto(); timer = setInterval(() => goTo(current + 1), 3500); }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  window.initMgmtSlider = function () {
    buildSlides(); buildDots(); startAuto();
    const panel = document.querySelector('.hero-mgmt-panel');
    if (panel) { panel.addEventListener('mouseenter', stopAuto); panel.addEventListener('mouseleave', startAuto); }
    const track = document.getElementById('mgmt-h-track');
    if (track) { let tx = 0; track.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true }); track.addEventListener('touchend', e => { const diff = tx - e.changedTouches[0].clientX; if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1)); }); }
  };
  window._mgmtGoTo = function (dir) { goTo(current + dir); };
})();

// ════════════════════════════════════════════════════
//  ACCESSIBILITY — FONT SIZE
// ════════════════════════════════════════════════════
(function initFontSize() {
  const LEVELS = ['font-sm', 'font-md', 'font-lg', 'font-xl'];
  const DEFAULT_IDX = 1; // font-md = 16px
  let currentIdx = parseInt(localStorage.getItem('voc_font_size') || DEFAULT_IDX, 10);
  if (isNaN(currentIdx) || currentIdx < 0 || currentIdx > 3) currentIdx = DEFAULT_IDX;

  function applyFontSize(idx) {
    const SIZES = [14, 16, 18, 20]; // px ตรงกับ font-sm/md/lg/xl
    document.body.classList.remove(...LEVELS);
    document.body.classList.add(LEVELS[idx]);
    // ตั้งค่า font-size บน <html> ด้วย เพื่อให้ rem cascade ทำงานทั่วทั้งหน้า
    document.documentElement.style.fontSize = SIZES[idx] + 'px';
    currentIdx = idx;
    localStorage.setItem('voc_font_size', idx);
    // update button active state
    ['font-decrease', 'font-reset', 'font-increase'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    if (idx === DEFAULT_IDX) {
      const rb = document.getElementById('font-reset');
      if (rb) rb.classList.add('active');
    }
  }

  window.changeFontSize = function (direction) {
    if (direction === 0) {
      applyFontSize(DEFAULT_IDX);
    } else {
      const next = Math.max(0, Math.min(3, currentIdx + direction));
      applyFontSize(next);
    }
  };

  // apply on page load
  // ใช้ requestAnimationFrame เพราะ type="module" อาจ DOMContentLoaded ผ่านไปแล้ว
  function _applyOnReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyFontSize(currentIdx));
    } else {
      // DOM พร้อมแล้ว — apply ทันที (กรณี module script load หลัง DOMContentLoaded)
      applyFontSize(currentIdx);
    }
  }
  _applyOnReady();
})();

// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// LANGUAGE SWITCH — Thai / English ทั้งหน้าเว็บ via /api/translate
// ════════════════════════════════════════════════════
(function initLangSwitch() {
  // ══════════════════════════════════════════════════════════════
  //  VOC i18n v5 — Safe Text Node & Attribute Approach
  //  แก้ไขปัญหา: แปลไม่ครบทุกส่วน + ปุ่มกดไม่ได้หลังจากเปลี่ยนภาษา
  //  วิธีการ: ดึงเฉพาะ Text Nodes และ Attributes มาแปลโดยไม่ทำลายโครงสร้าง DOM
  //  ทำให้รักษา Event Listeners ทั้งหมดไว้ได้ 100% และครอบคลุมทั้งหน้าเว็บ
  // ══════════════════════════════════════════════════════════════

  let _currentLang = localStorage.getItem('voc_lang') || 'th';
  let _isBusy = false;
  let _mutating = false;
  let _mutationTimer = null;

  const CACHE_KEY = 'voc_i18n_v4';
  const CACHE_MAX = 2000;
  const CHUNK_SIZE = 20;   // ส่งแปลทีละ 20 ข้อความต่อหนึ่ง API call
  const FETCH_TIMEOUT = 20000;

  let _memCache = {};
  try { _memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { _memCache = {}; }

  function _saveCache() {
    try {
      const keys = Object.keys(_memCache);
      if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach(k => delete _memCache[k]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(_memCache));
    } catch (e) { }
  }

  // เก็บบันทึกค่าเดิมสำหรับสลับกลับเป็นภาษาไทย
  let _snapshots = [];

  const THAI_RE = /[\u0E00-\u0E7F]/;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'IFRAME', 'TEXTAREA']);

  // ── แปล Real-time ด้วย Google Translate (เรียกตรงจาก Browser) ────
  // ไม่พึ่ง backend /api/translate — แปลทันทีที่ตรวจพบข้อความไทย
  async function _translateChunk(chunk) {
    const combinedText = chunk.join('\n');
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=en&dt=t&q=${encodeURIComponent(combinedText)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
      const translatedCombined = segments.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');
      const lines = translatedCombined.split('\n');
      if (lines.length === chunk.length) {
        chunk.forEach((s, j) => {
          const t = (lines[j] || '').trim();
          if (t && t !== s) _memCache[s] = t;
        });
        return true;
      }
      throw new Error('line mismatch');
    } catch (e) {
      for (const s of chunk) {
        try {
          const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=en&dt=t&q=${encodeURIComponent(s)}`;
          const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
          if (!r.ok) continue;
          const d = await r.json();
          const segs = Array.isArray(d) && Array.isArray(d[0]) ? d[0] : [];
          const t = segs.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('').trim();
          if (t && t !== s) _memCache[s] = t;
        } catch (e2) { /* ข้ามไป */ }
      }
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function _fetchTranslations(strings) {
    const toFetch = strings.filter(s => !(s in _memCache));
    if (!toFetch.length) return;

    for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
      const chunk = toFetch.slice(i, i + CHUNK_SIZE);
      try {
        await _translateChunk(chunk);
      } catch (e) {
        console.warn('[i18n] chunk failed:', e.message);
      }
    }
    _saveCache();
  }

  // ── ค้นหา Text Nodes และ Attributes ทั้งหมดที่ต้องแปล ──────────
  function _scanDOM() {
    const textNodes = [];
    const attrElements = [];
    const allThaiStrings = new Set();

    // 1. ตรวจสอบ Text Nodes ทั่วทั้งร่างกายของเว็บ (ครอบคลุม บาร์บน, เมนู, หน้าเว็บ, ฟุตเตอร์)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement && node.parentElement.closest('[data-i18n-skip]')) {
          return NodeFilter.FILTER_REJECT;
        }
        const val = node.nodeValue.trim();
        if (!val || !THAI_RE.test(val)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
      allThaiStrings.add(node.nodeValue.trim());
    }

    // 2. ตรวจสอบ Attributes (placeholder, title, aria-label) และ option ของ select
    document.querySelectorAll('[placeholder],[title],[aria-label], option').forEach(el => {
      if (el.closest('[data-i18n-skip]')) return;

      if (el.tagName === 'OPTION') {
        const val = el.textContent.trim();
        if (val && THAI_RE.test(val)) {
          attrElements.push({ el, type: 'option', original: el.textContent });
          allThaiStrings.add(val);
        }
      } else {
        ['placeholder', 'title', 'aria-label'].forEach(attr => {
          const val = el.getAttribute(attr);
          if (val && THAI_RE.test(val.trim())) {
            attrElements.push({ el, type: 'attr', attrName: attr, original: val });
            allThaiStrings.add(val.trim());
          }
        });
      }
    });

    return { textNodes, attrElements, allThaiStrings: [...allThaiStrings] };
  }

  // ── apply English ─────────────────────────────────────────────
  async function _applyEN() {
    const { textNodes, attrElements, allThaiStrings } = _scanDOM();
    if (allThaiStrings.length === 0) return;

    // ส่งชุดข้อความที่ยังไม่มีใน Cache ไปแปล
    await _fetchTranslations(allThaiStrings);

    // 1. เปลี่ยนภาษาของ Text Nodes ทั่วหน้า
    textNodes.forEach(node => {
      const orig = node.nodeValue;
      const key = orig.trim();
      if (_memCache[key]) {
        if (!_snapshots.find(s => s.node === node)) {
          _snapshots.push({ type: 'text', node, original: orig });
        }
        const translated = _memCache[key];
        const leadingSpace = orig.match(/^\s*/)[0];
        const trailingSpace = orig.match(/\s*$/)[0];
        node.nodeValue = leadingSpace + translated + trailingSpace;
      }
    });

    // 2. เปลี่ยนภาษาของ Attributes และ Options ในดรอปดาวน์
    attrElements.forEach(({ el, type, attrName, original }) => {
      const key = original.trim();
      if (_memCache[key]) {
        if (type === 'option') {
          if (!_snapshots.find(s => s.el === el && s.type === 'option')) {
            _snapshots.push({ type: 'option', el, original });
          }
          el.textContent = _memCache[key];
        } else {
          if (!_snapshots.find(s => s.el === el && s.type === 'attr' && s.attrName === attrName)) {
            _snapshots.push({ type: 'attr', el, attrName, original });
          }
          el.setAttribute(attrName, _memCache[key]);
        }
      }
    });

    document.documentElement.lang = 'en';
  }

  // ── apply Thai (revert) ────────────────────────────────────────
  function _applyTH() {
    _snapshots.forEach(snap => {
      if (snap.type === 'text') {
        snap.node.nodeValue = snap.original;
      } else if (snap.type === 'option') {
        snap.el.textContent = snap.original;
      } else if (snap.type === 'attr') {
        snap.el.setAttribute(snap.attrName, snap.original);
      }
    });
    _snapshots = [];
    document.documentElement.lang = 'th';
  }

  // ── MutationObserver: จับเนื้อหาใหม่ที่โหลดเพิ่มหรือสลับหน้า ─────
  const _observerOpts = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] };
  const _observer = new MutationObserver((mutations) => {
    if (_currentLang !== 'en' || _mutating || _isBusy) return;
    const relevant = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0
      || (m.type === 'attributes' && m.attributeName === 'class'));
    if (!relevant) return;
    clearTimeout(_mutationTimer);
    _mutationTimer = setTimeout(async () => {
      _mutating = true;
      _observer.disconnect();
      try { await _applyEN(); }
      catch (e) { console.warn('[i18n] mutation apply error:', e.message); }
      finally {
        _mutating = false;
        _observer.observe(document.body, _observerOpts);
      }
    }, 400);
  });

  // ── UI helpers ────────────────────────────────────────────────
  function _setButtons(lang, busy) {
    const th = document.getElementById('btn-lang-th');
    const en = document.getElementById('btn-lang-en');
    if (!th || !en) return;
    th.classList.toggle('active', lang === 'th');
    en.classList.toggle('active', lang === 'en');
    if (busy) {
      en.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:.8em;"></i> EN';
      en.disabled = true; th.disabled = true;
    } else {
      en.innerHTML = 'EN'; en.disabled = false; th.disabled = false;
    }
  }

  function _showToast(msg) {
    const old = document.getElementById('i18n-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'i18n-toast';
    t.setAttribute('data-i18n-skip', '');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:10px;font-size:.85rem;z-index:9999;font-family:Sarabun,sans-serif;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ── public API ────────────────────────────────────────────────
  window.switchLang = async function (lang) {
    if (_isBusy) return;
    if (lang === _currentLang) return;

    _isBusy = true;
    _setButtons(lang, lang === 'en');
    _observer.disconnect();

    try {
      if (lang === 'en') {
        document.body.classList.add('i18n-loading');
        try {
          await _applyEN();
        } catch (err) {
          console.error('[i18n] error:', err);
          _showToast('ไม่สามารถแปลภาษาได้ กรุณาลองใหม่');
        } finally {
          document.body.classList.remove('i18n-loading');
        }
      } else {
        _applyTH();
      }
      _currentLang = lang;
      localStorage.setItem('voc_lang', lang);
      _setButtons(lang, false);
    } finally {
      _isBusy = false;
      _observer.observe(document.body, _observerOpts);
    }
  };

  function _onReady() {
    _setButtons(_currentLang, false);
    _observer.observe(document.body, _observerOpts);
    if (_currentLang === 'en') {
      setTimeout(() => {
        _currentLang = 'th';
        window.switchLang('en');
      }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _onReady);
  } else {
    _onReady();
  }
})();
// ════ ACCESSIBILITY BAR — fixed position, push header down by bar height ════
(function () {
  function _updateBar() {
    const bar = document.getElementById('accessibility-bar');
    const header = document.querySelector('header');
    if (!bar || !header) return;

    // ใช้ getBoundingClientRect เพื่อความแม่นยำบน mobile (รองรับ wrap/no-wrap)
    const barH = bar.getBoundingClientRect().height;
    if (window.scrollY < 10) {
      bar.classList.remove('bar-hidden');
      header.style.top = barH + 'px';
    } else {
      bar.classList.add('bar-hidden');
      header.style.top = '0px';
    }
  }

  window.addEventListener('scroll', _updateBar, { passive: true });

  // รัน ทั้งตอน DOMContentLoaded และ load เพื่อความแน่ใจหลัง font/resource โหลด
  document.addEventListener('DOMContentLoaded', function () {
    requestAnimationFrame(_updateBar);
  });
  window.addEventListener('load', function () {
    requestAnimationFrame(_updateBar);
  });

  // รองรับ mobile orientation change และ resize (เช่น กาง/หุบ keyboard)
  window.addEventListener('resize', function () {
    requestAnimationFrame(_updateBar);
  }, { passive: true });
})();

// ════ SCROLL FAB — เลื่อนขึ้นบน/ลงล่าง (direction-aware + throttle 150ms) ════
(function () {
  const BOTTOM_THRESHOLD = 60; // px จากขอบล่าง ถือว่า "อยู่ล่างสุดแล้ว"
  const THROTTLE_MS = 150;

  let _lastScrollY = window.scrollY;
  let _rafPending = false;
  let _throttleTimer = null;

  // true = ชี้ขึ้น (จะพาไปบนสุด), false = ชี้ลง (จะพาไปล่างสุด)
  let _pointUp = false;

  function _isAtBottom() {
    return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - BOTTOM_THRESHOLD);
  }
  function _isAtTop() {
    return window.scrollY < 10;
  }

  function _applyFab(pointUp) {
    const fab = document.getElementById('scroll-fab');
    const icon = document.getElementById('scroll-fab-icon');
    if (!fab || !icon) return;

    _pointUp = pointUp;
    if (pointUp) {
      fab.classList.add('at-bottom');
      fab.title = 'เลื่อนขึ้นด้านบน';
      fab.setAttribute('aria-label', 'เลื่อนขึ้นด้านบน');
      icon.className = 'fas fa-chevron-down';
    } else {
      fab.classList.remove('at-bottom');
      fab.title = 'เลื่อนลงด้านล่าง';
      fab.setAttribute('aria-label', 'เลื่อนลงด้านล่าง');
      icon.className = 'fas fa-chevron-down';
    }
  }

  function _updateFab() {
    const currentY = window.scrollY;
    const scrolledDown = currentY > _lastScrollY; // scroll ลง = true

    // กรณีชัดเจน: ถึงล่างสุด หรือ กลับขึ้นบนสุด → override ทันที
    if (_isAtBottom()) {
      _applyFab(true);   // ชี้ขึ้น
    } else if (_isAtTop()) {
      _applyFab(false);  // ชี้ลง
    } else {
      // กลางหน้า — ดูทิศทาง scroll
      _applyFab(scrolledDown); // scroll ลง → ชี้ขึ้น (เบรกฉุกเฉิน), scroll ขึ้น → ชี้ลง
    }

    _lastScrollY = currentY;
    _rafPending = false;
  }

  function _onScroll() {
    // Throttle 150ms: ไม่ว่าจะสะบัดนิ้วรัวแค่ไหน จะ update แค่ครั้งเดียวใน 150ms
    if (_throttleTimer) return;
    _throttleTimer = setTimeout(function () {
      _throttleTimer = null;
      if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(_updateFab);
      }
    }, THROTTLE_MS);
  }

  window.toggleScrollFab = function () {
    if (_pointUp) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  window.addEventListener('scroll', _onScroll, { passive: true });
  window.addEventListener('load', _updateFab);
  document.addEventListener('DOMContentLoaded', _updateFab);
})();

// ════════════════════════════════════════════════════
//  PAGEVIEW COUNTER — โหลดสถิติและนับการเข้าชม
// ════════════════════════════════════════════════════
(function initPageViews() {
  // นับแค่ครั้งแรกที่เปิดหน้า (ไม่นับซ้ำเวลา navigate ระหว่าง SPA pages)
  const SESSION_KEY = 'voc_pv_counted';

  function _fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('th-TH');
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      });
    } catch { return '—'; }
  }

  function _render({ total, todayCount, updated }) {
    const el = (id) => document.getElementById(id);
    if (el('stat-total')) el('stat-total').textContent = _fmt(total);
    if (el('stat-today')) el('stat-today').textContent = _fmt(todayCount);
    if (el('stat-updated')) el('stat-updated').textContent = _fmtDate(updated);
  }

  async function _init() {
    const alreadyCounted = sessionStorage.getItem(SESSION_KEY);
    try {
      let data;
      if (alreadyCounted) {
        // เคยนับแล้วในเซสชันนี้ → GET อย่างเดียว
        const r = await fetch('/api/dashboard?action=pageviews');
        data = await r.json();
      } else {
        // นับครั้งแรก → POST
        const r = await fetch('/api/dashboard?action=pageviews', { method: 'POST' });
        data = await r.json();
        sessionStorage.setItem(SESSION_KEY, '1');
      }
      if (data && data.success !== false) _render(data);
    } catch (e) {
      console.warn('[pageviews] โหลดสถิติไม่สำเร็จ:', e.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
// ════════════════════════════════════════════════════════════════
//  GLOBAL KEYBOARD SUPPORT — สำหรับ custom modal/overlay ทั้งหมด
//  (showAlert/showConfirm มี handler ของตัวเองอยู่แล้วใน ui.js)
//  ครอบคลุม: editNews, editFaq, complaint-type, profile, news-detail
//
//  - Escape → ปิด overlay บนสุดที่เปิดอยู่ (เหมือนกดปุ่มยกเลิก/ปิด)
//  - Enter  → กดปุ่ม .voc-btn-ok ของ overlay บนสุด ถ้าโฟกัสไม่ได้อยู่ใน
//             textarea (เพื่อไม่ขัดจังหวะการพิมพ์ขึ้นบรรทัดใหม่)
// ════════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== 'Escape') return;

  const overlays = document.querySelectorAll('.voc-overlay');
  if (!overlays.length) return;
  const topOverlay = overlays[overlays.length - 1];

  // ui.js (showAlert/showConfirm) จัดการ keyboard ของตัวเองอยู่แล้ว — ข้าม
  if (topOverlay.dataset.vocManagedByUi === '1') return;

  if (e.key === 'Escape') {
    const cancelBtn = topOverlay.querySelector('.voc-btn-cancel, .modal-close');
    if (cancelBtn) cancelBtn.click();
    else if (document.body.contains(topOverlay)) document.body.removeChild(topOverlay);
    e.preventDefault();
    return;
  }

  if (e.key === 'Enter') {
    // ไม่ trigger ถ้ากำลังพิมพ์ใน textarea (ต้องขึ้นบรรทัดใหม่ได้ตามปกติ)
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
    const okBtn = topOverlay.querySelector('.voc-btn-ok');
    if (okBtn) { okBtn.click(); e.preventDefault(); }
  }
});