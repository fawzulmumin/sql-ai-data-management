# SQL AI — n8n Backend

Workflow n8n yang jadi backend SQL AI Data Management:

- **Auth Service** — login + CRUD user (role-based).
- **SQL AI Agent** — NL → SQL → eksekusi → narasi hasil.
- **Database Explorer / Selector** — introspeksi schema.
- **Chat history** — Save/Update Message, Get Sessions, Get History, Delete Session.

Semua workflow terhubung ke Microsoft SQL Server via node `n8n-nodes-base.microsoftSql`.

## Prasyarat

- Node.js 20+ (untuk n8n native) **atau** Docker Desktop.
- Microsoft SQL Server lokal/remote.
- Database `TestDB` sudah di-restore + punya tabel `dbo.users`, `dbo.chat_sessions`, `dbo.chat_messages`. Lihat [`../../database/README.md`](../../database/README.md).

## Setup lokal di Windows (recommended)

Urutan ini sudah divalidasi end-to-end. Ikuti berurutan.

### 1. Install dan start n8n

```powershell
npm install -g n8n

cd apps\n8n
copy .env.example .env
notepad .env   # minimal isi N8N_ENCRYPTION_KEY (32-char random; generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

n8n start
```

Buka `http://localhost:5678`.

> **Troubleshoot `SQLite package has not been found installed`.** Install global n8n di Windows kadang skip build native sqlite3. Fix sekali:
>
> ```powershell
> cd "$(npm root -g)\n8n\node_modules\sqlite3"
> npx --yes prebuild-install -r napi
> ```
>
> Lalu `n8n start` lagi.

### 2. Setup owner account n8n (first-time only)

UI akan minta buat **owner account** — email + password pilihan Anda sendiri, disimpan lokal di `~/.n8n/database.sqlite`. Ini akun untuk login UI editor n8n saja, **tidak ada hubungan** dengan akun aplikasi SQL AI atau SQL login.

### 3. Enable SQL Server TCP + buat SQL Login

Workflow pakai driver `tedious` yang tidak support Windows Authentication secara stabil. **Pakai SQL Authentication** (mixed-mode).

**Di SSMS**, right-click server → Properties → Security → **SQL Server and Windows Authentication mode** → OK (restart service bila diminta).

**Enable TCP port 1433** (named instance pakai dynamic port by default). Via SQL Server Configuration Manager (`C:\Windows\SysWOW64\SQLServerManager16.msc`):

- SQL Server Network Configuration → Protocols for SQLEXPRESS22B → right-click **TCP/IP** → Enable.
- Double-click TCP/IP → tab IP Addresses → scroll ke **IPAll** → TCP Dynamic Ports: kosongkan, TCP Port: `1433` → OK.
- Restart service **SQL Server (SQLEXPRESS22B)**.

Verifikasi:
```powershell
Test-NetConnection localhost -Port 1433
# TcpTestSucceeded : True
```

**Buat SQL Login** untuk n8n (SSMS → Security → Logins → New Login):
- Login name: `n8n_user`
- SQL Server authentication, password: `(set strong password)`
- Uncheck "Enforce password policy" (dev saja)
- User Mapping → centang `TestDB` (+ database lain yang mau Anda query) → role `db_owner`

Test di sqlcmd:
```powershell
sqlcmd -S localhost -U n8n_user -P "YourPassword" -d TestDB -Q "SELECT COUNT(*) FROM dbo.users;"
```

### 4. Buat credentials di n8n UI

n8n UI → sidebar **Credentials** → **+ Create Credential**.

**Microsoft SQL** — pilih dari list → isi:

| Field                    | Value                                 |
| ------------------------ | ------------------------------------- |
| Credential Name          | `Microsoft SQL account`               |
| Server                   | `localhost`                           |
| Database                 | `TestDB`                              |
| User                     | `n8n_user`                            |
| Password                 | *(password dari step 3)*              |
| Port                     | `1433`                                |
| Domain                   | **(KOSONG)**                          |
| TLS                      | **OFF**                               |
| Ignore SSL Issues        | OFF                                   |
| TDS Version              | `7_4 (SQL Server 2012 ~ 2019)`        |

Save → banner test harus hijau "Connection tested successfully". Kalau merah, cek Troubleshooting di bawah.

**LLM (Anthropic/OpenAI)** — pilih type sesuai provider → isi API key + base URL kalau pakai gateway custom.

### 5. Catat ID credential + replace di workflow JSON

Workflow yang di-export memakai **credential ID lama** dari developer sebelumnya (`2OxPIfEIqtH9wVkc`). ID tidak ada di n8n Anda — harus di-replace dengan ID credential baru Anda sebelum import.

**Ambil ID credential MSSQL**: n8n UI → Credentials → klik `Microsoft SQL account` → lihat URL browser:
```
http://localhost:5678/home/credentials/XXXXXXXXXX
                                        └── copy ini
```

**Replace di JSON** (dari root repo):
```powershell
cd apps\n8n\workflows

# GANTI dengan ID asli dari URL di atas (biasanya 16 char alfanumerik)
$MSSQL_NEW = "paste_id_asli_di_sini"

if ($MSSQL_NEW -like "*paste_*") { Write-Error "STOP: ID belum diisi"; return }

Get-ChildItem *.json | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace '2OxPIfEIqtH9wVkc', $MSSQL_NEW | Set-Content $_.FullName -NoNewline
}

# verify: angka harus 0 (ID lama hilang) + angka > 0 (ID baru ada)
Select-String -Path "*.json" -Pattern "2OxPIfEIqtH9wVkc" | Measure-Object | % Count
Select-String -Path "*.json" -Pattern $MSSQL_NEW | Measure-Object | % Count
```

