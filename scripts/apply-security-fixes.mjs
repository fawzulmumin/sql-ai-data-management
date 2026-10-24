#!/usr/bin/env node
// Patch n8n workflow JSON secara surgical untuk security fixes.
// Jalankan: node scripts/apply-security-fixes.mjs
// Setelah selesai, re-import ke n8n: `npm run n8n:import` (n8n harus stop).
//
// Scope:
//   - Auth Service: K-1 real JWT HMAC + Validate Token signature verify (semua 4 node)
//   - SQL AI Agent: K-3 database whitelist + K-4 role from token + nonaktifkan
//                   direct_execute untuk non-db_owner
//
// Follow-up (BELUM di-auto-patch, perlu restructuring workflow):
//   - K-2 IDOR di Get History / Get Sessions / Delete Session / Save Message / Update Message
//     butuh menambah node "Extract User From Token" + rewire. Lihat SECURITY.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(__dirname, '..', 'apps', 'n8n', 'workflows');

const JWT_GENERATE = `const crypto = require('crypto');
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  return { json: { success: false, error: 'JWT_SECRET belum di-set di environment n8n (min 32 char)', status: 500 } };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const user = $('Prepare Hash Input ').first().json;

const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  user_id: user.user_id,
  username: user.username,
  role: user.role,
  exp: Math.floor(Date.now() / 1000) + (8 * 3600)
};

const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
const sig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
const token = unsigned + '.' + sig;

return {
  json: {
    success: true,
    token: token,
    user: {
      user_id: user.user_id,
      username: user.username,
      fullname: user.fullname,
      role: user.role
    }
  }
};`;

const JWT_VERIFY_HELPER = `const crypto = require('crypto');
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  return { json: { _error: 'Server mis-config: JWT_SECRET belum di-set', _status: 500 } };
}

function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Format token tidak valid');
  const [h, p, s] = parts;
  const expected = crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature token tidak valid');
  }
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}

`;

const VALIDATE_CREATE_USER = JWT_VERIFY_HELPER + `
const headers = $input.first().json.headers;
const body = $input.first().json.body;
const authHeader = headers.authorization || headers.Authorization || '';
const token = authHeader.replace('Bearer ', '');

if (!token) return { json: { _error: 'Token tidak ditemukan. Silakan login.', _status: 401 } };

let payload;
try { payload = verifyJwt(token); } catch (e) {
  return { json: { _error: 'Token tidak valid: ' + e.message, _status: 401 } };
}

if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
  return { json: { _error: 'Token kadaluarsa. Silakan login ulang.', _status: 401 } };
}

const userRoles = (payload.role || '').split(',').map(r => r.trim());
if (!userRoles.includes('db_owner')) {
  return { json: { _error: 'Akses ditolak. Hanya db_owner yang bisa menambah user.', _status: 403 } };
}

const { username, password, fullname, role } = body;

if (!username || username.length < 3) return { json: { _error: 'Username minimal 3 karakter', _status: 400 } };
if (!/^[a-zA-Z0-9_]+$/.test(username)) return { json: { _error: 'Username hanya boleh huruf, angka, underscore', _status: 400 } };
if (!password || password.length < 8) return { json: { _error: 'Password minimal 8 karakter', _status: 400 } };

const validRoles = ['db_owner','db_securityadmin','db_accessadmin','db_ddladmin',
                    'db_datawriter','db_datareader','db_backupoperator',
                    'db_denydatareader','db_denydatawriter'];

const roleList = (role || '').split(',').map(r => r.trim()).filter(Boolean);
if (roleList.length === 0) return { json: { _error: 'Minimal pilih 1 role', _status: 400 } };
for (const r of roleList) {
  if (!validRoles.includes(r)) return { json: { _error: 'Role tidak valid: ' + r, _status: 400 } };
}

const salt = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
const stringToHash = salt + password;

return {
  json: {
    _error: null,
    username: username,
    plain_password: password,
    fullname: fullname || username,
    role: roleList.join(','),
    salt: salt,
    string_to_hash: stringToHash
  }
};`;

