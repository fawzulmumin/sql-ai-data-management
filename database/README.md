# Database Dumps

SSMS "Generate Scripts" output untuk dua database yang dipakai aplikasi:

| File           | Berisi                                                           |
| -------------- | ---------------------------------------------------------------- |
| `TestDB.sql`   | DB utama aplikasi: tabel `users`, `chat_sessions`, `chat_messages` + data awal. Ini database yang di-set di n8n Microsoft SQL credential. |
| `TestDB4.sql`  | DB kedua yang dipakai AI agent untuk query data user (contoh dataset tambahan). |

File di-encode UTF-16 LE (format default SSMS). Jalankan sekali di SSMS atau `sqlcmd` saat setup awal.

## Jalankan via SSMS

1. Buka SSMS, connect ke `localhost\SQLEXPRESS22B` (atau instance Anda).
2. File → Open → File → pilih `TestDB.sql` → Execute (F5).
3. Ulangi untuk `TestDB4.sql`.

## Jalankan via sqlcmd (CLI)

```powershell
sqlcmd -S "localhost\SQLEXPRESS22B" -E -i database\TestDB.sql
sqlcmd -S "localhost\SQLEXPRESS22B" -E -i database\TestDB4.sql
```

Flag `-E` = Windows Authentication. Untuk SQL login, pakai `-U <user> -P <password>`.

## Catatan

Dump script memakai path file hardcoded: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS22B\MSSQL\DATA\`. Kalau instance Anda beda path/nama, edit baris `CREATE DATABASE ... FILENAME = N'...'` di awal file, atau hapus clause `ON PRIMARY (...)` seluruhnya supaya SQL Server pakai default data path.
