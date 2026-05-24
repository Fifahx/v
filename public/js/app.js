// public/js/app.js — VOC System v4
'use strict';

let currentStep = 1;
let currentUser = null;
let vocData = { cType:'นักศึกษา', priority:'medium', category:'ข้อเสนอแนะหลักสูตร' };
let ratingSelection = 0;
const ALL_PAGES = ['home','login','register','portal','tracking','admin-dashboard','admin-tickets','admin-reviews'];

// ═══════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════
const api = {
  async post(url, body) {
    const r = await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    return r.json();
  },
  async patch(url, body) {
    const r = await fetch(url,{ method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    return r.json();
  },
  async get(url) { return (await fetch(url)).json(); },
};

// ═══════════════════════════════════════
//  MODAL SYSTEM (ข้อ 9 — สวยงาม)
// ═══════════════════════════════════════
function showAlert(icon, title, msg) {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns"><button class="voc-btn-ok" id="voc-ok">ตกลง</button></div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-ok').onclick = () => { document.body.removeChild(o); r(true); };
  });
}

function showConfirm(icon, title, msg, type='warning') {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns">
        <button class="voc-btn-cancel" id="voc-c">ยกเลิก</button>
        <button class="voc-btn-ok${type==='danger'?' danger':''}" id="voc-ok">ยืนยัน</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-c').onclick  = () => { document.body.removeChild(o); r(false); };
    document.getElementById('voc-ok').onclick = () => { document.body.removeChild(o); r(true); };
  });
}

// ═══════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════
function navigateTo(pageId) {
  if (pageId==='portal' && !currentUser) pageId='login';
  ALL_PAGES.forEach(p => { const e=document.getElementById('page-'+p); if(e) e.classList.add('hidden'); });
  document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-'+pageId);
  if (page) page.classList.remove('hidden');
  const nav = document.getElementById('nav-'+pageId);
  if (nav) nav.classList.add('active');
  if (pageId==='portal')           { setupPortalView(); changeStep(1); }
  if (pageId==='admin-dashboard')  loadDashboard();
  if (pageId==='admin-tickets')    loadAdminTickets('pending');
  if (pageId==='admin-reviews')    loadReviews();
  if (pageId==='tracking') {
    document.getElementById('track-result').innerHTML='';
    document.getElementById('track-input').value='';
    if (currentUser && currentUser.role!=='admin') loadMyTickets();
  }
  if (pageId==='home') loadPinnedTickets();
  window.scrollTo(0,0);
}

function setupPortalView() {
  const w=document.getElementById('portal-login-warning');
  const f=document.getElementById('portal-form-content');
  if (currentUser && currentUser.role!=='admin') {
    w.classList.add('hidden'); f.classList.remove('hidden');
    const nf=document.getElementById('v-name');
    if(nf&&currentUser.firstname) nf.value=(currentUser.firstname||'')+' '+(currentUser.lastname||'');
  } else if (currentUser && currentUser.role==='admin') {
    w.classList.remove('hidden');
    w.innerHTML='<i class="fas fa-info-circle"></i><span>ผู้ดูแลระบบไม่สามารถแจ้งเรื่องได้</span>';
    f.classList.add('hidden');
  } else { w.classList.remove('hidden'); f.classList.add('hidden'); }
}

// ═══════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════
function saveSession(u)  { try{localStorage.setItem('voc_session',JSON.stringify(u));}catch(e){} }
function clearSession()  { try{localStorage.removeItem('voc_session');}catch(e){} }
function loadSession()   { try{const r=localStorage.getItem('voc_session');return r?JSON.parse(r):null;}catch(e){return null;} }

// ═══════════════════════════════════════
//  AUTH LOGIN (ข้อ 7 — Enter key)
// ═══════════════════════════════════════
async function doLogin() {
  const u=document.getElementById('login-user').value.trim();
  const p=document.getElementById('login-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');return;}
  const btn=document.getElementById('btn-login');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';
  try {
    const res=await api.post('/api/auth',{action:'loginUser',username:u,password:p});
    if(res.success){currentUser=res;saveSession(res);updateMenuForUser();navigateTo('home');}
    else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message);
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยัน';}
}

function showAdminLoginModal(){document.getElementById('admin-modal').classList.remove('hidden');}
function hideAdminLoginModal(){document.getElementById('admin-modal').classList.add('hidden');}

async function doAdminLogin() {
  const u=document.getElementById('admin-user').value.trim();
  const p=document.getElementById('admin-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');return;}
  const btn=document.getElementById('btn-admin-login');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังตรวจสอบ...';
  try {
    const res=await api.post('/api/auth',{action:'loginAdmin',username:u,password:p});
    if(res.success){currentUser=res;saveSession(res);hideAdminLoginModal();updateMenuForAdmin();navigateTo('admin-dashboard');}
    else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message);
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='เข้าสู่ระบบ';}
}

