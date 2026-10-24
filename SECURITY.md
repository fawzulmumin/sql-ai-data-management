# Security

Dokumen ini mencatat postur keamanan monorepo SQL AI Data Management:
status fix dari audit terakhir, follow-up yang belum di-implement, dan
panduan reporting untuk vulnerability baru.

## Status fix dari audit 2026-10-24

Audit menemukan 19 isu (6 KRITIS, 7 TINGGI, 3 SEDANG, 3 RENDAH).

### ✅ Sudah di-fix

| ID    | Severity | Area       | Fix                                                               |
| ----- | -------- | ---------- | ----------------------------------------------------------------- |
| K-1   | KRITIS   | Auth       | JWT asli HS256 (`JWT_SECRET`) menggantikan base64 polos. Semua Validate Token node verify signature + exp. Token lama tidak kompatibel → user harus re-login setelah upgrade. |
| K-3   | KRITIS   | SQL AI Agent | Whitelist nama database (`TestDB`, `TestDB4`) di Parse Code prelude. Request dengan database di luar whitelist di-reject 403. |
| K-4   | KRITIS   | SQL AI Agent | `userId` + `userRole` di-overwrite dari JWT token di Parse Code prelude. Body client tidak lagi dipercaya untuk field ini. `direct_execute=true` di-force `false` untuk non-`db_owner`. |
| K-6   | KRITIS   | Frontend   | `safe-html.directive.ts` dihapus (unused XSS primitive).          |
| T-3   | TINGGI   | Deps       | `npm audit fix --force` → 16 vuln ⇒ 3 vuln. Sisa: xlsx (no fix available) + vite dev-only. |
| T-5   | TINGGI   | Frontend   | File upload validasi MIME + max 5 MB + try/catch XLSX.read.       |
| T-6   | TINGGI   | Frontend   | CSP + X-Content-Type-Options + Referrer-Policy di `index.html`.   |
| T-6   | TINGGI   | Infra      | `N8N_CORS_ALLOW_ORIGIN=http://localhost:4200` default di docker-compose + bind 127.0.0.1. |
| T-7   | TINGGI   | Frontend   | Hapus call ke `api.ipify.org`. IP sekarang di-capture di sisi n8n via header `x-forwarded-for` (opsional, bisa di-pakai di workflow). |
| S-2   | SEDANG   | Frontend   | Validasi format sessionId `/^web-\d+-[a-z0-9]+$/` di `?session=` param + semua call `getHistory`/`deleteSession`. |
| R-1   | RENDAH   | Infra      | `N8N_BASIC_AUTH_ACTIVE=true` default di env.example + docker-compose. |
| R-3   | RENDAH   | Frontend   | `console.log` di services diganti `console.debug` yang di-guard `!environment.production`. |

### ⏳ Follow-up (butuh migrasi atau restructuring, belum di-auto-apply)

| ID    | Severity | Area       | Yang perlu dilakukan                                              |
| ----- | -------- | ---------- | ----------------------------------------------------------------- |
| K-2   | KRITIS   | n8n workflows | IDOR di **Get History**, **Get Sessions**, **Delete Session**, **Save Message**, **Update Message**. Butuh tambah node "Extract User From Token" (code node baru) + rewire supaya SQL `WHERE user_id = $('Extract User').item.json.user_id`. Script `scripts/apply-security-fixes.mjs` tidak auto-apply karena menambah node + ubah connections map berisiko memutus workflow yang sedang jalan. **Workaround sementara**: setelah K-1 (JWT HMAC) aktif, attacker tidak lagi bisa forge token sembarangan, jadi dampak IDOR berkurang dari "siapa pun" jadi "user terotentikasi". Fix penuh butuh restructuring per workflow. |
| K-5   | KRITIS   | Auth       | Password hashing SHA256 polos → bcrypt/argon2. Butuh: (1) install node module `bcryptjs` di n8n (community nodes atau mount sebagai dependency), (2) migrasi hash existing (lazy re-hash saat user login berikutnya pakai password mereka — simpan format baru). Default `.env` password `admin12345` di seed data harus di-rotate. |
| T-1   | TINGGI   | n8n workflows | SQL injection via `sessionId` di workflows Save/Update/Delete yang pakai interpolasi template tanpa escape. Frontend sudah validasi format sessionId (S-2 defense), tapi backend harus escape sendiri. Fix: `{{ sessionId.replace(/'/g, "''") }}` atau pakai parameterized query n8n MSSQL node. |
| T-2   | TINGGI   | Frontend   | Token di `localStorage` rawan XSS. Migrasi ke httpOnly cookie butuh: (1) backend Set-Cookie di login response, (2) credentials: 'include' di HTTP client, (3) CORS tweak. Diperlakukan sebagai sprint sendiri. |
| T-4   | TINGGI   | Auth       | Rate limiting server-side. Butuh tabel `dbo.login_attempts (username, ip, ts)` + check di login workflow (lockout 5x fail dalam 15 menit). Client-side 5-min lockout saat ini (localStorage) **bisa di-bypass** dengan clear localStorage. |
| S-1   | SEDANG   | SQL AI Agent | LLM-generated SQL tanpa strict allowlist. Regex deteksi destructive bypass-able (`/* comment */DROP`). Fix: pakai SQL parser (`node-sql-parser`) untuk whitelist statement type per role. |
| S-3   | SEDANG   | Infra      | **Rotate API key Rindri sekarang** (`sk-rindri-36b86447b959e6aa48f1ccf3bc5adce55a4f7e0c3c315eb9` tercatat di `apps/n8n/credentials.local.md` — walaupun gitignored, repo ada di OneDrive yang auto-sync ke Microsoft cloud). SQL `trustServerCertificate: true` oke untuk dev; production ganti ke `false` + valid cert. |
| R-2   | RENDAH   | Infra      | Pindahkan `apps/n8n/.env` ke lokasi di luar OneDrive (misal symlink dari `C:\dev\sql-ai\.env`), atau exclude folder project dari OneDrive sync, supaya `N8N_ENCRYPTION_KEY` tidak ikut terbackup ke cloud. |

## Setup JWT_SECRET

Sebelum re-import workflow setelah upgrade security:

```powershell
# Generate secret 32-byte random (hex, 64 char — lebih panjang dari minimum 32 char)
$secret = -join ((1..64) | % { '{0:x}' -f (Get-Random -Max 16) })
Add-Content apps\n8n\.env "JWT_SECRET=$secret"
```

Atau pakai Node:
```powershell
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> apps\n8n\.env
```

Lalu re-apply security patches ke workflow (idempoten):
```powershell
node scripts/apply-security-fixes.mjs
# Stop n8n → re-import
# Ctrl+C di terminal n8n
npm run n8n:import
n8n start
```

Semua user existing harus **login ulang** — token lama (base64 polos) tidak kompatibel dengan verifier HMAC baru.

## Reporting vulnerability baru

Email: `fawzulmumin@gmail.com` dengan subject `[SEC] <ringkasan>`.
Jangan buka public issue di GitHub untuk vulnerability yang masih bisa dieksploitasi.

Response time target: 48 jam acknowledgment, 2 minggu fix untuk KRITIS, 1 bulan untuk TINGGI.

## Audit history

| Tanggal     | Versi    | Temuan                       | Ref           |
| ----------- | -------- | ---------------------------- | ------------- |
| 2026-10-24  | 0.1.0    | 19 (6 KRITIS, 7 TINGGI, 3 SEDANG, 3 RENDAH) | Internal review |
