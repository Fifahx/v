// public/js/app.js — VOC System v5
'use strict';

let currentStep=1, currentUser=null, ratingSelection=0;
let vocData={cType:'นักศึกษา',priority:'medium',category:'ข้อเสนอแนะหลักสูตร'};
let attachedFile=null;

const ALL_PAGES=['home','login','register','portal','tracking',
  'faq','admin-dashboard','admin-tickets','admin-reviews','admin-report','user-report','superadmin'];
let currentReportType='service';

// ═══ API ═══
const api={
  async post(url,body){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return r.json();
  },
  async patch(url,body){
    const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return r.json();
  },
  async get(url){return(await fetch(url)).json();},
};

// ═══ MODAL ═══
function showAlert(icon,title,msg){
  return new Promise(r=>{
    const o=document.createElement('div'); o.className='voc-overlay';
    o.innerHTML=`<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns"><button class="voc-btn-ok" id="voc-ok">ตกลง</button></div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-ok').onclick=()=>{document.body.removeChild(o);r(true);};
  });
}
function showConfirm(icon,title,msg,type='warning'){
  return new Promise(r=>{
    const o=document.createElement('div'); o.className='voc-overlay';
    o.innerHTML=`<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns">
        <button class="voc-btn-cancel" id="voc-c">ยกเลิก</button>
        <button class="voc-btn-ok${type==='danger'?' danger':''}" id="voc-ok">ยืนยัน</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-c').onclick=()=>{document.body.removeChild(o);r(false);};
    document.getElementById('voc-ok').onclick=()=>{document.body.removeChild(o);r(true);};
  });
}

// ═══ NAVIGATION ═══
function navigateTo(pageId){
  if(pageId==='portal'&&!currentUser)pageId='login';
  ALL_PAGES.forEach(p=>{const e=document.getElementById('page-'+p);if(e)e.classList.add('hidden');});
  document.querySelectorAll('.nav-menu a').forEach(a=>a.classList.remove('active'));
  const page=document.getElementById('page-'+pageId);
  if(page)page.classList.remove('hidden');
  const nav=document.getElementById('nav-'+pageId);
  if(nav)nav.classList.add('active');
  if(pageId==='portal'){setupPortalView();changeStep(1);}
  if(pageId==='admin-dashboard')loadDashboard();
  if(pageId==='admin-report')loadReport(currentReportType);
  if(pageId==='admin-tickets')loadAdminTickets('pending');
  if(pageId==='admin-reviews')loadReviews();
  if(pageId==='superadmin')loadSuperAdmin();
  if(pageId==='faq')loadFaq();
  if(pageId==='tracking'){
    document.getElementById('track-result').innerHTML='';
    document.getElementById('track-input').value='';
    if(currentUser&&currentUser.role!=='admin'&&currentUser.role!=='superadmin')loadMyTickets();
  }
  if(pageId==='home'){loadPinnedTickets();loadNewsStrip();}
  window.scrollTo(0,0);
}
function setupPortalView(){
  const w=document.getElementById('portal-login-warning');
  const f=document.getElementById('portal-form-content');
  if(currentUser&&currentUser.role==='user'){
    w.classList.add('hidden'); f.classList.remove('hidden');
    const nf=document.getElementById('v-name');
    if(nf&&currentUser.firstname) nf.value=(currentUser.firstname||'')+' '+(currentUser.lastname||'');
  } else if(currentUser&&(currentUser.role==='admin'||currentUser.role==='superadmin')){
    w.classList.remove('hidden');
    w.innerHTML='<i class="fas fa-info-circle"></i><span>ผู้ดูแลระบบไม่สามารถแจ้งเรื่องได้</span>';
    f.classList.add('hidden');
  } else { w.classList.remove('hidden'); f.classList.add('hidden'); }
}

// ═══ SESSION ═══
function saveSession(u){try{localStorage.setItem('voc_session',JSON.stringify(u));}catch(e){}}
function clearSession(){try{localStorage.removeItem('voc_session');}catch(e){}}
function loadSession(){try{const r=localStorage.getItem('voc_session');return r?JSON.parse(r):null;}catch(e){return null;}}

// ═══ AUTH ═══
async function doLogin(){
  const u=document.getElementById('login-user').value.trim();
  const p=document.getElementById('login-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');return;}
  const btn=document.getElementById('btn-login');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';
  try{
    const res=await api.post('/api/auth',{action:'loginUser',username:u,password:p});
    if(res.success){currentUser=res;saveSession(res);updateMenuForUser();navigateTo('home');}
    else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยัน';}
}

function showAdminLoginModal(){document.getElementById('admin-modal').classList.remove('hidden');}
function hideAdminLoginModal(){document.getElementById('admin-modal').classList.add('hidden');}

// ── superadmin modal ถูกรวมเข้า admin modal แล้ว (ข้อ 1) ──
// ยังคง function นี้ไว้เพื่อ backward compat กับ HTML เก่า
function showSuperAdminLoginModal(){ showAdminLoginModal(); }

