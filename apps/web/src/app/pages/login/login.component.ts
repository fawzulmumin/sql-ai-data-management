import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit { 
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly username = signal('');
  readonly password = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly isBlocked = signal(false);
  readonly showPassword = signal(false); 


  private readonly BLOCK_KEY = 'login_blocked_until';

  ngOnInit(): void {
    const blockedUntil = localStorage.getItem(this.BLOCK_KEY);
    if (blockedUntil) {
      const expiryTime = parseInt(blockedUntil, 10);
      if (Date.now() < expiryTime) {
        this.isBlocked.set(true);
        this.errorMessage.set('Anda masih dalam masa blokir. Silakan tunggu beberapa saat lagi.');
      } else {
        localStorage.removeItem(this.BLOCK_KEY);
      }
    }
  }

  onSubmit(): void {
    this.errorMessage.set('');

    if (!this.username().trim() || !this.password().trim()) {
      this.errorMessage.set('Username dan password wajib diisi.');
      return; 
    }

    this.isLoading.set(true);
    
    if (!this.isBlocked()) {
      this.isBlocked.set(false);
    }

    this.auth.login(this.username(), this.password())
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
        })
      )
      .subscribe({
        next: (res) => {
          if (res === null) {
            this.handleErrorLogic(0, {
              message: 'Username tidak terdaftar atau respons login tidak valid.',
            });
            return;
          }

          if (res.success === false || res.status === 401 || res.status === 429) {
            this.handleErrorLogic(res.status ?? 401, res);
          } else if (res.success && res.token && res.user) {
            localStorage.removeItem(this.BLOCK_KEY);
            this.isBlocked.set(false);
            
            this.auth.saveSession(res.token, res.user);
            this.router.navigate(['/']);
          } else {
            this.handleErrorLogic(0, {
              message: 'Respons login tidak valid. Silakan coba lagi.',
            });
          }
        },
        error: (err: HttpErrorResponse) => {
          this.handleErrorLogic(err.status, err.error);
        }
      });
  }

  private handleErrorLogic(status: number | string, payload: unknown): void {
    const details = this.getErrorDetails(payload);
    const statusIsRateLimited = Number(status) === 429
      || details.records.some((record) => Number(record['status']) === 429);
    const codeIsRateLimited = details.records.some((record) => {
      const code = record['error_code'] ?? record['code'] ?? record['status_type'];
      return typeof code === 'string'
        && /rate.?limit|too.?many|account.?blocked|login.?blocked/i.test(code);
    });
    const messageIndicatesBlock = this.isRateLimitMessage(details.message);
    const isBlocked = statusIsRateLimited || codeIsRateLimited || messageIndicatesBlock;

    this.isBlocked.set(isBlocked);

    if (isBlocked) {
      const expiryTime = Date.now() + (5 * 60 * 1000); 
      localStorage.setItem(this.BLOCK_KEY, expiryTime.toString());
    }

    this.errorMessage.set(
      details.message
        || (isBlocked
          ? 'Akun diblokir sementara. Silakan coba lagi 5 menit kemudian.' 
          : 'Username atau password yang anda masukkan salah.'),
    );
  }

  private getErrorDetails(payload: unknown): {
    records: Record<string, unknown>[];
    message?: string;
  } {
    if (typeof payload === 'string') {
      return { records: [], message: payload };
    }
    if (typeof payload !== 'object' || payload === null) {
      return { records: [] };
    }

    const record = payload as Record<string, unknown>;
    const nestedRecords = ['error', 'data', 'details']
      .map((key) => record[key])
      .filter((value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null,
      );
    const records = [record, ...nestedRecords];
    const messages = records
      .flatMap((item) => [item['message'], item['detail'], item['error']])
      .filter((value): value is string => typeof value === 'string');
    const message = messages.find((value) => this.isRateLimitMessage(value)) ?? messages[0];

    return { records, message };
  }

  private isRateLimitMessage(message: string | undefined): boolean {
    return typeof message === 'string'
      && /diblokir|blokir|terkunci|terlalu banyak percobaan|rate.?limit|too many attempts|temporarily blocked|account.?locked|login.?locked/i
        .test(message);
  }
}