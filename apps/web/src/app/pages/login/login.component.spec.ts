import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let auth: {
    login: ReturnType<typeof vi.fn<AuthService['login']>>;
    saveSession: ReturnType<typeof vi.fn<AuthService['saveSession']>>;
  };

  beforeEach(async () => {
    auth = {
      login: vi.fn<AuthService['login']>(),
      saveSession: vi.fn<AuthService['saveSession']>(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
  });

  it('shows validation error when username or password is empty', () => {
    fixture.detectChanges();
    fixture.componentInstance.username.set('testuser');
    fixture.componentInstance.password.set(''); 
    
    fixture.componentInstance.onSubmit();
    
    expect(auth.login).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.componentInstance.errorMessage()).toContain('Username dan password wajib diisi.');
  });

  it('clears loading and displays the error when login returns 401', async () => {
    auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 401,
      error: { message: 'Username atau password salah.' },
    })));

    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.nativeElement.querySelector('.login-error')?.textContent).toContain(
      'Username atau password salah.',
    );
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).textContent).toContain('Login');
  });

  it('clears loading and displays the blocked message when login returns 429', async () => {
    auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      error: { message: 'Terlalu banyak percobaan.' },
    })));

    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.componentInstance.isBlocked()).toBe(true);
    expect(fixture.nativeElement.querySelector('.login-error')?.textContent).toContain(
      'Terlalu banyak percobaan.',
    );
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).textContent).toContain(
      'Terkunci Sementara',
    );
  });

  it('recognizes a blocked account from a 401 response with a rate-limit error code', async () => {
    auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 401,
      error: {
        error_code: 'ACCOUNT_BLOCKED',
        message: 'Akun diblokir sementara setelah terlalu banyak percobaan.',
      },
    })));

    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.componentInstance.isBlocked()).toBe(true);
    expect(fixture.nativeElement.querySelector('.login-error')?.textContent).toContain(
      'Akun diblokir sementara',
    );
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).textContent).toContain(
      'Terkunci Sementara',
    );
  });

  it('recognizes a blocked account from a successful HTTP response with a block message', async () => {
    auth.login.mockReturnValue(of({
      success: false,
      status: 401,
      message: 'Login terkunci sementara.',
    }));

    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(fixture.componentInstance.isBlocked()).toBe(true);
    expect(fixture.nativeElement.querySelector('.login-error')?.textContent).toContain(
      'Login terkunci sementara.',
    );
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).textContent).toContain(
      'Terkunci Sementara',
    );
  });

  it('shows an error and restores the login button when the response body is null', async () => {
    auth.login.mockReturnValue(of(null));

    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(fixture.componentInstance.isBlocked()).toBe(false);
    expect(fixture.nativeElement.querySelector('.login-error')?.textContent).toContain(
      'Username tidak terdaftar atau respons login tidak valid.',
    );
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Login');
    expect(button.disabled).toBe(false);
  });
});
