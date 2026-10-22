# SQL AI — Data Management Agent

Monorepo untuk aplikasi **SQL AI Data Management**: sebuah agen AI yang menerima pertanyaan natural language dari user, menerjemahkannya menjadi query SQL, mengeksekusi ke database Microsoft SQL Server, dan mengembalikan hasil beserta narasi. Mendukung manajemen user, role-based access control, chat history, dan konfirmasi untuk operasi destruktif.

## Arsitektur

```
┌────────────────┐   HTTP   ┌──────────────────┐    SQL     ┌──────────────┐
│  apps/web      │ ───────► │   apps/n8n       │ ─────────► │  SQL Server  │
│  (Angular 22)  │          │  (workflows)     │            │  (MSSQL)     │
└────────────────┘          └──────────────────┘            └──────────────┘
                                     │
                                     ▼
                             ┌──────────────┐
                             │  LLM / OAI   │
                             └──────────────┘
```

- **`apps/web`** — Angular 22 SPA. Frontend chat, login, user management.
- **`apps/n8n`** — kumpulan workflow n8n (auth, SQL agent, chat history, DB explorer) + `docker-compose.yml` untuk menjalankan n8n + Microsoft SQL Server lokal.

## Struktur repo

```
sql-ai-data-management/
├── apps/
│   ├── web/              # Angular SPA frontend
│   └── n8n/              # n8n workflows + docker compose
├── .editorconfig
├── .env.example          # Referensi env vars seluruh monorepo
├── .gitignore
├── LICENSE
├── package.json          # npm workspaces root
└── README.md
```

## Prasyarat

- **Node.js** 20+ dan **npm** 11+ (untuk `apps/web`).
- **Docker** + **Docker Compose** (untuk `apps/n8n`).
- **Microsoft SQL Server** (otomatis via docker-compose, atau instance eksisting).
- **OpenAI API Key** (atau provider LLM lain yang dikonfigurasi di workflow `SQL AI Agent`).

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/fawzulmumin/sql-ai-data-management.git
cd sql-ai-data-management
npm install
```

`npm install` di root akan install dependency untuk semua workspace (`apps/*`).

### 2. Jalankan backend (n8n + MSSQL)

```bash
cp apps/n8n/.env.example apps/n8n/.env
# Edit apps/n8n/.env — isi N8N_ENCRYPTION_KEY, MSSQL_PASSWORD, OPENAI_API_KEY, dst.

npm run n8n:up
```

Setelah container up, buka `http://localhost:5678` → import semua file dari `apps/n8n/workflows/` → konfigurasi credential Microsoft SQL account.

Detail lengkap: lihat [`apps/n8n/README.md`](apps/n8n/README.md).

### 3. Jalankan frontend

```bash
npm run web:start
```

Buka `http://localhost:4200`.

Detail lengkap: lihat [`apps/web/README.md`](apps/web/README.md).

## Script root (via `npm run …`)

| Script         | Deskripsi                                           |
| -------------- | --------------------------------------------------- |
| `web:start`    | Jalankan Angular dev server (port 4200).            |
| `web:build`    | Build production bundle `apps/web`.                 |
| `web:test`     | Jalankan unit test Angular (Vitest).                |
| `n8n:up`       | Start stack n8n + MSSQL via Docker Compose.         |
| `n8n:down`     | Stop stack n8n + MSSQL.                             |
| `n8n:logs`     | Tail logs container n8n + MSSQL.                    |

## Environment variables

Referensi variabel seluruh monorepo ada di [`.env.example`](.env.example) (root). Masing-masing app juga punya `.env.example` sendiri:

- [`apps/n8n/.env.example`](apps/n8n/.env.example) — vars untuk n8n + MSSQL + OpenAI.
- `apps/web` — tidak pakai `.env`; konfigurasi di `src/environments/environment.ts` dan `environment.production.ts`.

**Jangan commit** file `.env` yang sudah terisi secret. `.gitignore` sudah menutup semua pola `.env*`.

## Lisensi

[MIT](LICENSE)
