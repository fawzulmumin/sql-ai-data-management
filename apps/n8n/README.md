# SQL AI — n8n Backend

Workflow n8n yang menjadi backend untuk SQL AI Data Management agent. Berisi:

- **Auth Service** — login, create/list/update/delete user, role-based access control.
- **SQL AI Agent** — orchestration utama antara LLM dan database (prompt → SQL → eksekusi → narasi hasil).
- **Database Explorer** / **Database Selector** — introspeksi schema dan daftar database.
- **Chat history** — Save Message, Update Message, Get History, Get Sessions, Delete Session.

Semua workflow terhubung ke Microsoft SQL Server via node `n8n-nodes-base.microsoftSql`.

## Prasyarat

- Docker Desktop (atau Docker Engine + Compose plugin).
- (Opsional) n8n CLI jika ingin import tanpa Docker.

## Setup cepat (Docker)

1. Salin environment template:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`. Minimal yang harus diisi:
   - `N8N_ENCRYPTION_KEY` — 32-char random string. Generate: `openssl rand -hex 32`.
   - `MSSQL_PASSWORD` dan `MSSQL_SA_PASSWORD` — password SQL Server (harus memenuhi SQL complexity policy; samakan nilainya).
   - `OPENAI_API_KEY` — API key provider LLM yang dipakai di workflow `SQL AI Agent`.
   - Ganti password `N8N_BASIC_AUTH_PASSWORD` jika `N8N_BASIC_AUTH_ACTIVE=true`.

3. Jalankan stack:

   ```bash
   docker compose up -d
   ```

   Service yang di-start:
   - `n8n` di `http://localhost:5678`
   - `mssql` di `localhost:1433` (SQL Server 2022 Developer edition)

4. Import workflow dari folder [`workflows/`](./workflows) via UI n8n (Workflows → Import from file), atau dengan CLI:

   ```bash
   docker exec -it sql-ai-n8n n8n import:workflow --separate --input=/workflows
   ```

5. Konfigurasi credential **Microsoft SQL account** di n8n UI dengan nilai dari `.env` (host `mssql`, port `1433`, user `sa`, database `TestDB`).

## Struktur workflow

| File                           | Deskripsi                                                  |
| ------------------------------ | ---------------------------------------------------------- |
| `Auth Service.json`            | Login + manajemen user (create/list/update role/delete).   |
| `SQL AI Agent.json`            | Agent utama: NL → SQL → eksekusi → narasi.                 |
| `Database Explorer.json`       | Introspeksi schema tabel pada database tertentu.           |
| `Database Selector.json`       | Daftar database yang tersedia untuk user.                  |
| `Get Sessions.json`            | List chat sessions milik user.                             |
| `Get History.json`             | Ambil history pesan dalam session.                         |
| `Save Message.json`            | Simpan pesan (user/ai) ke tabel `chat_messages`.           |
| `Update Message.json`          | Update status atau konten pesan existing.                  |
| `Delete Session.json`          | Hapus session beserta pesannya.                            |

## Skema database

Workflow mengharapkan tabel-tabel berikut sudah ada di `MSSQL_DATABASE`:

- `dbo.users (user_id, username, password, fullname, role, is_active, last_login)`
- `dbo.chat_sessions (session_id, user_id, …)`
- `dbo.chat_messages (message_id, session_id, type, content, sql, status_type, metadata, data, database, user_id, …)`

Buat skema sesuai kebutuhan sebelum menjalankan workflow (DDL belum di-vendor dalam repo).

## Menghentikan stack

```bash
docker compose down          # stop container, data tetap ada
docker compose down -v       # stop + hapus volume (data n8n & mssql ikut terhapus)
```
