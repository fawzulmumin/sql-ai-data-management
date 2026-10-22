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

## Struktur repo

```
sql-ai-data-management/
├── apps/
│   ├── web/              Angular SPA
│   └── n8n/              n8n workflows + docker-compose
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

### 2. Jalankan backend n8n

```powershell
cd apps\n8n
copy .env.example .env
# edit .env — minimal isi N8N_ENCRYPTION_KEY

npm install -g n8n
n8n start
```

Buka `http://localhost:5678`:

1. Import semua file di `apps/n8n/workflows/`.
2. Buat credential **Microsoft SQL account** → isi dengan SQL lokal Anda (lihat [apps/n8n/README.md](apps/n8n/README.md#3-konfigurasi-credential-di-n8n-ui)).
3. Buat credential **LLM provider** untuk workflow `SQL AI Agent`.
4. Aktifkan semua workflow (toggle Active).

### 3. Jalankan frontend

```powershell
cd ..\..
npm run web:start
```

Buka `http://localhost:4200`.

## Script root

| Script         | Deskripsi                                     |
| -------------- | --------------------------------------------- |
| `web:start`    | Angular dev server (port 4200).               |
| `web:build`    | Build production bundle apps/web.             |
| `web:test`     | Unit test Angular (Vitest).                   |
| `n8n:up`       | Jalankan n8n via Docker Compose.              |
| `n8n:down`     | Stop container n8n.                           |
| `n8n:logs`     | Tail logs container n8n.                      |

## Environment variables

- `apps/n8n/.env` (dari `.env.example`) — config startup n8n.
- `apps/web/src/environments/environment.ts` — base URL n8n untuk frontend.

Credential SQL Server dan LLM API key **tidak** disimpan di `.env`. Dikonfigurasi via UI n8n (Credentials vault), dienkripsi pakai `N8N_ENCRYPTION_KEY`.

File `.env` dan `credentials.local.md` sudah di-gitignore. Jangan commit secret.

## Lisensi

[MIT](LICENSE)
