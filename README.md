# SQL AI — Data Management Agent

Monorepo untuk **SQL AI Data Management**: agen AI yang menerima pertanyaan natural language, menerjemahkannya jadi SQL, mengeksekusi ke Microsoft SQL Server, dan mengembalikan hasil + narasi. Lengkap dengan auth, role-based access, chat history, dan konfirmasi untuk operasi destruktif.

## Arsitektur

```
┌────────────────┐   HTTP   ┌──────────────────┐    SQL     ┌──────────────┐
│  apps/web      │ ───────► │   apps/n8n       │ ─────────► │  SQL Server  │
│  (Angular 22)  │          │  (workflows)     │            │              │
└────────────────┘          └──────────────────┘            └──────────────┘
                                     │
                                     ▼
                             ┌──────────────┐
                             │  LLM Agent   │
                             └──────────────┘
```

- `apps/web` — Angular 22 SPA (chat, login, user management).
- `apps/n8n` — workflow n8n (auth, SQL agent, chat history, DB explorer).
- `database/` — SSMS SQL dumps untuk `TestDB` + `TestDB4`.

## Struktur repo

```
sql-ai-data-management/
├── apps/
│   ├── web/              Angular SPA
│   └── n8n/              n8n workflows + docker-compose
├── database/             SQL dumps (TestDB.sql, TestDB4.sql)
├── .editorconfig
├── .gitignore
├── LICENSE
├── package.json          npm workspaces
└── README.md
```

## Prasyarat

- Node.js 20+ dan npm 11+
- Microsoft SQL Server (lokal atau remote)
- (Opsional) Docker Desktop — untuk mode container

## Quick start (lokal Windows)

Skenario default: SQL Server 2022 lokal + Windows Authentication.

### 1. Clone dan install

```powershell
git clone https://github.com/fawzulmumin/sql-ai-data-management.git
cd sql-ai-data-management
npm install
```

### 2. Restore database

Import `database/TestDB.sql` dan `database/TestDB4.sql` via SSMS (File → Open → Execute) atau sqlcmd. Detail: [`database/README.md`](database/README.md).

### 3. Setup + jalankan n8n

```powershell
cd apps\n8n
copy .env.example .env
notepad .env         # isi N8N_ENCRYPTION_KEY (32-char random)

npm install -g n8n
n8n start
```

Buka `http://localhost:5678`:

1. **Setup owner account** (email+password pilihan Anda — untuk login UI n8n saja, lokal).
2. **Import workflow** — stop n8n (Ctrl+C), lalu dari root repo:
   ```powershell
   npm run n8n:import
   n8n start
   ```
   Atau via UI: Workflows → Import from file → pilih tiap file di `apps/n8n/workflows/`.
3. **Buat credentials** di n8n UI:
   - **Microsoft SQL account** → isi dengan SQL lokal Anda. Detail field: [`apps/n8n/README.md`](apps/n8n/README.md#4-buat-credentials-di-n8n-ui).
   - **LLM provider** (OpenAI/Anthropic/dll) → API key provider Anda.
4. **Relink credential + aktifkan workflow** — buka tiap workflow → relink node MSSQL ke credential baru → toggle **Active**.

Workflow yang belum di-activate = webhook belum terdaftar = frontend akan error `webhook not registered`.

### 4. Jalankan frontend

```powershell
cd ..\..\apps\web
npm start
```

Buka `http://localhost:4200`.

## Script root

| Script         | Deskripsi                                        |
| -------------- | ------------------------------------------------ |
| `web:start`    | Angular dev server (port 4200).                  |
| `web:build`    | Build production bundle apps/web.                |
| `web:test`     | Unit test Angular (Vitest).                      |
| `n8n:start`    | Jalankan n8n native (butuh install global dulu). |
| `n8n:import`   | Import semua workflow dari `apps/n8n/workflows/` (n8n harus stop). |
| `n8n:up`       | Jalankan n8n via Docker Compose.                 |
| `n8n:down`     | Stop container n8n.                              |
| `n8n:logs`     | Tail logs container n8n.                         |
| `db:apply`     | Jalankan SQL dumps via sqlcmd (edit instance name di package.json kalau beda). |

## Environment variables

- `apps/n8n/.env` (dari `.env.example`) — config startup n8n.
- `apps/web/src/environments/environment.ts` — base URL n8n untuk frontend.

Credential SQL Server dan LLM API key **tidak** disimpan di `.env`. Dikonfigurasi via UI n8n (Credentials vault), dienkripsi pakai `N8N_ENCRYPTION_KEY`.

File `.env` dan `credentials.local.md` sudah di-gitignore. Jangan commit secret.

## Troubleshooting

| Gejala                                              | Fix                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `n8n: command not found` setelah install            | Tutup/buka PowerShell lagi, atau cek `npm config get prefix` ada di PATH. |
| `SQLite package has not been found installed`       | [`apps/n8n/README.md`](apps/n8n/README.md#1-install-dan-start-n8n) — rebuild sqlite3 native binary. |
| `ResponseError: webhook not registered`             | Workflow di n8n belum di-activate. Toggle **Active** di UI setelah credential ter-link. |
| Tombol **Active** nolak di-toggle                   | Node MSSQL/LLM masih merah → credential belum di-link. Buka node → pilih credential → Save. |
| MSSQL error "Login failed for user"                 | Windows Auth gagal — periksa `Domain` di credential (nama komputer), atau pakai SQL Auth. |

## Lisensi

[MIT](LICENSE)
