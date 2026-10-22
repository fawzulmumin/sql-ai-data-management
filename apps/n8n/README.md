# SQL AI — n8n Backend

Workflow n8n yang jadi backend SQL AI Data Management:

- **Auth Service** — login + CRUD user (role-based).
- **SQL AI Agent** — NL → SQL → eksekusi → narasi hasil.
- **Database Explorer / Selector** — introspeksi schema.
- **Chat history** — Save/Update Message, Get Sessions, Get History, Delete Session.

Semua workflow terhubung ke Microsoft SQL Server via node `n8n-nodes-base.microsoftSql`.

## Prasyarat

- Node.js 20+ (untuk n8n native) **atau** Docker Desktop (untuk mode container).
- Microsoft SQL Server lokal/remote yang bisa diakses.
- Database `TestDB` (+ opsional `TestDB4`) sudah di-restore. Lihat [`../../database/README.md`](../../database/README.md).

## Setup lokal di Windows (recommended)

Cocok untuk kondisi: SQL Server lokal + Windows Authentication.

### 1. Install dan start n8n

```powershell
npm install -g n8n
copy .env.example .env
# edit .env — minimal isi N8N_ENCRYPTION_KEY (openssl rand -hex 32 atau string acak 32 char)
n8n start
```

Buka `http://localhost:5678`.

> **Troubleshoot `SQLite package has not been found installed`.** Install global
> n8n di Windows kadang skip build native sqlite3. Fix:
>
> ```powershell
> cd "$(npm root -g)\n8n\node_modules\sqlite3"
> npx --yes prebuild-install -r napi
> ```
>
> Lalu `n8n start` lagi.

### 2. Setup owner account (first-time only)

Pertama kali buka UI, n8n minta Anda **buat owner account** (email + password pilihan Anda sendiri, disimpan lokal di `~/.n8n/database.sqlite`). Ini akun untuk login ke UI editor n8n saja — tidak ada hubungan dengan akun aplikasi SQL AI (yang tersimpan di tabel `dbo.users` SQL Server).

Isi apa saja, misal:
- Email: `admin@local.test`
- Password: `(bebas, min 8 karakter)`

Setelah submit, Anda masuk ke UI n8n kosong.

### 3. Import workflow

Opsi A — via CLI (lebih cepat, 1 command):

```powershell
# PASTIKAN n8n STOP dulu (Ctrl+C di terminal n8n), karena sqlite lock
npm run n8n:import
# → "Successfully imported 9 workflows"
# Lalu start lagi: n8n start
```

Opsi B — via UI:

Workflows → menu `⋯` → Import from file → pilih tiap file di `apps/n8n/workflows/` satu per satu.

### 4. Buat credentials di n8n UI

Credential **tidak** disimpan di `.env`. Masuk ke **Credentials → New** di UI n8n.

**Microsoft SQL account** (Windows Auth, named instance `SQLEXPRESS22B`):

| Field                    | Value                                 |
| ------------------------ | ------------------------------------- |
| Server                   | `localhost` (atau nama komputer)      |
| Port                     | 1433                                  |
| Database                 | `TestDB`                              |
| User                     | *(kosong — pakai Windows Auth)*       |
| Password                 | *(kosong)*                            |
| Domain                   | nama komputer / workgroup             |
| TDS Version              | 7_4                                   |
| trustServerCertificate   | `true`                                |

Catatan untuk SQL Server 2022 (16.0.1210) dengan named instance:

- Aktifkan **TCP/IP** untuk instance via SQL Server Configuration Manager.
- Set TCP Port ke `1433` (atau catat dynamic port yang dipakai).
- Jalankan service **SQL Server Browser** jika pakai dynamic port.
- Restart service SQL Server instance.

Jika pakai SQL Authentication (mixed-mode) alih-alih Windows Auth, isi `User` + `Password` dan kosongkan `Domain`.

**OpenAI / LLM** (dipakai node AI di workflow `SQL AI Agent`):

| Field       | Value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| API Key     | *(key dari provider)*                                                 |
| Base URL    | *(gateway custom bila ada, mis. `https://api.rindri.com/`)*           |

### 5. Relink credential + aktifkan workflow

Workflow yang di-import mereferensikan credential ID lama dari developer sebelumnya, jadi harus di-relink dulu:

Untuk tiap workflow (ada 9) — Workflows → klik workflow → klik tiap node MSSQL yang menyala merah → **Credential to connect with** → pilih credential MS SQL yang baru Anda buat → **Save**. Lakukan hal yang sama untuk node OpenAI/LLM di workflow `SQL AI Agent`.

Setelah semua node sudah berpasangan credential:

Toggle **Active** di pojok kanan atas tiap workflow (biar webhook-nya terdaftar).

Verifikasi webhook sudah hidup:

```powershell
curl http://localhost:5678/webhook/databases
# harus balas JSON daftar database, bukan error "webhook not registered"
```

Error **"The requested webhook ... is not registered"** = workflow belum di-activate.

## Setup via Docker

Pakai ini kalau tidak mau install n8n langsung di host.

```bash
cp .env.example .env
# edit .env

docker compose up -d
```

Catatan: container n8n terhubung ke SQL Server di host via `host.docker.internal` (sudah di-set di `docker-compose.yml`). Di n8n UI, isi `Server` dengan `host.docker.internal`.

Stop:
```bash
docker compose down         # data n8n tetap
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

URL yang di-expose n8n (dipakai frontend):

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