// doAdminLogin — unified: ตรวจ superadmin ก่อนอัตโนมัติ (ข้อ 1)
async function doAdminLogin(){
  const u=document.getElementById('admin-user').value.trim();
  const p=document.getElementById('admin-pass').value;
  if(!u||!p){await showAlert('⚠️','กรุณากรอกข้อมูล','');return;}
  const btn=document.getElementById('btn-admin-login');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังตรวจสอบ...';
  try{
    // action:'loginAdmin' ตรวจ superadmin ก่อน แล้วจึง admin (ดู auth.js v6)
    const res=await api.post('/api/auth',{action:'loginAdmin',username:u,password:p});
    if(res.success){
      currentUser=res; saveSession(res); hideAdminLoginModal();
      if(res.role==='superadmin'){updateMenuForSuperAdmin();navigateTo('superadmin');}
      else{updateMenuForAdmin();navigateTo('admin-dashboard');}
    } else await showAlert('❌','เข้าสู่ระบบไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='เข้าสู่ระบบ';}
}

// ═══ REGISTER ═══
function clearFieldErrors(){
  document.querySelectorAll('#page-register .field-err').forEach(e=>e.remove());
  document.querySelectorAll('#page-register input').forEach(e=>e.classList.remove('input-error'));
}
function showFieldError(id,msg){
  const el=document.getElementById(id); if(!el)return;
  el.classList.add('input-error');
  const e=document.createElement('p'); e.className='field-err';
  e.innerHTML=`<i class="fas fa-exclamation-circle"></i>${msg}`;
  el.parentNode.appendChild(e); el.focus();
}
function checkPasswordStrength(pw){
  let s=0;
  if(pw.length>=8)s++; if(pw.length>=12)s++;
  if(/[A-Z]/.test(pw))s++; if(/[0-9]/.test(pw))s++;
  if(/[^a-zA-Z0-9]/.test(pw))s++;
  return s;
}
function updateStrengthBar(){
  const pw=document.getElementById('reg-pass')?.value||'';
  const bar=document.getElementById('pw-bar'); const lbl=document.getElementById('pw-label');
  if(!bar)return;
  const s=checkPasswordStrength(pw);
  const lv=[{p:'0%',c:'#eee',t:''},{p:'20%',c:'#d00000',t:'อ่อนมาก'},{p:'40%',c:'#f77f00',t:'อ่อน'},
    {p:'60%',c:'#e7e71b',t:'พอใช้'},{p:'80%',c:'#40916c',t:'ดี'},{p:'100%',c:'#2d6a4f',t:'แข็งแกร่ง'}][s]||{p:'0%',c:'#eee',t:''};
  bar.style.width=lv.p; bar.style.background=lv.c; lbl.innerText=lv.t; lbl.style.color=lv.c;
}
function validateRegister(){
  clearFieldErrors();
  const fn=document.getElementById('reg-firstname')?.value.trim();
  const ln=document.getElementById('reg-lastname')?.value.trim();
  const em=document.getElementById('reg-email')?.value.trim();
  const ph=document.getElementById('reg-phone')?.value.trim();
  const un=document.getElementById('reg-username')?.value.trim();
  const pw=document.getElementById('reg-pass')?.value;
  const p2=document.getElementById('reg-pass2')?.value;
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
async function doRegister(){
  if(!validateRegister())return;
  const btn=document.getElementById('btn-register');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังลงทะเบียน...';
  try{
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
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.disabled=false;btn.innerHTML='ยืนยันการลงทะเบียน';}
}

// ═══ MENU ═══
function updateMenuForUser(){
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="navigateTo('faq')" id="nav-faq">คำถามที่พบบ่อย</a>`;
  document.getElementById('right-menu').innerHTML=`
    <span class="user-badge" onclick="showProfile()" title="โปรไฟล์">
      <i class="fas fa-user-circle"></i>${currentUser.firstname} ${currentUser.lastname}
    </span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}
function updateMenuForAdmin(){
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a>
    <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a>
    <a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a>
    <a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a>
    <a onclick="navigateTo('faq')" id="nav-faq">FAQ</a>`;
  document.getElementById('right-menu').innerHTML=`
    <span class="user-badge"><i class="fas fa-shield-alt"></i>${currentUser.fullname||'Admin'}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}
function updateMenuForSuperAdmin(){
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home">หน้าหลัก</a>
    <a onclick="navigateTo('admin-dashboard')" id="nav-admin-dashboard">สถิติ</a>
    <a onclick="navigateTo('admin-tickets')" id="nav-admin-tickets">จัดการเรื่อง</a>
    <a onclick="navigateTo('admin-reviews')" id="nav-admin-reviews">รีวิว</a>
    <a onclick="navigateTo('admin-report')" id="nav-admin-report">รายงาน</a>
    <a onclick="navigateTo('superadmin')" id="nav-superadmin">⚙️ ระบบ</a>`;
  document.getElementById('right-menu').innerHTML=`
    <span class="user-badge superadmin-badge"><i class="fas fa-crown" style="color:#f0a500;"></i>${currentUser.fullname||'SuperAdmin'}</span>
    <a onclick="doLogout()" style="color:#fff;cursor:pointer;font-size:13px;"><i class="fas fa-sign-out-alt"></i></a>`;
}
async function doLogout(){
  if(!await showConfirm('🚪','ออกจากระบบ','ต้องการออกจากระบบใช่หรือไม่?'))return;
  currentUser=null; clearSession();
  document.getElementById('main-nav').innerHTML=`
    <a onclick="navigateTo('home')" id="nav-home" class="active">หน้าหลัก</a>
    <a onclick="navigateTo('portal')" id="nav-portal">แจ้งเรื่อง</a>
    <a onclick="navigateTo('tracking')" id="nav-tracking">ติดตามสถานะ</a>
    <a onclick="navigateTo('faq')" id="nav-faq">คำถามที่พบบ่อย</a>`;
  document.getElementById('right-menu').innerHTML=`
    <a onclick="navigateTo('login')" class="nav-menu" style="color:#fff;">เข้าสู่ระบบ</a>
    <a onclick="navigateTo('register')" class="btn-nav-active nav-menu">ลงทะเบียน</a>`;
  navigateTo('home');
}

// ═══ PROFILE (แก้ email/phone/line) ═══
async function showProfile(){
  if(!currentUser)return;
  try{
    const res=await api.get(`/api/profile?username=${encodeURIComponent(currentUser.username)}`);
    const p=res.success?res.profile:currentUser;
    const ini=(p.firstname||'?')[0].toUpperCase();
    const o=document.createElement('div'); o.className='voc-overlay'; o.id='profile-overlay';
    o.innerHTML=`<div class="voc-modal-box" style="max-width:500px;">
      <div class="profile-avatar">${ini}</div>
      <div class="voc-modal-title">${p.firstname||''} ${p.lastname||''}</div>
      <div style="text-align:center;margin-bottom:16px;">
        <span style="background:#e8f5e9;color:#2d6a4f;padding:3px 14px;border-radius:20px;font-size:.8rem;font-weight:700;">@${p.username||''}</span>
      </div>
      <div style="background:#f8f8f8;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:.72rem;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">ข้อมูลบัญชี</div>
        <div class="profile-grid">
          <div><div class="label">Username</div><div class="value">${p.username||'-'}</div></div>
          <div><div class="label">สมัครเมื่อ</div><div class="value">${p.registeredAt||'-'}</div></div>
        </div>
      </div>
      <div style="border:1.5px solid #e0f0e8;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:.72rem;color:#2d6a4f;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;"><i class="fas fa-edit"></i> แก้ไขได้</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div><div class="label" style="margin-bottom:4px;">📧 อีเมล</div><input class="profile-edit-field" id="pe-email" value="${p.email||''}" placeholder="email@example.com"></div>
          <div><div class="label" style="margin-bottom:4px;">📱 เบอร์โทรศัพท์</div><input class="profile-edit-field" id="pe-phone" value="${p.phone||''}" placeholder="0xxxxxxxxx" maxlength="10"></div>
          <div><div class="label" style="margin-bottom:4px;">💬 Line ID</div><input class="profile-edit-field" id="pe-line" value="${p.lineId||''}" placeholder="Line ID"></div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:14px;">
        <button onclick="showUserReport('${p.username||''}')" style="width:100%;padding:10px;background:#f0faf5;border:1.5px solid var(--dgreen);border-radius:10px;color:var(--dgreen);font-family:'Sarabun',sans-serif;font-size:.92rem;font-weight:700;cursor:pointer;"><i class="fas fa-chart-pie"></i> ดูรายงานสรุปการใช้บริการของฉัน</button>
      </div>
      <div class="voc-modal-btns">
        <button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('profile-overlay'))">ปิด</button>
        <button class="voc-btn-ok" onclick="saveProfile('${p.username||''}')"><i class="fas fa-save"></i> บันทึก</button>
      </div>
    </div>`;
    document.body.appendChild(o);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}
async function saveProfile(username){
  const email=document.getElementById('pe-email').value.trim();
  const phone=document.getElementById('pe-phone').value.trim();
  const lineId=document.getElementById('pe-line').value.trim();
  try{
    const res=await api.patch('/api/profile',{username,email,phone,lineId});
    if(res.success){
      await showAlert('✅','บันทึกสำเร็จ','อัปเดตข้อมูลเรียบร้อยแล้ว');
      const o=document.getElementById('profile-overlay'); if(o)document.body.removeChild(o);
    } else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ═══ VOC FORM ═══
function changeStep(step){
  currentStep=step;
  for(let i=1;i<=4;i++){
    document.getElementById('step-content-'+i)?.classList.add('hidden');
    document.getElementById('node'+i)?.classList.remove('active');
  }
  document.getElementById('success-area')?.classList.add('hidden');
  document.getElementById('step-content-'+step)?.classList.remove('hidden');
  for(let i=1;i<=step;i++) document.getElementById('node'+i)?.classList.add('active');
}
function setOption(el,key,val){
  el.parentElement.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected'); vocData[key]=val;
}
function toggleAnon(){
  document.getElementById('identity-fields').style.opacity=
    document.getElementById('isAnon').checked?'0.3':'1';
}

// ── FILE ATTACH ──
function handleFileSelect(inputEl){
  // รองรับทั้ง element และ event
  const file = inputEl.files ? inputEl.files[0] : (inputEl.target ? inputEl.target.files[0] : null);
  const infoEl = document.getElementById('file-info');
  if(!file){ attachedFile=null; if(infoEl) infoEl.innerText=''; return; }
  const maxMB = 2;
  if(file.size > maxMB * 1024 * 1024){
    showAlert('⚠️','ไฟล์ใหญ่เกินไป',`ขนาดไฟล์ต้องไม่เกิน ${maxMB} MB`);
    inputEl.value=''; attachedFile=null; if(infoEl) infoEl.innerText=''; return;
  }
  attachedFile = file;
  if(infoEl) infoEl.innerHTML=`<i class="fas fa-check-circle" style="color:#2d6a4f;"></i> ${file.name} <span style="color:#aaa;">(${(file.size/1024).toFixed(1)} KB)</span>`;
}

// ── REVIEW CARD ──
function prepareReview(){
  const subject = document.getElementById('v-subject')?.value.trim();
  const detail  = document.getElementById('v-detail')?.value.trim();
  const note    = document.getElementById('v-note')?.value.trim() || '';
  if(!subject){ showAlert('⚠️','กรุณากรอกหัวข้อ','หัวข้อเรื่องเป็นข้อมูลจำเป็น'); return; }
  if(!detail)  { showAlert('⚠️','กรุณากรอกรายละเอียด','รายละเอียดเป็นข้อมูลจำเป็น'); return; }
  const isAnon   = document.getElementById('isAnon')?.checked;
  const name     = isAnon ? 'ไม่ระบุตัวตน (นิรนาม)' : (document.getElementById('v-name')?.value || '-');
  const sid      = isAnon ? '-' : (document.getElementById('v-sid')?.value || '-');
  const pMap = {
    high  : { label:'🔴 เร่งด่วน',  sub:'ภายใน 24 ชม.', cls:'high'   },
    medium: { label:'🟡 ปานกลาง',   sub:'ภายใน 3 วัน',  cls:'medium' },
    low   : { label:'🟢 ทั่วไป',    sub:'ภายใน 7 วัน',  cls:'low'    },
  };
  const pInfo = pMap[vocData.priority] || pMap.medium;
  // format detail ให้อ่านง่าย (เปลี่ยน \n เป็น <br>)
  const detailHtml = detail.replace(/\n/g,'<br>');
  document.getElementById('review-area').innerHTML = `
    <div class="review-card">
      <div class="review-card-header">
        <h3>📋 ตรวจสอบข้อมูลก่อนส่ง</h3>
        <p>กรุณาตรวจสอบความถูกต้องของข้อมูลทั้งหมดก่อนยืนยันการส่ง</p>
      </div>

      <div class="review-section">
        <div class="review-section-title">👤 ข้อมูลผู้แจ้ง</div>
        <div class="review-row"><span class="ri">🏷️</span><span class="rl">ประเภท</span><span class="rv">${vocData.cType}</span></div>
        <div class="review-row"><span class="ri">🪪</span><span class="rl">ชื่อ-นามสกุล</span><span class="rv">${name}</span></div>
        <div class="review-row"><span class="ri">🎓</span><span class="rl">รหัส/หน่วยงาน</span><span class="rv">${sid}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-title">📂 รายละเอียดเรื่อง</div>
        <div class="review-row"><span class="ri">📌</span><span class="rl">ประเภทเรื่อง</span><span class="rv">${vocData.category}</span></div>
        <div class="review-row"><span class="ri">⚡</span><span class="rl">ความเร่งด่วน</span>
          <span class="rv"><span class="priority-pill ${pInfo.cls}">${pInfo.label}</span>
          <small style="color:#999;margin-left:6px;">${pInfo.sub}</small></span>
        </div>
        <div class="review-row"><span class="ri">📝</span><span class="rl">หัวข้อ</span><span class="rv" style="font-weight:700;color:#222;">${subject}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-title">📄 รายละเอียด</div>
        <div style="background:#f8faf9;border-radius:10px;padding:14px;font-size:.9rem;color:#444;line-height:1.75;border-left:3px solid var(--dgreen);">${detailHtml}</div>
      </div>

      ${note ? `<div class="review-section">
        <div class="review-section-title">📝 หมายเหตุเพิ่มเติม</div>
        <div style="background:#fffbf0;border-radius:10px;padding:12px 14px;font-size:.88rem;color:#555;border-left:3px solid #f77f00;">${note}</div>
      </div>` : ''}

      ${attachedFile ? `<div class="review-section">
        <div class="review-section-title">📎 ไฟล์แนบ</div>
        <div style="font-size:.88rem;color:#2d6a4f;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-file-alt"></i> ${attachedFile.name}
          <span style="color:#aaa;font-size:.78rem;">(${(attachedFile.size/1024).toFixed(1)} KB)</span>
        </div>
      </div>` : ''}

      <div style="background:#e8f5e9;border-radius:10px;padding:12px 16px;margin:16px 24px;font-size:.82rem;color:#2d6a4f;">
        <i class="fas fa-info-circle"></i> ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้ กรุณาตรวจสอบให้ถูกต้องก่อนยืนยัน
      </div>
    </div>`;
  changeStep(4);
}

async function finalSubmit(){
  if(!await showConfirm('📋','ยืนยันการส่งเรื่อง','ข้อมูลที่ส่งไปแล้วไม่สามารถแก้ไขได้'))return;
  const btn=document.getElementById('btn-final');
  btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> กำลังส่ง...'; btn.disabled=true;
  try{
    const res=await api.post('/api/submit',{
      customerType:vocData.cType, isAnon:document.getElementById('isAnon').checked,
      name:document.getElementById('v-name').value, studentId:document.getElementById('v-sid').value,
      categories:[vocData.category], priority:vocData.priority,
      subject:document.getElementById('v-subject').value,
      detail:document.getElementById('v-detail').value,
      userNote:document.getElementById('v-note')?.value.trim()||'', // ข้อ 1
      fileName:attachedFile?attachedFile.name:'',                    // ข้อ 2
      username:currentUser?currentUser.username:'',
    });
    if(res.success){
      document.getElementById('step-content-4')?.classList.add('hidden');
      document.getElementById('success-area')?.classList.remove('hidden');
      document.getElementById('new-ticket-id').innerText=res.ticketId;
      attachedFile=null;
    } else await showAlert('❌','ส่งไม่สำเร็จ',res.error||'เกิดข้อผิดพลาด');
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{btn.innerHTML='<i class="fas fa-paper-plane"></i> ยืนยันการส่งเรื่อง';btn.disabled=false;}
}

// ═══ PROGRESS BAR 5 ขั้นตอน ═══
function buildProgressBar(status){
  // 5 ขั้นตอนตามที่กำหนด
  const steps=[
    'ส่งคำร้อง',
    'ตรวจสอบข้อมูล',
    'มอบหมายผู้ดูแล',
    'ดำเนินการ',
    'เสร็จสิ้น',
  ];
  // map สถานะ DB → index ที่ active (0-based, 0=ส่งคำร้องแล้ว)
  const statusMap={
    'รอดำเนินการ'   :1,  // ผ่าน "ส่งคำร้อง" → กำลัง "ตรวจสอบข้อมูล"
    'กำลังดำเนินการ':2,  // ผ่าน 2 ขั้น → กำลัง "มอบหมายผู้ดูแล"
    'รอตรวจสอบ'     :3,  // ผ่าน 3 ขั้น → กำลัง "ดำเนินการ"
    'เสร็จสิ้น'     :4,  // ครบทุกขั้น
    'ปฏิเสธ'        :-1,
  };
  if(status==='ปฏิเสธ')
    return `<div style="margin-top:12px;padding:10px 14px;background:#fde8e8;border-radius:10px;
      color:#d00000;font-size:.82rem;font-weight:700;text-align:center;border:1.5px solid #f5c6c6;">
      ❌ ไม่รับดำเนินการ / ปฏิเสธคำร้อง</div>`;
  // ถ้า status ไม่อยู่ใน map ให้ default = 0 (ส่งคำร้องแล้ว)
  const cur = statusMap[status] ?? 0;
  const pct = cur <= 0 ? 0 : Math.round((cur / (steps.length - 1)) * 100);
  const stepsHtml = steps.map((label, i) => {
    const isDone   = i < cur;
    const isActive = i === cur;
    const cls      = isDone ? 'done' : isActive ? 'active' : '';
    return `<div class="prog-step">
      <div class="prog-dot ${cls}">${isDone ? '✓' : (i + 1)}</div>
      <div class="prog-label ${cls}">${label}</div>
    </div>`;
  }).join('');
  return `<div class="ticket-progress">
    <div class="progress-steps">
      <div class="progress-fill-bar" style="width:${pct}%"></div>
      ${stepsHtml}
    </div>
  </div>`;
}

// ═══ NEWS STRIP (หน้าหลัก — card style พร้อมรูปภาพ) ═══
let _newsCache = []; // เก็บ news objects ไว้ใช้ใน showNewsDetail

async function loadNewsStrip(){
  const container=document.getElementById('news-strip-section');
  if(!container)return;
  try{
    const res=await api.get('/api/news');
    if(res.success&&res.news&&res.news.length>0){
      _newsCache = res.news; // cache ไว้
      container.classList.remove('hidden');
      const tagClass={ทั่วไป:'news-tag-default',ด่วน:'news-tag-urgent',ข้อมูล:'news-tag-info',กิจกรรม:'news-tag-event','ข่าวสำคัญ':'news-tag-urgent','การเรียนการสอน':'news-tag-info','ประกาศทั่วไป':'news-tag-default'};
      let html=`<div class="news-section-wrap">
        <div class="news-section-header">
          <i class="fas fa-newspaper"></i> ข่าวสารและประกาศ
        </div>
        <div class="news-card-grid">`;
      res.news.forEach((n, idx)=>{
        const tc=tagClass[n.tag]||'news-tag-default';
        const shortContent=n.content.length>120?n.content.substring(0,120)+'...':n.content;
        const imgHtml=n.imageUrl?`<div class="news-card-img"><img src="${n.imageUrl}" alt="" onerror="this.parentElement.style.display='none'"></div>`:'';
        // ใช้ index แทน JSON.stringify เพื่อหลีกเลี่ยง quote ชนกัน
        html+=`<div class="news-card" onclick="showNewsDetail(${idx})" style="cursor:pointer;">
          ${imgHtml}
          <div class="news-card-body">
            <span class="news-tag-pill ${tc}">${n.tag||'ทั่วไป'}</span>
            <div class="news-card-title">${n.title}</div>
            <div class="news-card-date"><i class="fas fa-clock"></i> ${n.date||''}</div>
            <div class="news-card-content">${shortContent}</div>
            <div class="news-read-more"><i class="fas fa-arrow-right"></i> อ่านเพิ่มเติม</div>
          </div>
        </div>`;
      });
      html+=`</div></div>`;
      container.innerHTML=html;
    } else { container.classList.add('hidden'); }
  }catch(e){ container.classList.add('hidden'); }
}


// ═══ NEWS DETAIL MODAL ═══
// รับ index ของ _newsCache แทน object โดยตรง (หลีกเลี่ยง quote ชนกันใน onclick)
function showNewsDetail(idx){
  const n = _newsCache[idx];
  if(!n) return;
  const existing = document.getElementById('news-detail-overlay');
  if(existing) document.body.removeChild(existing);
  const overlay=document.createElement('div');
  overlay.className='voc-overlay';
  overlay.id='news-detail-overlay';
  const imgBlock=n.imageUrl?
    `<div style="text-align:center;margin-bottom:18px;"><img src="${n.imageUrl}" alt="" style="max-width:100%;max-height:280px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'"></div>`:'';
  const contentHtml=(n.content||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  overlay.innerHTML=`<div class="voc-modal-box" style="max-width:680px;max-height:85vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <span class="news-tag">${n.tag||'ทั่วไป'}</span>
        <div style="font-size:.8rem;color:#aaa;margin-top:6px;"><i class="fas fa-clock"></i> ${n.date||''}</div>
      </div>
      <button onclick="document.body.removeChild(document.getElementById('news-detail-overlay'))"
        style="background:none;border:none;font-size:1.3rem;color:#aaa;cursor:pointer;padding:0 4px;line-height:1;">✕</button>
    </div>
    ${imgBlock}
    <h3 style="font-size:1.15rem;color:var(--dgreen);margin-bottom:14px;line-height:1.5;">${n.title}</h3>
    <div style="font-size:.93rem;color:#444;line-height:1.85;word-break:break-word;">${contentHtml}</div>
  </div>`;
  // ปิด modal เมื่อกด overlay ด้านนอก
  overlay.addEventListener('click', function(e){ if(e.target===overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

// ═══ HERO STATS ═══
async function loadHeroStats(){
  try{
    const res=await api.get('/api/dashboard');
    if(!res.success)return;
    const s=res.stats;
    const el=(id,v)=>{const e=document.getElementById(id);if(e){const n=e.querySelector('.hs-num');if(n)n.textContent=v;}};
    el('hs-total',   s.total||0);
    el('hs-done',    s.done||0);
    el('hs-pending', s.pending||0);
  }catch(e){/* ไม่แสดง error ใน hero */}
}
// ═══ PINNED TICKETS ═══
async function loadPinnedTickets(){
  const container=document.getElementById('pinned-tickets-section');
  if(!container)return;
  try{
    const res=await api.get('/api/tickets?action=pinned');
    if(res.success&&res.tickets&&res.tickets.length>0){
      container.classList.remove('hidden');
      const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject','รอตรวจสอบ':'status-review'};
      let html=`<div class="section-title" style="margin-bottom:14px;">
        <h2 style="font-size:1.05rem;"><i class="fas fa-thumbtack" style="color:var(--dgreen);"></i> ประกาศ / ติดตามสถานะ</h2>
      </div>`;
      res.tickets.forEach(t=>{
        const comments = t['Comments'] || '';
        const commentEntries = comments ? comments.split('\n---\n').filter(c=>c.trim()) : [];
        const lastEntry = commentEntries.length ? commentEntries[commentEntries.length-1] : '';
        // แยก timestamp และข้อความออกจาก comment
        const commentText = lastEntry ? lastEntry.replace(/^\[.*?\]\s*.*?:\s*/,'').trim() : '';
        const commentMeta = lastEntry ? (lastEntry.match(/^\[(.*?)\]/)||['',''])[1] : '';
        const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
        const pChip={'high':'red','medium':'orange','low':'green'};
        const priority=t['ความเร่งด่วน']||'medium';
        const detailText=t['รายละเอียด']||'';
        const detailShortPinned=detailText.length>200?detailText.substring(0,200)+'...':detailText;
        html+=`<div class="pinned-card">
          <div class="pinned-card-header">
            <div>
              <div class="pinned-card-title">${t['หัวข้อ']||'-'}</div>
              <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">
                ${t['ประเภทเรื่อง']?`<span class="chip blue" style="font-size:.73rem;"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>`:''}
                ${priority?`<span class="chip ${pChip[priority]||'gray'}" style="font-size:.73rem;">${pLabel[priority]||priority}</span>`:''}
                ${t['ประเภทผู้แจ้ง']?`<span class="chip gray" style="font-size:.73rem;">${t['ประเภทผู้แจ้ง']}</span>`:''}
              </div>
            </div>
            <span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']||'-'}</span>
          </div>
          ${detailText?`<div class="pinned-detail-box">
            <div class="pinned-detail-label"><i class="fas fa-align-left"></i> รายละเอียด</div>
            <div class="pinned-detail-text" id="pin-detail-${t['Ticket ID']}">${detailShortPinned.replace(/\n/g,'<br>')}</div>
            ${detailText.length>200?`<button class="btn-expand" onclick="expandPinDetail('${t['Ticket ID']}', this)">ดูเพิ่มเติม ▼</button>`:''}
          </div>`:''}
          <div class="pinned-card-body">
            ${buildProgressBar(t['สถานะ'])}
          </div>
          <div class="pinned-card-footer">
            <span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||''}</span>
            <span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span>
            <span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
          </div>
          ${commentText ? `<div class="pinned-comment-box">
            <div class="pinned-comment-meta"><i class="fas fa-comment-dots"></i> ความคิดเห็นล่าสุด${commentMeta?` · ${commentMeta}`:''}</div>
            <div class="pinned-comment-text">${commentText}</div>
          </div>` : ''}
        </div>`;
      });
      container.innerHTML=html;
    } else { container.classList.add('hidden'); }
  }catch(e){ container.classList.add('hidden'); }
}

// ═══ TRACKING ═══
async function loadMyTickets(){
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try{
    const res=await api.get(`/api/tickets?action=byUsername&username=${encodeURIComponent(currentUser.username)}`);
    if(res.success&&res.tickets&&res.tickets.length>0) await renderTicketCards(res.tickets,true);
    else resDiv.innerHTML=`<div style="text-align:center;padding:40px;color:#aaa;">
      <i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;display:block;margin-bottom:12px;"></i>
      <p style="margin-bottom:16px;">คุณยังไม่มีประวัติการร้องเรียน</p>
      <button onclick="navigateTo('portal')" style="padding:10px 24px;background:var(--dgreen);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:'Sarabun',sans-serif;font-weight:700;">
        <i class="fas fa-bullhorn"></i> แจ้งเรื่องใหม่
      </button></div>`;
  }catch(e){ resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
async function doTrack(){
  const val=document.getElementById('track-input').value.trim();
  if(!val){await showAlert('⚠️','กรุณากรอก Ticket ID','ตัวอย่าง: VOC-2568-0001');return;}
  if(!val.toUpperCase().startsWith('VOC-')){
    await showAlert('⚠️','รูปแบบไม่ถูกต้อง','กรุณากรอก Ticket ID ที่ขึ้นต้นด้วย VOC-');return;}
  const resDiv=document.getElementById('track-result');
  resDiv.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังค้นหา...</p></div>';
  try{
    const res=await api.get(`/api/tickets?action=byId&id=${encodeURIComponent(val.toUpperCase())}`);
    if(res.success){
      // แสดง rating เฉพาะถ้า user login แล้วและเป็นเจ้าของ ticket
      const isOwner = currentUser && currentUser.role==='user' &&
        String(res.ticket['Username']||'').toLowerCase()===String(currentUser.username||'').toLowerCase();
      await renderTicketCards([res.ticket], isOwner);
    } else resDiv.innerHTML=`<p style="color:#d00000;text-align:center;padding:30px;"><i class="fas fa-search"></i> ไม่พบ Ticket ID นี้</p>`;
  }catch(e){ resDiv.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}

// ── TICKET CARD v5 (ข้อ 4 หมวดหมู่ชัดเจน) ──
function buildTicketCard(t, showRating=false){
  const sc={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject','รอตรวจสอบ':'status-review'};
  const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pChipCls={'high':'red','medium':'orange','low':'green'};
  const isDone=t['สถานะ']==='เสร็จสิ้น';
  const comments=t['Comments']||'';
  const commentEntries=comments?comments.split('\n---\n').filter(c=>c.trim()):[];
  const userNote=t['หมายเหตุผู้ใช้']||'';
  const fileInfo=t['FileURL']||'';
  // ข้อ 11: ตัดข้อความยาว
  const detailShort=t['รายละเอียด']&&t['รายละเอียด'].length>150
    ?t['รายละเอียด'].substring(0,150)+'...' : (t['รายละเอียด']||'');
  const detailFull=t['รายละเอียด']||'';
  const needExpand=t['รายละเอียด']&&t['รายละเอียด'].length>150;

  return `<div class="ticket-card">
    <!-- HEADER -->
    <div class="ticket-card-header">
      <div>
        <div class="ticket-id"><i class="fas fa-ticket-alt" style="font-size:.75rem;margin-right:4px;"></i>${t['Ticket ID']||'-'}</div>
        <div class="ticket-subject" style="margin-top:4px;">${t['หัวข้อ']||'-'}</div>
      </div>
      <span class="status ${sc[t['สถานะ']]||'status-pending'}">${t['สถานะ']||'-'}</span>
    </div>

    <!-- BODY -->
    <div class="ticket-card-body">

      <!-- หมวด: ข้อมูลการแจ้ง -->
      <div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-info-circle"></i> ข้อมูลการแจ้ง</div>
        <div class="ticket-meta-chips">
          ${t['ประเภทเรื่อง']?`<span class="chip blue"><i class="fas fa-tag"></i>${t['ประเภทเรื่อง']}</span>`:''}
          ${t['ความเร่งด่วน']?`<span class="chip ${pChipCls[t['ความเร่งด่วน']]||'gray'}">${pLabel[t['ความเร่งด่วน']]||t['ความเร่งด่วน']}</span>`:''}
          ${t['ประเภทผู้แจ้ง']?`<span class="chip gray"><i class="fas fa-user"></i>${t['ประเภทผู้แจ้ง']}</span>`:''}
        </div>
      </div>

      <!-- หมวด: รายละเอียด (ข้อ 11 ตัดข้อความ) -->
      <div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-align-left"></i> รายละเอียด</div>
        <div class="ticket-detail-text" id="detail-${t['Ticket ID']}">${needExpand?detailShort:detailFull}</div>
        ${needExpand?`<button class="btn-expand" onclick="expandDetail('${t['Ticket ID']}','${encodeURIComponent(detailFull)}')">ดูเพิ่มเติม ▼</button>`:''}
      </div>

      ${userNote?`<!-- หมวด: หมายเหตุผู้ใช้ (ข้อ 1) -->
      <div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</div>
        <div class="user-note-box" style="white-space:pre-wrap;line-height:1.75;word-break:break-word;">${userNote}</div>
      </div>`:''}

      ${fileInfo?`<div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</div>
        <div class="file-attach-display">
          <i class="fas fa-file-alt" style="color:var(--dgreen);font-size:1.1rem;"></i>
          <span style="font-size:.9rem;color:#333;">${fileInfo.replace(/\[แนบไฟล์:\s*/,'').replace(/\]$/,'')}</span>
        </div>
      </div>`:''}

      <!-- หมวด: ความคืบหน้า (ข้อ 3 — 5 ระดับ) -->
      <div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-tasks"></i> ความคืบหน้า</div>
        ${buildProgressBar(t['สถานะ'])}
      </div>

      <!-- หมวด: ความคิดเห็น -->
      ${commentEntries.length?`<div class="ticket-card-section">
        <div class="ticket-card-section-label"><i class="fas fa-comment-dots"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div>
        <div class="comments-log">
          ${commentEntries.map((c,idx)=>{
            const metaMatch=c.match(/^\[(.*?)\]\s*(.*?):/);
            const timestamp=metaMatch?metaMatch[1]:'';
            const author=metaMatch?metaMatch[2]:'';
            const text=c.replace(/^\[.*?\].*?:\s*/,'').trim();
            const isLatest=idx===commentEntries.length-1;
            return `<div class="comment-entry ${isLatest?'comment-latest':''}">
              <div class="comment-meta">
                ${isLatest?'<span class="comment-new-badge">ใหม่</span>':''}
                ${author?`<strong style="color:#2d6a4f;">${author}</strong> · `:''}
                <i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp||'ไม่ระบุเวลา'}
              </div>
              <div class="comment-text">${text}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`:''}

      <!-- Rating (ถ้าเสร็จแล้ว) -->
      ${showRating&&isDone?buildRatingBox(t['Ticket ID']):''}

    </div>

    <!-- FOOTER -->
    <div class="ticket-card-footer">
      <span><i class="fas fa-calendar-alt"></i>${t['วันที่แจ้ง']||'-'}</span>
      <span><i class="fas fa-clock"></i>กำหนด: ${t['กำหนดตอบกลับ']||'-'}</span>
      <span><i class="fas fa-user-tie"></i>${t['ผู้รับผิดชอบ']||'รอมอบหมาย'}</span>
    </div>
  </div>`;
}

// ข้อ 11: ขยายข้อความ
// expand pinned detail
function expandPinDetail(ticketId, btn){
  const el=document.getElementById('pin-detail-'+ticketId);
  if(!el)return;
  // fetch full detail from server
  api.get('/api/tickets?action=byId&id='+encodeURIComponent(ticketId)).then(res=>{
    if(res.success&&res.ticket){
      el.innerHTML=(res.ticket['รายละเอียด']||'').replace(/\n/g,'<br>');
      if(btn)btn.style.display='none';
    }
  });
}
function expandDetail(ticketId, encodedText){
  const el=document.getElementById('detail-'+ticketId);
  if(!el)return;
  el.innerText=decodeURIComponent(encodedText);
  const btn=el.nextElementSibling;
  if(btn&&btn.classList.contains('btn-expand')) btn.style.display='none';
}

// ข้อ 12 — renderTicketCards ต้องเช็ค rating ก่อน ไม่แสดงซ้ำ
async function renderTicketCards(tickets, showRating=false){
  const resDiv=document.getElementById('track-result');
  let ratedSet=new Set();
  // ถ้าต้องแสดงปุ่ม rating ให้ดึงข้อมูลที่เคยให้คะแนนแล้วก่อน
  if(showRating && currentUser){
    try{
      const ratedRes = await Promise.all(
        tickets.filter(t=>t['สถานะ']==='เสร็จสิ้น').map(t=>
          api.get(`/api/ratings?action=byTicket&id=${encodeURIComponent(t['Ticket ID']||'')}`)
        )
      );
      ratedRes.forEach((res,idx)=>{
        if(res.success && res.ratings && res.ratings.length>0){
          const tid = tickets.filter(t=>t['สถานะ']==='เสร็จสิ้น')[idx]['Ticket ID'];
          // เช็คว่า user นี้เคยให้คะแนนหรือยัง
          const hasRated = res.ratings.some(r=>
            String(r.username||'').toLowerCase()===String(currentUser.username||'').toLowerCase()
          );
          if(hasRated) ratedSet.add(tid);
        }
      });
    }catch(e){ /* ถ้า error ก็ไม่แสดง rating ทั้งหมดเพื่อความปลอดภัย */ }
  }
  let html=`<p style="color:#888;margin-bottom:16px;font-size:.88rem;">พบ ${tickets.length} รายการ</p>`;
  tickets.forEach(t=>{
    // showRating = true เฉพาะ ticket ที่เสร็จแล้ว AND ยังไม่เคยให้คะแนน
    const canRate = showRating && t['สถานะ']==='เสร็จสิ้น' && !ratedSet.has(t['Ticket ID']);
    html += buildTicketCard(t, canRate);
  });
  resDiv.innerHTML=html;
}

// ═══ RATING (ข้อ 2) ═══
function buildRatingBox(ticketId){
  return `<div class="rating-box" id="rbox-${ticketId}">
    <h4>⭐ ให้คะแนนการบริการ</h4>
    <div class="star-row" id="stars-${ticketId}">
      ${[1,2,3,4,5].map(i=>`<button class="star-btn dim" onclick="selectStar('${ticketId}',${i})">⭐</button>`).join('')}
    </div>
    <textarea class="rating-comment" id="rc-${ticketId}" rows="2" placeholder="ความคิดเห็น (ไม่บังคับ)"></textarea>
    <button class="btn-rate" onclick="submitRating('${ticketId}')"><i class="fas fa-paper-plane"></i> ส่งคะแนน</button>
  </div>`;
}
function selectStar(tid,score){
  ratingSelection=score;
  const row=document.getElementById('stars-'+tid); if(!row)return;
  row.querySelectorAll('.star-btn').forEach((b,i)=>{
    b.classList.toggle('lit',i<score); b.classList.toggle('dim',i>=score);
    b.style.transform=i<score?'scale(1.1)':'scale(1)';
  });
}
async function submitRating(ticketId){
  if(!ratingSelection){await showAlert('⚠️','กรุณาเลือกคะแนน','');return;}
  const comment=document.getElementById('rc-'+ticketId)?.value.trim();
  try{
    const res=await api.post('/api/ratings',{ticketId,username:currentUser?.username||'',score:ratingSelection,comment});
    if(res.success){
      const box=document.getElementById('rbox-'+ticketId);
      if(box) box.innerHTML=`<div style="text-align:center;padding:16px;color:#2d6a4f;font-weight:700;">
        ✅ ขอบคุณสำหรับ ${'⭐'.repeat(ratingSelection)} คะแนน</div>`;
      ratingSelection=0;
    } else await showAlert('ℹ️','แจ้งเตือน',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ═══ FAQ (ข้อ 8) ═══
async function loadFaq(){
  const container=document.getElementById('faq-content');
  if(!container)return;
  container.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>';
  try{
    const res=await api.get('/api/faq');
    if(res.success) renderFaq(res.faqs||[]);
    else container.innerHTML='<p style="color:red;">โหลด FAQ ไม่สำเร็จ</p>';
  }catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderFaq(faqs,query=''){
  const container=document.getElementById('faq-content');
  const filtered=query?faqs.filter(f=>
    f.question.toLowerCase().includes(query.toLowerCase())||
    f.answer.toLowerCase().includes(query.toLowerCase())):faqs;

  if(!filtered.length){container.innerHTML='<p style="text-align:center;color:#aaa;padding:30px;">ไม่พบคำถามที่ค้นหา</p>';return;}

  // จัดกลุ่มตาม category
  const groups={};
  filtered.forEach(f=>{
    const cat=f.category||'ทั่วไป';
    if(!groups[cat])groups[cat]=[];
    groups[cat].push(f);
  });

  let html='<div class="faq-list">';
  Object.entries(groups).forEach(([cat,items])=>{
    html+=`<div class="faq-category-label"><i class="fas fa-folder-open"></i> ${cat}</div>`;
    items.forEach(f=>{
      html+=`<div class="faq-item" id="faq-${f.faqId}">
        <div class="faq-question" onclick="toggleFaq('${f.faqId}')">
          <span>${f.question}</span>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div class="faq-answer">${f.answer}</div>
      </div>`;
    });
  });
  html+='</div>';
  container.innerHTML=html;
}
function toggleFaq(id){
  const item=document.getElementById('faq-'+id);
  if(item) item.classList.toggle('open');
}
function searchFaq(){
  const q=document.getElementById('faq-search')?.value.trim()||'';
  const container=document.getElementById('faq-content');
  container.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>';
  api.get('/api/faq').then(res=>{
    if(res.success) renderFaq(res.faqs||[],q);
  });
}


// ═══════════════════════════════════════════════════════════════
// ADMIN REPORT (ข้อ 2)
// ═══════════════════════════════════════════════════════════════
async function loadReport(type){
  currentReportType = type || 'service';
  // sync tab active state
  ['service','users','duration','monthly'].forEach(t=>{
    const el=document.getElementById('rtab-'+t);
    if(el) el.classList.toggle('active', t===currentReportType);
  });
  const box=document.getElementById('report-content');
  if(!box)return;
  box.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดรายงาน...</p></div>';
  try{
    const res=await api.get('/api/report?type='+currentReportType);
    if(!res.success){box.innerHTML='<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>';return;}
    if(currentReportType==='service')  renderReportService(res.report, box);
    if(currentReportType==='users')    renderReportUsers(res.report, box);
    if(currentReportType==='duration') renderReportDuration(res.report, box);
    if(currentReportType==='monthly')  renderReportMonthly(res.report, box);
  }catch(e){box.innerHTML=`<p style="color:red;padding:20px;">${e.message}</p>`;}
}

// ── 2.1 สรุปการให้บริการ ──
function renderReportService(r, box){
  const statusRows=Object.entries(r.byStatus||{}).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>`<tr><td>${k}</td><td style="text-align:right;font-weight:700;">${v}</td><td style="text-align:right;color:#888;">${r.total?`${Math.round(v/r.total*100)}%`:'0%'}</td></tr>`).join('');
  const catRows=Object.entries(r.byCategory||{}).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k,v])=>{ const pct=r.total?Math.round(v/r.total*100):0; return `<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div><span class="rpt-bar-count">${v}</span></div>`; }).join('');
  const assigneeRows=Object.entries(r.byAssignee||{}).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k,v])=>`<tr><td>${k}</td><td style="text-align:right;font-weight:700;">${v}</td></tr>`).join('');
  box.innerHTML=`
    <div class="rpt-kpi-grid">
      <div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 ทั้งหมด</div></div>
      <div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div>
      <div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00">${r.pending}</div><div class="rpt-kpi-label">⏳ รอ/ดำเนินการ</div></div>
      <div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div>
    </div>
    <div class="rpt-success-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;"><span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span></div>
      <div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div>
    </div>
    <div class="rpt-two-col">
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-list-ul"></i> สถานะทั้งหมด</div>
        <table class="rpt-table"><tr><th>สถานะ</th><th>จำนวน</th><th>%</th></tr>${statusRows}</table>
      </div>
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-shield-alt"></i> ความเร่งด่วน</div>
        <div class="rpt-priority-row">
          <div class="rpt-priority-block high"><div class="rpt-priority-num">${r.byPriority?.high||0}</div><div>🔴 เร่งด่วน</div></div>
          <div class="rpt-priority-block med"><div class="rpt-priority-num">${r.byPriority?.medium||0}</div><div>🟡 ปานกลาง</div></div>
          <div class="rpt-priority-block low"><div class="rpt-priority-num">${r.byPriority?.low||0}</div><div>🟢 ทั่วไป</div></div>
        </div>
      </div>
    </div>
    <div class="rpt-two-col">
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่อง (Top 8)</div>
        ${catRows||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}
      </div>
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-user-tie"></i> ผู้รับผิดชอบ</div>
        <table class="rpt-table"><tr><th>ชื่อ</th><th>จำนวน</th></tr>${assigneeRows||'<tr><td colspan="2" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}</table>
      </div>
    </div>`;
}