// ═══════════════════════════════════════
//  REGISTER + VALIDATION
// ═══════════════════════════════════════
function clearFieldErrors() {
  document.querySelectorAll('#page-register .field-err').forEach(e=>e.remove());
  document.querySelectorAll('#page-register input').forEach(e=>e.classList.remove('input-error'));
}
function showFieldError(id,msg) {
  const el=document.getElementById(id); if(!el)return;
  el.classList.add('input-error');
  const e=document.createElement('p'); e.className='field-err';
  e.innerHTML=`<i class="fas fa-exclamation-circle"></i>${msg}`;
  el.parentNode.appendChild(e); el.focus();
}
function checkPasswordStrength(pw) {
  let s=0;
  if(pw.length>=8)s++; if(pw.length>=12)s++;
  if(/[A-Z]/.test(pw))s++; if(/[0-9]/.test(pw))s++;
  if(/[^a-zA-Z0-9]/.test(pw))s++;
  return s;
}
function updateStrengthBar() {
  const pw=document.getElementById('reg-pass').value;
  const bar=document.getElementById('pw-bar'), lbl=document.getElementById('pw-label');
  if(!bar)return;
  const s=checkPasswordStrength(pw);
  const lv=[
    {p:'0%',c:'#eee',t:''},
    {p:'20%',c:'#d00000',t:'อ่อนมาก'},{p:'40%',c:'#f77f00',t:'อ่อน'},
    {p:'60%',c:'#e7e71b',t:'พอใช้'},{p:'80%',c:'#40916c',t:'ดี'},
    {p:'100%',c:'#2d6a4f',t:'แข็งแกร่ง'},
  ][s]||{p:'0%',c:'#eee',t:''};
  bar.style.width=lv.p; bar.style.background=lv.c;
  lbl.innerText=lv.t; lbl.style.color=lv.c;
}
function validateRegister() {
  clearFieldErrors();
  const fn=document.getElementById('reg-firstname').value.trim();
  const ln=document.getElementById('reg-lastname').value.trim();
  const em=document.getElementById('reg-email').value.trim();
  const ph=document.getElementById('reg-phone').value.trim();
  const un=document.getElementById('reg-username').value.trim();
  const pw=document.getElementById('reg-pass').value;
  const p2=document.getElementById('reg-pass2').value;
  if(!fn){showFieldError('reg-firstname','กรุณากรอกชื่อ');return false;}
  if(!ln){showFieldError('reg-lastname','กรุณากรอกนามสกุล');return false;}
  if(!em||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){showFieldError('reg-email','รูปแบบอีเมลไม่ถูกต้อง');return false;}
  if(ph){
    if(!/^\d+$/.test(ph)){showFieldError('reg-phone','เบอร์โทรต้องเป็นตัวเลขเท่านั้น');return false;}
    if(ph.length<9||ph.length>10){showFieldError('reg-phone','เบอร์โทรต้องมี 9-10 หลัก');return false;}
  }
  if(!un){showFieldError('reg-username','กรุณากำหนดชื่อผู้ใช้');return false;}
  if(un.length<4){showFieldError('reg-username','ชื่อผู้ใช้ต้องอย่างน้อย 4 ตัว');return false;}
  if(!/^[a-zA-Z0-9_]+$/.test(un)){showFieldError('reg-username','ใช้ได้เฉพาะ a-z, 0-9 และ _');return false;}
  if(!pw){showFieldError('reg-pass','กรุณากรอกรหัสผ่าน');return false;}
  if(pw.length<8){showFieldError('reg-pass','รหัสผ่านต้องอย่างน้อย 8 ตัว');return false;}
  if(!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(pw)){showFieldError('reg-pass','ต้องมีทั้งตัวอักษรและตัวเลข');return false;}
  if(checkPasswordStrength(pw)<2){showFieldError('reg-pass','รหัสผ่านอ่อนเกินไป');return false;}
  if(pw!==p2){showFieldError('reg-pass2','รหัสผ่านไม่ตรงกัน');return false;}
  return true;
}
async function doRegister() {
  if(!validateRegister())return;
  const btn=document.getElementById('btn-register');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังลงทะเบียน...';
  try {
    const res=await api.post('/api/auth',{
      action:'register',
      firstname:document.getElementById('reg-firstname').value.trim(),
      lastname:document.getElementById('reg-lastname').value.trim(),
      email:document.getElementById('reg-email').value.trim(),
      lineId:document.getElementById('reg-line').value.trim(),
      phone:document.getElementById('reg-phone').value.trim(),
      username:document.getElementById('reg-username').value.trim(),
      password:document.getElementById('reg-pass').value,
    });
    if(res.success){await showAlert('✅','ลงทะเบียนสำเร็จ','กรุณาเข้าสู่ระบบเพื่อใช้งาน');navigateTo('login');}
    else await showAlert('❌','ไม่สำเร็จ',res.message);
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยันการลงทะเบียน';}
}

// ═══════════════════════════════════════
//  MENU
// ═══════════════════════════════════════
function updateMenuForUser() {
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')">คู่มือ</a>`;
  document.getElementById('right-menu').innerHTML=`
    <span class="user-badge" onclick="showProfile()" title="ดูโปรไฟล์ของฉัน" style="cursor:pointer;">
      <i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}
      <i class="fas fa-chevron-down" style="font-size:.65rem;opacity:.7;margin-left:2px;"></i>
    </span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;" title="ออกจากระบบ"><i class="fas fa-sign-out-alt"></i></a>`;
}
function updateMenuForAdmin() {
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a>
    <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a>
    <a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a>`;
  document.getElementById('right-menu').innerHTML=`
    <span class="user-badge"><i class="fas fa-shield-alt"></i>${currentUser.fullname||'Admin'}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}
async function doLogout() {
  if(!await showConfirm('🚪','ออกจากระบบ','ต้องการออกจากระบบใช่หรือไม่?'))return;
  currentUser=null; clearSession();
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home" class="active">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="alert('คู่มืออยู่ด้านล่างหน้าแรก')">คู่มือ</a>`;
  document.getElementById('right-menu').innerHTML=`
    <a onclick="navigateTo('login')" class="nav-menu" style="color:#fff;">เข้าสู่ระบบ</a>
    <a onclick="navigateTo('register')" class="btn-nav-active nav-menu">ลงทะเบียน</a>`;
  navigateTo('home');
}

// ═══════════════════════════════════════
//  PROFILE (ข้อ 8 — แก้ email/phone/line)
// ═══════════════════════════════════════
async function showProfile() {
  if(!currentUser)return;
  try {
    const res=await api.get(`/api/profile?username=${encodeURIComponent(currentUser.username)}`);
    const p=res.success?res.profile:currentUser;
    const ini=(p.firstname||'?')[0].toUpperCase();
    const o=document.createElement('div'); o.className='voc-overlay'; o.id='profile-overlay';
    o.innerHTML=`
      <div class="voc-modal-box" style="max-width:500px;max-height:90vh;overflow-y:auto;">
        <div class="profile-avatar">${ini}</div>
        <div class="voc-modal-title">${p.firstname||''} ${p.lastname||''}</div>
        <div style="text-align:center;margin-bottom:18px;">
          <span style="background:#e8f5e9;color:#2d6a4f;padding:3px 14px;border-radius:20px;font-size:.8rem;font-weight:700;">
            @${p.username||''}
          </span>
        </div>

        <!-- ข้อมูลที่แก้ไม่ได้ -->
        <div style="background:#f8f8f8;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:.74rem;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">ข้อมูลบัญชี</div>
          <div class="profile-grid">
            <div><div class="label">Username</div><div class="value">${p.username||'-'}</div></div>
            <div><div class="label">สมัครเมื่อ</div><div class="value">${p.registeredAt||'-'}</div></div>
            <div><div class="label">สถานะ</div><div class="value"><span style="color:#2d6a4f;">● ${p.status||'active'}</span></div></div>
          </div>
        </div>

        <!-- ข้อมูลที่แก้ได้ -->
        <div style="border:1.5px solid #e0f0e8;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          <div style="font-size:.74rem;color:#2d6a4f;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">
            <i class="fas fa-edit"></i> ข้อมูลที่แก้ไขได้
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <div class="label" style="margin-bottom:4px;">📧 อีเมล</div>
              <input class="profile-edit-field" id="pe-email" value="${p.email||''}" placeholder="email@example.com">
            </div>
            <div>
              <div class="label" style="margin-bottom:4px;">📱 เบอร์โทรศัพท์</div>
              <input class="profile-edit-field" id="pe-phone" value="${p.phone||''}" placeholder="0xxxxxxxxx" maxlength="10">
            </div>
            <div>
              <div class="label" style="margin-bottom:4px;">💬 Line ID</div>
              <input class="profile-edit-field" id="pe-line" value="${p.lineId||''}" placeholder="Line ID">
            </div>
          </div>
        </div>

        <div class="voc-modal-btns">
          <button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('profile-overlay'))">ปิด</button>
          <button class="voc-btn-ok" onclick="saveProfile('${p.username||''}')"><i class="fas fa-save"></i> บันทึก</button>
        </div>
      </div>`;
    document.body.appendChild(o);
  } catch(e){ await showAlert('❌','เกิดข้อผิดพลาด',e.message); }
}

async function saveProfile(username) {
  const email  = document.getElementById('pe-email').value.trim();
  const phone  = document.getElementById('pe-phone').value.trim();
  const lineId = document.getElementById('pe-line').value.trim();
  try {
    const res = await api.patch('/api/profile',{username, email, phone, lineId});
    if(res.success){
      await showAlert('✅','บันทึกสำเร็จ','อัปเดตข้อมูลเรียบร้อยแล้ว');
      const o=document.getElementById('profile-overlay');
      if(o) document.body.removeChild(o);
    } else {
      await showAlert('❌','ไม่สำเร็จ',res.message);
    }
  } catch(e){ await showAlert('❌','เกิดข้อผิดพลาด',e.message); }
}

// ═══════════════════════════════════════
//  VOC FORM
// ═══════════════════════════════════════
function changeStep(step) {
  currentStep=step;
  for(let i=1;i<=4;i++){
    document.getElementById('step-content-'+i).classList.add('hidden');
    document.getElementById('node'+i).classList.remove('active');
  }
  document.getElementById('success-area').classList.add('hidden');
  document.getElementById('step-content-'+step).classList.remove('hidden');
  for(let i=1;i<=step;i++) document.getElementById('node'+i).classList.add('active');
}
function setOption(el,key,val){
  el.parentElement.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected'); vocData[key]=val;
}
function toggleAnon(){
  document.getElementById('identity-fields').style.opacity=
    document.getElementById('isAnon').checked?'0.3':'1';
}

// ── REVIEW CARD (ข้อ 5) ──
function prepareReview() {
  const subject=document.getElementById('v-subject').value.trim();
  const detail =document.getElementById('v-detail').value.trim();
  if(!subject){showAlert('⚠️','กรุณากรอกหัวข้อ','หัวข้อเรื่องเป็นข้อมูลจำเป็น');return;}
  if(!detail) {showAlert('⚠️','กรุณากรอกรายละเอียด','รายละเอียดเป็นข้อมูลจำเป็น');return;}
  const isAnon=document.getElementById('isAnon').checked;
  const name  =isAnon?'ไม่ระบุตัวตน':document.getElementById('v-name').value;
  const pMap  ={high:{label:'🔴 เร่งด่วน',sub:'ภายใน 24 ชม.',cls:'high'},medium:{label:'🟡 ปานกลาง',sub:'ภายใน 3 วัน',cls:'medium'},low:{label:'🟢 ทั่วไป',sub:'ภายใน 7 วัน',cls:'low'}};
  const pInfo =pMap[vocData.priority]||pMap.medium;
  document.getElementById('review-area').innerHTML=`
    <div class="review-card">
      <div class="review-card-header">
        <h3>📋 ตรวจสอบข้อมูลก่อนส่ง</h3>
        <p>กรุณาตรวจสอบความถูกต้องของข้อมูลทั้งหมดก่อนยืนยันการส่ง</p>
      </div>
      <div class="review-section">
        <div class="review-section-title">ข้อมูลผู้แจ้ง</div>
        <div class="review-row"><span class="ri">👤</span><span class="rl">ประเภท</span><span class="rv">${vocData.cType}</span></div>
        <div class="review-row"><span class="ri">🪪</span><span class="rl">ตัวตน</span><span class="rv">${name}</span></div>
      </div>
      <div class="review-section">
        <div class="review-section-title">รายละเอียดเรื่อง</div>
        <div class="review-row"><span class="ri">🏷️</span><span class="rl">ประเภท</span><span class="rv">${vocData.category}</span></div>
        <div class="review-row"><span class="ri">⚡</span><span class="rl">ความด่วน</span><span class="rv"><span class="priority-pill ${pInfo.cls}">${pInfo.label}</span> <small style="color:#888;">${pInfo.sub}</small></span></div>
        <div class="review-row"><span class="ri">📌</span><span class="rl">หัวข้อ</span><span class="rv" style="font-weight:700;">${subject}</span></div>
      </div>
      <div class="review-section">
        <div class="review-section-title">รายละเอียด</div>
        <div style="background:#f8faf9;border-radius:8px;padding:12px;font-size:.9rem;color:#444;line-height:1.65;">${detail}</div>
      </div>
    </div>`;
  changeStep(4);
}

async function finalSubmit() {
  if(!await showConfirm('📋','ยืนยันการส่งเรื่อง','ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้<br>ต้องการส่งเรื่องนี้ใช่หรือไม่?'))return;
  const btn=document.getElementById('btn-final');
  btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...'; btn.disabled=true;
  try {
    const res=await api.post('/api/submit',{
      customerType:vocData.cType, isAnon:document.getElementById('isAnon').checked,
      name:document.getElementById('v-name').value, studentId:document.getElementById('v-sid').value,
      categories:[vocData.category], priority:vocData.priority,
      subject:document.getElementById('v-subject').value, detail:document.getElementById('v-detail').value,
      username:currentUser?currentUser.username:'',
    });
    if(res.success){
      document.getElementById('step-content-4').classList.add('hidden');
      document.getElementById('success-area').classList.remove('hidden');
      document.getElementById('new-ticket-id').innerText=res.ticketId;
    } else { await showAlert('❌','ส่งไม่สำเร็จ',res.error||'เกิดข้อผิดพลาด'); }
  } catch(e){ await showAlert('❌','เกิดข้อผิดพลาด',e.message); }
  finally{ btn.innerHTML='ยืนยันการส่งเรื่อง'; btn.disabled=false; }
}

// ═══════════════════════════════════════
//  PINNED TICKETS (ข้อ 1 — progress bar)
// ═══════════════════════════════════════
function buildProgressBar(status) {
  const steps=['รอดำเนินการ','กำลังดำเนินการ','เสร็จสิ้น'];
  const isRejected = status==='ปฏิเสธ';
  if(isRejected){
    return `<div style="margin-top:12px;padding:8px 12px;background:#fde8e8;border-radius:8px;color:#d00000;font-size:.82rem;font-weight:700;text-align:center;">
      ❌ ปฏิเสธคำร้อง
    </div>`;
  }
  const cur=steps.indexOf(status);
  const pct=cur<0?0:Math.round((cur/(steps.length-1))*100);
  const stepsHtml=steps.map((s,i)=>`
    <div class="prog-step">
      <div class="prog-dot ${i<cur?'done':i===cur?'active':''}">${i<cur?'✓':(i+1)}</div>
      <div class="prog-label ${i===cur?'active':''}">${s}</div>
    </div>`).join('');
  return `<div class="ticket-progress">
    <div class="progress-steps">
      <div class="progress-fill-bar" style="width:${pct}%"></div>
      ${stepsHtml}
    </div>
  </div>`;
}

async function loadPinnedTickets() {
  const container=document.getElementById('pinned-tickets-section');
  if(!container)return;
  try {
    const res=await api.get('/api/tickets?action=pinned');
    if(res.success&&res.tickets&&res.tickets.length>0){
      container.classList.remove('hidden');
      const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
      let html=`<div class="section-title" style="margin-bottom:14px;"><h2 style="font-size:1.05rem;"><i class="fas fa-thumbtack" style="color:var(--dgreen);"></i> ประกาศ / ติดตามสถานะ</h2></div>`;
      res.tickets.forEach(t=>{
        html+=`<div class="ticket-card" style="border-left-color:#e7e71b;">
          <div class="ticket-card-header">
            <div><span class="ticket-id">${t['Ticket ID']}</span></div>
            <span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span>
          </div>
          <div class="ticket-card-body">
            <div class="ticket-subject">${t['หัวข้อ']||'-'}</div>
            ${buildProgressBar(t['สถานะ'])}
          </div>
          <div class="ticket-card-footer">
            <span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||''}</span>
            <span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
          </div>
          ${t['หมายเหตุ']?`<div class="ticket-feedback-box" style="margin:0 20px 14px;"><strong>💬 หมายเหตุ:</strong> ${t['หมายเหตุ']}</div>`:''}
        </div>`;
      });
      container.innerHTML=html;
    } else { container.classList.add('hidden'); }
  } catch(e){ container.classList.add('hidden'); }
}

// ═══════════════════════════════════════
//  TRACKING (ข้อ 4 — ticket card ใหม่)
// ═══════════════════════════════════════
async function loadMyTickets() {
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const res=await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`);
    if(res.success&&res.tickets&&res.tickets.length>0) renderTicketCards(res.tickets,true);
    else resDiv.innerHTML=`<div style="text-align:center;padding:40px;color:#aaa;">
      <i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;display:block;margin-bottom:12px;"></i>
      <p style="margin-bottom:16px;">คุณยังไม่มีประวัติการร้องเรียน</p>
      <button onclick="navigateTo('portal')" style="padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;font-weight:700;">
        <i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่
      </button></div>`;
  } catch(e){ resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}

async function doTrack() {
  const val=document.getElementById('track-input').value.trim();
  if(!val){await showAlert('⚠️','กรุณากรอก Ticket ID','ตัวอย่าง: VOC-2568-0001');return;}
  if(!val.toUpperCase().startsWith('VOC-')){
    await showAlert('⚠️','รูปแบบไม่ถูกต้อง','กรุณากรอก Ticket ID ที่ขึ้นต้นด้วย VOC-<br><small style="color:#888;">เพื่อความปลอดภัย ค้นหาได้เฉพาะ Ticket ID เท่านั้น</small>');
    return;
  }
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังค้นหา...</p></div>';
  try {
    const res=await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val.toUpperCase())}`);
    if(res.success) renderTicketCards([res.ticket],false);
    else resDiv.innerHTML=`<p style="color:#d00000;text-align:center;padding:30px;"><i class="fas fa-search"></i> ไม่พบ Ticket ID นี้</p>`;
  } catch(e){ resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}

