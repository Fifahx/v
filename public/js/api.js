// public/js/api.js
// ─────────────────────────────────────────────────────
//  Fetch wrapper — แนบ Authorization: Bearer <token>
//  ทุก request โดยอัตโนมัติ
//  Export: api (object)
// ─────────────────────────────────────────────────────
'use strict';

import { loadToken } from './session.js';

export const api = {
  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = loadToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  },

  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    return r.json();
  },

  async patch(url, body) {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    return r.json();
  },

  async get(url) {
    const r = await fetch(url, { headers: this._headers() });
    return r.json();
  },
};
