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

## Catatan tentang file path

Dump script memakai path file hardcoded: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS22B\MSSQL\DATA\`. Kalau instance Anda beda path/nama, edit baris `CREATE DATABASE ... FILENAME = N'...'` di awal file, atau hapus clause `ON PRIMARY (...)` seluruhnya supaya SQL Server pakai default data path.

## Seed user pertama

Tabel `dbo.users` di `TestDB` yang di-restore dari dump sudah berisi beberapa user existing (`Nabil`, `Tes`, `Taufik`, `Fawzul`). **Password-nya tidak diketahui** (hanya hash tersimpan).

Reset salah satu user ke password baru yang Anda tahu, misal `Nabil`:

```powershell
# GANTI password sesuai keinginan
$password = "Nabil2026!"
$username = "Nabil"

# Generate salt 16-byte + SHA256(salt + password)
$saltBytes = New-Object byte[] 16
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($saltBytes)
$salt = -join ($saltBytes | ForEach-Object { '{0:x2}' -f $_ })
$sha = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($salt + $password))
$hash = -join ($hashBytes | ForEach-Object { '{0:x2}' -f $_ })
$stored = "${salt}:${hash}"

# Opsi A — print SQL (copy-paste ke SSMS)
Write-Host "USE TestDB;"
Write-Host "UPDATE dbo.users SET password = N'$stored' WHERE username = N'$username';"

# Opsi B — eksekusi langsung via sqlcmd (ganti -E ke -U/-P kalau tidak pakai Windows Auth)
# sqlcmd -S "localhost\SQLEXPRESS22B" -E -d TestDB -Q "UPDATE dbo.users SET password = N'$stored' WHERE username = N'$username';"

Write-Host "Login: $username / $password"
```

Format password di tabel: `<salt-hex>:<sha256(salt+password)-hex>`. Algoritma ini sama dengan yang dipakai workflow `Auth Service` saat verifikasi login + saat create-user.

Verifikasi via webhook:

```powershell
$body = @{ username = "Nabil"; password = "Nabil2026!" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5678/webhook/auth/login" -Method Post -ContentType "application/json" -Body $body
# → success=True + ada field token = login OK
```

Setelah ini, login via `http://localhost:4200/login` dengan username/password yang Anda set.

## Buat user baru (bukan reset)

User dengan role `db_owner` bisa bikin user baru via webhook `/auth/create-user`:

```powershell
$token = "<token dari response login db_owner>"
$body = @{
  username = "newuser"
  password = "newpassword"
  fullname = "New User"
  role     = "db_datareader,db_datawriter"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5678/webhook/auth/create-user" `
  -Method Post `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body $body
```

Atau via UI di `http://localhost:4200` (menu user management, perlu login sebagai db_owner).

Role yang valid (mirror SQL Server fixed database roles):
`db_owner`, `db_securityadmin`, `db_accessadmin`, `db_ddladmin`, `db_datawriter`, `db_datareader`, `db_backupoperator`, `db_denydatareader`, `db_denydatawriter`.
