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
  'home', 'login', 'register', 'portal', 'tracking', 'manual',
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
  const btn = document.getElementById('hamburger-btn');
  if (!menu || !btn) return;
  menu.classList.toggle('open');
  btn.classList.toggle('open');
}

export function closeMobileNav() {
  const menu = document.getElementById('main-nav');
  const btn = document.getElementById('hamburger-btn');
  if (menu) menu.classList.remove('open');
  if (btn) btn.classList.remove('open');
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
      showAlert('เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
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
  if (pageId === 'admin-dashboard') { if (cb.loadDashboard) cb.loadDashboard(); }
  if (pageId === 'admin-report') { if (cb.loadReport) cb.loadReport(); }
  if (pageId === 'admin-tickets') { if (cb.loadAdminTickets) cb.loadAdminTickets('pending'); }
  if (pageId === 'admin-reviews') { if (cb.loadReviews) cb.loadReviews(); }
  if (pageId === 'superadmin') { if (cb.loadSuperAdmin) cb.loadSuperAdmin(); }
  if (pageId === 'faq') { if (cb.loadFaq) cb.loadFaq(); }
  if (pageId === 'tracking') {
    document.getElementById('track-result').innerHTML = '';
    document.getElementById('track-input').value = '';
    // โหลด my tickets เสมอ (ทั้ง guest และ user) — loadMyTickets จัดการ state เอง
    if (cb.loadMyTickets) cb.loadMyTickets();
  }
  if (pageId === 'home') {
    if (cb.loadPinnedTickets) cb.loadPinnedTickets();
    if (cb.loadNewsStrip) cb.loadNewsStrip();
  }
  // ── Scroll past hero ────────────────────────────────────────────────────
  // หน้า home → scroll ขึ้นบนสุด (hero ควรเห็น)
  // หน้าอื่นทุกหน้า → scroll ไปที่ .container (ด้านล่างต่อจาก hero)
  //   เพื่อให้ผู้ใช้รู้ว่าหน้าเปลี่ยนแล้ว ไม่ต้องเห็น hero ซ้ำทุกครั้ง
  requestAnimationFrame(() => {
    if (pageId === 'home') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      const container = document.querySelector('.container');
      if (container) {
        // คำนวณ offset จาก top ของ document และ scroll ลงมา
        // ลบ 8px เพื่อให้มี breathing room เล็กน้อยเหนือเนื้อหา
        const offset = container.getBoundingClientRect().top + window.scrollY - 8;
        window.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
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
    // ยังไม่ login: แสดง modal ให้เลือกประเภทก่อน (เหมือนเดิม)
    if (_appCallbacks.showComplaintTypeModal) {
      _appCallbacks.showComplaintTypeModal(function (choice) {
        if (choice === 'oneway') {
          // เลือกแจ้งทางเดียว → set flag ให้ setupGuestPortalView วาง badge บนฟอร์ม
          _doNavigate._guestMode = true;
          _doNavigate('portal');
        } else {
          _doNavigate('login');
          showAlert('ℹ️', 'กรุณาเข้าสู่ระบบหรือลงทะเบียน');
          sessionStorage.setItem('voc_after_login', 'portal');
        }
      });
      return;
    }
  }

  _doNavigate(pageId);
}