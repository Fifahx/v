// public/js/ui.js
// ─────────────────────────────────────────────────────
//  UI helpers — Modal alert / confirm
//  Export: showAlert, showConfirm
// ─────────────────────────────────────────────────────
'use strict';

export function showAlert(icon, title, msg) {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns">
        <button class="voc-btn-ok" id="voc-ok">ตกลง</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-ok').onclick = () => {
      document.body.removeChild(o);
      r(true);
    };
  });
}

export function showConfirm(icon, title, msg, type = 'warning') {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <span class="voc-modal-icon">${icon}</span>
      <div class="voc-modal-title">${title}</div>
      <div class="voc-modal-msg">${msg}</div>
      <div class="voc-modal-btns">
        <button class="voc-btn-cancel" id="voc-c">ยกเลิก</button>
        <button class="voc-btn-ok${type === 'danger' ? ' danger' : ''}" id="voc-ok">ยืนยัน</button>
      </div>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('voc-c').onclick  = () => { document.body.removeChild(o); r(false); };
    document.getElementById('voc-ok').onclick = () => { document.body.removeChild(o); r(true); };
  });
}
