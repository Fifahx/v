// public/js/session.js
// ─────────────────────────────────────────────────────
//  JWT + localStorage session management
//  Export: saveSession, loadSession, clearSession,
//          loadToken, _isTokenExpired
// ─────────────────────────────────────────────────────
'use strict';

export function _isTokenExpired(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload.exp && Math.floor(Date.now() / 1000) > payload.exp;
  } catch (e) {
    return true;
  }
}

export function saveSession(u) {
  try {
    const { token, ...rest } = u;
    localStorage.setItem('voc_session', JSON.stringify(rest));
    if (token) localStorage.setItem('voc_token', token);
  } catch (e) {}
}

export function clearSession() {
  try { localStorage.removeItem('voc_session'); } catch (e) {}
  try { localStorage.removeItem('voc_token'); } catch (e) {}
  try { sessionStorage.removeItem('voc_token'); } catch (e) {}
}

export function loadSession() {
  try {
    const r = localStorage.getItem('voc_session');
    if (!r) return null;
    const token = loadToken();
    if (token && _isTokenExpired(token)) {
      localStorage.removeItem('voc_session');
      localStorage.removeItem('voc_token');
      return null;
    }
    const parsed = JSON.parse(r);
    // ตรวจว่ามี role จึงจะถือว่าเป็น session ที่ valid
    if (!parsed || !parsed.role) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function loadToken() {
  try {
    return localStorage.getItem('voc_token')
      || sessionStorage.getItem('voc_token')
      || '';
  } catch (e) {
    return '';
  }
}
