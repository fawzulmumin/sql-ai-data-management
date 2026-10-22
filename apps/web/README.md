# SQL AI — Web Frontend

Angular 22 single-page application untuk SQL AI Data Management agent. Aplikasi ini menyediakan antarmuka chat untuk berinteraksi dengan workflow n8n yang menjalankan agen AI SQL (query generation, confirmation flow, history management, dan user administration).

## Prasyarat

- Node.js 20+
- npm 11+ (lihat `packageManager` di `package.json`)
- Backend n8n berjalan dan dapat diakses (default `http://localhost:5678`). Lihat [`apps/n8n`](../n8n/README.md) untuk cara menjalankannya.

## Setup

```bash
npm install
```

## Konfigurasi lingkungan

Konfigurasi runtime diambil dari `src/environments/environment.ts` (development) dan `src/environments/environment.production.ts` (production). Nilai default:

| Variabel            | Development                      | Production  |
| ------------------- | -------------------------------- | ----------- |
| `n8nBaseUrl`        | `http://localhost:5678/webhook`  | `/webhook`  |
| `requestTimeoutMs`  | `60000`                          | `60000`     |

Untuk mengganti base URL n8n (misalnya saat deploy ke staging/production), edit file environment yang relevan. Lihat juga `.env.example` di root repo untuk referensi variabel seluruh monorepo.

## Menjalankan dev server

```bash
npm start
```

Buka `http://localhost:4200`. Aplikasi akan auto-reload setiap kali file source berubah.

## Build production

```bash
npm run build
```

Artifact build akan tersimpan di `dist/`.

## Testing

```bash
npm test
```

Menggunakan Vitest sebagai test runner.

## Struktur folder

```
src/
├── app/
│   ├── directives/        Direktif kustom (safe-html, dll)
│   ├── guards/            Route guards (AuthGuard)
│   ├── pages/             Halaman utama (chat, login)
│   └── services/          HTTP services (ai, auth)
├── environments/          File konfigurasi per build mode
├── index.html
├── main.ts
└── styles.css
```

## Konvensi kode

Lihat [`AGENTS.md`](./AGENTS.md) untuk konvensi TypeScript, Angular, state management, aksesibilitas, dan styling yang berlaku di aplikasi ini.
