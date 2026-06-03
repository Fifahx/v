// public/js/ui.js
// ─────────────────────────────────────────────────────
//  UI helpers — Modal alert / confirm
//  Export: showAlert, showConfirm
//
//  showAlert(title, msg)         — แสดง modal แจ้งเตือน
//  showConfirm(title, msg, type) — แสดง modal ยืนยัน
//  ไม่มี icon/emoji parameter อีกต่อไป
// ─────────────────────────────────────────────────────
'use strict';

export function showAlert(title, msg) {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <div class="voc-modal-title">${title}</div>
      ${msg ? `<div class="voc-modal-msg">${msg}</div>` : ''}
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

export function showConfirm(title, msg, type = 'warning') {
  return new Promise(r => {
    const o = document.createElement('div');
    o.className = 'voc-overlay';
    o.innerHTML = `<div class="voc-modal-box">
      <div class="voc-modal-title">${title}</div>
      ${msg ? `<div class="voc-modal-msg">${msg}</div>` : ''}
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