// ── 2.2 ผู้ใช้บริการ ──
function renderReportUsers(r, box){
  const rows=(r.users||[]).map((u,i)=>`
    <tr>
      <td style="color:#888;font-size:.82rem;">${i+1}</td>
      <td><strong>${u.username}</strong><br><span style="font-size:.78rem;color:#aaa;">${u.name||''}</span></td>
      <td style="text-align:center;">${u.total}</td>
      <td style="text-align:center;color:#2d6a4f;font-weight:700;">${u.done}</td>
      <td style="text-align:center;color:#f77f00;">${u.pending}</td>
      <td style="text-align:center;">${u.successRate}%</td>
      <td style="font-size:.8rem;color:#666;">${u.topCategory}</td>
      <td><button onclick="showUserReport('${u.username}')" style="padding:4px 10px;background:var(--dgreen);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.76rem;"><i class="fas fa-user-chart"></i> รายงาน</button></td>
    </tr>`).join('');
  box.innerHTML=`
    <div class="rpt-kpi-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="rpt-kpi"><div class="rpt-kpi-num">${r.totalUsers}</div><div class="rpt-kpi-label">👤 ผู้ใช้ทั้งหมด</div></div>
      <div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f;">${(r.users||[]).filter(u=>u.total>0).length}</div><div class="rpt-kpi-label">✅ ใช้งานแล้ว</div></div>
    </div>
    <div class="rpt-card" style="overflow-x:auto;">
      <div class="rpt-card-title"><i class="fas fa-users"></i> รายชื่อผู้ใช้บริการ</div>
      <table class="rpt-table rpt-users-table">
        <tr><th>#</th><th>ผู้ใช้</th><th>ทั้งหมด</th><th>เสร็จ</th><th>รอ</th><th>%สำเร็จ</th><th>หมวดบ่อยสุด</th><th></th></tr>
        ${rows||'<tr><td colspan="8" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}
      </table>
    </div>`;
}

