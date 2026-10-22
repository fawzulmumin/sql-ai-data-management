import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  user_id: number;
  username: string;
  full_name: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly AUTH_BASE = `${environment.n8nBaseUrl}/auth`;

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.AUTH_BASE}/login`, { username, password });
  }

  saveSession(token: string, user: AuthUser): void {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  getCurrentUser(): AuthUser | null {
    const str = localStorage.getItem('auth_user');
    return str ? JSON.parse(str) : null;
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token));
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getToken()}`
    });
  }

  listUsers(): Observable<any> {
    return this.http.post(
      `${this.AUTH_BASE}/list-users`, 
      {}, 
      { headers: this.getAuthHeaders() }
    );
  }

  createUser(payload: any): Observable<any> {
    return this.http.post(
      `${this.AUTH_BASE}/create-user`, 
      payload, 
      { headers: this.getAuthHeaders() }
    );
  }

  updateUserRole(userId: number, role: string): Observable<any> {
    return this.http.post(
      `${this.AUTH_BASE}/update-role`, 
      { user_id: userId, role }, 
      { headers: this.getAuthHeaders() }
    );
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.post(
      `${this.AUTH_BASE}/delete-user`, 
      { user_id: userId }, 
      { headers: this.getAuthHeaders() }
    );
  }
}