const VALIDATE_TOKEN_LIST = JWT_VERIFY_HELPER + `
const headers = $input.first().json.headers;
const authHeader = headers.authorization || headers.Authorization || '';
const token = authHeader.replace('Bearer ', '');

if (!token) return { json: { _error: 'Token tidak ditemukan', _status: 401 } };

let payload;
try { payload = verifyJwt(token); } catch (e) {
  return { json: { _error: 'Token tidak valid', _status: 401 } };
}

if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
  return { json: { _error: 'Token kadaluarsa', _status: 401 } };
}

const userRoles = (payload.role || '').split(',').map(r => r.trim());
if (!userRoles.includes('db_owner')) {
  return { json: { _error: 'Akses ditolak. Hanya db_owner.', _status: 403 } };
}

return { json: { valid: true, _error: null } };`;

const VALIDATE_UPDATE_ROLE = JWT_VERIFY_HELPER + `
const headers = $input.first().json.headers;
const body = $input.first().json.body;
const authHeader = headers.authorization || headers.Authorization || '';
const token = authHeader.replace('Bearer ', '');

if (!token) return { json: { _error: 'Token tidak ditemukan', _status: 401 } };

let payload;
try { payload = verifyJwt(token); } catch (e) {
  return { json: { _error: 'Token tidak valid', _status: 401 } };
}

if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
  return { json: { _error: 'Token kadaluarsa', _status: 401 } };
}

const userRoles = (payload.role || '').split(',').map(r => r.trim());
if (!userRoles.includes('db_owner')) {
  return { json: { _error: 'Akses ditolak', _status: 403 } };
}

const userId = parseInt(body.user_id);
const newRole = (body.role || '').trim();

if (!userId || userId <= 0 || isNaN(userId)) return { json: { _error: 'User ID tidak valid', _status: 400 } };

const roleList = newRole.split(',').map(r => r.trim()).filter(Boolean);
if (roleList.length === 0) return { json: { _error: 'Minimal pilih 1 role', _status: 400 } };

const validRoles = ['db_owner','db_securityadmin','db_accessadmin','db_ddladmin',
                    'db_datawriter','db_datareader','db_backupoperator',
                    'db_denydatareader','db_denydatawriter'];

for (const r of roleList) {
  if (!validRoles.includes(r)) return { json: { _error: 'Role tidak valid: ' + r, _status: 400 } };
}

if (userId === payload.user_id && !roleList.includes('db_owner')) {
  return { json: { _error: 'Anda tidak dapat menghapus role db_owner dari akun sendiri', _status: 400 } };
}

return {
  json: {
    _error: null,
    user_id: userId,
    new_role: roleList.join(','),
    total_roles: roleList.length
  }
};`;

const VALIDATE_DELETE = JWT_VERIFY_HELPER + `
const headers = $input.first().json.headers;
const body = $input.first().json.body;
const authHeader = headers.authorization || headers.Authorization || '';
const token = authHeader.replace('Bearer ', '');

if (!token) return { json: { _error: 'Token tidak ditemukan', _status: 401 } };

let payload;
try { payload = verifyJwt(token); } catch (e) {
  return { json: { _error: 'Token tidak valid', _status: 401 } };
}

if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
  return { json: { _error: 'Token kadaluarsa', _status: 401 } };
}

if (!(payload.role || '').split(',').map(r=>r.trim()).includes('db_owner')) {
  return { json: { _error: 'Akses ditolak', _status: 403 } };
}

const userId = parseInt(body.user_id);
if (!userId || userId <= 0) return { json: { _error: 'User ID tidak valid', _status: 400 } };
if (userId === payload.user_id) return { json: { _error: 'Tidak dapat menghapus akun sendiri', _status: 400 } };

return { json: { target_user_id: userId, _error: null } };`;

// ---------- Patcher helpers ----------

