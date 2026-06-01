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
window.navigateTo      = (...a) => navigateTo(...a);
window.toggleMobileNav = (...a) => toggleMobileNav(...a);
window.closeMobileNav  = (...a) => closeMobileNav(...a);
window.onTurnstileSuccess = (token) => onTurnstileSuccess(token);
window.onTurnstileExpire  = ()      => onTurnstileExpire();
window.onTurnstileError   = ()      => onTurnstileError();
let currentUser     = null;
let currentStep     = 1;
let ratingSelection = 0;
let vocData         = { cType:'นักศึกษา', priority:'medium', category:'ข้อเสนอแนะหลักสูตร' };
let attachedFile    = null;
let currentReportType = 'service';
let currentSATab    = 'news';
let _newsCache      = [];
let _saNewsCache    = [];
let _turnstileToken = '';
let _turnstileReady = false;
let _guestPortalMode = false;

const SUBMIT_COOLDOWN_MS = 5 * 60 * 1000;
function isClientRateLimited() { try { return Date.now()-Number(localStorage.getItem('voc_last_submit')||0)<SUBMIT_COOLDOWN_MS; } catch(e){return false;} }
function markClientSubmit()    { try { localStorage.setItem('voc_last_submit',String(Date.now())); } catch(e){} }
function clientCooldownRemaining() { try { const rem=Math.ceil((SUBMIT_COOLDOWN_MS-(Date.now()-Number(localStorage.getItem('voc_last_submit')||0)))/60000); return rem>0?rem:0; } catch(e){return 0;} }

function skeletonHtml(type='list', count=3) {
  const lines = Array.from({ length: count }, () => '<div class="skeleton-card"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line--short"></div></div>').join('');
  if (type === 'stats') return '<div class="skeleton-grid skeleton-grid--stats">' + lines + '</div>';
  if (type === 'news') return '<div class="skeleton-grid skeleton-grid--news">' + lines + '</div>';
  return '<div class="skeleton-list">' + lines + '</div>';
}

// ════ TURNSTILE ════
function onTurnstileSuccess(token) { _turnstileToken=token; _turnstileReady=true; const btn=document.getElementById('btn-final'); const st=document.getElementById('turnstile-status'); if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-paper-plane"></i> ยืนยันการส่งเรื่องร้องเรียน';} if(st){st.className='turnstile-status-msg turnstile-ok';st.innerHTML='<i class="fas fa-check-circle"></i> ยืนยันตัวตนสำเร็จ';} }
function onTurnstileExpire()  { _turnstileToken=''; _turnstileReady=false; const btn=document.getElementById('btn-final'); if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-shield-alt"></i> กรุณายืนยันอีกครั้ง';} }
function onTurnstileError()   { _turnstileToken=''; _turnstileReady=false; const st=document.getElementById('turnstile-status'); if(st){st.className='turnstile-status-msg turnstile-err';st.innerHTML='<i class="fas fa-times-circle"></i> ไม่สามารถโหลด CAPTCHA ได้';} }
function resetTurnstile() { _turnstileToken=''; _turnstileReady=false; const btn=document.getElementById('btn-final'); if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-shield-alt"></i> ยืนยันการส่งเรื่อง (รอการยืนยัน)';} try{if(window.turnstile)window.turnstile.reset('#cf-turnstile-widget');}catch(e){} }

// ════ DROPDOWN ════
function toggleDropdown(id) { const menu=document.getElementById(id); if(!menu)return; const isOpen=menu.classList.contains('open'); document.querySelectorAll('.voc-dropdown-menu.open').forEach(m=>m.classList.remove('open')); document.querySelectorAll('.voc-dropdown-arrow.rotated').forEach(a=>a.classList.remove('rotated')); if(!isOpen){menu.classList.add('open');const wrap=menu.closest('.voc-dropdown-wrap');if(wrap){const arrow=wrap.querySelector('.voc-dropdown-arrow');if(arrow)arrow.classList.add('rotated');}} }
function selectReportType(type,label,iconCls,btn) { document.querySelectorAll('#report-type-dropdown .voc-dropdown-item').forEach(b=>b.classList.remove('active')); if(btn)btn.classList.add('active'); const lbl=document.getElementById('report-type-label'); const ico=document.getElementById('report-type-icon'); if(lbl)lbl.textContent=label; if(ico)ico.className=iconCls; document.getElementById('report-type-dropdown')?.classList.remove('open'); loadReport(type); }
function selectTicketFilter(filter,label,btn) { document.querySelectorAll('#ticket-filter-dropdown .voc-dropdown-item').forEach(b=>b.classList.remove('active')); if(btn)btn.classList.add('active'); const lbl=document.getElementById('ticket-filter-label'); if(lbl)lbl.textContent=label; document.getElementById('ticket-filter-dropdown')?.classList.remove('open'); loadAdminTickets(filter); setFilter(filter==='pending'?'pending':filter==='all'?'all':filter==='เสร็จสิ้น'?'done':filter==='ปฏิเสธ'?'rejected':'inprogress'); }

// ════ AUTH ════
function showAdminLoginModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function hideAdminLoginModal() { document.getElementById('admin-modal').classList.add('hidden'); }

async function doLogin() {
  const u=document.getElementById('login-user').value.trim(), p=document.getElementById('login-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');return;}
  const btn=document.getElementById('btn-login'); btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';
  try { const res=await api.post('/api/auth',{action:'loginUser',username:u,password:p}); if(res.success){currentUser=res;saveSession(res);updateMenuForUser();const after=sessionStorage.getItem('voc_after_login');if(after){sessionStorage.removeItem('voc_after_login');navigateTo(after);}else navigateTo('home');} else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message); }
  catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยัน';}
}

async function doAdminLogin() {
  const u=document.getElementById('admin-user').value.trim(), p=document.getElementById('admin-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}
  const btn=document.getElementById('btn-admin-login'); btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังตรวจสอบ...';
  try { const res=await api.post('/api/auth',{action:'loginAdmin',username:u,password:p}); if(res.success){currentUser=res;saveSession(res);hideAdminLoginModal();if(res.role==='superadmin'){updateMenuForSuperAdmin();navigateTo('superadmin');}else{updateMenuForAdmin();navigateTo('admin-dashboard');}} else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message); }
  catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='เข้าสู่ระบบ';}
}

async function doRegister() {
  if(!validateRegister())return;
  const btn=document.getElementById('btn-register'); btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังลงทะเบียน...';
  try { const res=await api.post('/api/auth',{action:'register',firstname:document.getElementById('reg-firstname').value.trim(),lastname:document.getElementById('reg-lastname').value.trim(),email:document.getElementById('reg-email').value.trim(),lineId:document.getElementById('reg-line').value.trim(),phone:document.getElementById('reg-phone').value.trim(),username:document.getElementById('reg-username').value.trim(),password:document.getElementById('reg-pass').value}); if(res.success){await showAlert('✅','ลงทะเบียนสำเร็จ','กรุณาเข้าสู่ระบบเพื่อใช้งาน');navigateTo('login');}else await showAlert('❌','ไม่สำเร็จ',res.message); }
  catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยันการลงทะเบียน';}
}

async function doLogout() {
  if(!await showConfirm('🚪','ออกจากระบบ','ต้องการออกจากระบบใช่หรือไม่?'))return;
  currentUser=null; clearSession();
  _clearAdminPageContent(); // ล้าง admin content ออกจาก DOM เมื่อ logout
  _resetMenuToGuest();
  navigateTo('home');
}

