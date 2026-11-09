# Security

Dokumen ini mencatat postur keamanan monorepo SQL AI Data Management:
status fix dari audit terakhir dan
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

Sebagian temuan lain dari audit masih dalam pengerjaan. Rinciannya tidak dipublikasikan sampai selesai diperbaiki.

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

Laporkan secara privat lewat GitHub: buka tab **Security** repo ini → **Report a vulnerability**.
Jangan membuka issue publik untuk vulnerability yang masih bisa dieksploitasi.

Response time target: 48 jam acknowledgment, 2 minggu fix untuk KRITIS, 1 bulan untuk TINGGI.

## Audit history

| Tanggal     | Versi    | Temuan                       | Ref           |
| ----------- | -------- | ---------------------------- | ------------- |
| 2026-10-24  | 0.1.0    | 19 (6 KRITIS, 7 TINGGI, 3 SEDANG, 3 RENDAH) | Internal review |
