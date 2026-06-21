// public/js/ui.js
// ─────────────────────────────────────────────────────
//  UI helpers — Modal alert / confirm
//  Export: showAlert, showConfirm
//
//  showAlert(title, msg, type?)          — แสดง modal แจ้งเตือน
//  showConfirm(title, msg, type?)        — แสดง modal ยืนยัน
//
//  type: 'success' | 'warning' | 'danger' | 'info' (auto-detect ถ้าไม่ระบุ)
//  - Enter  = ยืนยัน/ตกลง (ปุ่ม default)
//  - Escape = ยกเลิก (เฉพาะ confirm)
// ─────────────────────────────────────────────────────
'use strict';

// ── ไอคอน SVG แบบมี animation ในตัว ──────────────────────────
const ICONS = {
  success: `
    <svg class="voc-icon voc-icon-success" viewBox="0 0 64 64" width="56" height="56">
      <circle class="voc-icon-circle" cx="32" cy="32" r="28" fill="none" stroke="#2d6a4f" stroke-width="4"/>
      <path class="voc-icon-check" fill="none" stroke="#2d6a4f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M18 33 L27 42 L46 21"/>
    </svg>`,
  danger: `
    <svg class="voc-icon voc-icon-danger" viewBox="0 0 64 64" width="56" height="56">
      <circle class="voc-icon-circle" cx="32" cy="32" r="28" fill="none" stroke="#d00000" stroke-width="4"/>
      <path class="voc-icon-x" fill="none" stroke="#d00000" stroke-width="5" stroke-linecap="round" d="M22 22 L42 42 M42 22 L22 42"/>
    </svg>`,
  warning: `
    <svg class="voc-icon voc-icon-warning" viewBox="0 0 64 64" width="56" height="56">
      <circle class="voc-icon-circle" cx="32" cy="32" r="28" fill="none" stroke="#b8860b" stroke-width="4"/>
      <line class="voc-icon-bang-line" x1="32" y1="18" x2="32" y2="36" stroke="#b8860b" stroke-width="5" stroke-linecap="round"/>
      <circle class="voc-icon-bang-dot" cx="32" cy="46" r="3.2" fill="#b8860b"/>
    </svg>`,
  info: `
    <svg class="voc-icon voc-icon-info" viewBox="0 0 64 64" width="56" height="56">
      <circle class="voc-icon-circle" cx="32" cy="32" r="28" fill="none" stroke="#1d6fa4" stroke-width="4"/>
      <circle class="voc-icon-info-dot" cx="32" cy="20" r="3.2" fill="#1d6fa4"/>
      <line class="voc-icon-info-line" x1="32" y1="29" x2="32" y2="45" stroke="#1d6fa4" stroke-width="5" stroke-linecap="round"/>
    </svg>`,
};

// ── auto-detect type จากเนื้อหา title (ถ้าไม่ได้ระบุ type ชัดเจน) ──
function _detectType(title) {
  const t = title || '';
  if (/สำเร็จ|เรียบร้อย|เพิ่ม.*สำเร็จ|แก้ไขสำเร็จ|บันทึกสำเร็จ|ขอบคุณ/.test(t)) return 'success';
  if (/ลบ|danger|อันตราย|ไม่สามารถเรียกคืน/.test(t)) return 'danger';
  if (/ไม่สำเร็จ|ผิดพลาด|error|ล้มเหลว/i.test(t)) return 'danger';
  if (/ยืนยัน|ต้องการ|warning|แน่ใจ/.test(t)) return 'warning';
  return 'info';
}

// ── สร้าง modal element (ใช้ร่วมกันทั้ง alert/confirm) ──────────
function _buildModal({ title, msg, type, buttons }) {
  const o = document.createElement('div');
  o.className = 'voc-overlay';
  o.dataset.vocManagedByUi = '1'; // บอก global handler (app.js) ว่า keyboard ถูกจัดการที่นี่แล้ว
  o.innerHTML = `<div class="voc-modal-box" role="dialog" aria-modal="true">
    <div class="voc-modal-icon-wrap">${ICONS[type] || ICONS.info}</div>
    <div class="voc-modal-title">${title}</div>
    ${msg ? `<div class="voc-modal-msg">${msg}</div>` : ''}
    <div class="voc-modal-btns">${buttons}</div>
  </div>`;
  return o;
}

// ── jiggle effect บนไอคอนเมื่อกดยืนยัน (ผู้ใช้ขอ: "ขยับติ๊ก") ──
function _celebrateIcon(overlay) {
  const icon = overlay.querySelector('.voc-icon-success, .voc-icon-warning');
  if (icon) icon.classList.add('voc-icon-pop');
}

export function showAlert(title, msg, type) {
  const resolvedType = type || _detectType(title);
  return new Promise(r => {
    const o = _buildModal({
      title, msg, type: resolvedType,
      buttons: `<button class="voc-btn-ok" id="voc-ok">ตกลง</button>`,
    });
    document.body.appendChild(o);

    const okBtn = document.getElementById('voc-ok');
    okBtn.focus(); // โฟกัสปุ่มทันที เพื่อรองรับ Enter จาก native button behavior ด้วย

    const cleanup = (result) => {
      document.removeEventListener('keydown', onKey);
      if (document.body.contains(o)) document.body.removeChild(o);
      r(result);
    };

    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        cleanup(true);
      }
    };
    document.addEventListener('keydown', onKey);

    okBtn.onclick = () => cleanup(true);
  });
}

export function showConfirm(title, msg, type) {
  const resolvedType = type || _detectType(title);
  return new Promise(r => {
    const o = _buildModal({
      title, msg, type: resolvedType,
      buttons: `
        <button class="voc-btn-cancel" id="voc-c">ยกเลิก</button>
        <button class="voc-btn-ok${resolvedType === 'danger' ? ' danger' : ''}" id="voc-ok">ยืนยัน</button>`,
    });
    document.body.appendChild(o);

    const okBtn = document.getElementById('voc-ok');
    const cancelBtn = document.getElementById('voc-c');
    okBtn.focus(); // default action = Enter ยืนยัน

    const cleanup = (result) => {
      document.removeEventListener('keydown', onKey);
      if (document.body.contains(o)) document.body.removeChild(o);
      r(result);
    };

    const confirmAction = () => {
      // เล่น animation ติ๊กถูก/เด้งก่อน แล้วค่อยปิด modal
      if (resolvedType === 'success' || resolvedType === 'warning') {
        _celebrateIcon(o);
        setTimeout(() => cleanup(true), 220);
      } else {
        cleanup(true);
      }
    };

    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmAction(); }
      else if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
    };
    document.addEventListener('keydown', onKey);

    cancelBtn.onclick = () => cleanup(false);
    okBtn.onclick = confirmAction;
  });
}
