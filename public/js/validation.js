// public/js/validation.js
// ─────────────────────────────────────────────────────
//  Form validation + password strength
//  Export: validateRegister, checkPasswordStrength,
//          updateStrengthBar, clearFieldErrors, showFieldError
// ─────────────────────────────────────────────────────
'use strict';

export function clearFieldErrors() {
  document.querySelectorAll('#page-register .field-err').forEach(e => e.remove());
  document.querySelectorAll('#page-register input').forEach(e => e.classList.remove('input-error'));
}

export function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  const e = document.createElement('p');
  e.className = 'field-err';
  e.innerHTML = `<i class="fas fa-exclamation-circle"></i>${msg}`;
  el.parentNode.appendChild(e);
  el.focus();
}

export function checkPasswordStrength(pw) {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw))       s++;
  if (/[0-9]/.test(pw))       s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

export function updateStrengthBar() {
  const pw  = document.getElementById('reg-pass')?.value || '';
  const bar = document.getElementById('pw-bar');
  const lbl = document.getElementById('pw-label');
  if (!bar) return;
  const s  = checkPasswordStrength(pw);
  const lv = [
    { p: '0%',   c: '#eee',     t: '' },
    { p: '20%',  c: '#d00000',  t: 'อ่อนมาก' },
    { p: '40%',  c: '#f77f00',  t: 'อ่อน' },
    { p: '60%',  c: '#e7e71b',  t: 'พอใช้' },
    { p: '80%',  c: '#40916c',  t: 'ดี' },
    { p: '100%', c: '#2d6a4f',  t: 'แข็งแกร่ง' },
  ][s] || { p: '0%', c: '#eee', t: '' };
  bar.style.width      = lv.p;
  bar.style.background = lv.c;
  lbl.innerText        = lv.t;
  lbl.style.color      = lv.c;
}

export function validateRegister() {
  clearFieldErrors();
  const fn = document.getElementById('reg-firstname')?.value.trim();
  const ln = document.getElementById('reg-lastname')?.value.trim();
  const em = document.getElementById('reg-email')?.value.trim();
  const ph = document.getElementById('reg-phone')?.value.trim();
  const un = document.getElementById('reg-username')?.value.trim();
  const pw = document.getElementById('reg-pass')?.value;
  const p2 = document.getElementById('reg-pass2')?.value;

  if (!fn) { showFieldError('reg-firstname', 'กรุณากรอกชื่อ'); return false; }
  if (!ln) { showFieldError('reg-lastname',  'กรุณากรอกนามสกุล'); return false; }
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    showFieldError('reg-email', 'รูปแบบอีเมลไม่ถูกต้อง'); return false;
  }
  if (ph) {
    if (!/^\d+$/.test(ph)) { showFieldError('reg-phone', 'เบอร์โทรต้องเป็นตัวเลขเท่านั้น'); return false; }
    if (ph.length < 9 || ph.length > 10) { showFieldError('reg-phone', 'เบอร์โทรต้องมี 9-10 หลัก'); return false; }
  }
  if (!un) { showFieldError('reg-username', 'กรุณากำหนดชื่อผู้ใช้'); return false; }
  if (un.length < 4) { showFieldError('reg-username', 'ชื่อผู้ใช้ต้องอย่างน้อย 4 ตัว'); return false; }
  if (!/^[a-zA-Z0-9_]+$/.test(un)) { showFieldError('reg-username', 'ใช้ได้เฉพาะ a-z, 0-9 และ _'); return false; }
  if (!pw) { showFieldError('reg-pass', 'กรุณากรอกรหัสผ่าน'); return false; }
  if (pw.length < 8) { showFieldError('reg-pass', 'รหัสผ่านต้องอย่างน้อย 8 ตัว'); return false; }
  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(pw)) { showFieldError('reg-pass', 'ต้องมีทั้งตัวอักษรและตัวเลข'); return false; }
  if (checkPasswordStrength(pw) < 2) { showFieldError('reg-pass', 'รหัสผ่านอ่อนเกินไป'); return false; }
  if (pw !== p2) { showFieldError('reg-pass2', 'รหัสผ่านไม่ตรงกัน'); return false; }
  return true;
}