function renderTicketCards(tickets, showRating=false) {
  const resDiv=document.getElementById('track-result');
  const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pChipCls={'high':'orange','medium':'orange','low':'green'};
  let html=`<p style="color:#888;margin-bottom:16px;font-size:.88rem;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t=>{
    const isDone=t['สถานะ']==='เสร็จสิ้น';
    const ratingHtml=showRating&&isDone?buildRatingBox(t['Ticket ID']):'';
    html+=`<div class="ticket-card">
      <div class="ticket-card-header">
        <div>
          <div class="ticket-id"><i class="fas fa-ticket-alt" style="font-size:.8rem;margin-right:4px;"></i>${t['Ticket ID']}</div>
        </div>
        <span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span>
      </div>
      <div class="ticket-card-body">
        <div class="ticket-subject">${t['หัวข้อ']||'-'}</div>
        <div class="ticket-detail">${t['รายละเอียด']||''}</div>
        <div class="ticket-meta-chips" style="margin-top:10px;">
          ${t['ประเภทเรื่อง']?`<span class="chip blue"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>`:''}
          ${t['ความเร่งด่วน']?`<span class="chip ${pChipCls[t['ความเร่งด่วน']]||''}">${pLabel[t['ความเร่งด่วน']]||t['ความเร่งด่วน']}</span>`:''}
          ${t['ประเภทผู้แจ้ง']?`<span class="chip"><i class="fas fa-user"></i>${t['ประเภทผู้แจ้ง']}</span>`:''}
        </div>
        ${buildProgressBar(t['สถานะ'])}
      </div>
      <div class="ticket-card-footer">
        <span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||'-'}</span>
        <span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span>
        <span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
      </div>
      ${t['หมายเหตุ']?`<div class="ticket-feedback-box"><strong>💬 หมายเหตุ:</strong> ${t['หมายเหตุ']}</div>`:''}
      ${ratingHtml}
    </div>`;
  });
  resDiv.innerHTML=html;
}

// ═══════════════════════════════════════
//  RATING SYSTEM (ข้อ 2)
// ═══════════════════════════════════════
function buildRatingBox(ticketId) {
  return `<div class="rating-box" id="rbox-${ticketId}">
    <h4>⭐ ให้คะแนนการบริการ</h4>
    <div class="star-row" id="stars-${ticketId}">
      ${[1,2,3,4,5].map(i=>`<button class="star-btn dim" data-score="${i}" onclick="selectStar('${ticketId}',${i})">⭐</button>`).join('')}
    </div>
    <textarea class="rating-comment" id="rc-${ticketId}" rows="2" placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"></textarea>
    <button class="btn-rate" onclick="submitRating('${ticketId}')"><i class="fas fa-paper-plane"></i> ส่งคะแนน</button>
  </div>`;
}
function selectStar(ticketId, score) {
  ratingSelection=score;
  const row=document.getElementById('stars-'+ticketId);
  if(!row)return;
  row.querySelectorAll('.star-btn').forEach((b,i)=>{
    b.classList.toggle('lit',i<score);
    b.classList.toggle('dim',i>=score);
    b.style.transform=i<score?'scale(1.1)':'scale(1)';
  });
}
async function submitRating(ticketId) {
  if(!ratingSelection||ratingSelection<1){await showAlert('⚠️','กรุณาเลือกคะแนน','กรุณากดดาวก่อนส่งคะแนน');return;}
  const comment=document.getElementById('rc-'+ticketId).value.trim();
  try {
    const res=await api.post('/api/ratings',{ticketId,username:currentUser?.username||'',score:ratingSelection,comment});
    if(res.success){
      const box=document.getElementById('rbox-'+ticketId);
      if(box) box.innerHTML=`<div style="text-align:center;padding:16px;color:#2d6a4f;font-weight:700;">
        ✅ ขอบคุณสำหรับการให้คะแนน! คุณให้ ${'⭐'.repeat(ratingSelection)} สำหรับ Ticket นี้
      </div>`;
      ratingSelection=0;
    } else { await showAlert('ℹ️','แจ้งเตือน',res.message); }
  } catch(e){ await showAlert('❌','เกิดข้อผิดพลาด',e.message); }
}

// ═══════════════════════════════════════
//  ADMIN REVIEWS (ข้อ 3)
// ═══════════════════════════════════════
async function loadReviews() {
  const container=document.getElementById('review-content');
  if(!container)return;
  container.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const [allRes, sumRes]=await Promise.all([
      api.get('/api/ratings?action=all'),
      api.get('/api/ratings?action=summary'),
    ]);
    renderReviews(allRes.ratings||[], sumRes.summary||{avg:0,total:0,dist:{}});
  } catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}

function renderReviews(ratings, summary) {
  const container=document.getElementById('review-content');
  const avg=summary.avg||0;
  const total=summary.total||0;
  const dist=summary.dist||{};
  const starsDisplay='⭐'.repeat(Math.round(avg))+'☆'.repeat(5-Math.round(avg));
  let sumHtml=`
    <div class="rating-summary" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div class="rating-avg">${avg}</div>
          <div class="rating-stars-display">${starsDisplay}</div>
          <div style="font-size:.82rem;color:#888;">${total} รีวิวทั้งหมด</div>
        </div>
        <div style="flex:1;min-width:200px;">
          ${[5,4,3,2,1].map(s=>{
            const cnt=dist[s]||0;
            const pct=total?Math.round(cnt/total*100):0;
            return `<div class="rating-dist-row">
              <div class="star-label">${s} ⭐</div>
              <div class="bar-track"><div class="bar-fill orange" style="width:${pct}%"></div></div>
              <div class="bar-count">${cnt}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  if(!ratings.length){
    container.innerHTML=sumHtml+'<div class="no-tickets"><i class="fas fa-star" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ยังไม่มีรีวิว</p></div>';
    return;
  }
  let html=sumHtml;
  ratings.forEach(r=>{
    const stars='⭐'.repeat(r.score)+'☆'.repeat(5-r.score);
    html+=`<div style="background:#fff;border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div>
          <span style="font-weight:700;color:var(--dgreen);font-family:monospace;">${r.ticketId}</span>
          <span style="font-size:1.1rem;margin-left:8px;">${stars}</span>
        </div>
        <span style="font-size:.78rem;color:#aaa;">${r.date||''}</span>
      </div>
      <div style="font-size:.84rem;color:#888;margin-bottom:4px;"><i class="fas fa-user"></i> ${r.username||'ไม่ระบุ'}</div>
      ${r.comment?`<div style="background:#f8f8f8;border-radius:8px;padding:10px 12px;font-size:.88rem;color:#444;margin-top:8px;border-left:3px solid #e0e0e0;">${r.comment}</div>`:''}
    </div>`;
  });
  container.innerHTML=html;
}

// ═══════════════════════════════════════
//  ADMIN DASHBOARD (ข้อ 6)
// ═══════════════════════════════════════
async function loadDashboard() {
  document.getElementById('dash-content').innerHTML=
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดข้อมูล...</p></div>';
  try {
    const [dashRes, sumRes]=await Promise.all([
      api.get('/api/dashboard'),
      api.get('/api/ratings?action=summary'),
    ]);
    if(dashRes.success) renderDashboard(dashRes.stats, sumRes.summary||{avg:0,total:0});
    else document.getElementById('dash-content').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';
  } catch(e){ document.getElementById('dash-content').innerHTML=`<p style="color:red;">${e.message}</p>`; }
}

function renderDashboard(s, ratingSummary) {
  const maxCat=Math.max(...Object.values(s.byCategory),1);
  const maxCus=Math.max(...Object.values(s.byCustomer),1);
  const maxMon=Math.max(...Object.values(s.byMonth),1);
  let catBars='',cusBars='',monBars='',urgentHtml='';

  Object.entries(s.byCategory).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    catBars+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxCat*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byCustomer).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    cusBars+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v/maxCus*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byMonth).sort().slice(-6).forEach(([k,v])=>{
    monBars+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill blue" style="width:${Math.round(v/maxMon*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });

  if(s.urgentTickets&&s.urgentTickets.length>0){
    urgentHtml=`<div class="urgent-banner">
      <h4><i class="fas fa-exclamation-triangle"></i> ⚠️ มี ${s.urgentTickets.length} เรื่องเร่งด่วนที่ยังไม่เสร็จ</h4>
      ${s.urgentTickets.map(t=>`<div class="urgent-item">
        <span class="priority-badge p-high">🔴 เร่งด่วน</span>
        <strong>${t.ticketId}</strong>
        <span style="flex:1;">${t.subject}</span>
        <span style="color:#888;font-size:.79rem;">กำหนด: ${t.due||'-'}</span>
      </div>`).join('')}
    </div>`;
  }

  const successRate=s.total>0?Math.round(s.done/s.total*100):0;

  document.getElementById('dash-content').innerHTML=`
    ${urgentHtml}

    <!-- stat cards -->
    <div class="dash-grid">
      <div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">📋 ทั้งหมด</div></div>
      <div class="stat-card orange"><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">⏳ รอดำเนินการ</div></div>
      <div class="stat-card blue"><div class="stat-num" style="color:#3a86ff;">${s.inprogress}</div><div class="stat-label">🔄 กำลังดำเนินการ</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">✅ เสร็จสิ้น</div></div>
    </div>

    <!-- ความเร่งด่วน -->
    <div class="priority-stat-grid">
      <div class="pstat-card high"><div class="pstat-num" style="color:#d00000;">${s.byPriority.high||0}</div><div class="pstat-label" style="color:#d00000;">🔴 เร่งด่วน</div></div>
      <div class="pstat-card medium"><div class="pstat-num" style="color:#b25f00;">${s.byPriority.medium||0}</div><div class="pstat-label" style="color:#b25f00;">🟡 ปานกลาง</div></div>
      <div class="pstat-card low"><div class="pstat-num" style="color:#2d6a4f;">${s.byPriority.low||0}</div><div class="pstat-label" style="color:#2d6a4f;">🟢 ทั่วไป</div></div>
    </div>

    <!-- overview + rating -->
    <div class="dash-charts" style="margin-bottom:18px;">
      <div class="chart-card">
        <h4><i class="fas fa-tachometer-alt"></i> ภาพรวมระบบ</h4>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:.83rem;color:#888;margin-bottom:5px;"><span>อัตราสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;">${successRate}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${successRate}%"></div></div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:.83rem;color:#888;margin-bottom:5px;"><span>กำลังดำเนินการ</span><span style="font-weight:700;color:#3a86ff;">${s.total>0?Math.round((s.inprogress)/s.total*100):0}%</span></div>
          <div class="bar-track"><div class="bar-fill blue" style="width:${s.total>0?Math.round(s.inprogress/s.total*100):0}%"></div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:.83rem;color:#888;margin-bottom:5px;"><span>ปฏิเสธ</span><span style="font-weight:700;color:#d00000;">${s.total>0?Math.round(s.rejected/s.total*100):0}%</span></div>
          <div class="bar-track"><div class="bar-fill red" style="width:${s.total>0?Math.round(s.rejected/s.total*100):0}%"></div></div>
        </div>
      </div>
      <div class="chart-card" style="text-align:center;">
        <h4><i class="fas fa-star"></i> คะแนนความพึงพอใจ</h4>
        <div style="font-size:3.5rem;font-weight:800;color:var(--dgreen);line-height:1;">${ratingSummary.avg||'-'}</div>
        <div style="font-size:1.5rem;margin:6px 0;">${'⭐'.repeat(Math.round(ratingSummary.avg||0))}${'☆'.repeat(5-Math.round(ratingSummary.avg||0))}</div>
        <div style="font-size:.83rem;color:#888;">${ratingSummary.total||0} รีวิวทั้งหมด</div>
        <button onclick="navigateTo('admin-reviews')" style="margin-top:14px;padding:7px 18px;background:var(--dgreen);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.85rem;">
          ดูรีวิวทั้งหมด
        </button>
      </div>
    </div>

    <!-- charts -->
    <div class="dash-charts">
      <div class="chart-card"><h4><i class="fas fa-tags"></i> แยกตามประเภทเรื่อง</h4>${catBars||'<p style="color:#bbb;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
      <div class="chart-card"><h4><i class="fas fa-users"></i> แยกตามประเภทผู้แจ้ง</h4>${cusBars||'<p style="color:#bbb;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>
    </div>
    <div class="chart-card" style="margin-bottom:18px;"><h4><i class="fas fa-calendar-alt"></i> รายเดือน (6 เดือนล่าสุด)</h4>${monBars||'<p style="color:#bbb;font-size:.88rem;">ยังไม่มีข้อมูล</p>'}</div>

    <!-- ข้อ 4/5 — สรุปข้อมูลทั้งหมดแบบละเอียด -->
    <div class="chart-card summary-table-card" style="margin-bottom:18px;">
      <h4><i class="fas fa-table"></i> สรุปข้อมูลการส่งเรื่องร้องเรียนทั้งหมด</h4>
      <div style="overflow-x:auto;">
        <table class="summary-table">
          <thead>
            <tr>
              <th>รายการ</th><th>จำนวน</th><th>สัดส่วน</th><th>แนวโน้ม</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><span class="tbl-dot" style="background:#888;"></span>ทั้งหมด</td><td><strong>${s.total}</strong></td><td>100%</td><td>—</td></tr>
            <tr><td><span class="tbl-dot" style="background:#f77f00;"></span>รอดำเนินการ</td><td><strong>${s.pending}</strong></td><td>${s.total?Math.round(s.pending/s.total*100):0}%</td><td><span style="color:#f77f00;">⏳</span></td></tr>
            <tr><td><span class="tbl-dot" style="background:#3a86ff;"></span>กำลังดำเนินการ</td><td><strong>${s.inprogress}</strong></td><td>${s.total?Math.round(s.inprogress/s.total*100):0}%</td><td><span style="color:#3a86ff;">🔄</span></td></tr>
            <tr class="tbl-success"><td><span class="tbl-dot" style="background:#2d6a4f;"></span>เสร็จสิ้น</td><td><strong>${s.done}</strong></td><td>${s.total?Math.round(s.done/s.total*100):0}%</td><td><span style="color:#2d6a4f;">✅</span></td></tr>
            <tr><td><span class="tbl-dot" style="background:#d00000;"></span>ปฏิเสธ</td><td><strong>${s.rejected}</strong></td><td>${s.total?Math.round(s.rejected/s.total*100):0}%</td><td><span style="color:#d00000;">❌</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ข้อ 6 — สรุปความเร่งด่วนละเอียด -->
    <div class="chart-card priority-detail-card" style="margin-bottom:18px;">
      <h4><i class="fas fa-exclamation-circle"></i> สรุปความเร่งด่วนของ Tickets</h4>
      <div class="priority-detail-grid">
        <div class="priority-detail-box high">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:1.4rem;">🔴</span>
            <div>
              <div style="font-weight:800;font-size:1.5rem;color:#d00000;">${s.byPriority.high||0}</div>
              <div style="font-size:.78rem;color:#d00000;font-weight:700;">เร่งด่วน (ภายใน 24 ชม.)</div>
            </div>
          </div>
          <div class="bar-track"><div class="bar-fill red" style="width:${s.total?Math.round((s.byPriority.high||0)/s.total*100):0}%"></div></div>
          <div style="font-size:.75rem;color:#d00000;margin-top:4px;font-weight:700;">${s.total?Math.round((s.byPriority.high||0)/s.total*100):0}% ของทั้งหมด</div>
        </div>
        <div class="priority-detail-box medium">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:1.4rem;">🟡</span>
            <div>
              <div style="font-weight:800;font-size:1.5rem;color:#b25f00;">${s.byPriority.medium||0}</div>
              <div style="font-size:.78rem;color:#b25f00;font-weight:700;">ปานกลาง (ภายใน 3 วัน)</div>
            </div>
          </div>
          <div class="bar-track"><div class="bar-fill orange" style="width:${s.total?Math.round((s.byPriority.medium||0)/s.total*100):0}%"></div></div>
          <div style="font-size:.75rem;color:#b25f00;margin-top:4px;font-weight:700;">${s.total?Math.round((s.byPriority.medium||0)/s.total*100):0}% ของทั้งหมด</div>
        </div>
        <div class="priority-detail-box low">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:1.4rem;">🟢</span>
            <div>
              <div style="font-weight:800;font-size:1.5rem;color:#2d6a4f;">${s.byPriority.low||0}</div>
              <div style="font-size:.78rem;color:#2d6a4f;font-weight:700;">ทั่วไป (ภายใน 7 วัน)</div>
            </div>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${s.total?Math.round((s.byPriority.low||0)/s.total*100):0}%"></div></div>
          <div style="font-size:.75rem;color:#2d6a4f;margin-top:4px;font-weight:700;">${s.total?Math.round((s.byPriority.low||0)/s.total*100):0}% ของทั้งหมด</div>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════
//  ADMIN TICKETS
// ═══════════════════════════════════════
function setFilter(id){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  const e=document.getElementById('filter-'+id); if(e)e.classList.add('active');
}
async function loadAdminTickets(filter){
  document.getElementById('admin-ticket-list').innerHTML=
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try {
    const [tr,nr]=await Promise.all([
      api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`),
      api.get('/api/notify?action=getEmail'),
    ]);
    const ce=nr.success?(nr.email||''):'';
    if(tr.success) renderAdminTickets(tr.tickets,ce);
    else document.getElementById('admin-ticket-list').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';
  } catch(e){ document.getElementById('admin-ticket-list').innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
async function saveNotifyEmail(){
  const email=document.getElementById('notify-email-input').value.trim();
  if(!email){await showAlert('⚠️','กรุณากรอก email','');return;}
  const btn=document.getElementById('btn-save-notify');
  btn.disabled=true; btn.innerHTML='บันทึก...';
  try {
    const res=await api.post('/api/notify',{action:'setEmail',email});
    if(res.success) await showAlert('✅','บันทึกสำเร็จ',`จะส่งแจ้งเตือนไปที่ ${email}`);
    else await showAlert('❌','ไม่สำเร็จ',res.message);
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> บันทึก';}
}

function renderAdminTickets(tickets, currentEmail){
  const container=document.getElementById('admin-ticket-list');
  const po={'high':0,'medium':1,'low':2};
  tickets.sort((a,b)=>(po[a['ความเร่งด่วน']]??9)-(po[b['ความเร่งด่วน']]??9));
  const scColor={'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
  const scTag  ={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const pLabel ={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pClass ={'high':'p-high','medium':'p-medium','low':'p-low'};

  // ข้อ 6 — นับ priority ของ tickets ที่แสดงอยู่
  const pCount={high:0,medium:0,low:0};
  tickets.forEach(t=>{ const p=t['ความเร่งด่วน']||'low'; if(pCount[p]!==undefined)pCount[p]++; });
  const urgentActive=tickets.filter(t=>t['ความเร่งด่วน']==='high'&&t['สถานะ']!=='เสร็จสิ้น'&&t['สถานะ']!=='ปฏิเสธ').length;

  let html=`<div class="notify-box">
    <h4><i class="fas fa-bell"></i> ตั้งค่า Email รับแจ้งเตือน</h4>
    <div class="notify-row">
      <input type="email" id="notify-email-input" placeholder="admin@gmail.com" value="${currentEmail}">
      <button class="btn-notify" id="btn-save-notify" onclick="saveNotifyEmail()"><i class="fas fa-save"></i> บันทึก</button>
    </div>
    ${currentEmail?`<p style="font-size:.8rem;color:#2d6a4f;margin-top:8px;"><i class="fas fa-check-circle"></i> ส่งแจ้งเตือนไปที่ ${currentEmail}</p>`:''}
  </div>

  <!-- ข้อ 6 — Priority Summary Bar -->
  <div class="manage-priority-summary">
    <div class="mps-title"><i class="fas fa-exclamation-circle"></i> สรุปความเร่งด่วน (${tickets.length} รายการ)</div>
    <div class="mps-grid">
      <div class="mps-box high ${urgentActive>0?'pulse':''}">
        <div class="mps-icon">🔴</div>
        <div class="mps-count">${pCount.high}</div>
        <div class="mps-label">เร่งด่วน</div>
        ${urgentActive>0?`<div class="mps-alert">${urgentActive} ยังไม่เสร็จ!</div>`:'<div class="mps-ok">✓ ครบแล้ว</div>'}
      </div>
      <div class="mps-box medium">
        <div class="mps-icon">🟡</div>
        <div class="mps-count">${pCount.medium}</div>
        <div class="mps-label">ปานกลาง</div>
      </div>
      <div class="mps-box low">
        <div class="mps-icon">🟢</div>
        <div class="mps-count">${pCount.low}</div>
        <div class="mps-label">ทั่วไป</div>
      </div>
    </div>
    ${urgentActive>0?`<div class="mps-warning"><i class="fas fa-exclamation-triangle"></i> มี <strong>${urgentActive} รายการเร่งด่วน</strong> ที่ยังไม่ได้ดำเนินการ! กรุณาดำเนินการโดยด่วน</div>`:''}
  </div>`;
  if(!tickets.length){
    container.innerHTML=html+'<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ไม่มีเรื่องในหมวดนี้</p></div>';
    return;
  }
  html+=`<p style="color:#888;margin-bottom:14px;font-size:.86rem;">แสดง ${tickets.length} รายการ (เรียงตามความเร่งด่วน)</p>`;
  tickets.forEach(t=>{
    const tid=t['Ticket ID'], pr=t['ความเร่งด่วน']||'low', isHigh=pr==='high';
    const isPinned=String(t['Pinned']||'').toLowerCase()==='true';
    html+=`<div class="admin-ticket-card ${scColor[t['สถานะ']]||'pending'} ${isHigh?'priority-high':''}" id="card-${tid}">
      <div class="admin-card-top">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          ${isHigh?'<span title="เร่งด่วนมาก">🚨</span>':''}
          <span class="ticket-id" style="font-size:.97rem;">${tid}</span>
          <span style="font-size:.72rem;color:#bbb;">ID:${t['UserID']||'-'}</span>
          <span class="priority-badge ${pClass[pr]||'p-low'}">${pLabel[pr]||pr}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="status ${scTag[t['สถานะ']]||'status-pending'}">${t['สถานะ']}</span>
          <button id="pin-btn-${tid}" onclick="togglePin('${tid}',${!isPinned})"
            style="padding:3px 9px;border-radius:8px;border:1px solid ${isPinned?'#2d6a4f':'#ddd'};
            background:${isPinned?'#e8f5e9':'#fff'};font-size:.74rem;
            color:${isPinned?'#2d6a4f':'#aaa'};font-family:'Sarabun',sans-serif;">
            <i class="fas fa-thumbtack"></i>${isPinned?'แสดงอยู่':'ปักหมุด'}
          </button>
        </div>
      </div>
      <div style="font-size:.97rem;font-weight:700;margin-bottom:10px;">${t['หัวข้อ']||'-'}</div>
      <div class="admin-card-meta">
        <span><strong>ประเภทผู้แจ้ง:</strong> ${t['ประเภทผู้แจ้ง']||'-'}</span>
        <span><strong>ชื่อ:</strong> ${t['ชื่อ']||'-'}</span>
        <span><strong>รหัส/หน่วยงาน:</strong> ${t['รหัสนักศึกษา/หน่วยงาน']||'-'}</span>
        <span><strong>ประเภทเรื่อง:</strong> ${t['ประเภทเรื่อง']||'-'}</span>
        <span><strong>วันที่แจ้ง:</strong> ${t['วันที่แจ้ง']||'-'}</span>
        <span><strong>กำหนดตอบกลับ:</strong> ${t['กำหนดตอบกลับ']||'-'}</span>
      </div>
      <div class="detail-box">${t['รายละเอียด']||'(ไม่มีรายละเอียด)'}</div>
      ${t['หมายเหตุ']?`<div class="ticket-feedback-box" style="margin-bottom:12px;"><strong>หมายเหตุเดิม:</strong> ${t['หมายเหตุ']}</div>`:''}
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
  container.innerHTML=html;
}

async function togglePin(tid,ns){
  if(!await showConfirm('📌',ns?'ปักหมุดบนหน้าหลัก':'ยกเลิกการปักหมุด',
    ns?'ticket นี้จะแสดงให้ผู้ใช้ทั่วไปเห็น':'ยกเลิกการแสดงบนหน้าหลัก'))return;
  try {
    const res=await api.post('/api/tickets',{action:'togglePin',ticketId:tid,pinned:ns});
    if(res.success){
      const btn=document.getElementById(`pin-btn-${tid}`);
      if(btn){
        btn.style.border=`1px solid ${ns?'#2d6a4f':'#ddd'}`;
        btn.style.background=ns?'#e8f5e9':'#fff';
        btn.style.color=ns?'#2d6a4f':'#aaa';
        btn.innerHTML=`<i class="fas fa-thumbtack"></i>${ns?'แสดงอยู่':'ปักหมุด'}`;
        btn.setAttribute('onclick',`togglePin('${tid}',${!ns})`);
      }
    }
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

async function submitUpdate(tid){
  const ns=document.getElementById('status-'+tid).value;
  const as=document.getElementById('assignee-'+tid).value;
  const fb=document.getElementById('feedback-'+tid).value;
  if(!await showConfirm('💾','ยืนยันการบันทึก',`Ticket: <strong>${tid}</strong><br>สถานะใหม่: <strong>${ns}</strong>`))return;
  const btn=document.querySelector(`#card-${tid} .btn-update`);
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
  try {
    const res=await api.post('/api/tickets',{action:'update',ticketId:tid,newStatus:ns,assignee:as,feedback:fb});
    if(res.success){
      const card=document.getElementById('card-'+tid);
      card.style.transition='background .4s'; card.style.background='#d4edda';
      setTimeout(()=>{card.style.background='';},1500);
      const sTag={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
      const scTag={'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
      card.querySelector('.status').className='status '+(sTag[ns]||'status-pending');
      card.querySelector('.status').innerText=ns;
      card.className=`admin-ticket-card ${scTag[ns]||'pending'}`;
    } else { await showAlert('❌','บันทึกไม่สำเร็จ',res.message||''); }
  } catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.innerHTML='<i class="fas fa-save"></i> บันทึก'; btn.disabled=false;}
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
window.onload = function() {
  const saved=loadSession();
  if(saved&&saved.success){
    currentUser=saved;
    if(saved.role==='admin') updateMenuForAdmin();
    else updateMenuForUser();
  }

  // ข้อ 7 — Enter key สำหรับ login และ register
  const loginSetup=()=>{
    const lu=document.getElementById('login-user');
    const lp=document.getElementById('login-pass');
    if(lu) lu.addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('login-pass').focus(); });
    if(lp) lp.addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
    const au=document.getElementById('admin-user');
    const ap=document.getElementById('admin-pass');
    if(au) au.addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('admin-pass').focus(); });
    if(ap) ap.addEventListener('keydown',e=>{ if(e.key==='Enter') doAdminLogin(); });
  };

  const regSetup=()=>{
    const fields=['reg-firstname','reg-lastname','reg-email','reg-phone','reg-username','reg-pass','reg-pass2'];
    fields.forEach((id,idx)=>{
      const el=document.getElementById(id);
      if(!el)return;
      el.addEventListener('input',clearFieldErrors);
      if(idx<fields.length-1){
        el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const next=document.getElementById(fields[idx+1]); if(next) next.focus(); }});
      }
    });
    const last=document.getElementById('reg-pass2');
    if(last) last.addEventListener('keydown',e=>{ if(e.key==='Enter') doRegister(); });
    const pw=document.getElementById('reg-pass');
    if(pw) pw.addEventListener('input',updateStrengthBar);
  };

  loginSetup();
  regSetup();
  navigateTo('home');
};