// ── 2.3 เวลาให้บริการสำเร็จ ──
function renderReportDuration(r, box){
  const rows=(r.items||[]).slice(0,20).map(d=>{
    const pLabel={high:'🔴 เร่งด่วน',medium:'🟡 ปานกลาง',low:'🟢 ทั่วไป'};
    return `<tr><td style="font-size:.8rem;color:#2d6a4f;font-weight:700;">${d.ticketId}</td><td style="font-size:.82rem;">${d.subject}</td><td>${pLabel[d.priority]||d.priority}</td><td style="text-align:right;font-weight:700;">${d.hours} ชม.</td></tr>`;
  }).join('');
  const avgLabel = h => h!==null?h+' ชม.':'-';
  box.innerHTML=`
    <div class="rpt-kpi-grid">
      <div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">🎯 เรื่องที่เสร็จแล้ว</div></div>
      <div class="rpt-kpi blue"><div class="rpt-kpi-num" style="color:#3a86ff;">${avgLabel(r.avgHours)}</div><div class="rpt-kpi-label">⏱️ เวลาเฉลี่ยรวม</div></div>
    </div>
    <div class="rpt-two-col">
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-tachometer-alt"></i> เวลาเฉลี่ยตามความเร่งด่วน</div>
        <div class="rpt-priority-row">
          <div class="rpt-priority-block high"><div class="rpt-priority-num" style="font-size:1.2rem;">${avgLabel(r.avgByPriority?.high)}</div><div style="font-size:.75rem;">🔴 เร่งด่วน</div></div>
          <div class="rpt-priority-block med"><div class="rpt-priority-num" style="font-size:1.2rem;">${avgLabel(r.avgByPriority?.medium)}</div><div style="font-size:.75rem;">🟡 ปานกลาง</div></div>
          <div class="rpt-priority-block low"><div class="rpt-priority-num" style="font-size:1.2rem;">${avgLabel(r.avgByPriority?.low)}</div><div style="font-size:.75rem;">🟢 ทั่วไป</div></div>
        </div>
      </div>
      <div class="rpt-card" style="overflow-x:auto;">
        <div class="rpt-card-title"><i class="fas fa-list"></i> รายการล่าสุด (20 เรื่อง)</div>
        <table class="rpt-table">
          <tr><th>Ticket</th><th>หัวข้อ</th><th>ความเร่งด่วน</th><th>เวลา</th></tr>
          ${rows||'<tr><td colspan="4" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}
        </table>
      </div>
    </div>`;
}