// ════ MENU ════
function updateMenuForUser() {
  document.getElementById('main-nav').innerHTML=`<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a><a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a><a onclick="navigateTo('faq')" id="nav-faq">คำถามที่พบบ่อย</a>`;
  document.getElementById('right-menu').innerHTML=`<span class="user-badge header-auth-desktop" onclick="showProfile()" title="โปรไฟล์"><i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="showProfile()" aria-label="โปรไฟล์" title="โปรไฟล์"><i class="fas fa-user-circle"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}
function updateMenuForAdmin() {
  _initAdminPageContent('admin');
  document.getElementById('main-nav').innerHTML=`<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a><a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a><a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a><a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a><a onclick="navigateTo('faq')" id="nav-faq">FAQ</a>`;
  document.getElementById('right-menu').innerHTML=`<span class="user-badge header-auth-desktop"><i class="fas fa-shield-alt"></i>${currentUser.fullname||'Admin'}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ (Admin)"><i class="fas fa-shield-alt"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}
function updateMenuForSuperAdmin() {
  _initAdminPageContent('superadmin');
  document.getElementById('main-nav').innerHTML=`<a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a><a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a><a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a><a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a><a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a><a onclick="navigateTo('superadmin')" id="nav-superadmin">⚙️ ระบบ</a>`;
  document.getElementById('right-menu').innerHTML=`<span class="user-badge superadmin-badge header-auth-desktop"><i class="fas fa-crown" style="color:#f0a500;"></i>${currentUser.fullname||'SuperAdmin'}</span><a onclick="doLogout()" class="header-auth-desktop" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a><button class="header-auth-mobile header-auth-mobile--logged" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ (SuperAdmin)"><i class="fas fa-crown" style="color:#f0a500;"></i></button><button class="header-auth-mobile header-auth-mobile--logout" onclick="doLogout()" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></button>`;
}

// ════ ROLE-BASED DOM INJECTION ════
// inject skeleton HTML เข้า admin pages เฉพาะเมื่อ login เป็น admin/superadmin
// เมื่อ logout → ลบ innerHTML ทิ้งเพื่อป้องกัน user เห็น
function _initAdminPageContent(role) {
  // dash-content
  const dc = document.getElementById('dash-content');
  if (dc && !dc.innerHTML.trim()) dc.innerHTML = skeletonHtml('stats', 4);

  // admin-ticket-list
  const tl = document.getElementById('admin-ticket-list');
  if (tl && !tl.innerHTML.trim()) tl.innerHTML = skeletonHtml('list', 3);

  // review-content
  const rc = document.getElementById('review-content');
  if (rc && !rc.innerHTML.trim()) rc.innerHTML = skeletonHtml('list', 3);

  // report-content
  const rpc = document.getElementById('report-content');
  if (rpc && !rpc.innerHTML.trim()) rpc.innerHTML = skeletonHtml('list', 3);

  // superadmin-content — เฉพาะ superadmin เท่านั้น
  if (role === 'superadmin') {
    const sc = document.getElementById('superadmin-content');
    if (sc && !sc.innerHTML.trim()) sc.innerHTML = skeletonHtml('list', 3);
  }
}

function _clearAdminPageContent() {
  // ล้าง content ทั้งหมดออกจาก DOM เมื่อ logout
  // เพื่อป้องกัน user เห็น admin data หลัง logout
  ['dash-content','admin-ticket-list','review-content',
   'report-content','superadmin-content','user-report-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}



// ════ COMPLAINT TYPE MODAL ════
function showComplaintTypeModal(callback) {
  const o=document.createElement('div'); o.className='voc-overlay'; o.id='complaint-type-overlay';
  o.innerHTML=`<div class="voc-modal-box complaint-type-modal" style="max-width:520px;"><div style="text-align:center;margin-bottom:6px;"><span style="font-size:2.2rem;">📣</span></div><div class="voc-modal-title">เลือกประเภทการร้องเรียน</div><div class="complaint-type-cards"><div class="complaint-type-card" id="ctype-oneway"><div class="ctype-icon">📩</div><div class="ctype-title">ร้องเรียนทางเดียว</div><div class="ctype-desc"><strong>ไม่ต้องเข้าสู่ระบบ</strong><br><span class="ctype-warn">⚠️ ไม่สามารถติดตามสถานะได้</span></div><div class="ctype-badge ctype-badge-guest">ไม่ต้อง Login</div></div><div class="complaint-type-card" id="ctype-track"><div class="ctype-icon">🔍</div><div class="ctype-title">ร้องเรียนแบบติดตามผล</div><div class="ctype-desc">ต้องเข้าสู่ระบบก่อน<br><span class="ctype-good">✅ ติดตามสถานะและรับแจ้งเตือนได้</span></div><div class="ctype-badge ctype-badge-user">ต้อง Login</div></div></div><div id="ctype-confirm-area" style="display:none;margin-top:18px;"><div class="ctype-confirm-msg" id="ctype-confirm-msg"></div><div class="voc-modal-btns" style="margin-top:12px;"><button class="voc-btn-cancel" onclick="resetComplaintTypeSelection()">เปลี่ยนใจ</button><button class="voc-btn-ok" id="ctype-confirm-btn">ยืนยัน</button></div></div><div style="margin-top:14px;text-align:center;"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('complaint-type-overlay'))" style="font-size:.82rem;padding:7px 18px;">ยกเลิก</button></div></div>`;
  document.body.appendChild(o);
  function selectType(type) {
    document.getElementById('ctype-oneway').classList.toggle('selected',type==='oneway');
    document.getElementById('ctype-track').classList.toggle('selected',type==='track');
    const area=document.getElementById('ctype-confirm-area'); const msg=document.getElementById('ctype-confirm-msg'); const btn=document.getElementById('ctype-confirm-btn');
    if(type==='oneway'){msg.innerHTML=`<div class="ctype-confirm-warn">⚠️ <strong>จะไม่สามารถติดตามสถานะได้</strong></div>`;btn.textContent='ยืนยัน — แจ้งเรื่องโดยไม่ Login';btn.onclick=()=>{document.body.removeChild(o);callback('oneway');};}
    else{msg.innerHTML=`<div class="ctype-confirm-ok">✅ <strong>จะถูกนำไปยังหน้าเข้าสู่ระบบก่อน</strong></div>`;btn.textContent='ยืนยัน — ไปเข้าสู่ระบบ';btn.onclick=()=>{document.body.removeChild(o);callback('track');};}
    area.style.display='block';
  }
  window.resetComplaintTypeSelection=function(){document.getElementById('ctype-oneway').classList.remove('selected');document.getElementById('ctype-track').classList.remove('selected');document.getElementById('ctype-confirm-area').style.display='none';};
  document.getElementById('ctype-oneway').addEventListener('click',()=>selectType('oneway'));
  document.getElementById('ctype-track').addEventListener('click',()=>selectType('track'));
}

// ════ PORTAL VIEW ════
function setupPortalView() {
  const oldBanner=document.getElementById('guest-mode-banner'); if(oldBanner)oldBanner.remove();
  const w=document.getElementById('portal-login-warning'); const f=document.getElementById('portal-form-content');
  if(_guestPortalMode&&!currentUser){setupGuestPortalView();return;}
  _guestPortalMode=false;
  if(currentUser&&currentUser.role==='user'){
    w.classList.add('hidden');
    f.classList.remove('hidden');
    setIdentityPanelMode('user');
    updatePortalStepValidation();
  }
  else if(currentUser&&(currentUser.role==='admin'||currentUser.role==='superadmin')){w.classList.remove('hidden');w.innerHTML='<i class="fas fa-info-circle"></i><span>ผู้ดูแลระบบไม่สามารถแจ้งเรื่องได้</span>';f.classList.add('hidden');}
  else{w.classList.remove('hidden');f.classList.add('hidden');}
}
function setupGuestPortalView() {
  _guestPortalMode=true;
  const w=document.getElementById('portal-login-warning'); const f=document.getElementById('portal-form-content');
  if(w)w.classList.add('hidden');
  if(f){f.classList.remove('hidden');if(!document.getElementById('guest-mode-banner')){const b=document.createElement('div');b.id='guest-mode-banner';b.className='guest-banner';b.innerHTML=`<div class="guest-banner-inner"><i class="fas fa-user-circle" style="font-size:1.4rem;color:#2d6a4f;"></i><div class="guest-banner-text"><div class="guest-banner-title">คุณยังไม่ได้เข้าสู่ระบบ</div><div class="guest-banner-sub"><strong>จะไม่สามารถติดตามสถานะ</strong>ได้</div></div><div class="guest-banner-btns"><button class="guest-btn-login" onclick="navigateTo('login')"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ</button><button class="guest-btn-cont" onclick="dismissGuestBanner()"><i class="fas fa-bullhorn"></i> แจ้งเรื่องโดยไม่ login</button></div></div>`;f.insertBefore(b,f.firstChild);}}
  updatePortalStepValidation();
}
function dismissGuestBanner() { const b=document.getElementById('guest-mode-banner'); if(b)b.style.display='none'; document.querySelector('.step-progress')?.classList.remove('hidden'); document.getElementById('step-content-1')?.classList.remove('hidden'); }

// ════ PROFILE ════
async function showProfile() {
  if(!currentUser)return;
  try {
    const res=await api.get(`/api/profile?username=${encodeURIComponent(currentUser.username)}`);
    const p=res.success?res.profile:currentUser; const ini=(p.firstname||'?')[0].toUpperCase();
    const o=document.createElement('div'); o.className='voc-overlay'; o.id='profile-overlay';
    o.innerHTML=`<div class="voc-modal-box" style="max-width:500px;"><div class="profile-avatar">${ini}</div><div class="voc-modal-title">${p.firstname||''} ${p.lastname||''}</div><div style="text-align:center;margin-bottom:16px;"><span style="background:#e8f5e9;color:#2d6a4f;padding:3px 14px;border-radius:20px;font-size:.8rem;font-weight:700;">@${p.username||''}</span></div><div style="border:1.5px solid #e0f0e8;border-radius:10px;padding:14px 16px;margin-bottom:18px;"><div style="display:flex;flex-direction:column;gap:10px;"><div><div class="label" style="margin-bottom:4px;">📧 อีเมล</div><input class="profile-edit-field" id="pe-email" value="${p.email||''}" placeholder="email@example.com"></div><div><div class="label" style="margin-bottom:4px;">📱 เบอร์โทรศัพท์</div><input class="profile-edit-field" id="pe-phone" value="${p.phone||''}" placeholder="0xxxxxxxxx" maxlength="10"></div><div><div class="label" style="margin-bottom:4px;">💬 Line ID</div><input class="profile-edit-field" id="pe-line" value="${p.lineId||''}" placeholder="Line ID"></div></div></div><div style="text-align:center;margin-bottom:14px;"><button onclick="showUserReport('${p.username||''}')" style="width:100%;padding:10px;background:#f0faf5;border:1.5px solid var(--dgreen);border-radius:10px;color:var(--dgreen);font-family:'Sarabun',sans-serif;font-size:.92rem;font-weight:700;cursor:pointer;"><i class="fas fa-chart-pie"></i> ดูรายงานสรุปการใช้บริการของฉัน</button></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('profile-overlay'))">ปิด</button><button class="voc-btn-ok" onclick="saveProfile('${p.username||''}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`;
    document.body.appendChild(o);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}
async function saveProfile(username) {
  const email=document.getElementById('pe-email').value.trim(); const phone=document.getElementById('pe-phone').value.trim(); const lineId=document.getElementById('pe-line').value.trim();
  try { const res=await api.patch('/api/profile',{username,email,phone,lineId}); if(res.success){await showAlert('✅','บันทึกสำเร็จ','อัปเดตข้อมูลเรียบร้อยแล้ว');const o=document.getElementById('profile-overlay');if(o)document.body.removeChild(o);}else await showAlert('❌','ไม่สำเร็จ',res.message); }
  catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ════ VOC FORM ════
function setIdentityPanelMode(mode) {
  const panel=document.getElementById('identity-panel');
  const anon=document.getElementById('isAnon');
  const nf=document.getElementById('v-name');
  const sf=document.getElementById('v-sid');
  if (mode === 'user') {
    if(panel)panel.classList.add('hidden');
    if(anon)anon.checked=false;
    if(nf)nf.value=((currentUser?.firstname||'')+' '+(currentUser?.lastname||'')).trim();
    if(sf)sf.value=currentUser?.studentId||currentUser?.username||'';
    return;
  }
  if(panel)panel.classList.remove('hidden');
  if(nf && !nf.value && currentUser?.firstname) nf.value=((currentUser.firstname||'')+' '+(currentUser.lastname||'')).trim();
  toggleAnon();
}
function getSubmitIdentity() {
  const loggedInUser = currentUser && currentUser.role === 'user';
  const isAnon = loggedInUser ? false : !!document.getElementById('isAnon')?.checked;
  const accountName = ((currentUser?.firstname||'')+' '+(currentUser?.lastname||'')).trim();
  return {
    isAnon,
    name: isAnon ? 'ไม่ระบุตัวตน' : (loggedInUser ? accountName : (document.getElementById('v-name')?.value||'-')),
    studentId: isAnon ? '-' : (loggedInUser ? (currentUser?.studentId||currentUser?.username||'') : (document.getElementById('v-sid')?.value||'-')),
  };
}
function isStepValid(step) {
  if (step === 1) {
    if (currentUser && currentUser.role === 'user') return !!vocData.cType;
    if (document.getElementById('isAnon')?.checked) return !!vocData.cType;
    return !!vocData.cType && !!document.getElementById('v-name')?.value.trim();
  }
  if (step === 2) return !!vocData.category && !!vocData.priority;
  if (step === 3) return !!document.getElementById('v-subject')?.value.trim() && !!document.getElementById('v-detail')?.value.trim();
  return true;
}
function updatePortalStepValidation() {
  const buttons = [
    ['btn-step-1-next', 1],
    ['btn-step-2-next', 2],
    ['btn-step-3-next', 3],
  ];
  buttons.forEach(([id, step]) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !isStepValid(step);
  });
}
function changeStep(step) {
  if (step > currentStep && !isStepValid(currentStep)) { updatePortalStepValidation(); return; }
  currentStep=step;
  for(let i=1;i<=4;i++){
    const content=document.getElementById('step-content-'+i);
    const node=document.getElementById('node'+i);
    content?.classList.add('hidden');
    node?.classList.remove('active','done');
    if(node && i<step) node.classList.add('done');
    if(node && i===step) node.classList.add('active');
  }
  document.getElementById('success-area')?.classList.add('hidden');
  document.getElementById('step-content-'+step)?.classList.remove('hidden');
  updatePortalStepValidation();
  if(step!==4)resetTurnstile();
}
function setOption(el,key,val) { el.parentElement.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected')); el.classList.add('selected'); vocData[key]=val; updatePortalStepValidation(); }
function toggleAnon() {
  const isAnon=!!document.getElementById('isAnon')?.checked;
  const fields=document.getElementById('identity-fields');
  if(fields)fields.style.opacity=isAnon?'0.3':'1';
  ['v-name','v-sid'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=isAnon;});
  updatePortalStepValidation();
}
function handleFileSelect(inputEl) {
  // Legacy: ไม่ใช้แล้ว — ใช้ link input แทน
}
function prepareReview() {
  if (!isStepValid(3)) { updatePortalStepValidation(); return; }
  const subject=document.getElementById('v-subject')?.value.trim(); const detail=document.getElementById('v-detail')?.value.trim(); const note=document.getElementById('v-note')?.value.trim()||'';
  if(!subject){showAlert('⚠️','กรุณากรอกหัวข้อ','');return;} if(!detail){showAlert('⚠️','กรุณากรอกรายละเอียด','');return;}
  const identity=getSubmitIdentity(); const name=identity.name; const sid=identity.studentId;
  const pMap={high:{label:'🔴 เร่งด่วน',sub:'ภายใน 24 ชม.',cls:'high'},medium:{label:'🟡 ปานกลาง',sub:'ภายใน 3 วัน',cls:'medium'},low:{label:'🟢 ทั่วไป',sub:'ภายใน 7 วัน',cls:'low'}};
  const pInfo=pMap[vocData.priority]||pMap.medium; const detailHtml=detail.replace(/\n/g,'<br>');
  const _rl=document.getElementById('v-file-link')?.value.trim()||'';
  const _fileLinkHtml=_rl&&_rl.startsWith('http')?`<div class="review-section"><div class="review-section-title">📎 ลิงก์ไฟล์แนบ</div><div style="padding:10px 14px;background:#f5f5f5;border-radius:8px;"><a href="${_rl}" target="_blank" style="color:#2d6a4f;word-break:break-all;font-size:.87rem;"><i class="fas fa-external-link-alt"></i> ${_rl}</a></div></div>`:'';
  document.getElementById('review-area').innerHTML=`<div class="review-card"><div class="review-card-header"><h3>📋 ตรวจสอบข้อมูลก่อนส่ง</h3></div><div class="review-section"><div class="review-section-title">👤 ข้อมูลผู้แจ้ง</div><div class="review-row"><span class="ri">🏷️</span><span class="rl">ประเภท</span><span class="rv">${vocData.cType}</span></div><div class="review-row"><span class="ri">🪪</span><span class="rl">ชื่อ-นามสกุล</span><span class="rv">${name}</span></div><div class="review-row"><span class="ri">🎓</span><span class="rl">รหัส/หน่วยงาน</span><span class="rv">${sid}</span></div></div><div class="review-section"><div class="review-section-title">📂 รายละเอียดเรื่อง</div><div class="review-row"><span class="ri">📌</span><span class="rl">ประเภทเรื่อง</span><span class="rv">${vocData.category}</span></div><div class="review-row"><span class="ri">⚡</span><span class="rl">ความเร่งด่วน</span><span class="rv"><span class="priority-pill ${pInfo.cls}">${pInfo.label}</span><small style="color:#999;margin-left:6px;">${pInfo.sub}</small></span></div><div class="review-row"><span class="ri">📝</span><span class="rl">หัวข้อ</span><span class="rv" style="font-weight:700;">${subject}</span></div></div><div class="review-section"><div class="review-section-title">📄 รายละเอียด</div><div style="background:#f8faf9;border-radius:10px;padding:14px;font-size:.9rem;color:#444;line-height:1.75;border-left:3px solid var(--dgreen);">${detailHtml}</div></div>${note?`<div class="review-section"><div class="review-section-title">📝 หมายเหตุ</div><div style="background:#fffbf0;border-radius:10px;padding:12px 14px;font-size:.88rem;color:#555;border-left:3px solid #f77f00;">${note}</div></div>`:''}${_fileLinkHtml}<div style="background:#e8f5e9;border-radius:10px;padding:12px 16px;margin:16px 24px;font-size:.82rem;color:#2d6a4f;"><i class="fas fa-info-circle"></i> ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้</div></div>`;
  changeStep(4);
}

async function finalSubmit() {
  if(!currentUser&&isClientRateLimited()){await showAlert('⏱️','กรุณารอสักครู่',`กรุณารออีก ${clientCooldownRemaining()} นาที`);return;}
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
    await showAlert('🛡️','กรุณายืนยันตัวตน','กรุณายืนยัน CAPTCHA ก่อนส่งเรื่อง');
    return;
  }
  if(!await showConfirm('📋','ยืนยันการส่งเรื่อง','ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้'))return;
  const btn=document.getElementById('btn-final'); btn.disabled=true;
  let submitted=false; // ← flag: ถ้า true แล้ว finally จะไม่ re-enable ปุ่ม
  try {
    // ใช้ link ที่ user กรอกโดยตรง แทนการ upload
    const _linkInput = document.getElementById('v-file-link');
    let fileUrl = (_linkInput && _linkInput.value.trim().startsWith('http'))
      ? _linkInput.value.trim()
      : '';
    btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...';
    const identity=getSubmitIdentity();
    const res=await api.post('/api/submit',{customerType:vocData.cType,isAnon:identity.isAnon,name:identity.name,studentId:identity.studentId,categories:[vocData.category],priority:vocData.priority,subject:document.getElementById('v-subject').value,detail:document.getElementById('v-detail').value,userNote:document.getElementById('v-note')?.value.trim()||'',fileUrl,username:currentUser?currentUser.username:'guest',turnstileToken:_turnstileToken||'bypass-no-widget'});
    if(res.success){
      submitted=true; // ← mark ว่าส่งสำเร็จแล้ว finally จะไม่แตะปุ่ม
      markClientSubmit(); resetTurnstile(); attachedFile=null;
      document.getElementById('step-content-4')?.classList.add('hidden');
      document.getElementById('success-area')?.classList.remove('hidden');
      document.getElementById('new-ticket-id').innerText=res.ticketId;
    } else {
      await showAlert('❌','ส่งไม่สำเร็จ',res.error||res.message||'เกิดข้อผิดพลาด');
    }
  } catch(e) {
    await showAlert('❌','เกิดข้อผิดพลาด',e.message);
  } finally {
    // re-enable ปุ่มเฉพาะกรณีที่ยังไม่สำเร็จ (error/cancel)
    // ถ้า submitted=true → ปุ่มอยู่ใน step-4 ที่ซ่อนแล้ว ไม่ต้อง restore
    if(!submitted){
      btn.innerHTML='<i class="fas fa-paper-plane"></i> ยืนยันการส่งเรื่อง (รอการยืนยัน)';
      btn.disabled=true; // ← disable ไว้เพราะ Turnstile ถูก reset แล้ว ต้องยืนยันใหม่
    }
  }
}

// ════ PROGRESS BAR ════
function buildProgressBar(status) {
  const steps=['ส่งคำร้อง','ตรวจสอบข้อมูล','มอบหมายผู้ดูแล','ดำเนินการ','เสร็จสิ้น'];
  const statusMap={'รอดำเนินการ':1,'กำลังดำเนินการ':2,'รอตรวจสอบ':3,'เสร็จสิ้น':4,'ปฏิเสธ':-1};
  if(status==='ปฏิเสธ')return`<div style="margin-top:12px;padding:10px 14px;background:#fde8e8;border-radius:10px;color:#d00000;font-size:.82rem;font-weight:700;text-align:center;">❌ ไม่รับดำเนินการ / ปฏิเสธคำร้อง</div>`;
  const cur=statusMap[status]??0; const pct=cur<=0?0:Math.round((cur/(steps.length-1))*100);
  const stepsHtml=steps.map((label,i)=>{const isDone=i<cur,isActive=i===cur;const cls=isDone?'done':isActive?'active':'';return`<div class="prog-step"><div class="prog-dot ${cls}">${isDone?'✓':i+1}</div><div class="prog-label ${cls}">${label}</div></div>`;}).join('');
  return`<div class="ticket-progress"><div class="progress-steps"><div class="progress-fill-bar" style="width:${pct}%"></div>${stepsHtml}</div></div>`;
}

// ════ NEWS ════
async function loadNewsStrip() {
  const container=document.getElementById('news-strip-section'); if(!container)return;
  container.classList.remove('hidden');
  container.innerHTML=skeletonHtml('news',3);
  try {
    const res=await api.get('/api/news');
    if(res.success&&res.news&&res.news.length>0){
      _newsCache=res.news; container.classList.remove('hidden');
      const tagClass={ทั่วไป:'news-tag-default',ด่วน:'news-tag-urgent',ข้อมูล:'news-tag-info',กิจกรรม:'news-tag-event'};
      let itemsHtml='';
      res.news.forEach((n,idx)=>{const tc=tagClass[n.tag]||'news-tag-default';const short=n.content.length>120?n.content.substring(0,120)+'...':n.content;const imgHtml=n.imageUrl?`<div style="height:120px;overflow:hidden;border-radius:8px;margin-bottom:10px;"><img src="${n.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"></div>`:'';const viewImgBtn=n.imageUrl?`<button class="news-view-img-btn" onclick="event.stopPropagation();showNewsImage('${n.imageUrl.replace(/'/g,'&#39;')}','${(n.title||'').replace(/'/g,'&#39;')}')" title="ดูรูปภาพ"><i class="fas fa-image"></i> ดูรูป</button>`:'';
      itemsHtml+=`<div class="news-strip-item" onclick="showNewsDetail(${idx})">${imgHtml}<div class="news-strip-item-meta"><span class="news-tag-pill ${tc}">${n.tag||'ทั่วไป'}</span><span class="news-date" style="font-size:.73rem;color:#bbb;"><i class="fas fa-clock"></i> ${n.date||''}</span>${viewImgBtn}</div><div class="news-strip-item-title">${n.title}</div><div class="news-strip-item-content">${short}</div></div>`;});
      let dotsHtml=''; if(res.news.length>1)res.news.forEach((_,i)=>{dotsHtml+=`<button class="news-strip-dot${i===0?' active':''}" data-idx="${i}" onclick="newsScrollTo(${i})"></button>`;});
      container.innerHTML=`<div class="news-section-wrap"><div class="news-section-header"><i class="fas fa-newspaper"></i> ข่าวสารและประกาศ<span style="margin-left:auto;font-size:.78rem;color:#aaa;font-weight:400;">${res.news.length} รายการ</span></div><div class="news-strip-scroll-wrap" id="news-scroll-wrap"><div class="news-strip-inner" id="news-strip-inner">${itemsHtml}</div></div>${dotsHtml?`<div class="news-strip-dots">${dotsHtml}</div>`:''}</div>`;
    }else { container.innerHTML=''; container.classList.add('hidden'); }
  }catch(e){container.classList.add('hidden');}
}
window.newsScrollTo=function(idx){const wrap=document.getElementById('news-scroll-wrap');const items=document.querySelectorAll('.news-strip-item');if(!wrap||!items[idx])return;wrap.scrollTo({left:idx*(items[0].offsetWidth+14),behavior:'smooth'});};
window.showNewsDetail=function(idx){const n=_newsCache[idx];if(!n)return;const existing=document.getElementById('news-detail-overlay');if(existing)document.body.removeChild(existing);const overlay=document.createElement('div');overlay.className='voc-overlay';overlay.id='news-detail-overlay';const imgBlock=n.imageUrl?`<div style="text-align:center;margin-bottom:18px;"><img src="${n.imageUrl}" alt="" style="max-width:100%;max-height:280px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'"></div>`:'';const contentHtml=(n.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');overlay.innerHTML=`<div class="voc-modal-box" style="max-width:680px;max-height:85vh;overflow-y:auto;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;"><div><span class="news-tag">${n.tag||'ทั่วไป'}</span><div style="font-size:.8rem;color:#aaa;margin-top:6px;"><i class="fas fa-clock"></i> ${n.date||''}</div></div><button onclick="document.body.removeChild(document.getElementById('news-detail-overlay'))" style="background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;">✕</button></div>${imgBlock}<h3 style="font-size:1.15rem;color:var(--dgreen);margin-bottom:14px;">${n.title}</h3><div style="font-size:.93rem;color:#444;line-height:1.85;">${contentHtml}</div></div>`;overlay.addEventListener('click',e=>{if(e.target===overlay)document.body.removeChild(overlay);});document.body.appendChild(overlay);};

window.showNewsImage=function(imgUrl,title){
  const existing=document.getElementById('news-img-overlay');if(existing)document.body.removeChild(existing);
  const o=document.createElement('div');o.className='voc-overlay';o.id='news-img-overlay';
  o.innerHTML=`<div class="voc-modal-box" style="max-width:800px;padding:16px;text-align:center;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span style="font-size:.9rem;color:#555;font-weight:600;">${title}</span>
      <button onclick="document.body.removeChild(document.getElementById('news-img-overlay'))" style="background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;">✕</button>
    </div>
    <img src="${imgUrl}" alt="${title}" style="max-width:100%;max-height:75vh;border-radius:10px;object-fit:contain;" onerror="this.parentElement.innerHTML+='<p style=\'color:#d00;margin-top:12px;\'>โหลดรูปไม่ได้</p>'">
    <div style="margin-top:12px;">
      <a href="${imgUrl}" target="_blank" style="font-size:.82rem;color:#2d6a4f;"><i class="fas fa-external-link-alt"></i> เปิดในแท็บใหม่</a>
    </div>
  </div>`;
  o.addEventListener('click',e=>{if(e.target===o)document.body.removeChild(o);});
  document.body.appendChild(o);
};

// ════ PINNED TICKETS ════
async function loadPinnedTickets() {
  const container=document.getElementById('pinned-tickets-section'); if(!container)return;
  container.classList.remove('hidden');
  container.innerHTML=skeletonHtml('list',2);
  try {
    const res=await api.get('/api/tickets?action=pinned');
    if(res.success&&res.tickets&&res.tickets.length>0){
      container.classList.remove('hidden');
      const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject','รอตรวจสอบ':'status-review'};
      const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
      const pChip={'high':'red','medium':'orange','low':'green'};
      let html=`<div class="section-title" style="margin-bottom:14px;"><h2 style="font-size:1.05rem;"><i class="fas fa-thumbtack" style="color:var(--dgreen);"></i> ประกาศ / ติดตามสถานะ</h2></div>`;
      res.tickets.forEach(t=>{
        const comments=t['Comments']||''; const commentEntries=comments?comments.split('\n---\n').filter(c=>c.trim()):[];
        const lastEntry=commentEntries.length?commentEntries[commentEntries.length-1]:'';
        const commentText=lastEntry?lastEntry.replace(/^\[.*?\]\s*.*?:\s*/,'').trim():'';
        const commentMeta=lastEntry?(lastEntry.match(/^\[(.*?)\]/)||['',''])[1]:'';
        const priority=t['ความเร่งด่วน']||'medium'; const detailText=t['รายละเอียด']||'';
        const detailShort=detailText.length>200?detailText.substring(0,200)+'...':detailText;
        html+=`<div class="pinned-card"><div class="pinned-card-header"><div><div class="pinned-card-title">${t['หัวข้อ']||'-'}</div><div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">${t['ประเภทเรื่อง']?`<span class="chip blue" style="font-size:.73rem;"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>`:''}${priority?`<span class="chip ${pChip[priority]||'gray'}" style="font-size:.73rem;">${pLabel[priority]||priority}</span>`:''}</div></div><span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']||'-'}</span></div>${detailText?`<div class="pinned-detail-box"><div class="pinned-detail-label"><i class="fas fa-align-left"></i> รายละเอียด</div><div class="pinned-detail-text" id="pin-detail-${t['Ticket ID']}">${detailShort.replace(/\n/g,'<br>')}</div>${detailText.length>200?`<button class="btn-expand" onclick="expandPinDetail('${t['Ticket ID']}',this)">ดูเพิ่มเติม ▼</button>`:''}</div>`:''}<div class="pinned-card-body">${buildProgressBar(t['สถานะ'])}</div><div class="pinned-card-footer"><span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||''}</span><span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span><span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span></div>${commentText?`<div class="pinned-comment-box"><div class="pinned-comment-meta"><i class="fas fa-comment-dots"></i> ความคิดเห็นล่าสุด${commentMeta?` · ${commentMeta}`:''}</div><div class="pinned-comment-text">${commentText}</div></div>`:''}</div>`;
      });
      container.innerHTML=html;
    }else { container.innerHTML=''; container.classList.add('hidden'); }
  }catch(e){container.classList.add('hidden');}
}

// ════ TRACKING ════
async function loadMyTickets() {
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML=skeletonHtml('list',2);
  try { const res=await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`); if(res.success&&res.tickets&&res.tickets.length>0)await renderTicketCards(res.tickets,true); else resDiv.innerHTML=`<div style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;display:block;margin-bottom:12px;"></i><p style="margin-bottom:16px;">คุณยังไม่มีประวัติการร้องเรียน</p><button onclick="navigateTo('portal')" style="padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;font-weight:700;"><i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่</button></div>`; }
  catch(e){resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`;}
}
async function doTrack() {
  const val=document.getElementById('track-input').value.trim();
  if(!val){await showAlert('⚠️','กรุณากรอก Ticket ID','ตัวอย่าง: VOC-2568-XXXXXXXX');return;}
  if(!val.toUpperCase().startsWith('VOC-')){await showAlert('⚠️','รูปแบบไม่ถูกต้อง','กรุณากรอก Ticket ID ที่ขึ้นต้นด้วย VOC-');return;}
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML=skeletonHtml('list',1);
  try { const res=await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val.toUpperCase())}`); if(res.success){const isOwner=currentUser&&currentUser.role==='user'&&String(res.ticket['Username']||'').toLowerCase()===String(currentUser.username||'').toLowerCase();await renderTicketCards([res.ticket],isOwner);}else resDiv.innerHTML=`<p style="color:#d00000;text-align:center;padding:30px;"><i class="fas fa-search"></i> ไม่พบ Ticket ID นี้</p>`; }
  catch(e){resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`;}
}
function expandPinDetail(ticketId,btn){const el=document.getElementById('pin-detail-'+ticketId);if(!el)return;api.get('/api/tickets?action=byId&id='+encodeURIComponent(ticketId)).then(res=>{if(res.success&&res.ticket){el.innerHTML=(res.ticket['รายละเอียด']||'').replace(/\n/g,'<br>');if(btn)btn.style.display='none';}});}
function expandDetail(ticketId,encodedText){const el=document.getElementById('detail-'+ticketId);if(!el)return;el.innerText=decodeURIComponent(encodedText);const btn=el.nextElementSibling;if(btn&&btn.classList.contains('btn-expand'))btn.style.display='none';}

// ════ TICKET CARD ════
function buildTicketCard(t,showRating=false){
  const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject','รอตรวจสอบ':'status-review'};
  const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pChipCls={'high':'red','medium':'orange','low':'green'};
  const isDone=t['สถานะ']==='เสร็จสิ้น'; const comments=t['Comments']||''; const commentEntries=comments?comments.split('\n---\n').filter(c=>c.trim()):[];
  const userNote=t['หมายเหตุผู้ใช้']||''; const fileInfo=t['FileURL']||'';
  const detailFull=t['รายละเอียด']||''; const detailShort=detailFull.length>150?detailFull.substring(0,150)+'...':detailFull; const needExpand=detailFull.length>150;
  return`<div class="ticket-card"><div class="ticket-card-header"><div><div class="ticket-id"><i class="fas fa-ticket-alt" style="font-size:.75rem;margin-right:4px;"></i>${t['Ticket ID']||'-'}</div><div class="ticket-subject" style="margin-top:4px;">${t['หัวข้อ']||'-'}</div></div><span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']||'-'}</span></div><div class="ticket-card-body"><div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-info-circle"></i> ข้อมูลการแจ้ง</div><div class="ticket-meta-chips">${t['ประเภทเรื่อง']?`<span class="chip blue"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>`:''}${t['ความเร่งด่วน']?`<span class="chip ${pChipCls[t['ความเร่งด่วน']]||'gray'}">${pLabel[t['ความเร่งด่วน']]||t['ความเร่งด่วน']}</span>`:''}${t['ประเภทผู้แจ้ง']?`<span class="chip gray"><i class="fas fa-user"></i>${t['ประเภทผู้แจ้ง']}</span>`:''}</div></div><div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-align-left"></i> รายละเอียด</div><div class="ticket-detail-text" id="detail-${t['Ticket ID']}">${needExpand?detailShort:detailFull}</div>${needExpand?`<button class="btn-expand" onclick="expandDetail('${t['Ticket ID']}','${encodeURIComponent(detailFull)}')">ดูเพิ่มเติม ▼</button>`:''}</div>${userNote?`<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</div><div class="user-note-box" style="white-space:pre-wrap;line-height:1.75;">${userNote}</div></div>`:''} ${fileInfo?`<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</div><div class="file-attach-display">${fileInfo.startsWith('https://')?`<a href="${fileInfo}" target="_blank" rel="noopener" style="color:var(--dgreen);font-weight:700;text-decoration:none;"><i class="fas fa-external-link-alt"></i> ดูไฟล์แนบ (Google Drive)</a>`:`<i class="fas fa-file-alt" style="color:var(--dgreen);"></i><span style="font-size:.9rem;color:#555;">${fileInfo}</span>`}</div></div>`:''}<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-tasks"></i> ความคืบหน้า</div>${buildProgressBar(t['สถานะ'])}</div>${commentEntries.length?`<div class="ticket-card-section"><div class="ticket-card-section-label"><i class="fas fa-comment-dots"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div><div class="comments-log">${commentEntries.map((c,idx)=>{const mm=c.match(/^\[(.*?)\]\s*(.*?):/);const timestamp=mm?mm[1]:'',author=mm?mm[2]:'';const text=c.replace(/^\[.*?\].*?:\s*/,'').trim();const isLatest=idx===commentEntries.length-1;return`<div class="comment-entry ${isLatest?'comment-latest':''}"><div class="comment-meta">${isLatest?'<span class="comment-new-badge">ใหม่</span>':''}${author?`<strong style="color:#2d6a4f;">${author}</strong> · `:''}<i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp||'ไม่ระบุเวลา'}</div><div class="comment-text">${text}</div></div>`;}).join('')}</div></div>`:''} ${showRating&&isDone?buildRatingBox(t['Ticket ID']):''}</div><div class="ticket-card-footer"><span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||'-'}</span><span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span><span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span></div></div>`;
}

async function renderTicketCards(tickets,showRating=false){
  const resDiv=document.getElementById('track-result'); let ratedSet=new Set();
  if(showRating&&currentUser){try{const ratedRes=await Promise.all(tickets.filter(t=>t['สถานะ']==='เสร็จสิ้น').map(t=>api.get(`/api/ratings?action=byTicket&id=${encodeURIComponent(t['Ticket ID']||'')}`)));ratedRes.forEach((res,idx)=>{if(res.success&&res.ratings&&res.ratings.length>0){const tid=tickets.filter(t=>t['สถานะ']==='เสร็จสิ้น')[idx]['Ticket ID'];if(res.ratings.some(r=>String(r.username||'').toLowerCase()===String(currentUser.username||'').toLowerCase()))ratedSet.add(tid);}});}catch(e){}}
  let html=`<p style="color:#888;margin-bottom:16px;font-size:.88rem;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t=>{const canRate=showRating&&t['สถานะ']==='เสร็จสิ้น'&&!ratedSet.has(t['Ticket ID']);html+=buildTicketCard(t,canRate);});
  resDiv.innerHTML=html;
}

// ════ RATING ════
function buildRatingBox(ticketId){return`<div class="rating-box" id="rbox-${ticketId}"><h4>⭐ ให้คะแนนการบริการ</h4><div class="star-row" id="stars-${ticketId}">${[1,2,3,4,5].map(i=>`<button class="star-btn dim" onclick="selectStar('${ticketId}',${i})">⭐</button>`).join('')}</div><textarea class="rating-comment" id="rc-${ticketId}" rows="2" placeholder="ความคิดเห็น (ไม่บังคับ)"></textarea><button class="btn-rate" onclick="submitRating('${ticketId}')"><i class="fas fa-paper-plane"></i> ส่งคะแนน</button></div>`;}
function selectStar(tid,score){ratingSelection=score;const row=document.getElementById('stars-'+tid);if(!row)return;row.querySelectorAll('.star-btn').forEach((b,i)=>{b.classList.toggle('lit',i<score);b.classList.toggle('dim',i>=score);b.style.transform=i<score?'scale(1.1)':'scale(1)';});}
async function submitRating(ticketId){if(!ratingSelection){await showAlert('⚠️','กรุณาเลือกคะแนน','');return;}const comment=document.getElementById('rc-'+ticketId)?.value.trim();try{const res=await api.post('/api/ratings',{ticketId,username:currentUser?.username||'',score:ratingSelection,comment});if(res.success){const box=document.getElementById('rbox-'+ticketId);if(box)box.innerHTML=`<div style="text-align:center;padding:16px;color:#2d6a4f;font-weight:700;">✅ ขอบคุณสำหรับ ${'⭐'.repeat(ratingSelection)} คะแนน</div>`;ratingSelection=0;}else await showAlert('ℹ️','แจ้งเตือน',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}

// ════ FAQ ════
async function loadFaq(){const container=document.getElementById('faq-content');if(!container)return;container.innerHTML=skeletonHtml('list',4);try{const res=await api.get('/api/faq');if(res.success)renderFaq(res.faqs||[]);else container.innerHTML='<p style="color:red;">โหลด FAQ ไม่สำเร็จ</p>';}catch(e){container.innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderFaq(faqs,query=''){const container=document.getElementById('faq-content');const filtered=query?faqs.filter(f=>f.question.toLowerCase().includes(query.toLowerCase())||f.answer.toLowerCase().includes(query.toLowerCase())):faqs;if(!filtered.length){container.innerHTML='<p style="text-align:center;color:#aaa;padding:30px;">ไม่พบคำถามที่ค้นหา</p>';return;}const groups={};filtered.forEach(f=>{const cat=f.category||'ทั่วไป';if(!groups[cat])groups[cat]=[];groups[cat].push(f);});let html='<div class="faq-list">';Object.entries(groups).forEach(([cat,items])=>{html+=`<div class="faq-category-label"><i class="fas fa-folder-open"></i> ${cat}</div>`;items.forEach(f=>{html+=`<div class="faq-item" id="faq-${f.faqId}"><div class="faq-question" onclick="toggleFaq('${f.faqId}')"><span>${f.question}</span><i class="fas fa-chevron-down"></i></div><div class="faq-answer">${f.answer}</div></div>`;});});html+='</div>';container.innerHTML=html;}
function toggleFaq(id){const item=document.getElementById('faq-'+id);if(item)item.classList.toggle('open');}
function searchFaq(){const q=document.getElementById('faq-search')?.value.trim()||'';const container=document.getElementById('faq-content');container.innerHTML=skeletonHtml('list',3);api.get('/api/faq').then(res=>{if(res.success)renderFaq(res.faqs||[],q);});}

// ════ REPORT ════
function printReport(){const content=document.getElementById('report-content');if(!content||content.querySelector('.loading-spinner,.skeleton-card')){showAlert('⚠️','รายงานยังไม่โหลด','');return;}const rptNames={service:'สรุปการให้บริการ',users:'ผู้ใช้บริการ',duration:'เวลาให้บริการ',monthly:'สรุปรายเดือน'};const now=new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'});const printWin=window.open('','_blank','width=900,height=700');printWin.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>VOC รายงาน</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Sarabun',sans-serif;background:#fff;color:#222;padding:32px 40px;}.print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2d6a4f;padding-bottom:16px;margin-bottom:24px;}.print-header h1{font-size:1.4rem;color:#2d6a4f;font-weight:800;}@media print{body{padding:16px 20px;}}</style></head><body><div class="print-header"><div><h1>🎙️ VOC System — ${rptNames[currentReportType]||'รายงาน'}</h1><p>คณะวิทยาศาสตร์เทคโนโลยีและการเกษตร · มหาวิทยาลัยราชภัฏยะลา</p></div><div style="text-align:right;font-size:.8rem;color:#888;"><div>วันที่พิมพ์: ${now}</div><div>ผู้พิมพ์: ${currentUser?.fullname||currentUser?.username||'admin'}</div></div></div>${content.innerHTML}<script>setTimeout(function(){window.print();},600);<\/script></body></html>`);printWin.document.close();}

async function loadReport(type){
  window._currentReportType = type || currentReportType;
  currentReportType=type||'service';
  const _rc=document.getElementById('report-content');
  if(_rc)_rc.innerHTML=skeletonHtml('list',3);
  const _rptNames={service:'สรุปการให้บริการ',users:'ผู้ใช้บริการ',duration:'เวลาให้บริการ',monthly:'รายเดือน'};
  const _rptIcons={service:'fas fa-clipboard-list',users:'fas fa-users',duration:'fas fa-stopwatch',monthly:'fas fa-calendar-alt'};
  const _lbl=document.getElementById('report-type-label'); const _ico=document.getElementById('report-type-icon');
  if(_lbl)_lbl.textContent=_rptNames[currentReportType]||'รายงาน'; if(_ico)_ico.className=_rptIcons[currentReportType]||'fas fa-clipboard-list';
  const box=document.getElementById('report-content'); if(!box)return;
  box.innerHTML=skeletonHtml('list',3);
  try{const res=await api.get('/api/report?type='+currentReportType);if(!res.success){box.innerHTML='<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>';return;}if(currentReportType==='service')renderReportService(res.report,box);if(currentReportType==='users')renderReportUsers(res.report,box);if(currentReportType==='duration')renderReportDuration(res.report,box);if(currentReportType==='monthly')renderReportMonthly(res.report,box);}
  catch(e){box.innerHTML=`<p style="color:red;padding:20px;">${e.message}</p>`;}
}

function renderReportService(r,box){const statusRows=Object.entries(r.byStatus||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${k}</td><td style="text-align:right;font-weight:700;">${v}</td><td style="text-align:right;color:#888;">${r.total?`${Math.round(v/r.total*100)}%`:'0%'}</td></tr>`).join('');const catRows=Object.entries(r.byCategory||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>{const pct=r.total?Math.round(v/r.total*100):0;return`<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div><span class="rpt-bar-count">${v}</span></div>`;}).join('');box.innerHTML=`<div class="rpt-kpi-grid"><div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 ทั้งหมด</div></div><div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div><div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00">${r.pending}</div><div class="rpt-kpi-label">⏳ รอ/ดำเนินการ</div></div><div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div></div><div class="rpt-success-bar-wrap"><div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;"><span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span></div><div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div></div><div class="rpt-two-col"><div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-list-ul"></i> สถานะทั้งหมด</div><table class="rpt-table"><tr><th>สถานะ</th><th>จำนวน</th><th>%</th></tr>${statusRows}</table></div><div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่อง (Top 8)</div>${catRows||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div></div>`;}
function renderReportUsers(r,box){const rows=(r.users||[]).map((u,i)=>`<tr><td style="color:#888;font-size:.82rem;">${i+1}</td><td><strong>${u.username}</strong></td><td style="text-align:center;">${u.total}</td><td style="text-align:center;color:#2d6a4f;font-weight:700;">${u.done}</td><td style="text-align:center;color:#f77f00;">${u.pending}</td><td style="text-align:center;">${u.successRate}%</td><td style="font-size:.8rem;color:#666;">${u.topCategory}</td><td><button onclick="showUserReport('${u.username}')" style="padding:4px 10px;background:var(--dgreen);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.76rem;">รายงาน</button></td></tr>`).join('');box.innerHTML=`<div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-users"></i> รายชื่อผู้ใช้บริการ</div><table class="rpt-table"><tr><th>#</th><th>ผู้ใช้</th><th>ทั้งหมด</th><th>เสร็จ</th><th>รอ</th><th>%สำเร็จ</th><th>หมวดบ่อยสุด</th><th></th></tr>${rows||'<tr><td colspan="8" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`;}
function renderReportDuration(r,box){const rows=(r.items||[]).slice(0,20).map(d=>`<tr><td style="font-size:.8rem;color:#2d6a4f;font-weight:700;">${d.ticketId}</td><td style="font-size:.82rem;">${d.subject}</td><td>${d.priority}</td><td style="text-align:right;font-weight:700;">${d.hours} ชม.</td></tr>`).join('');const avgLabel=h=>h!==null?h+' ชม.':'-';box.innerHTML=`<div class="rpt-kpi-grid"><div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">🎯 เรื่องที่เสร็จแล้ว</div></div><div class="rpt-kpi blue"><div class="rpt-kpi-num" style="color:#3a86ff;">${avgLabel(r.avgHours)}</div><div class="rpt-kpi-label">⏱️ เวลาเฉลี่ยรวม</div></div></div><div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-list"></i> รายการล่าสุด</div><table class="rpt-table"><tr><th>Ticket</th><th>หัวข้อ</th><th>ความเร่งด่วน</th><th>เวลา</th></tr>${rows||'<tr><td colspan="4" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`;}
function renderReportMonthly(r,box){const months=r.months||[];const maxTotal=Math.max(...months.map(m=>m.total),1);const bars=months.map(m=>{const pct=Math.round(m.total/maxTotal*100);return`<div class="rpt-month-row"><div class="rpt-month-label">${m.month}</div><div style="flex:1;"><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div></div><div class="rpt-month-count">${m.total}</div></div>`;}).join('');box.innerHTML=`<div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-chart-bar"></i> จำนวน Ticket รายเดือน</div>${bars||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>`;}

async function showUserReport(username){const po=document.getElementById('profile-overlay');if(po)document.body.removeChild(po);navigateTo('user-report');const box=document.getElementById('user-report-content');box.innerHTML=skeletonHtml('list',3);try{const res=await api.get('/api/report?type=userSummary&username='+encodeURIComponent(username));if(!res.success){box.innerHTML='<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>';return;}renderUserReport(res.report,box);}catch(e){box.innerHTML=`<p style="color:red;padding:20px;">${e.message}</p>`;}}
function closeUserReport(){if(currentUser&&(currentUser.role==='admin'||currentUser.role==='superadmin'))navigateTo('admin-report');else navigateTo('tracking');}
function renderUserReport(r,box){const scClass={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-done','ปฏิเสธ':'status-rejected'};const catEntries=Object.entries(r.byCategory||{}).sort((a,b)=>b[1]-a[1]);const maxCat=Math.max(...catEntries.map(e=>e[1]),1);const catBars=catEntries.map(([k,v])=>`<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${Math.round(v/maxCat*100)}%"></div></div><span class="rpt-bar-count">${v}</span></div>`).join('');const ticketRows=(r.recentTickets||[]).map(t=>`<tr><td style="font-size:.78rem;color:#2d6a4f;font-weight:700;">${t.ticketId}</td><td style="font-size:.83rem;">${t.subject}</td><td><span class="status ${scClass[t.status]||'status-pending'}" style="font-size:.72rem;">${t.status}</span></td><td style="font-size:.78rem;color:#888;">${t.date}</td></tr>`).join('');box.innerHTML=`<div class="rpt-kpi-grid"><div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 รวมทั้งหมด</div></div><div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f;">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div><div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00;">${r.pending}</div><div class="rpt-kpi-label">⏳ รอดำเนินการ</div></div><div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000;">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div></div><div class="rpt-success-bar-wrap"><div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;"><span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span></div><div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div></div><div class="rpt-card"><div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่องที่แจ้ง</div>${catBars||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div><div class="rpt-card" style="overflow-x:auto;"><div class="rpt-card-title"><i class="fas fa-history"></i> ประวัติคำร้องล่าสุด</div><table class="rpt-table"><tr><th>Ticket ID</th><th>หัวข้อ</th><th>สถานะ</th><th>วันที่</th></tr>${ticketRows||'<tr><td colspan="4" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table></div>`;}

// ════ ADMIN DASHBOARD ════
async function loadDashboard(){document.getElementById('dash-content').innerHTML=skeletonHtml('stats',4);try{const [dr,sr]=await Promise.all([api.get('/api/dashboard'),api.get('/api/ratings?action=summary')]);if(dr.success)renderDashboard(dr.stats,sr.summary||{avg:0,total:0});else document.getElementById('dash-content').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';}catch(e){document.getElementById('dash-content').innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderDashboard(s,rs){const mxC=Math.max(...Object.values(s.byCategory),1);const mxU=Math.max(...Object.values(s.byCustomer),1);let catB='',cusB='',urgH='';Object.entries(s.byCategory).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{catB+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mxC*100)}%"></div></div><span class="bar-count">${v}</span></div>`;});Object.entries(s.byCustomer).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{cusB+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v/mxU*100)}%"></div></div><span class="bar-count">${v}</span></div>`;});if(s.urgentTickets&&s.urgentTickets.length>0)urgH=`<div class="urgent-banner"><h4><i class="fas fa-exclamation-triangle"></i> ⚠️ ${s.urgentTickets.length} เรื่องเร่งด่วนยังไม่เสร็จ</h4>${s.urgentTickets.map(t=>`<div class="urgent-item"><span class="priority-badge p-high">🔴 เร่งด่วน</span><strong>${t.ticketId}</strong><span style="flex:1;">${t.subject}</span></div>`).join('')}</div>`;document.getElementById('dash-content').innerHTML=`${urgH}<div class="dash-grid"><div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">📋 ทั้งหมด</div></div><div class="stat-card orange"><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">⏳ รอดำเนินการ</div></div><div class="stat-card blue"><div class="stat-num" style="color:#3a86ff;">${s.inprogress}</div><div class="stat-label">🔄 กำลังดำเนินการ</div></div><div class="stat-card"><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">✅ เสร็จสิ้น</div></div></div><div class="dash-charts"><div class="chart-card"><h4><i class="fas fa-tags"></i> ประเภทเรื่อง</h4>${catB||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div><div class="chart-card" style="text-align:center;"><h4><i class="fas fa-star"></i> คะแนนพึงพอใจ</h4><div style="font-size:3.2rem;font-weight:800;color:var(--dgreen);line-height:1;">${rs.avg||'-'}</div><div style="font-size:.83rem;color:#888;">${rs.total||0} รีวิว</div><button onclick="navigateTo('admin-reviews')" style="margin-top:12px;padding:7px 16px;background:var(--dgreen);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.85rem;">ดูรีวิว</button></div><div class="chart-card"><h4><i class="fas fa-users"></i> ประเภทผู้แจ้ง</h4>${cusB||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div></div>`;}

// ════ ADMIN TICKETS ════
function setFilter(id){document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));const e=document.getElementById('filter-'+id);if(e)e.classList.add('active');}
async function loadAdminTickets(filter){document.getElementById('admin-ticket-list').innerHTML=skeletonHtml('list',3);try{const tr=await api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`);if(tr.success)renderAdminTickets(tr.tickets);else document.getElementById('admin-ticket-list').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';}catch(e){document.getElementById('admin-ticket-list').innerHTML=`<p style="color:red;">${e.message}</p>`;}}

function renderAdminTickets(tickets){
  const container=document.getElementById('admin-ticket-list');
  const po={'high':0,'medium':1,'low':2}; tickets.sort((a,b)=>(po[a['ความเร่งด่วน']]??9)-(po[b['ความเร่งด่วน']]??9));
  const scColor={'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
  const scTag={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pClass={'high':'p-high','medium':'p-medium','low':'p-low'};
  const categories=[...new Set(tickets.map(t=>t['ประเภทเรื่อง']).filter(Boolean))].sort();
  let html='';
  if(categories.length){html+=`<div class="voc-dropdown-wrap" id="admin-cat-filter"><button class="voc-dropdown-btn" onclick="toggleDropdown('admin-cat-dd')" type="button"><i class="fas fa-filter"></i><span id="admin-cat-label">ทั้งหมด</span><i class="fas fa-chevron-down voc-dropdown-arrow"></i></button><div class="voc-dropdown-menu" id="admin-cat-dd"><button class="voc-dropdown-item active" data-cat="all" onclick="filterByCategory('all',this)"><i class="fas fa-list" style="font-size:.75rem;color:#888;"></i> ทั้งหมด</button>${categories.map(c=>`<button class="voc-dropdown-item" data-cat="${c.replace(/"/g,'&quot;')}" onclick="filterByCategory('${c.replace(/'/g,"&#39;")}',this)">${c}</button>`).join('')}</div></div>`;}
  if(!tickets.length){container.innerHTML=html+'<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ไม่มีเรื่อง</p></div>';return;}
  html+=`<p style="color:#888;margin-bottom:14px;font-size:.85rem;" id="admin-ticket-count">แสดง ${tickets.length} รายการ</p>`;
  tickets.forEach(t=>{
    const tid=t['Ticket ID'],pr=t['ความเร่งด่วน']||'low',isHigh=pr==='high';
    const isPinned=String(t['Pinned']||'').toLowerCase()==='true';
    const comments=t['Comments']||''; const commentEntries=comments?comments.split('\n---\n').filter(c=>c.trim()):[];
    const detail=t['รายละเอียด']||'(ไม่มีรายละเอียด)'; const detailShort=detail.length>200?detail.substring(0,200)+'...':detail; const needExpand=detail.length>200;
    html+=`<div class="admin-ticket-card ${scColor[t['สถานะ']]||'pending'} ${isHigh?'priority-high':''}" id="card-${tid}" data-category="${(t['ประเภทเรื่อง']||'').replace(/"/g,'&quot;')}">
      <div class="admin-card-top"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">${isHigh?'<span>🚨</span>':''}<span class="ticket-id" style="font-size:.96rem;">${tid}</span><span class="priority-badge ${pClass[pr]||'p-low'}">${pLabel[pr]||pr}</span></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span class="status ${scTag[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span><button id="pin-btn-${tid}" onclick="togglePin('${tid}',${!isPinned})" style="padding:3px 9px;border-radius:8px;border:1px solid ${isPinned?'#2d6a4f':'#ddd'};background:${isPinned?'#e8f5e9':'#fff'};font-size:.74rem;color:${isPinned?'#2d6a4f':'#aaa'};font-family:'Sarabun',sans-serif;"><i class="fas fa-thumbtack"></i>${isPinned?'แสดงอยู่':'ปักหมุด'}</button>${currentUser&&currentUser.role==='superadmin'?`<button onclick="deleteTicket('${tid}')" style="padding:3px 9px;border-radius:8px;border:1px solid #f5c6c6;background:#fff5f5;font-size:.74rem;color:#d00000;font-family:'Sarabun',sans-serif;"><i class="fas fa-trash-alt"></i> ลบ</button>`:''}</div></div>
      <div style="font-size:.97rem;font-weight:700;margin-bottom:10px;">${t['หัวข้อ']||'-'}</div>
      <div class="admin-card-meta"><span><strong>ประเภทผู้แจ้ง:</strong> ${t['ประเภทผู้แจ้ง']||'-'}</span><span><strong>ชื่อ:</strong> ${t['ชื่อ']||'-'}</span><span><strong>ประเภทเรื่อง:</strong> ${t['ประเภทเรื่อง']||'-'}</span><span><strong>วันที่แจ้ง:</strong> ${t['วันที่แจ้ง']||'-'}</span><span><strong>กำหนดตอบกลับ:</strong> ${t['กำหนดตอบกลับ']||'-'}</span><span><strong>ผู้รับผิดชอบ:</strong> ${t['ผู้รับผิดชอบ']||'-'}</span></div>
      ${t['หมายเหตุผู้ใช้']?`<div class="admin-user-note"><span class="admin-note-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</span><div class="admin-note-text">${t['หมายเหตุผู้ใช้']}</div></div>`:''}
      ${t['FileURL']?`<div class="admin-file-box"><span class="admin-note-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</span><div>${t['FileURL'].startsWith('https://')?`<a href="${t['FileURL']}" target="_blank" rel="noopener" style="color:var(--dgreen);font-weight:700;text-decoration:none;"><i class="fas fa-external-link-alt"></i> ดูไฟล์แนบ</a>`:t['FileURL']}</div></div>`:''}
      <div class="detail-box" id="adm-detail-${tid}">${needExpand?detailShort:detail}${needExpand?`<button class="btn-expand" onclick="expandAdminDetail('${tid}','${encodeURIComponent(detail)}')">ดูเพิ่มเติม ▼</button>`:''}</div>
      ${commentEntries.length?`<div style="margin-bottom:12px;"><div style="font-size:.75rem;font-weight:700;color:#aaa;text-transform:uppercase;margin-bottom:8px;"><i class="fas fa-comments"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div><div class="comments-log">${commentEntries.map((c,idx)=>{const mm=c.match(/^\[(.*?)\]\s*(.*?):/);const timestamp=mm?mm[1]:'',author=mm?mm[2]:'';const text=c.replace(/^\[.*?\].*?:\s*/,'').trim();const isLatest=idx===commentEntries.length-1;return`<div class="comment-entry ${isLatest?'comment-latest':''}"><div class="comment-meta">${isLatest?'<span class="comment-new-badge">ใหม่</span>':''}${author?`<strong style="color:#2d6a4f;">${author}</strong> · `:''}<i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp||'ไม่ระบุเวลา'}</div><div class="comment-text">${text}</div></div>`;}).join('')}</div></div>`:''}
      <div class="comment-add-box"><div style="font-size:.78rem;color:#2d6a4f;font-weight:700;margin-bottom:6px;"><i class="fas fa-plus-circle"></i> เพิ่มความคิดเห็น</div><textarea id="new-comment-${tid}" rows="2" placeholder="พิมพ์ความคิดเห็น..."></textarea><button class="btn-comment" onclick="addComment('${tid}')"><i class="fas fa-paper-plane"></i> ส่งความคิดเห็น</button></div>
      <div class="update-row" style="margin-top:10px;"><select id="status-${tid}"><option value="รอดำเนินการ" ${t['สถานะ']==='รอดำเนินการ'?'selected':''}>รอดำเนินการ</option><option value="กำลังดำเนินการ" ${t['สถานะ']==='กำลังดำเนินการ'?'selected':''}>กำลังดำเนินการ</option><option value="รอตรวจสอบ" ${t['สถานะ']==='รอตรวจสอบ'?'selected':''}>รอตรวจสอบ</option><option value="เสร็จสิ้น" ${t['สถานะ']==='เสร็จสิ้น'?'selected':''}>เสร็จสิ้น</option><option value="ปฏิเสธ" ${t['สถานะ']==='ปฏิเสธ'?'selected':''}>ปฏิเสธ</option></select><input type="text" id="assignee-${tid}" placeholder="ผู้รับผิดชอบ" value="${t['ผู้รับผิดชอบ']||''}"><button class="btn-update" onclick="submitUpdate('${tid}')"><i class="fas fa-save"></i> บันทึก</button></div>
    </div>`;
  });
  container.innerHTML=html;
}

function filterByCategory(cat,btn){document.querySelectorAll('#admin-cat-dd .voc-dropdown-item').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');const label=document.getElementById('admin-cat-label');if(label)label.textContent=btn?btn.textContent.trim():'ทั้งหมด';document.getElementById('admin-cat-dd')?.classList.remove('open');const cards=document.querySelectorAll('.admin-ticket-card[data-category]');let shown=0;cards.forEach(card=>{const match=cat==='all'||card.dataset.category===cat;card.style.display=match?'':'none';if(match)shown++;});const countEl=document.getElementById('admin-ticket-count');if(countEl)countEl.textContent=`แสดง ${shown} รายการ${cat!=='all'?` (กรอง: ${cat})`:''}`;}
function expandAdminDetail(tid,enc){const el=document.getElementById('adm-detail-'+tid);if(!el)return;el.innerHTML=decodeURIComponent(enc);}

async function addComment(ticketId){const commentEl=document.getElementById('new-comment-'+ticketId);const comment=commentEl?.value.trim();if(!comment){await showAlert('⚠️','กรุณาพิมพ์ความคิดเห็น','');return;}try{const res=await api.post('/api/tickets',{action:'addComment',ticketId,comment,author:currentUser?.fullname||currentUser?.username||'ผู้ดูแล'});if(res.success){if(commentEl)commentEl.value='';await showAlert('✅','บันทึกความคิดเห็นสำเร็จ','');loadAdminTickets(document.querySelector('.filter-btn.active')?.id?.replace('filter-','')||'pending');}else await showAlert('❌','ไม่สำเร็จ',res.message||'');}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
async function togglePin(tid,ns){if(!await showConfirm('📌',ns?'ปักหมุด':'ยกเลิกปักหมุด',''))return;try{const res=await api.post('/api/tickets',{action:'togglePin',ticketId:tid,pinned:ns});if(res.success){const btn=document.getElementById(`pin-btn-${tid}`);if(btn){btn.style.border=`1px solid ${ns?'#2d6a4f':'#ddd'}`;btn.style.background=ns?'#e8f5e9':'#fff';btn.style.color=ns?'#2d6a4f':'#aaa';btn.innerHTML=`<i class="fas fa-thumbtack"></i>${ns?'แสดงอยู่':'ปักหมุด'}`;btn.setAttribute('onclick',`togglePin('${tid}',${!ns})`);}}  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
async function submitUpdate(tid){
  // ตรวจสอบ token ก่อน — ถ้าไม่มีให้แจ้งเตือนทันที
  const _tok = loadToken();
  if (!_tok) {
    await showAlert('⚠️','กรุณาเข้าสู่ระบบใหม่','Session หมดอายุ กรุณา Login ใหม่อีกครั้ง');
    return;
  }
  const ns=document.getElementById('status-'+tid).value;
  const as=document.getElementById('assignee-'+tid).value;
  if(!await showConfirm('💾','ยืนยันการบันทึก',`Ticket: <strong>${tid}</strong><br>สถานะ: <strong>${ns}</strong>`))return;
  const btn=document.querySelector(`#card-${tid} .btn-update`);
  if(btn){btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';btn.disabled=true;}
  try {
    const res=await api.post('/api/tickets',{action:'update',ticketId:tid,newStatus:ns,assignee:as});
    if(res.success){
      const card=document.getElementById('card-'+tid);
      if(card){
        // ── อัปเดต badge สถานะใน card header ──
        const badge=card.querySelector('.admin-card-top .status');
        // ใช้ค่าเดียวกับ renderAdminTickets
        const scTag={
          'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress',
          'รอตรวจสอบ':'status-pending','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'
        };
        const scColor={
          'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress',
          'รอตรวจสอบ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'
        };
        if(badge){
          // ลบ class เก่าทั้งหมดที่เป็น status-*
          badge.className=badge.className.replace(/\bstatus-\S+/g,'').trim();
          badge.classList.add('status', scTag[ns]||'status-pending');
          badge.textContent=ns;
        }
        // อัปเดต class สีของ card ด้วย
        ['pending','inprogress','review','done','rejected'].forEach(c=>card.classList.remove(c));
        card.classList.add(scColor[ns]||'pending');
        // อัปเดต assignee ที่แสดงใน footer
        const footerAssignee=card.querySelector('.ticket-card-footer span:last-child');
        if(footerAssignee&&as) footerAssignee.innerHTML=`<i class="fas fa-user-tie"></i>${as}`;
        // กะพริบเขียวยืนยัน
        card.style.transition='background .4s';
        card.style.background='#d4edda';
        setTimeout(()=>{card.style.background='';},1500);
      }
    } else {
      // ถ้า 401 → token หมดอายุ ให้แจ้งเตือนชัดเจน
      const msg = (res.message||'').includes('กรุณาเข้าสู่ระบบ') || (res.message||'').includes('token')
        ? 'Session หมดอายุ กรุณา Login ใหม่'
        : res.message||'บันทึกไม่สำเร็จ';
      await showAlert('❌','บันทึกไม่สำเร็จ', msg);
    }
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{if(btn){btn.innerHTML='<i class="fas fa-save"></i> บันทึก';btn.disabled=false;}}
}
async function deleteTicket(tid){if(!await showConfirm('🗑️','ลบ Ticket',`ต้องการลบ <strong>${tid}</strong>?<br><small style="color:#d00000;">ไม่สามารถเรียกคืนได้</small>`,'danger'))return;try{const res=await api.post('/api/tickets',{action:'deleteTicket',ticketId:tid});if(res.success){const card=document.getElementById('card-'+tid);if(card){card.style.transition='opacity .4s';card.style.opacity='0';setTimeout(()=>card.remove(),400);}await showAlert('✅','ลบสำเร็จ',`Ticket ${tid} ถูกลบแล้ว`);}else await showAlert('❌','ลบไม่สำเร็จ',res.message||'');}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}

// ════ ADMIN REVIEWS ════
async function loadReviews(){const container=document.getElementById('review-content');if(!container)return;container.innerHTML=skeletonHtml('list',3);try{const [ar,sr]=await Promise.all([api.get('/api/ratings?action=all'),api.get('/api/ratings?action=summary')]);renderReviews(ar.ratings||[],sr.summary||{avg:0,total:0,dist:{}});}catch(e){container.innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderReviews(ratings,summary){const container=document.getElementById('review-content');const avg=summary.avg||0,total=summary.total||0;let html=`<div class="rating-summary"><div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;"><div style="text-align:center;"><div class="rating-avg">${avg}</div><div style="font-size:1.4rem;margin:6px 0;">${'⭐'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div><div style="font-size:.82rem;color:#888;">${total} รีวิว</div></div></div></div>`;if(!ratings.length){container.innerHTML=html+'<div class="no-tickets"><i class="fas fa-star" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ยังไม่มีรีวิว</p></div>';return;}ratings.forEach(r=>{const stars='⭐'.repeat(r.score)+'☆'.repeat(5-r.score);html+=`<div style="background:#fff;border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:12px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;"><div><span style="font-weight:700;color:var(--dgreen);font-family:monospace;">${r.ticketId}</span><span style="font-size:1.1rem;margin-left:8px;">${stars}</span></div><span style="font-size:.78rem;color:#aaa;">${r.date||''}</span></div><div style="font-size:.83rem;color:#aaa;"><i class="fas fa-user"></i> ${r.username||'ไม่ระบุ'}</div>${r.comment?`<div style="background:#f8f8f8;border-radius:8px;padding:10px 12px;font-size:.87rem;color:#444;margin-top:8px;">${r.comment}</div>`:''}</div>`;});container.innerHTML=html;}

// ════ SUPERADMIN ════
async function loadSuperAdmin(){showSATab('news');}
function showSATab(tab){currentSATab=tab;if(tab==='news')loadSANews();if(tab==='faq')loadSAFaq();if(tab==='admins')loadSAAdmins();}
function _saTabsHtml(){return`<div class="sa-tabs"><button class="sa-tab ${currentSATab==='news'?'active':''}" onclick="showSATab('news')"><i class="fas fa-newspaper"></i> ข่าวสาร</button><button class="sa-tab ${currentSATab==='faq'?'active':''}" onclick="showSATab('faq')"><i class="fas fa-question-circle"></i> FAQ</button><button class="sa-tab ${currentSATab==='admins'?'active':''}" onclick="showSATab('admins')"><i class="fas fa-user-shield"></i> ผู้ดูแลระบบ</button></div>`;}
function _saBannerHtml(){return`<div class="superadmin-banner"><i class="fas fa-crown"></i><div><strong>ผู้ดูแลระดับสูง</strong><br><small>จัดการข่าวสาร FAQ และการตั้งค่าระบบ</small></div></div>`;}

async function loadSAAdmins(){const container=document.getElementById('superadmin-content');if(!container)return;try{const res=await api.post('/api/auth',{action:'listAdmins'});renderSAAdmins(res.admins||[]);}catch(e){document.getElementById('superadmin-content').innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderSAAdmins(admins){const container=document.getElementById('superadmin-content');let html=_saBannerHtml()+_saTabsHtml();html+=`<div class="news-manager-form"><h4><i class="fas fa-user-plus"></i> เพิ่ม Admin ใหม่</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div class="form-group" style="margin-bottom:0;"><label>Username *</label><input type="text" id="new-admin-user" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>รหัสผ่าน *</label><input type="password" id="new-admin-pass" placeholder="อย่างน้อย 8 ตัว" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>ชื่อแสดง</label><input type="text" id="new-admin-name" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group" style="margin-bottom:0;"><label>อีเมล</label><input type="email" id="new-admin-email" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div></div><button class="btn-add-news" style="margin-top:14px;" onclick="addAdmin()"><i class="fas fa-plus"></i> เพิ่ม Admin</button></div>`;admins.forEach(a=>{html+=`<div class="news-manager-card" style="display:flex;align-items:center;gap:14px;"><div style="width:44px;height:44px;background:var(--dgreen);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.1rem;flex-shrink:0;">${(a.fullname||a.username||'A')[0].toUpperCase()}</div><div style="flex:1;"><div style="font-weight:700;">${a.fullname||a.username}</div><div style="font-size:.82rem;color:#aaa;font-family:monospace;">${a.username} · ${a.email||'ไม่มีอีเมล'}</div></div><span style="font-size:.75rem;padding:3px 10px;border-radius:8px;background:${a.status==='active'?'#e8f5e9':'#fde8e8'};color:${a.status==='active'?'#2d6a4f':'#d00000'};font-weight:700;">${a.status==='active'?'ใช้งาน':'ระงับ'}</span></div>`;});container.innerHTML=html;}
async function addAdmin(){const u=document.getElementById('new-admin-user')?.value.trim();const p=document.getElementById('new-admin-pass')?.value;const n=document.getElementById('new-admin-name')?.value.trim();const e=document.getElementById('new-admin-email')?.value.trim();if(!u||!p){await showAlert('⚠️','ข้อมูลไม่ครบ','กรุณากรอก Username และรหัสผ่าน');return;}if(p.length<8){await showAlert('⚠️','รหัสผ่านสั้นเกิน','รหัสผ่านต้องอย่างน้อย 8 ตัว');return;}try{const res=await api.post('/api/auth',{action:'addAdmin',username:u,password:p,fullname:n,email:e});if(res.success){await showAlert('✅','เพิ่ม Admin สำเร็จ',res.message);['new-admin-user','new-admin-pass','new-admin-name','new-admin-email'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});loadSAAdmins();}else await showAlert('❌','ไม่สำเร็จ',res.message);}catch(err){await showAlert('❌','เกิดข้อผิดพลาด',err.message);}}

async function loadSANews(){const container=document.getElementById('superadmin-content');if(!container)return;try{const res=await api.get('/api/news');renderSANews(res.news||[]);}catch(e){document.getElementById('superadmin-content').innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderSANews(news){_saNewsCache=news;const container=document.getElementById('superadmin-content');const tagOpts=['ทั่วไป','ด่วน','ข้อมูล','กิจกรรม'];let html=_saBannerHtml()+_saTabsHtml();html+=`<div class="news-manager-form"><h4><i class="fas fa-plus-circle"></i> เพิ่มข่าวสารใหม่</h4><div class="form-group"><label>หัวเรื่อง *</label><input type="text" id="news-title" placeholder="หัวเรื่องข่าว"></div><div class="form-group"><label>เนื้อหา *</label><textarea id="news-content" rows="4" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;"></textarea></div><div class="form-group"><label>Tag</label><select id="news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${tagOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div><div class="form-group"><label>URL รูปภาพ</label><input type="url" id="news-image-url" placeholder="https://..." style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;"></div><button class="btn-add-news" onclick="addNews()"><i class="fas fa-plus"></i> เพิ่มข่าว</button></div>`;news.forEach(n=>{const short=n.content.length>100?n.content.substring(0,100)+'...':n.content;html+=`<div class="news-manager-card" style="display:flex;align-items:flex-start;">${n.imageUrl?`<img src="${n.imageUrl}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-right:12px;flex-shrink:0;" onerror="this.style.display='none'">`:''}<div style="flex:1;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;"><div><span class="news-tag">${n.tag||'ทั่วไป'}</span><strong>${n.title}</strong></div><div style="display:flex;gap:6px;"><button class="btn-edit-news" onclick="editNews(${news.indexOf(n)})"><i class="fas fa-edit"></i> แก้ไข</button><button class="btn-delete" onclick="deleteNews('${n.newsId}')"><i class="fas fa-trash"></i> ลบ</button></div></div><div style="font-size:.86rem;color:#666;">${short}</div></div></div>`;});container.innerHTML=html;}
function handleNewsImageSelect(input,previewId,b64Id){const file=input.files?.[0];const previewEl=document.getElementById(previewId);const b64El=document.getElementById(b64Id);if(!file){if(previewEl)previewEl.style.display='none';if(b64El)b64El.value='';return;}if(file.size>3*1024*1024){showAlert('⚠️','ไฟล์ใหญ่เกินไป','ขนาดรูปไม่เกิน 3 MB');input.value='';return;}const reader=new FileReader();reader.onload=e=>{if(b64El)b64El.value=e.target.result;if(previewEl){previewEl.innerHTML=`<img src="${e.target.result}" style="max-width:200px;max-height:140px;border-radius:8px;object-fit:cover;">`;previewEl.style.display='block';}};reader.readAsDataURL(file);}
function clearNewsImg(inputId,previewId,b64Id){const inp=document.getElementById(inputId);if(inp)inp.value='';const prev=document.getElementById(previewId);if(prev){prev.innerHTML='';prev.style.display='none';}const b64=document.getElementById(b64Id);if(b64)b64.value='';}
async function addNews(){const title=document.getElementById('news-title')?.value.trim();const content=document.getElementById('news-content')?.value.trim();const tag=document.getElementById('news-tag')?.value;const imageUrl=document.getElementById('news-image-url')?.value.trim()||'';if(!title||!content){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}try{const res=await api.post('/api/news',{action:'add',title,content,tag,imageUrl,author:currentUser?.username||'admin'});if(res.success){document.getElementById('news-title').value='';document.getElementById('news-content').value='';const u=document.getElementById('news-image-url');if(u)u.value='';await showAlert('✅','เพิ่มข่าวสำเร็จ','');loadSANews();}else await showAlert('❌','ไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
function editNews(idx){const n=_saNewsCache[idx];if(!n){showAlert('⚠️','เกิดข้อผิดพลาด','ไม่พบข้อมูลข่าว');return;}const tagOpts=['ทั่วไป','ด่วน','ข้อมูล','กิจกรรม'];const overlay=document.createElement('div');overlay.className='voc-overlay';overlay.id='edit-news-overlay';overlay.innerHTML=`<div class="voc-modal-box" style="max-width:600px;"><div class="voc-modal-title"><i class="fas fa-edit"></i> แก้ไขข่าวสาร</div><div class="form-group"><label>หัวเรื่อง *</label><input type="text" id="edit-news-title" value="${(n.title||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group"><label>เนื้อหา *</label><textarea id="edit-news-content" rows="5" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;box-sizing:border-box;">${n.content||''}</textarea></div><div class="form-group"><label>Tag</label><select id="edit-news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${tagOpts.map(t=>`<option value="${t}" ${t===n.tag?'selected':''}>${t}</option>`).join('')}</select></div><div class="form-group"><label>URL รูปภาพ</label><input type="url" id="edit-news-image-url" value="${n.imageUrl||''}" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;"></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('edit-news-overlay'))">ยกเลิก</button><button class="voc-btn-ok" onclick="updateNews('${n.newsId}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`;document.body.appendChild(overlay);}
async function updateNews(newsId){const title=document.getElementById('edit-news-title')?.value.trim();const content=document.getElementById('edit-news-content')?.value.trim();const tag=document.getElementById('edit-news-tag')?.value;const imageUrl=document.getElementById('edit-news-image-url')?.value.trim()||'';if(!title||!content){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}try{const res=await api.post('/api/news',{action:'update',newsId,title,content,tag,imageUrl});if(res.success){const o=document.getElementById('edit-news-overlay');if(o)document.body.removeChild(o);await showAlert('✅','แก้ไขสำเร็จ','');loadSANews();}else await showAlert('❌','ไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
function clearExistingImg(){const ex=document.getElementById('edit-news-image-existing');if(ex)ex.value='';}
async function deleteNews(newsId){if(!await showConfirm('🗑️','ลบข่าว','ต้องการลบข่าวนี้ใช่หรือไม่?','danger'))return;try{const res=await api.post('/api/news',{action:'delete',newsId});if(res.success)loadSANews();else await showAlert('❌','ลบไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}

async function loadSAFaq(){const container=document.getElementById('superadmin-content');if(!container)return;try{const res=await api.get('/api/faq');renderSAFaq(res.faqs||[]);}catch(e){document.getElementById('superadmin-content').innerHTML=`<p style="color:red;">${e.message}</p>`;}}
function renderSAFaq(faqs){const container=document.getElementById('superadmin-content');const catOpts=['การใช้งาน','ความเร่งด่วน','ความปลอดภัย','ระบบ','ทั่วไป'];let html=_saBannerHtml()+_saTabsHtml();html+=`<div class="news-manager-form"><h4><i class="fas fa-plus-circle"></i> เพิ่มคำถามใหม่</h4><div class="form-group"><label>หมวดหมู่</label><select id="faq-cat-new" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">${catOpts.map(c=>`<option>${c}</option>`).join('')}</select></div><div class="form-group"><label>คำถาม *</label><input type="text" id="faq-q-new" placeholder="คำถาม..."></div><div class="form-group"><label>คำตอบ *</label><textarea id="faq-a-new" rows="3" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;" placeholder="คำตอบ..."></textarea></div><button class="btn-add-news" onclick="addFaq()"><i class="fas fa-plus"></i> เพิ่มคำถาม</button></div><p style="font-size:.85rem;color:#888;margin-bottom:14px;">FAQ ทั้งหมด ${faqs.length} รายการ</p>`;faqs.forEach(f=>{html+=`<div class="news-manager-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;"><div><span class="chip gray" style="margin-right:6px;">${f.category}</span><strong>${f.question}</strong></div><div style="display:flex;gap:6px;"><button class="btn-edit-news" onclick='editFaq(${JSON.stringify(f)})'><i class="fas fa-edit"></i> แก้ไข</button><button class="btn-delete" onclick="deleteFaq('${f.faqId}')"><i class="fas fa-trash"></i> ลบ</button></div></div><div style="font-size:.86rem;color:#666;">${f.answer}</div></div>`;});container.innerHTML=html;}
function editFaq(f){const catOpts=['การใช้งาน','ความเร่งด่วน','ความปลอดภัย','ระบบ','ทั่วไป'];const overlay=document.createElement('div');overlay.className='voc-overlay';overlay.id='edit-faq-overlay';overlay.innerHTML=`<div class="voc-modal-box" style="max-width:580px;"><div class="voc-modal-title"><i class="fas fa-edit"></i> แก้ไขคำถาม FAQ</div><div class="form-group"><label>หมวดหมู่</label><select id="edit-faq-cat" style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;margin-top:4px;">${catOpts.map(c=>`<option value="${c}" ${c===f.category?'selected':''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>คำถาม *</label><input type="text" id="edit-faq-q" value="${(f.question||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div><div class="form-group"><label>คำตอบ *</label><textarea id="edit-faq-a" rows="5" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;resize:vertical;box-sizing:border-box;">${f.answer||''}</textarea></div><div class="voc-modal-btns"><button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('edit-faq-overlay'))">ยกเลิก</button><button class="voc-btn-ok" onclick="updateFaq('${f.faqId}')"><i class="fas fa-save"></i> บันทึก</button></div></div>`;document.body.appendChild(overlay);}
async function updateFaq(faqId){const category=document.getElementById('edit-faq-cat')?.value;const question=document.getElementById('edit-faq-q')?.value.trim();const answer=document.getElementById('edit-faq-a')?.value.trim();if(!question||!answer){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}try{const res=await api.post('/api/faq',{action:'update',faqId,category,question,answer});if(res.success){const o=document.getElementById('edit-faq-overlay');if(o)document.body.removeChild(o);await showAlert('✅','แก้ไขสำเร็จ','');loadSAFaq();}else await showAlert('❌','ไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
async function addFaq(){const cat=document.getElementById('faq-cat-new')?.value;const q=document.getElementById('faq-q-new')?.value.trim();const a=document.getElementById('faq-a-new')?.value.trim();if(!q||!a){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}try{const res=await api.post('/api/faq',{action:'add',category:cat,question:q,answer:a});if(res.success){await showAlert('✅','เพิ่มสำเร็จ','');loadSAFaq();}else await showAlert('❌','ไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}
async function deleteFaq(faqId){if(!await showConfirm('🗑️','ลบคำถาม','','danger'))return;try{const res=await api.post('/api/faq',{action:'delete',faqId});if(res.success)loadSAFaq();else await showAlert('❌','ลบไม่สำเร็จ',res.message);}catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}}

function _resetMenuToGuest() {
  const nav = document.getElementById('main-nav');
  const right = document.getElementById('right-menu');
  if (nav) nav.innerHTML = `
    <a onclick="navigateTo('home')"     id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('portal')"   id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="navigateTo('faq')"      id="nav-faq">คำถามที่พบบ่อย</a>`;
  if (right) right.innerHTML = `
    <a onclick="navigateTo('login')"    class="nav-menu header-auth-desktop" style="color:rgba(255,255,255,.85);font-size:.85rem;"><i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ</a>
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
  G.navigateTo=navigateTo; G.toggleMobileNav=toggleMobileNav; G.closeMobileNav=closeMobileNav;
  G.doLogin=doLogin; G.doAdminLogin=doAdminLogin; G.doRegister=doRegister; G.doLogout=doLogout;
  G.showAdminLoginModal=showAdminLoginModal; G.hideAdminLoginModal=hideAdminLoginModal;
  G.showSuperAdminLoginModal=showAdminLoginModal;
  G.showProfile=showProfile; G.saveProfile=saveProfile;
  G.changeStep=changeStep; G.setOption=setOption; G.toggleAnon=toggleAnon;
  G.handleFileSelect=handleFileSelect; G.prepareReview=prepareReview; G.finalSubmit=finalSubmit;
  G.onTurnstileSuccess=onTurnstileSuccess; G.onTurnstileExpire=onTurnstileExpire;
  G.onTurnstileError=onTurnstileError; G.resetTurnstile=resetTurnstile;
  G.doTrack=doTrack; G.expandDetail=expandDetail; G.expandPinDetail=expandPinDetail;
  G.submitRating=submitRating; G.selectStar=selectStar;
  G.loadFaq=loadFaq; G.searchFaq=searchFaq; G.toggleFaq=toggleFaq;
  G.loadAdminTickets=loadAdminTickets; G.addComment=addComment; G.togglePin=togglePin;
  G.submitUpdate=submitUpdate; G.deleteTicket=deleteTicket;
  G.filterByCategory=filterByCategory; G.expandAdminDetail=expandAdminDetail;
  G.selectTicketFilter=selectTicketFilter; G.setFilter=setFilter;
  G.loadReport=loadReport; G.selectReportType=selectReportType;
  G.printReport=printReport; G.showUserReport=showUserReport; G.closeUserReport=closeUserReport;
  G.loadSuperAdmin=loadSuperAdmin; G.showSATab=showSATab;
  G.addNews=addNews; G.editNews=editNews; G.updateNews=updateNews; G.deleteNews=deleteNews;
  G.addFaq=addFaq; G.editFaq=editFaq; G.updateFaq=updateFaq; G.deleteFaq=deleteFaq;
  G.addAdmin=addAdmin; G.handleNewsImageSelect=handleNewsImageSelect;
  G.clearNewsImg=clearNewsImg; G.clearExistingImg=clearExistingImg;
  G.toggleDropdown=toggleDropdown; G.dismissGuestBanner=dismissGuestBanner;
  G.resetComplaintTypeSelection=()=>{};
  G.mgmtSlide=(dir)=>{if(window._mgmtGoTo)window._mgmtGoTo(dir);};
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
    if (saved.role==='superadmin') updateMenuForSuperAdmin();
    else if (saved.role==='admin') updateMenuForAdmin();
    else updateMenuForUser();
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.voc-dropdown-wrap')) {
      document.querySelectorAll('.voc-dropdown-menu.open').forEach(m=>m.classList.remove('open'));
      document.querySelectorAll('.voc-dropdown-arrow.rotated').forEach(a=>a.classList.remove('rotated'));
    }
  });

  const loginPairs=[['login-user','login-pass',doLogin],['admin-user','admin-pass',doAdminLogin]];
  loginPairs.forEach(([f1,f2,fn])=>{const e1=document.getElementById(f1);const e2=document.getElementById(f2);if(e1)e1.addEventListener('keydown',e=>{if(e.key==='Enter'&&e2)e2.focus();});if(e2)e2.addEventListener('keydown',e=>{if(e.key==='Enter')fn();});});

  const regFields=['reg-firstname','reg-lastname','reg-email','reg-phone','reg-username','reg-pass','reg-pass2'];
  regFields.forEach((id,idx)=>{const el=document.getElementById(id);if(!el)return;el.addEventListener('input', clearFieldErrors);if(idx<regFields.length-1)el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const nx=document.getElementById(regFields[idx+1]);if(nx)nx.focus();}});});
  ['v-name','v-sid','v-subject','v-detail'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',updatePortalStepValidation);});
  const pw=document.getElementById('reg-pass'); if(pw)pw.addEventListener('input',updateStrengthBar);
  const lastReg=document.getElementById('reg-pass2'); if(lastReg)lastReg.addEventListener('keydown',e=>{if(e.key==='Enter')doRegister();});
  const ti=document.getElementById('track-input'); if(ti)ti.addEventListener('keydown',e=>{if(e.key==='Enter')doTrack();});
  const fs=document.getElementById('faq-search'); if(fs)fs.addEventListener('keydown',e=>{if(e.key==='Enter')searchFaq();});

  if(window.initMgmtSlider) window.initMgmtSlider();
  navigateTo('home');
};

// ════ MGMT SLIDER (ต้องอยู่หลัง INIT section เพื่อให้ window.initMgmtSlider พร้อมก่อน onload) ════
(function () {
  const MGMT_PEOPLE = [
    { img:'/img/คณะผู้บริหารคณะวิทย์/wilaiwan.png',    name:'ผศ.ดร.วิไลวัลย์ แก้วตาทิพย์',   pos:'คณบดีคณะวิทยาศาสตร์เทคโนโลยีและการเกษตร' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/ดาว.png',         name:'ผศ.ดร.ปัทมา พิศภักดิ์',          pos:'รองคณบดีฝ่ายบริหารและเครือข่ายสัมพันธ์' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/ely(nw).png',     name:'ผศ.ดร.อีลีหย๊ะ สนิโซ',           pos:'รองคณบดีฝ่ายวิจัย บริการวิชาการและกิจการนักศึกษา' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/อาบีดีน.png',     name:'ผศ.ดร.อาบีดีน ดะแซสาเมาะ',      pos:'รองคณบดีฝ่ายวิชาการและพัฒนาคุณภาพบัณฑิต' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/1759376222_.png',  name:'นางอธิพร สมจิตต์',               pos:'รักษาการในตำแหน่งผู้อำนวยการสำนักงานคณบดี' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/zl.png',           name:'ผศ.ดร.อิมรอน มีชัย',             pos:'ผู้ช่วยคณบดี ฝ่ายการสรรหานักศึกษาเชิงรุก' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/Screenshot 2025_09_24 153629.png', name:'ผศ.รอมลี เจะดอเลาะ', pos:'ผู้ช่วยคณบดี ฝ่ายการประเมินผลกระทบการบริการวิชาการ' },
    { img:'/img/คณะผู้บริหารคณะวิทย์/Gemini_Generated_Image_z9sopgz9sopgz9so_removebg_preview.png', name:'อ.ดร.อดุลย์สมาน สุขแก้ว', pos:'ผู้ช่วยคณบดี ฝ่ายงานวิเทศสัมพันธ์และการสื่อสารองค์กร' },
  ];
  let current=0, timer=null, slides=[];

  function buildSlides() {
    const track=document.getElementById('mgmt-h-track'); if(!track)return;
    track.innerHTML='';
    slides=MGMT_PEOPLE.map(p=>{
      const div=document.createElement('div'); div.className='mgmt-h-item';
      div.innerHTML=`<img class="mgmt-h-img" src="${p.img}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="mgmt-h-img-fallback" style="display:none;"><i class="fas fa-user-tie"></i></div>`;
      track.appendChild(div); return div;
    });
    updateInfo(0);
  }
  function updateInfo(idx) {
    const nameEl=document.getElementById('mgmt-h-name'); const posEl=document.getElementById('mgmt-h-pos');
    if(!nameEl||!posEl)return;
    const p=MGMT_PEOPLE[idx]; if(!p)return;
    nameEl.style.opacity='0'; posEl.style.opacity='0';
    setTimeout(()=>{nameEl.textContent=p.name;posEl.textContent=p.pos;nameEl.style.opacity='1';posEl.style.opacity='1';},220);
  }
  function buildDots() {
    const dotsEl=document.getElementById('mgmt-dots'); if(!dotsEl)return; dotsEl.innerHTML='';
    MGMT_PEOPLE.forEach((_,i)=>{const d=document.createElement('div');d.className='mgmt-dot'+(i===0?' active':'');d.onclick=()=>goTo(i);dotsEl.appendChild(d);});
  }
  function updateDots() {
    const dotsEl=document.getElementById('mgmt-dots'); if(!dotsEl)return;
    dotsEl.querySelectorAll('.mgmt-dot').forEach((d,i)=>d.classList.toggle('active',i===current));
  }
  function goTo(idx) {
    if(!slides.length)return;
    current=(idx+MGMT_PEOPLE.length)%MGMT_PEOPLE.length;
    const track=document.getElementById('mgmt-h-track');
    if(track)track.style.transform=`translateX(-${current*100}%)`;
    updateDots(); updateInfo(current);
  }
  function startAuto(){stopAuto();timer=setInterval(()=>goTo(current+1),3500);}
  function stopAuto(){if(timer){clearInterval(timer);timer=null;}}

  window.initMgmtSlider=function(){
    buildSlides(); buildDots(); startAuto();
    const panel=document.querySelector('.hero-mgmt-panel');
    if(panel){panel.addEventListener('mouseenter',stopAuto);panel.addEventListener('mouseleave',startAuto);}
    const track=document.getElementById('mgmt-h-track');
    if(track){let tx=0;track.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{passive:true});track.addEventListener('touchend',e=>{const diff=tx-e.changedTouches[0].clientX;if(Math.abs(diff)>40)goTo(current+(diff>0?1:-1));});}
  };
  window._mgmtGoTo=function(dir){goTo(current+dir);};
})();