> **PENTING**: `MSSQL_NEW` **harus** ID asli dari URL. Jangan paste placeholder — kalau Anda replace dengan string literal placeholder, workflow JSON jadi corrupt dan harus `git checkout -- apps/n8n/workflows/` untuk restore.

Credential **LLM tidak** ada di JSON (field `credentials` kosong untuk node LLM di export). Nanti di-link manual di UI setelah import.

### 6. Import workflow (via CLI)

n8n harus **STOP** dulu (Ctrl+C di terminal n8n) karena sqlite lock. Dari root repo:

```powershell
npm run n8n:import
# → "Successfully imported 9 workflows"

# Start lagi
n8n start
```

Alternatif via UI: Workflows → menu `⋯` → Import from file → pilih tiap file di `apps/n8n/workflows/`.

### 7. Link LLM credential + activate semua workflow

Buka workflow **SQL AI Agent** → cari node LLM (biasanya nama `Anthropic Chat Model` / `OpenAI Chat Model`) → panel kanan → **Credential to connect with** → pilih credential LLM Anda → Save.

Kemudian untuk tiap workflow (ada 9):
- Buka workflow
- Pastikan tidak ada node merah (kalau ada, credential belum ter-link — klik node → pilih credential → Save)
- Toggle **Active** di pojok kanan atas

Verifikasi webhook aktif:
```powershell
curl.exe -X POST http://localhost:5678/webhook/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"test\",\"password\":\"test\"}'
# response JSON (bahkan error 401) = sukses konek, workflow jalan
```

### 8. Seed user pertama

Sebelum bisa login via UI, perlu minimal 1 user di `dbo.users`. Lihat [`../../database/README.md#seed-user-pertama`](../../database/README.md#seed-user-pertama).

## Setup via Docker

Alternatif kalau tidak mau install n8n native.

```bash
cp .env.example .env
docker compose up -d
```

Container n8n konek ke SQL Server di host via `host.docker.internal` (sudah di-set di `docker-compose.yml`). Di n8n UI, isi `Server` dengan `host.docker.internal`. Sisanya sama dengan setup native.

Stop:
```bash
docker compose down         # data n8n tetap di volume
docker compose down -v      # hapus volume (reset total)
```

## Struktur workflow

| File                           | Deskripsi                                    |
| ------------------------------ | -------------------------------------------- |
| `Auth Service.json`            | Login + CRUD user.                           |
| `SQL AI Agent.json`            | Agent utama (NL → SQL → eksekusi → narasi).  |
| `Database Explorer.json`       | Introspeksi schema per database.             |
| `Database Selector.json`       | List database tersedia.                      |
| `Get Sessions.json`            | List chat session user.                      |
| `Get History.json`             | Pesan dalam satu session.                    |
| `Save Message.json`            | Simpan pesan ke `chat_messages`.             |
| `Update Message.json`          | Update status/konten pesan.                  |
| `Delete Session.json`          | Hapus session + pesannya.                    |

## Webhook endpoints

```
POST  /webhook/auth/login
POST  /webhook/auth/create-user
POST  /webhook/auth/list-users
POST  /webhook/auth/update-role
POST  /webhook/auth/delete-user
POST  /webhook/sql-agent
GET   /webhook/databases
GET   /webhook/schema?database=…
GET   /webhook/sessions?userId=…
GET   /webhook/history?sessionId=…&userId=…
POST  /webhook/save-message
POST  /webhook/update-message
POST  /webhook/delete-session
```

Webhook URL **bukan credential** — hanya endpoint publik n8n. Base URL dikonfigurasi di `apps/web/src/environments/environment.ts`.

## Troubleshooting

| Gejala                                              | Root cause / fix                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `SQLite package has not been found installed`       | Rebuild sqlite3 native binary (lihat step 1).                       |
| `Couldn't connect with these settings` di credential form | Password salah, atau TLS/Domain misconfig. Reset password SQL login via `ALTER LOGIN n8n_user WITH PASSWORD = '...'; ` dan re-type di n8n UI. |
| Credential test hijau, tapi workflow fail `ConnectionError: Login failed for user 'n8n_user'` | Password di n8n credential beda dengan password SQL login. **Klik field password di n8n UI, hapus, ketik ulang**, Save. Jangan copy-paste (kadang invisible char). |
| `Credential with ID "2OxPIfEIqtH9wVkc" does not exist` | Workflow JSON masih pakai ID lama. Ulang step 5 (replace ID), lalu re-import (step 6). |
| `ResponseError: webhook ... is not registered`      | Workflow belum **Active**. Toggle Active di pojok kanan atas. Kalau nolak di-toggle, ada node yang masih merah → link credential dulu. |
| `{"message":"Error in workflow"}` dari webhook      | Pesan generik. Buka n8n UI → **Executions** → klik eksekusi terakhir → lihat node merah + error detail. |
| String `__n8n_BLANK_VALUE_<uuid>` di export         | Placeholder n8n internal yang artinya "field sengaja kosong". **Bukan password**. Tapi developer sebelumnya pernah set string ini sebagai password SQL login — kalau Anda inherit SQL instance mereka, pakai string itu persis sebagai password; kalau fresh install, abaikan. |
| MMC error "could not create the snap-in" buka SQL Configuration Manager | Launch `.msc` langsung: `C:\Windows\SysWOW64\SQLServerManager16.msc` (angka = versi SQL Server; 16 untuk 2022). |