// ── 2.4 รายเดือน ──
function renderReportMonthly(r, box){
  const months = r.months || [];
  const maxTotal = Math.max(...months.map(m=>m.total), 1);
  const bars = months.map(m=>{
    const pct = Math.round(m.total/maxTotal*100);
    const donePct = m.total?Math.round(m.done/m.total*100):0;
    return `<div class="rpt-month-row">
      <div class="rpt-month-label">${m.month}</div>
      <div style="flex:1;">
        <div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div>
        <div style="font-size:.74rem;color:#888;margin-top:2px;">เสร็จ ${donePct}% · รอ ${m.pending} · ปฏิเสธ ${m.rejected}</div>
      </div>
      <div class="rpt-month-count">${m.total}</div>
    </div>`;
  }).join('');
  const tableRows = months.map(m=>`<tr><td>${m.month}</td><td style="text-align:center;">${m.total}</td><td style="text-align:center;color:#2d6a4f;">${m.done}</td><td style="text-align:center;color:#f77f00;">${m.pending}</td><td style="text-align:center;color:#d00000;">${m.rejected}</td><td style="text-align:center;color:#3a86ff;">${m.high}</td></tr>`).join('');
  box.innerHTML=`
    <div class="rpt-card">
      <div class="rpt-card-title"><i class="fas fa-chart-bar"></i> จำนวน Ticket รายเดือน</div>
      ${bars||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}
    </div>
    <div class="rpt-card" style="overflow-x:auto;margin-top:16px;">
      <div class="rpt-card-title"><i class="fas fa-table"></i> ตารางสรุปรายเดือน</div>
      <table class="rpt-table">
        <tr><th>เดือน/ปี</th><th>ทั้งหมด</th><th>เสร็จ</th><th>รอ</th><th>ปฏิเสธ</th><th>🔴 เร่งด่วน</th></tr>
        ${tableRows||'<tr><td colspan="6" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}
      </table>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// USER PERSONAL REPORT (ข้อ 3)
// ═══════════════════════════════════════════════════════════════
async function showUserReport(username){
  // ปิด profile overlay ถ้าเปิดอยู่
  const po=document.getElementById('profile-overlay');
  if(po)document.body.removeChild(po);
  navigateTo('user-report');
  const box=document.getElementById('user-report-content');
  box.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลดรายงาน...</p></div>';
  try{
    const res=await api.get('/api/report?type=userSummary&username='+encodeURIComponent(username));
    if(!res.success){box.innerHTML='<p style="color:red;padding:20px;">โหลดไม่สำเร็จ</p>';return;}
    renderUserReport(res.report, box);
  }catch(e){box.innerHTML=`<p style="color:red;padding:20px;">${e.message}</p>`;}
}
function closeUserReport(){
  // กลับหน้าที่เหมาะสม
  if(currentUser&&(currentUser.role==='admin'||currentUser.role==='superadmin'))
    navigateTo('admin-report');
  else
    navigateTo('tracking');
}
function renderUserReport(r, box){
  const pLabel={high:'🔴 เร่งด่วน',medium:'🟡 ปานกลาง',low:'🟢 ทั่วไป'};
  const scClass={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-done','ปฏิเสธ':'status-rejected'};

  // by category bars
  const catEntries=Object.entries(r.byCategory||{}).sort((a,b)=>b[1]-a[1]);
  const maxCat=Math.max(...catEntries.map(e=>e[1]),1);
  const catBars=catEntries.map(([k,v])=>{
    const pct=Math.round(v/maxCat*100);
    return `<div class="rpt-bar-row"><span class="rpt-bar-label">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill" style="width:${pct}%"></div></div><span class="rpt-bar-count">${v}</span></div>`;
  }).join('');

  // monthly mini bars
  const maxMon=Math.max(...(r.byMonth||[]).map(m=>m[1]),1);
  const monBars=(r.byMonth||[]).map(([k,v])=>{
    const pct=Math.round(v/maxMon*100);
    return `<div class="rpt-bar-row"><span class="rpt-bar-label" style="width:90px;">${k}</span><div class="rpt-bar-track"><div class="rpt-bar-fill blue" style="width:${pct}%"></div></div><span class="rpt-bar-count">${v}</span></div>`;
  }).join('');

  // ticket table
  const ticketRows=(r.recentTickets||[]).map(t=>`
    <tr>
      <td style="font-size:.78rem;color:#2d6a4f;font-weight:700;">${t.ticketId}</td>
      <td style="font-size:.83rem;">${t.subject}</td>
      <td><span class="status ${scClass[t.status]||'status-pending'}" style="font-size:.72rem;">${t.status}</span></td>
      <td style="font-size:.78rem;">${pLabel[t.priority]||t.priority}</td>
      <td style="font-size:.78rem;color:#888;">${t.date}</td>
    </tr>`).join('');

  box.innerHTML=`
    <div style="text-align:center;padding:16px 0 8px;">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--dgreen);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;margin-bottom:8px;">${(r.username||'?')[0].toUpperCase()}</div>
      <div style="font-size:1.1rem;font-weight:700;color:#222;">@${r.username}</div>
      <div style="font-size:.83rem;color:#aaa;margin-top:2px;">สรุปการใช้บริการทั้งหมด</div>
    </div>

    <div class="rpt-kpi-grid">
      <div class="rpt-kpi"><div class="rpt-kpi-num">${r.total}</div><div class="rpt-kpi-label">📋 รวมทั้งหมด</div></div>
      <div class="rpt-kpi green"><div class="rpt-kpi-num" style="color:#2d6a4f;">${r.done}</div><div class="rpt-kpi-label">✅ เสร็จสิ้น</div></div>
      <div class="rpt-kpi orange"><div class="rpt-kpi-num" style="color:#f77f00;">${r.pending}</div><div class="rpt-kpi-label">⏳ รอดำเนินการ</div></div>
      <div class="rpt-kpi red"><div class="rpt-kpi-num" style="color:#d00000;">${r.rejected}</div><div class="rpt-kpi-label">❌ ปฏิเสธ</div></div>
    </div>

    <div class="rpt-success-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;color:#888;margin-bottom:6px;"><span>อัตราความสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;font-size:1.1rem;">${r.successRate}%</span></div>
      <div class="rpt-bar-track big"><div class="rpt-bar-fill" style="width:${r.successRate}%"></div></div>
    </div>

    <div class="rpt-two-col">
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-tags"></i> ประเภทเรื่องที่แจ้ง</div>
        ${catBars||'<p style="color:#bbb;font-size:.85rem;">ยังไม่มีข้อมูล</p>'}
      </div>
      <div class="rpt-card">
        <div class="rpt-card-title"><i class="fas fa-calendar-alt"></i> ประวัติรายเดือน</div>
        ${monBars||'<p style="color:#bbb;font-size:.85rem;">ยังไม่มีข้อมูล</p>'}
      </div>
    </div>

    <div class="rpt-card" style="overflow-x:auto;">
      <div class="rpt-card-title"><i class="fas fa-history"></i> ประวัติคำร้องล่าสุด (20 รายการ)</div>
      <table class="rpt-table">
        <tr><th>Ticket ID</th><th>หัวข้อ</th><th>สถานะ</th><th>ความเร่งด่วน</th><th>วันที่</th></tr>
        ${ticketRows||'<tr><td colspan="5" style="color:#bbb;">ยังไม่มีข้อมูล</td></tr>'}
      </table>
    </div>`;
}

