// public/js/router.js
// ─────────────────────────────────────────────────────
//  Page routing + navigation state
//  Export: navigateTo, _doNavigate,
//          closeMobileNav, toggleMobileNav
// ─────────────────────────────────────────────────────
'use strict';

import { loadToken, clearSession } from './session.js';
import { showAlert } from './ui.js';

export const ALL_PAGES = [
  'home', 'login', 'register', 'portal', 'tracking',
  'faq', 'admin-dashboard', 'admin-tickets',
  'admin-reviews', 'admin-report', 'user-report', 'superadmin',
];

// ── ฟังก์ชันเหล่านี้ถูก inject จาก app.js ตอน init ──
// เพื่อหลีกเลี่ยง circular dependency
let _appCallbacks = {};
export function registerRouterCallbacks(callbacks) {
  // ✅ ใช้ Object.defineProperties เพื่อ copy property descriptor ทั้งหมด
  //    รวมถึง getter: get currentUser() { return currentUser } ด้วย
  // ❌ ห้ามใช้ spread { ..._appCallbacks, ...callbacks }
  //    เพราะ spread เรียก getter แล้ว snapshot ค่า ณ ขณะนั้นเป็น plain value
  //    ทำให้ currentUser กลายเป็น null ถาวร แม้ login แล้ว
  Object.defineProperties(
    _appCallbacks,
    Object.getOwnPropertyDescriptors(callbacks),
  );
}

export function toggleMobileNav() {
  const menu = document.getElementById('main-nav');
  const btn  = document.getElementById('hamburger-btn');
  if (!menu || !btn) return;
  menu.classList.toggle('open');
  btn.classList.toggle('open');
}

export function closeMobileNav() {
  const menu = document.getElementById('main-nav');
  const btn  = document.getElementById('hamburger-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.classList.remove('open');
}

function _isTokenExpiredLocal(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload.exp && Math.floor(Date.now() / 1000) > payload.exp;
  } catch (e) { return true; }
}

export function _doNavigate(pageId) {
  closeMobileNav();

  // Guard: admin pages ต้องมี token ที่ยังไม่หมดอายุ
  const adminPages = ['admin-dashboard', 'admin-tickets', 'admin-reviews', 'admin-report', 'superadmin'];
  if (adminPages.includes(pageId)) {
    const token = loadToken();
    if (!token || _isTokenExpiredLocal(token)) {
      clearSession();
      if (_appCallbacks.onSessionExpired) _appCallbacks.onSessionExpired();
      pageId = 'login';
      showAlert('⚠️', 'เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    }
  }

  // ซ่อนทุกหน้า
  ALL_PAGES.forEach(p => {
    const e = document.getElementById('page-' + p);
    if (e) e.classList.add('hidden');
  });
  document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));

  // แสดงหน้าที่เลือก
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.remove('hidden');
  const nav = document.getElementById('nav-' + pageId);
  if (nav) nav.classList.add('active');

  // เรียก page-specific callback
  const cb = _appCallbacks;
  if (pageId === 'portal') {
    if (_doNavigate._guestMode) {
      _doNavigate._guestMode = false;
      if (cb.setupGuestPortalView) cb.setupGuestPortalView();
      // ไม่เรียก changeStep(1) — dismissGuestBanner จะเรียกเองเมื่อ user กดยืนยัน
    } else {
      if (cb.setupPortalView) cb.setupPortalView();
      if (cb.changeStep) cb.changeStep(1);
    }
  }
  if (pageId === 'admin-dashboard') { if (cb.loadDashboard)   cb.loadDashboard(); }
  if (pageId === 'admin-report')    { if (cb.loadReport)      cb.loadReport(); }
  if (pageId === 'admin-tickets')   { if (cb.loadAdminTickets) cb.loadAdminTickets('pending'); }
  if (pageId === 'admin-reviews')   { if (cb.loadReviews)     cb.loadReviews(); }
  if (pageId === 'superadmin')      { if (cb.loadSuperAdmin)  cb.loadSuperAdmin(); }
  if (pageId === 'faq')             { if (cb.loadFaq)         cb.loadFaq(); }
  if (pageId === 'tracking') {
    document.getElementById('track-result').innerHTML = '';
    document.getElementById('track-input').value = '';
    if (cb.currentUser && cb.currentUser.role === 'user' && cb.loadMyTickets) cb.loadMyTickets();
  }
  if (pageId === 'home') {
    if (cb.loadPinnedTickets) cb.loadPinnedTickets();
    if (cb.loadNewsStrip)     cb.loadNewsStrip();
  }
  // scroll ขึ้นบนสุดหลัง DOM render เสร็จ (requestAnimationFrame ให้ browser paint ก่อน)
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

export function navigateTo(pageId) {
  const currentUser = _appCallbacks.currentUser;

  if (pageId === 'portal') {
    // admin/superadmin: ผ่านตรงไป setupPortalView จะจัดการแสดง warning เอง
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin')) {
      _doNavigate(pageId);
      return;
    }
    // user ที่ login แล้ว: ผ่านตรงไปเลย ไม่ต้องแสดง modal
    if (currentUser && currentUser.role === 'user') {
      _doNavigate(pageId);
      return;
    }
    // ยังไม่ login: แสดง modal ให้เลือกประเภท
    if (_appCallbacks.showComplaintTypeModal) {
      _appCallbacks.showComplaintTypeModal(function (choice) {
        if (choice === 'oneway') {
          _doNavigate._guestMode = true;
          _doNavigate('portal');
        } else {
          _doNavigate('login');
          showAlert('ℹ️', 'กรุณาเข้าสู่ระบบ', 'เข้าสู่ระบบหรือลงทะเบียนก่อนนะคะ');
          sessionStorage.setItem('voc_after_login', 'portal');
        }
      });
      return;
    }
  }

  _doNavigate(pageId);
}
