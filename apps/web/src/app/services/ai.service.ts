import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface AiResponse {
  status_text: string;
  status_type: 'info' | 'success' | 'warning' | 'danger' | 'destructive';
  narrative: string;
  metadata: {
    database: string;
    table: string;
    row_count: number;
    timestamp: string;
    query: string;
  };
  data?: unknown[];
  dashboard_url?: string;
  timestamp?: string;
  sql?: string;
  expiresIn?: number;
}

export interface AIRequest {
  message: string;
  sessionId: string;
  confirmed?: boolean;
  query?: string;
}

@Injectable({
  providedIn: 'root'
})

export class AiService {
  private readonly BASE = environment.n8nBaseUrl;
  private readonly N8N_URL = `${this.BASE}/sql-agent`;
  private readonly N8N_DATABASES_URL = `${this.BASE}/databases`;
  private readonly N8N_SCHEMA_URL = `${this.BASE}/schema`;
  private readonly N8N_SAVE_MESSAGE_URL = `${this.BASE}/save-message`;
  private readonly N8N_SESSIONS_URL = `${this.BASE}/sessions`;
  private readonly N8N_HISTORY_URL = `${this.BASE}/history`;
  private readonly N8N_DELETE_SESSION_URL = `${this.BASE}/delete-session`;
  private readonly TIMEOUT_MS = environment.requestTimeoutMs;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private static readonly SESSION_ID_RE = /^web-\d+-[a-z0-9]+$/;

  private assertValidSessionId(sessionId: string): void {
    if (!AiService.SESSION_ID_RE.test(sessionId)) {
      throw new Error('Format sessionId tidak valid.');
    }
  }

  deleteSessionFromDB(sessionId: string): Observable<any> {
    this.assertValidSessionId(sessionId);
    return this.http.post(this.N8N_DELETE_SESSION_URL, { sessionId });
  }

  saveMessageToHistory(payload: {
    sessionId: string;
    type: 'user' | 'ai';
    content?: string;
    sql?: string;
    statusType?: string;
    metadata?: any;
    data?: unknown[];
    database?: string;
    userId?: number | null;
  }): Observable<any> {
    const user = this.auth.getCurrentUser();
    const body = {
      sessionId: payload.sessionId,
      type: payload.type,
      content: payload.content,
      sql: payload.sql,
      statusType: payload.statusType,
      metadata: payload.metadata,
      data: payload.data,
      database: payload.database,
      userId: payload.userId ?? user?.user_id ?? null
    };

    return this.http.post(this.N8N_SAVE_MESSAGE_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  updateMessage(payload: {
    messageId: number;
    statusType: string;
    narrative?: string;
    sql?: string;
  }): Observable<any> {
    const url = this.N8N_URL.replace('/sql-agent', '/update-message');
    return this.http.post(url, payload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  getSessions(): Observable<any> {
    const user = this.auth.getCurrentUser();
    const userId = user?.user_id || null;
    
    return this.http.get(`${this.N8N_SESSIONS_URL}?userId=${userId}`, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  getHistory(sessionId: string): Observable<any> {
    this.assertValidSessionId(sessionId);
    const user = this.auth.getCurrentUser();
    const userId = user?.user_id || null;

    return this.http.get(`${this.N8N_HISTORY_URL}?sessionId=${encodeURIComponent(sessionId)}&userId=${userId}`, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  sendMessage(
    message: string,
    sessionId: string,
    database?: string,
    fileData?: any,
    fileBase64?: string
  ): Observable<AiResponse> {

    const user = this.auth.getCurrentUser();

    const body = {
      message,
      sessionId,
      database: database || 'TestDB',
      userId: user?.user_id || null,
      userRole: user?.role || 'db_datareader',
      fileData: fileData,
      fileBase64: fileBase64
    };
    
    if (!environment.production) console.debug('[ai] request:', body);

    return this.http.post<AiResponse>(this.N8N_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  confirmOperation(
    query: string, 
    sessionId: string, 
    pending_id?: number,
    database?: string,  
  ): Observable<AiResponse> {
    const body: AIRequest & { pending_id?: number; database?: string } = {
      message: 'CONFIRM',
      sessionId,
      confirmed: true,
      query,
      pending_id: pending_id,
      database: database || 'TestDB'
    };
    if (!environment.production) console.debug('[ai] confirm:', body);

    return this.http.post<AiResponse>(this.N8N_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  cancelOperation(query: string, sessionId: string, database?: string): Observable<AiResponse> {
    const body = {
      message: 'BATAL',
      sessionId,
      query,
      database: database || 'TestDB'
    };
    if (!environment.production) console.debug('[ai] cancel:', body);

    return this.http.post<AiResponse>(this.N8N_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  executeDirectQuery(query: string, sessionId: string, database: string): Observable<AiResponse> {
    const body = {
      message: 'DIRECT_EXECUTE',
      sessionId: sessionId,
      database: database,
      direct_query: query,
      direct_execute: true
    };
    
    if (!environment.production) console.debug('[ai] direct-execute:', body);

    return this.http.post<AiResponse>(this.N8N_URL, body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  getDatabases(): Observable<{ databases: string[]; total: number }> {
    if (!environment.production) console.debug('[ai] get databases');

    return this.http.get<{ databases: string[]; total: number }>(this.N8N_DATABASES_URL, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  getSchema(database: string): Observable<any> {
    const url = this.N8N_SCHEMA_URL + '?database=' + encodeURIComponent(database);
    if (!environment.production) console.debug('[ai] get schema:', database);

    return this.http.get<any>(url, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      timeout(this.TIMEOUT_MS),
      catchError(this.handleError)
    );
  }

  generateSessionId(): string {
    const sid = 'web-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    return sid;
  }
  
  resetSession(): string {
    const sid = 'web-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('sid', sid);
    return sid;
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'Terjadi kesalahan pada server AI.';
    
    if (error.name === 'TimeoutError') {
      errorMessage = 'Request timeout. Server AI tidak merespons.';
    } else if (error.status === 0) {
      errorMessage = `Tidak dapat terhubung ke n8n. Pastikan n8n berjalan di ${environment.n8nBaseUrl}`;
    } else if (error.status === 404) {
      errorMessage = 'Webhook tidak ditemukan. Cek path webhook di n8n.';
    } else if (error.status === 500) {
      errorMessage = 'Server error di n8n. Cek log workflow.';
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    }
    
    console.error('❌ HTTP Error:', error);
    return throwError(() => new Error(errorMessage));
  }
}