// ═══ ADMIN DASHBOARD ═══
async function loadDashboard(){
  document.getElementById('dash-content').innerHTML=
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try{
    const [dr,sr]=await Promise.all([api.get('/api/dashboard'),api.get('/api/ratings?action=summary')]);
    if(dr.success) renderDashboard(dr.stats,sr.summary||{avg:0,total:0});
    else document.getElementById('dash-content').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';
  }catch(e){ document.getElementById('dash-content').innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderDashboard(s,rs){
  const mxC=Math.max(...Object.values(s.byCategory),1);
  const mxU=Math.max(...Object.values(s.byCustomer),1);
  const mxM=Math.max(...Object.values(s.byMonth),1);
  let catB='',cusB='',monB='',urgH='';
  Object.entries(s.byCategory).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    catB+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mxC*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byCustomer).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    cusB+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v/mxU*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  Object.entries(s.byMonth).sort().slice(-6).forEach(([k,v])=>{
    monB+=`<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill blue" style="width:${Math.round(v/mxM*100)}%"></div></div><span class="bar-count">${v}</span></div>`;
  });
  if(s.urgentTickets&&s.urgentTickets.length>0)
    urgH=`<div class="urgent-banner"><h4><i class="fas fa-exclamation-triangle"></i> ⚠️ ${s.urgentTickets.length} เรื่องเร่งด่วนยังไม่เสร็จ</h4>
      ${s.urgentTickets.map(t=>`<div class="urgent-item"><span class="priority-badge p-high">🔴 เร่งด่วน</span><strong>${t.ticketId}</strong><span style="flex:1;">${t.subject}</span><span style="color:#aaa;font-size:.79rem;">${t.due||''}</span></div>`).join('')}
    </div>`;
  const sr2=s.total>0?Math.round(s.done/s.total*100):0;
  document.getElementById('dash-content').innerHTML=`${urgH}
    <div class="dash-grid">
      <div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-label">📋 ทั้งหมด</div></div>
      <div class="stat-card orange"><div class="stat-num" style="color:#f77f00;">${s.pending}</div><div class="stat-label">⏳ รอดำเนินการ</div></div>
      <div class="stat-card blue"><div class="stat-num" style="color:#3a86ff;">${s.inprogress}</div><div class="stat-label">🔄 กำลังดำเนินการ</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#2d6a4f;">${s.done}</div><div class="stat-label">✅ เสร็จสิ้น</div></div>
    </div>
    <div class="priority-stat-grid">
      <div class="pstat-card high"><div class="pstat-num" style="color:#d00000;">${s.byPriority?.high||0}</div><div class="pstat-label" style="color:#d00000;">🔴 เร่งด่วน</div></div>
      <div class="pstat-card medium"><div class="pstat-num" style="color:#b25f00;">${s.byPriority?.medium||0}</div><div class="pstat-label" style="color:#b25f00;">🟡 ปานกลาง</div></div>
      <div class="pstat-card low"><div class="pstat-num" style="color:#2d6a4f;">${s.byPriority?.low||0}</div><div class="pstat-label" style="color:#2d6a4f;">🟢 ทั่วไป</div></div>
    </div>
    <div class="dash-charts">
      <div class="chart-card">
        <h4><i class="fas fa-tachometer-alt"></i> ภาพรวม</h4>
        <div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:.83rem;color:#888;margin-bottom:4px;"><span>อัตราสำเร็จ</span><span style="font-weight:700;color:#2d6a4f;">${sr2}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${sr2}%"></div></div></div>
        <div><div style="display:flex;justify-content:space-between;font-size:.83rem;color:#888;margin-bottom:4px;"><span>กำลังดำเนินการ</span><span style="font-weight:700;color:#3a86ff;">${s.total>0?Math.round(s.inprogress/s.total*100):0}%</span></div><div class="bar-track"><div class="bar-fill blue" style="width:${s.total>0?Math.round(s.inprogress/s.total*100):0}%"></div></div></div>
      </div>
      <div class="chart-card" style="text-align:center;">
        <h4><i class="fas fa-star"></i> คะแนนพึงพอใจ</h4>
        <div style="font-size:3.2rem;font-weight:800;color:var(--dgreen);line-height:1;">${rs.avg||'-'}</div>
        <div style="font-size:1.4rem;margin:6px 0;">${'⭐'.repeat(Math.round(rs.avg||0))}${'☆'.repeat(5-Math.round(rs.avg||0))}</div>
        <div style="font-size:.83rem;color:#888;">${rs.total||0} รีวิว</div>
        <button onclick="navigateTo('admin-reviews')" style="margin-top:12px;padding:7px 16px;background:var(--dgreen);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:'Sarabun',sans-serif;font-size:.85rem;">ดูรีวิว</button>
      </div>
    </div>
    <div class="dash-charts">
      <div class="chart-card"><h4><i class="fas fa-tags"></i> ประเภทเรื่อง</h4>${catB||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>
      <div class="chart-card"><h4><i class="fas fa-users"></i> ประเภทผู้แจ้ง</h4>${cusB||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>
    </div>
    <div class="chart-card"><h4><i class="fas fa-calendar-alt"></i> รายเดือน (6 เดือนล่าสุด)</h4>${monB||'<p style="color:#bbb;">ยังไม่มีข้อมูล</p>'}</div>`;
}

// ═══ ADMIN TICKETS ═══
function setFilter(id){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  const e=document.getElementById('filter-'+id); if(e) e.classList.add('active');
}
async function loadAdminTickets(filter){
  document.getElementById('admin-ticket-list').innerHTML=
    '<div class="loading-spinner"><i class="fas fa-circle-notch"></i><p style="margin-top:10px;">กำลังโหลด...</p></div>';
  try{
    const [tr,nr]=await Promise.all([
      api.get(`/api/tickets?action=all&filter=${encodeURIComponent(filter)}`),
      api.get('/api/notify?action=getEmail'),
    ]);
    const ce=nr.success?(nr.email||''):'';
    if(tr.success) renderAdminTickets(tr.tickets,ce);
    else document.getElementById('admin-ticket-list').innerHTML='<p style="color:red;">โหลดไม่สำเร็จ</p>';
  }catch(e){ document.getElementById('admin-ticket-list').innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
async function saveNotifyEmail(){
  const email=document.getElementById('notify-email-input')?.value.trim();
  if(!email){await showAlert('⚠️','กรุณากรอก email','');return;}
  const btn=document.getElementById('btn-save-notify');
  if(btn){btn.disabled=true;btn.innerHTML='บันทึก...';}
  try{
    const res=await api.post('/api/notify',{action:'setEmail',email});
    if(res.success) await showAlert('✅','บันทึกสำเร็จ',`จะส่งแจ้งเตือนไปที่ ${email}`);
    else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> บันทึก';}}
}

function renderAdminTickets(tickets,currentEmail){
  const container=document.getElementById('admin-ticket-list');
  const po={'high':0,'medium':1,'low':2};
  tickets.sort((a,b)=>(po[a['ความเร่งด่วน']]??9)-(po[b['ความเร่งด่วน']]??9));
  const scColor={'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected'};
  const scTag={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject'};
  const pLabel={'high':'🔴 เร่งด่วน','medium':'🟡 ปานกลาง','low':'🟢 ทั่วไป'};
  const pClass={'high':'p-high','medium':'p-medium','low':'p-low'};
  let html=`<div class="notify-box">
    <h4><i class="fas fa-bell"></i> Email แจ้งเตือน</h4>
    <div class="notify-row">
      <input type="email" id="notify-email-input" placeholder="admin@gmail.com" value="${currentEmail}">
      <button class="btn-notify" id="btn-save-notify" onclick="saveNotifyEmail()"><i class="fas fa-save"></i> บันทึก</button>
    </div>
    ${currentEmail?`<p style="font-size:.8rem;color:#2d6a4f;margin-top:8px;"><i class="fas fa-check-circle"></i> ${currentEmail}</p>`:''}
  </div>`;
  if(!tickets.length){
    container.innerHTML=html+'<div class="no-tickets"><i class="fas fa-inbox" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ไม่มีเรื่อง</p></div>';
    return;
  }
  html+=`<p style="color:#888;margin-bottom:14px;font-size:.85rem;">แสดง ${tickets.length} รายการ (เรียงตามความเร่งด่วน)</p>`;
  tickets.forEach(t=>{
    const tid=t['Ticket ID'], pr=t['ความเร่งด่วน']||'low', isHigh=pr==='high';
    const isPinned=String(t['Pinned']||'').toLowerCase()==='true';
    const comments=t['Comments']||'';
    const commentEntries=comments?comments.split('\n---\n').filter(c=>c.trim()):[];
    // ข้อ 11: ตัดรายละเอียดยาว
    const detail=t['รายละเอียด']||'(ไม่มีรายละเอียด)';
    const detailShort=detail.length>200?detail.substring(0,200)+'...':detail;
    const needExpand=detail.length>200;

    html+=`<div class="admin-ticket-card ${scColor[t['สถานะ']]||'pending'} ${isHigh?'priority-high':''}" id="card-${tid}">
      <div class="admin-card-top">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          ${isHigh?'<span>🚨</span>':''}
          <span class="ticket-id" style="font-size:.96rem;">${tid}</span>
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
          ${currentUser&&currentUser.role==='superadmin'?`<button onclick="deleteTicket('${tid}')"
            style="padding:3px 9px;border-radius:8px;border:1px solid #f5c6c6;
            background:#fff5f5;font-size:.74rem;color:#d00000;font-family:'Sarabun',sans-serif;">
            <i class="fas fa-trash-alt"></i> ลบ
          </button>`:''}
        </div>
      </div>
      <div style="font-size:.97rem;font-weight:700;margin-bottom:10px;">${t['หัวข้อ']||'-'}</div>
      <div class="admin-card-meta">
        <span><strong>ประเภทผู้แจ้ง:</strong> ${t['ประเภทผู้แจ้ง']||'-'}</span>
        <span><strong>ชื่อ:</strong> ${t['ชื่อ']||'-'}</span>
        <span><strong>ประเภทเรื่อง:</strong> ${t['ประเภทเรื่อง']||'-'}</span>
        <span><strong>วันที่แจ้ง:</strong> ${t['วันที่แจ้ง']||'-'}</span>
        <span><strong>กำหนดตอบกลับ:</strong> ${t['กำหนดตอบกลับ']||'-'}</span>
        <span><strong>ผู้รับผิดชอบ:</strong> ${t['ผู้รับผิดชอบ']||'-'}</span>
      </div>
      ${t['หมายเหตุผู้ใช้']?`<div class="admin-user-note">
        <span class="admin-note-label"><i class="fas fa-sticky-note"></i> หมายเหตุจากผู้แจ้ง</span>
        <div class="admin-note-text">${t['หมายเหตุผู้ใช้']}</div>
      </div>`:''}
      ${t['FileURL']&&t['FileURL']!==''?`<div class="admin-file-box">
        <span class="admin-note-label"><i class="fas fa-paperclip"></i> ไฟล์แนบ</span>
        <div class="admin-file-text">${t['FileURL']}</div>
      </div>`:''}
      <div class="detail-box" id="adm-detail-${tid}">
        ${needExpand?detailShort:detail}
        ${needExpand?`<button class="btn-expand" onclick="expandAdminDetail('${tid}','${encodeURIComponent(detail)}')">ดูเพิ่มเติม ▼</button>`:''}
      </div>
      <!-- ความคิดเห็น (ข้อ 6 — แสดงพร้อม timestamp) -->
      ${commentEntries.length?`<div style="margin-bottom:12px;">
        <div style="font-size:.75rem;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;"><i class="fas fa-comments"></i> ความคิดเห็น (${commentEntries.length} รายการ)</div>
        <div class="comments-log">
          ${commentEntries.map((c,idx)=>{
            const mm=c.match(/^\[(.*?)\]\s*(.*?):/);
            const timestamp=mm?mm[1]:'';
            const author=mm?mm[2]:'';
            const text=c.replace(/^\[.*?\].*?:\s*/,'').trim();
            const isLatest=idx===commentEntries.length-1;
            return `<div class="comment-entry ${isLatest?'comment-latest':''}">
              <div class="comment-meta">
                ${isLatest?'<span class="comment-new-badge">ใหม่</span>':''}
                ${author?`<strong style="color:#2d6a4f;">${author}</strong> · `:''}
                <span><i class="fas fa-clock" style="font-size:.65rem;"></i> ${timestamp||'ไม่ระบุเวลา'}</span>
              </div>
              <div class="comment-text">${text}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`:''}
      <!-- เพิ่มความคิดเห็นใหม่ (ข้อ 6 — append ไม่ overwrite) -->
      <div class="comment-add-box">
        <div style="font-size:.78rem;color:#2d6a4f;font-weight:700;margin-bottom:6px;"><i class="fas fa-plus-circle"></i> เพิ่มความคิดเห็น</div>
        <textarea id="new-comment-${tid}" rows="2" placeholder="พิมพ์ความคิดเห็น... (จะบันทึกวันเวลาอัตโนมัติ)"></textarea>
        <button class="btn-comment" onclick="addComment('${tid}')"><i class="fas fa-paper-plane"></i> ส่งความคิดเห็น</button>
      </div>
      <!-- Update row -->
      <div class="update-row" style="margin-top:10px;">
        <select id="status-${tid}">
          <option value="รอดำเนินการ"    ${t['สถานะ']==='รอดำเนินการ'    ?'selected':''}>รอดำเนินการ</option>
          <option value="กำลังดำเนินการ" ${t['สถานะ']==='กำลังดำเนินการ' ?'selected':''}>กำลังดำเนินการ</option>
          <option value="รอตรวจสอบ"      ${t['สถานะ']==='รอตรวจสอบ'      ?'selected':''}>รอตรวจสอบ</option>
          <option value="เสร็จสิ้น"      ${t['สถานะ']==='เสร็จสิ้น'      ?'selected':''}>เสร็จสิ้น</option>
          <option value="ปฏิเสธ"         ${t['สถานะ']==='ปฏิเสธ'         ?'selected':''}>ปฏิเสธ</option>
        </select>
        <input type="text" id="assignee-${tid}" placeholder="ผู้รับผิดชอบ" value="${t['ผู้รับผิดชอบ']||''}">
        <button class="btn-update" onclick="submitUpdate('${tid}')"><i class="fas fa-save"></i> บันทึก</button>
      </div>
    </div>`;
  });
  container.innerHTML=html;
}

function expandAdminDetail(tid,enc){
  const el=document.getElementById('adm-detail-'+tid); if(!el)return;
  const btn=el.querySelector('.btn-expand');
  el.innerHTML=decodeURIComponent(enc); // clear and set full text
}

// ── addComment (ข้อ 6 — append พร้อม timestamp อัตโนมัติ) ──
async function addComment(ticketId){
  const commentEl=document.getElementById('new-comment-'+ticketId);
  const comment=commentEl?.value.trim();
  if(!comment){await showAlert('⚠️','กรุณาพิมพ์ความคิดเห็น','');return;}
  try{
    const res=await api.post('/api/tickets',{
      action:'addComment', ticketId, comment,
      author: currentUser?.fullname||currentUser?.username||'ผู้ดูแล',
    });
    if(res.success){
      if(commentEl) commentEl.value='';
      await showAlert('✅','บันทึกความคิดเห็นสำเร็จ','');
      loadAdminTickets(document.querySelector('.filter-btn.active')?.id?.replace('filter-','')||'pending');
    } else await showAlert('❌','ไม่สำเร็จ',res.message||'');
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

async function togglePin(tid,ns){
  if(!await showConfirm('📌',ns?'ปักหมุด':'ยกเลิกปักหมุด',''))return;
  try{
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
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

async function submitUpdate(tid){
  const ns=document.getElementById('status-'+tid).value;
  const as=document.getElementById('assignee-'+tid).value;
  if(!await showConfirm('💾','ยืนยันการบันทึก',`Ticket: <strong>${tid}</strong><br>สถานะ: <strong>${ns}</strong>`))return;
  const btn=document.querySelector(`#card-${tid} .btn-update`);
  if(btn){btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';btn.disabled=true;}
  try{
    const res=await api.post('/api/tickets',{action:'update',ticketId:tid,newStatus:ns,assignee:as});
    if(res.success){
      const card=document.getElementById('card-'+tid);
      if(card){card.style.transition='background .4s';card.style.background='#d4edda';setTimeout(()=>{card.style.background='';},1500);}
      const sTag={'รอดำเนินการ':'status-pending','กำลังดำเนินการ':'status-inprogress','เสร็จสิ้น':'status-success','ปฏิเสธ':'status-reject','รอตรวจสอบ':'status-review'};
      const scTag={'รอดำเนินการ':'pending','กำลังดำเนินการ':'inprogress','เสร็จสิ้น':'done','ปฏิเสธ':'rejected','รอตรวจสอบ':'pending'};
      card?.querySelector('.status')&&(card.querySelector('.status').className='status '+(sTag[ns]||'status-pending'));
      card?.querySelector('.status')&&(card.querySelector('.status').innerText=ns);
      if(card) card.className=`admin-ticket-card ${scTag[ns]||'pending'}`;
    } else await showAlert('❌','บันทึกไม่สำเร็จ',res.message||'');
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
  finally{if(btn){btn.innerHTML='<i class="fas fa-save"></i> บันทึก';btn.disabled=false;}}
}

// ── deleteTicket (ข้อ 4 — superadmin only) ──
async function deleteTicket(tid){
  if(!await showConfirm('🗑️','ลบ Ticket',`ต้องการลบ Ticket <strong>${tid}</strong> ออกจากระบบ?<br><small style="color:#d00000;">การดำเนินการนี้ไม่สามารถเรียกคืนได้</small>`,'danger'))return;
  try{
    const res=await api.post('/api/tickets',{action:'deleteTicket',ticketId:tid});
    if(res.success){
      const card=document.getElementById('card-'+tid);
      if(card){card.style.transition='opacity .4s';card.style.opacity='0';setTimeout(()=>card.remove(),400);}
      await showAlert('✅','ลบสำเร็จ',`Ticket ${tid} ถูกลบออกจากระบบแล้ว`);
    } else await showAlert('❌','ลบไม่สำเร็จ',res.message||'');
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ── addAdmin (superadmin เพิ่ม admin ใหม่) ──
async function addAdmin(){
  const u=document.getElementById('new-admin-user')?.value.trim();
  const p=document.getElementById('new-admin-pass')?.value;
  const n=document.getElementById('new-admin-name')?.value.trim();
  const e=document.getElementById('new-admin-email')?.value.trim();
  if(!u||!p){await showAlert('⚠️','ข้อมูลไม่ครบ','กรุณากรอก Username และรหัสผ่าน');return;}
  if(p.length<8){await showAlert('⚠️','รหัสผ่านสั้นเกิน','รหัสผ่านต้องอย่างน้อย 8 ตัว');return;}
  try{
    const res=await api.post('/api/auth',{action:'addAdmin',username:u,password:p,fullname:n,email:e});
    if(res.success){
      await showAlert('✅','เพิ่ม Admin สำเร็จ',res.message);
      document.getElementById('new-admin-user').value='';
      document.getElementById('new-admin-pass').value='';
      document.getElementById('new-admin-name').value='';
      document.getElementById('new-admin-email').value='';
      loadSuperAdmin();
    } else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(err){await showAlert('❌','เกิดข้อผิดพลาด',err.message);}
}

// ═══ ADMIN REVIEWS ═══
async function loadReviews(){
  const container=document.getElementById('review-content');
  if(!container)return;
  container.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>';
  try{
    const [ar,sr]=await Promise.all([api.get('/api/ratings?action=all'),api.get('/api/ratings?action=summary')]);
    renderReviews(ar.ratings||[],sr.summary||{avg:0,total:0,dist:{}});
  }catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderReviews(ratings,summary){
  const container=document.getElementById('review-content');
  const avg=summary.avg||0, total=summary.total||0, dist=summary.dist||{};
  let sumHtml=`<div class="rating-summary">
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="text-align:center;">
        <div class="rating-avg">${avg}</div>
        <div style="font-size:1.4rem;margin:6px 0;">${'⭐'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div>
        <div style="font-size:.82rem;color:#888;">${total} รีวิว</div>
      </div>
      <div style="flex:1;min-width:200px;">
        ${[5,4,3,2,1].map(s=>{const cnt=dist[s]||0;const pct=total?Math.round(cnt/total*100):0;
          return `<div class="rating-dist-row"><div class="star-label">${s} ⭐</div><div class="bar-track"><div class="bar-fill orange" style="width:${pct}%"></div></div><div class="bar-count">${cnt}</div></div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
  if(!ratings.length){container.innerHTML=sumHtml+'<div class="no-tickets"><i class="fas fa-star" style="font-size:2.5rem;color:#ddd;"></i><p style="margin-top:12px;">ยังไม่มีรีวิว</p></div>';return;}
  let html=sumHtml;
  ratings.forEach(r=>{
    const stars='⭐'.repeat(r.score)+'☆'.repeat(5-r.score);
    html+=`<div style="background:#fff;border-radius:var(--radius);padding:16px 20px;box-shadow:var(--shadow);margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div><span style="font-weight:700;color:var(--dgreen);font-family:monospace;">${r.ticketId}</span><span style="font-size:1.1rem;margin-left:8px;">${stars}</span></div>
        <span style="font-size:.78rem;color:#aaa;">${r.date||''}</span>
      </div>
      <div style="font-size:.83rem;color:#aaa;margin-bottom:4px;"><i class="fas fa-user"></i> ${r.username||'ไม่ระบุ'}</div>
      ${r.comment?`<div style="background:#f8f8f8;border-radius:8px;padding:10px 12px;font-size:.87rem;color:#444;margin-top:8px;">${r.comment}</div>`:''}
    </div>`;
  });
  container.innerHTML=html;
}

// ═══ SUPERADMIN (ข้อ 10) ═══
async function loadSuperAdmin(){
  const container=document.getElementById('superadmin-content');
  if(!container)return;
  container.innerHTML='<div class="loading-spinner"><i class="fas fa-circle-notch"></i></div>';
  showSATab('news');
}

let currentSATab='news';
function showSATab(tab){
  currentSATab=tab;
  document.querySelectorAll('.sa-tab').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('sa-tab-'+tab); if(btn) btn.classList.add('active');
  if(tab==='news')   loadSANews();
  if(tab==='faq')    loadSAFaq();
  if(tab==='admins') loadSAAdmins();
}

// ── Superadmin: Admin Manager ──
async function loadSAAdmins(){
  const container=document.getElementById('superadmin-content'); if(!container)return;
  try{
    const res=await api.post('/api/auth',{action:'listAdmins'});
    renderSAAdmins(res.admins||[]);
  }catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderSAAdmins(admins){
  const container=document.getElementById('superadmin-content');
  let html=`<div class="superadmin-banner"><i class="fas fa-crown"></i><div><strong>ผู้ดูแลระดับสูง</strong><br><small>จัดการข่าวสาร FAQ และการตั้งค่าระบบ</small></div></div>
  <div class="sa-tabs">
    <button class="sa-tab ${currentSATab==='news'?'active':''}" id="sa-tab-news" onclick="showSATab('news')"><i class="fas fa-newspaper"></i> ข่าวสาร</button>
    <button class="sa-tab ${currentSATab==='faq'?'active':''}" id="sa-tab-faq" onclick="showSATab('faq')"><i class="fas fa-question-circle"></i> FAQ</button>
    <button class="sa-tab ${currentSATab==='admins'?'active':''}" id="sa-tab-admins" onclick="showSATab('admins')"><i class="fas fa-user-shield"></i> ผู้ดูแลระบบ</button>
  </div>
  <div class="news-manager-form">
    <h4><i class="fas fa-user-plus"></i> เพิ่มผู้ดูแลระบบ (Admin) ใหม่</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group" style="margin-bottom:0;"><label>Username <span style="color:#d00000;">*</span></label><input type="text" id="new-admin-user" placeholder="admin_name" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div>
      <div class="form-group" style="margin-bottom:0;"><label>รหัสผ่าน <span style="color:#d00000;">*</span></label><input type="password" id="new-admin-pass" placeholder="อย่างน้อย 8 ตัว" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div>
      <div class="form-group" style="margin-bottom:0;"><label>ชื่อแสดง</label><input type="text" id="new-admin-name" placeholder="ชื่อ-นามสกุล" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div>
      <div class="form-group" style="margin-bottom:0;"><label>อีเมล</label><input type="email" id="new-admin-email" placeholder="admin@yru.ac.th" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div>
    </div>
    <button class="btn-add-news" style="margin-top:14px;" onclick="addAdmin()"><i class="fas fa-plus"></i> เพิ่ม Admin</button>
  </div>
  <p style="font-size:.85rem;color:#888;margin-bottom:14px;">ผู้ดูแลระบบทั้งหมด ${admins.length} คน</p>`;
  if(!admins.length){
    html+=`<div class="no-tickets"><i class="fas fa-user-slash" style="font-size:2rem;color:#ddd;"></i><p style="margin-top:10px;">ยังไม่มีผู้ดูแลระบบ</p></div>`;
  } else {
    admins.forEach(a=>{
      html+=`<div class="news-manager-card" style="display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;background:var(--dgreen);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.1rem;flex-shrink:0;">${(a.fullname||a.username||'A')[0].toUpperCase()}</div>
        <div style="flex:1;">
          <div style="font-weight:700;color:#222;">${a.fullname||a.username}</div>
          <div style="font-size:.82rem;color:#aaa;font-family:monospace;">${a.username} · ${a.email||'ไม่มีอีเมล'}</div>
        </div>
        <span style="font-size:.75rem;padding:3px 10px;border-radius:8px;background:${a.status==='active'?'#e8f5e9':'#fde8e8'};color:${a.status==='active'?'#2d6a4f':'#d00000'};font-weight:700;">${a.status==='active'?'ใช้งาน':'ระงับ'}</span>
      </div>`;
    });
  }
  container.innerHTML=html;
}

// ── Superadmin: News Manager ──
async function loadSANews(){
  const container=document.getElementById('superadmin-content'); if(!container)return;
  try{
    const res=await api.get('/api/news');
    renderSANews(res.news||[]);
  }catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderSANews(news){
  const container=document.getElementById('superadmin-content');
  const tagOpts=['ทั่วไป','ด่วน','ข้อมูล','กิจกรรม'];
  let html=`<div class="superadmin-banner"><i class="fas fa-crown"></i><div><strong>ผู้ดูแลระดับสูง</strong><br><small>จัดการข่าวสาร FAQ และการตั้งค่าระบบ</small></div></div>
  <div class="sa-tabs">
    <button class="sa-tab ${currentSATab==='news'?'active':''}" id="sa-tab-news" onclick="showSATab('news')"><i class="fas fa-newspaper"></i> ข่าวสาร</button>
    <button class="sa-tab ${currentSATab==='faq'?'active':''}" id="sa-tab-faq" onclick="showSATab('faq')"><i class="fas fa-question-circle"></i> FAQ</button>
    <button class="sa-tab ${currentSATab==='admins'?'active':''}" id="sa-tab-admins" onclick="showSATab('admins')"><i class="fas fa-user-shield"></i> ผู้ดูแลระบบ</button>
  </div>
  <div class="news-manager-form">
    <h4><i class="fas fa-plus-circle"></i> เพิ่มข่าวสารใหม่</h4>
    <div class="form-group"><label>หัวเรื่อง <span style="color:#d00000;">*</span></label><input type="text" id="news-title" placeholder="หัวเรื่องข่าว"></div>
    <div class="form-group"><label>เนื้อหา <span style="color:#d00000;">*</span></label><textarea id="news-content" rows="4" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;font-size:.93rem;resize:vertical;"></textarea></div>
    <div class="form-group"><label>URL รูปภาพ <span style="color:#aaa;font-weight:400;">(ไม่บังคับ)</span></label>
      <input type="url" id="news-image" placeholder="https://example.com/image.jpg" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;font-size:.93rem;box-sizing:border-box;">
      <small style="color:#aaa;font-size:.75rem;">ใส่ URL รูปภาพจากภายนอก เช่น Google Drive, Imgur หรือเว็บโรงเรียน</small>
    </div>
    <div class="form-group"><label>Tag</label><select id="news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">
      ${tagOpts.map(t=>`<option value="${t}">${t}</option>`).join('')}
    </select></div>
    <button class="btn-add-news" onclick="addNews()"><i class="fas fa-plus"></i> เพิ่มข่าว</button>
  </div>
  <p style="font-size:.85rem;color:#888;margin-bottom:14px;">ข่าวทั้งหมด ${news.length} รายการ</p>`;
  news.forEach(n=>{
    const shortContent=n.content.length>100?n.content.substring(0,100)+'...':n.content;
    const imgHtml=n.imageUrl?`<img src="${n.imageUrl}" alt="img" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-right:12px;flex-shrink:0;" onerror="this.style.display='none'">`:'';
    html+=`<div class="news-manager-card" style="display:flex;align-items:flex-start;gap:0;">
      ${imgHtml}
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
          <div><span class="news-tag">${n.tag||'ทั่วไป'}</span><strong>${n.title}</strong><span class="news-date">${n.date||''}</span></div>
          <div style="display:flex;gap:6px;">
            <button class="btn-edit-news" onclick="editNews(${JSON.stringify(n).replace(/'/g,'&#39;')})"><i class="fas fa-edit"></i> แก้ไข</button>
            <button class="btn-delete" onclick="deleteNews('${n.newsId}')"><i class="fas fa-trash"></i> ลบ</button>
          </div>
        </div>
        <div style="font-size:.86rem;color:#666;">${shortContent}</div>
      </div>
    </div>`;
  });
  container.innerHTML=html;
}
async function addNews(){
  const title=document.getElementById('news-title')?.value.trim();
  const content=document.getElementById('news-content')?.value.trim();
  const tag=document.getElementById('news-tag')?.value;
  const imageUrl=document.getElementById('news-image')?.value.trim()||'';
  if(!title||!content){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกหัวเรื่องและเนื้อหา');return;}
  try{
    const res=await api.post('/api/news',{action:'add',title,content,tag,imageUrl,author:currentUser?.username||'admin'});
    if(res.success){await showAlert('✅','เพิ่มข่าวสำเร็จ','');loadSANews();}
    else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ── editNews: เปิด modal แก้ไขข่าว ──
function editNews(n){
  const tagOpts=['ทั่วไป','ด่วน','ข้อมูล','กิจกรรม'];
  const overlay=document.createElement('div');
  overlay.className='voc-overlay';
  overlay.id='edit-news-overlay';
  overlay.innerHTML=`<div class="voc-modal-box" style="max-width:600px;">
    <div class="voc-modal-title"><i class="fas fa-edit"></i> แก้ไขข่าวสาร</div>
    <div class="form-group"><label>หัวเรื่อง <span style="color:#d00000;">*</span></label>
      <input type="text" id="edit-news-title" value="${(n.title||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;margin-top:4px;"></div>
    <div class="form-group"><label>เนื้อหา <span style="color:#d00000;">*</span></label>
      <textarea id="edit-news-content" rows="5" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;font-size:.93rem;resize:vertical;box-sizing:border-box;">${n.content||''}</textarea></div>
    <div class="form-group"><label>URL รูปภาพ</label>
      <input type="url" id="edit-news-image" value="${n.imageUrl||''}" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;box-sizing:border-box;"></div>
    <div class="form-group"><label>Tag</label>
      <select id="edit-news-tag" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">
        ${tagOpts.map(t=>`<option value="${t}" ${t===n.tag?'selected':''}>${t}</option>`).join('')}
      </select></div>
    <div class="voc-modal-btns">
      <button class="voc-btn-cancel" onclick="document.body.removeChild(document.getElementById('edit-news-overlay'))">ยกเลิก</button>
      <button class="voc-btn-ok" onclick="updateNews('${n.newsId}')"><i class="fas fa-save"></i> บันทึก</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
async function updateNews(newsId){
  const title=document.getElementById('edit-news-title')?.value.trim();
  const content=document.getElementById('edit-news-content')?.value.trim();
  const tag=document.getElementById('edit-news-tag')?.value;
  if(!title||!content){await showAlert('⚠️','กรุณากรอกข้อมูล','หัวเรื่องและเนื้อหาจำเป็นต้องกรอก');return;}
  try{
    const res=await api.post('/api/news',{action:'update',newsId,title,content,tag});
    if(res.success){
      const o=document.getElementById('edit-news-overlay');if(o)document.body.removeChild(o);
      await showAlert('✅','แก้ไขสำเร็จ','อัปเดตข่าวเรียบร้อยแล้ว');
      loadSANews();
    } else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}
async function deleteNews(newsId){
  if(!await showConfirm('🗑️','ลบข่าว','ต้องการลบข่าวนี้ใช่หรือไม่?','danger'))return;
  try{
    const res=await api.post('/api/news',{action:'delete',newsId});
    if(res.success) loadSANews();
    else await showAlert('❌','ลบไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ── Superadmin: FAQ Manager ──
async function loadSAFaq(){
  const container=document.getElementById('superadmin-content'); if(!container)return;
  try{
    const res=await api.get('/api/faq');
    renderSAFaq(res.faqs||[]);
  }catch(e){ container.innerHTML=`<p style="color:red;">${e.message}</p>`; }
}
function renderSAFaq(faqs){
  const container=document.getElementById('superadmin-content');
  const catOpts=['การใช้งาน','ความเร่งด่วน','ความปลอดภัย','ระบบ','ทั่วไป'];
  let html=`<div class="superadmin-banner"><i class="fas fa-crown"></i><div><strong>ผู้ดูแลระดับสูง</strong><br><small>จัดการข่าวสาร FAQ และการตั้งค่าระบบ</small></div></div>
  <div class="sa-tabs">
    <button class="sa-tab ${currentSATab==='news'?'active':''}" id="sa-tab-news" onclick="showSATab('news')"><i class="fas fa-newspaper"></i> ข่าวสาร</button>
    <button class="sa-tab ${currentSATab==='faq'?'active':''}" id="sa-tab-faq" onclick="showSATab('faq')"><i class="fas fa-question-circle"></i> FAQ</button>
    <button class="sa-tab ${currentSATab==='admins'?'active':''}" id="sa-tab-admins" onclick="showSATab('admins')"><i class="fas fa-user-shield"></i> ผู้ดูแลระบบ</button>
  </div>
  <div class="news-manager-form">
    <h4><i class="fas fa-plus-circle"></i> เพิ่มคำถามใหม่</h4>
    <div class="form-group"><label>หมวดหมู่</label><select id="faq-cat-new" style="padding:8px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;">
      ${catOpts.map(c=>`<option>${c}</option>`).join('')}
    </select></div>
    <div class="form-group"><label>คำถาม *</label><input type="text" id="faq-q-new" placeholder="คำถาม..."></div>
    <div class="form-group"><label>คำตอบ *</label><textarea id="faq-a-new" rows="3" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;font-family:'Sarabun',sans-serif;font-size:.93rem;resize:vertical;" placeholder="คำตอบ..."></textarea></div>
    <button class="btn-add-news" onclick="addFaq()"><i class="fas fa-plus"></i> เพิ่มคำถาม</button>
  </div>
  <p style="font-size:.85rem;color:#888;margin-bottom:14px;">FAQ ทั้งหมด ${faqs.length} รายการ</p>`;
  faqs.forEach(f=>{
    html+=`<div class="news-manager-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
        <div><span class="chip gray" style="margin-right:6px;">${f.category}</span><strong>${f.question}</strong></div>
        <button class="btn-delete" onclick="deleteFaq('${f.faqId}')"><i class="fas fa-trash"></i> ลบ</button>
      </div>
      <div style="font-size:.86rem;color:#666;">${f.answer}</div>
    </div>`;
  });
  container.innerHTML=html;
}
async function addFaq(){
  const cat=document.getElementById('faq-cat-new')?.value;
  const q=document.getElementById('faq-q-new')?.value.trim();
  const a=document.getElementById('faq-a-new')?.value.trim();
  if(!q||!a){await showAlert('⚠️','กรุณากรอกข้อมูล','กรุณากรอกคำถามและคำตอบ');return;}
  try{
    const res=await api.post('/api/faq',{action:'add',category:cat,question:q,answer:a});
    if(res.success){await showAlert('✅','เพิ่มสำเร็จ','');loadSAFaq();}
    else await showAlert('❌','ไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}
async function deleteFaq(faqId){
  if(!await showConfirm('🗑️','ลบคำถาม','','danger'))return;
  try{
    const res=await api.post('/api/faq',{action:'delete',faqId});
    if(res.success) loadSAFaq();
    else await showAlert('❌','ลบไม่สำเร็จ',res.message);
  }catch(e){await showAlert('❌','เกิดข้อผิดพลาด',e.message);}
}

// ═══ INIT ═══
window.onload=function(){
  const saved=loadSession();
  if(saved&&saved.success){
    currentUser=saved;
    if(saved.role==='superadmin') updateMenuForSuperAdmin();
    else if(saved.role==='admin') updateMenuForAdmin();
    else updateMenuForUser();
  }

  // ข้อ 5 — Enter key ทุกที่
  const pairs=[
    ['login-user','login-pass',null,doLogin],
    ['admin-user','admin-pass',null,doAdminLogin],
  ];
  pairs.forEach(([f1,f2,f3,fn])=>{
    const e1=document.getElementById(f1);
    const e2=document.getElementById(f2);
    if(e1) e1.addEventListener('keydown',e=>{if(e.key==='Enter'&&e2)e2.focus();});
    if(e2) e2.addEventListener('keydown',e=>{if(e.key==='Enter'){if(f3&&document.getElementById(f3)){document.getElementById(f3).focus();}else fn();}});
  });
  // Register enter
  const regFields=['reg-firstname','reg-lastname','reg-email','reg-phone','reg-username','reg-pass','reg-pass2'];
  regFields.forEach((id,idx)=>{
    const el=document.getElementById(id); if(!el)return;
    el.addEventListener('input',clearFieldErrors);
    if(idx<regFields.length-1)
      el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const nx=document.getElementById(regFields[idx+1]);if(nx)nx.focus();}});
  });
  const lastReg=document.getElementById('reg-pass2');
  if(lastReg) lastReg.addEventListener('keydown',e=>{if(e.key==='Enter')doRegister();});
  const pw=document.getElementById('reg-pass');
  if(pw) pw.addEventListener('input',updateStrengthBar);
  // Track enter
  const ti=document.getElementById('track-input');
  if(ti) ti.addEventListener('keydown',e=>{if(e.key==='Enter')doTrack();});
  // FAQ search enter
  const fs=document.getElementById('faq-search');
  if(fs) fs.addEventListener('keydown',e=>{if(e.key==='Enter')searchFaq();});

  navigateTo('home');
};
