# SQL AI — Web Frontend

Angular 22 SPA untuk SQL AI Data Management agent. Menyediakan chat UI, login, dan user management yang berkomunikasi dengan backend n8n via webhook.

## Prasyarat

- Node.js 20+ dan npm 11+
- Backend n8n berjalan di `http://localhost:5678` (lihat [apps/n8n/README.md](../n8n/README.md))

## Setup

```powershell
npm install
```

## Konfigurasi

Config runtime ada di `src/environments/`:

| File                           | Mode        | `n8nBaseUrl`                       |
| ------------------------------ | ----------- | ---------------------------------- |
| `environment.ts`               | development | `http://localhost:5678/webhook`    |
| `environment.production.ts`    | production  | `/webhook`                         |

Edit file yang relevan untuk mengganti base URL n8n.

## Perintah

```powershell
npm start          # dev server di http://localhost:4200
npm run build      # build production ke dist/
npm test           # unit test (Vitest)
```

## Struktur

```
src/
├── app/
│   ├── directives/        safe-html, dll
│   ├── guards/            AuthGuard
│   ├── pages/             chat, login
│   └── services/          ai.service, auth.service
├── environments/
├── index.html
├── main.ts
└── styles.css
```

Konvensi kode: lihat [`AGENTS.md`](./AGENTS.md).