function patchWorkflow(filename, patchFn) {
  const path = join(WORKFLOWS, filename);
  const raw = readFileSync(path, 'utf8');
  const wf = JSON.parse(raw);
  patchFn(wf);
  // n8n export menggunakan JSON tanpa indent (single line). Pertahankan format.
  writeFileSync(path, JSON.stringify(wf) + '\n', 'utf8');
  console.log('  ✓ patched:', filename);
}

function findNode(wf, name) {
  const n = wf.nodes.find(x => x.name === name);
  if (!n) throw new Error(`Node not found: ${name}`);
  return n;
}

function tryFindNode(wf, name) {
  return wf.nodes.find(x => x.name === name);
}

// ---------- Auth Service ----------
console.log('\n[Auth Service.json]');
patchWorkflow('Auth Service.json', (wf) => {
  findNode(wf, 'Generate Token').parameters.jsCode = JWT_GENERATE;
  findNode(wf, 'Validate Token & Hash Password').parameters.jsCode = VALIDATE_CREATE_USER;
  findNode(wf, 'Validate Token - List').parameters.jsCode = VALIDATE_TOKEN_LIST;
  findNode(wf, 'Validate & Prepare Role').parameters.jsCode = VALIDATE_UPDATE_ROLE;
  findNode(wf, 'Validate Delete').parameters.jsCode = VALIDATE_DELETE;
});

// ---------- SQL AI Agent ----------
// Patch node "Parse Code" (atau nama serupa) agar:
// 1. Verify JWT dan extract role + userId dari token (overwrite body)
// 2. Whitelist nama database
// 3. Nonaktifkan direct_execute kalau role bukan db_owner
console.log('\n[SQL AI Agent.json]');
patchWorkflow('SQL AI Agent.json', (wf) => {
  const parse = tryFindNode(wf, 'Parse Code') || tryFindNode(wf, 'Prepare Request');
  if (!parse || !parse.parameters.jsCode) {
    console.warn('  ! Node "Parse Code" tidak ditemukan. Lewati patch SQL AI Agent.');
    return;
  }
  const existing = parse.parameters.jsCode;
  const prelude = `${JWT_VERIFY_HELPER}// --- Security prelude ---
const _headers = $input.first().json.headers || {};
const _authHeader = _headers.authorization || _headers.Authorization || '';
const _rawToken = _authHeader.replace('Bearer ', '');
let _tokenPayload = null;
if (_rawToken) {
  try { _tokenPayload = verifyJwt(_rawToken); } catch (e) {}
  if (_tokenPayload && _tokenPayload.exp && _tokenPayload.exp < Math.floor(Date.now()/1000)) _tokenPayload = null;
}
const _ALLOWED_DB = ['TestDB', 'TestDB4'];
const _bodyRef = $input.first().json.body;
if (_bodyRef) {
  if (_bodyRef.database && !_ALLOWED_DB.includes(_bodyRef.database)) {
    return { json: { success: false, error: 'Database tidak diizinkan: ' + _bodyRef.database, status: 403 } };
  }
  if (_tokenPayload) {
    _bodyRef.userId = _tokenPayload.user_id;
    _bodyRef.userRole = _tokenPayload.role;
  }
  const _roles = ((_bodyRef.userRole) || '').split(',').map(r => r.trim());
  if (!_roles.includes('db_owner')) _bodyRef.direct_execute = false;
}
// --- End security prelude ---

`;
  parse.parameters.jsCode = prelude + existing;
});

console.log('\n✅ Patch selesai (K-1 JWT, K-3 whitelist DB, K-4 role from token).');
console.log('⏳ Follow-up manual (lihat SECURITY.md): K-2 IDOR, K-5 bcrypt, T-4 server rate limit.');
console.log('⚠️  Set JWT_SECRET di apps/n8n/.env (min 32 char) sebelum re-import.');
console.log('⚠️  User existing akan perlu re-login (token lama tidak valid dengan HMAC baru).');
