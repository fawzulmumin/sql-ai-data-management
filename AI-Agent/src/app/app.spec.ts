import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { AiService } from './services/ai.service';

describe('App', () => {
  let historyMessages: unknown[];
  let serverSessions: unknown[];

  beforeEach(async () => {
    historyMessages = [];
    serverSessions = [];
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App] })
      .overrideComponent(App, {
        set: {
          providers: [
            {
              provide: AiService,
              useValue: {
                generateSessionId: () => 'generated-session',
                getHistory: () => of({ messages: historyMessages }),
                getSessions: () => of({ sessions: serverSessions }),
                getDatabases: () => of({ databases: [] }),
              },
            },
          ],
        },
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should show Share and Delete actions when a conversation menu is opened', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    app.ChatSession = [{
      id: 'session-1',
      title: 'Test conversation',
      timestamp: Date.now(),
      messages: [],
    }];
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('.context-menu') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain('Share');
    expect(menu.textContent).toContain('Delete');
    const expandedTrigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;
    expect(expandedTrigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('should extract object keys and format values dynamically', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.getObjectKeys({ npsn: '1', nama_sekolah: 'SMAN 1', aktif: true })).toEqual([
      'npsn',
      'nama_sekolah',
      'aktif',
    ]);
    expect(app.formatColumnName('nama_sekolah')).toBe('Nama Sekolah');
    expect(app.formatCellValue(null)).toBe('-');
    expect(app.formatCellValue(true)).toBe('Ya');
    expect(app.formatCellValue(false)).toBe('Tidak');
  });

  it('should extract the SQL query from nested AI payloads', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const payload = {
      status_text: 'Query Berhasil Dijalankan',
      status_type: 'success',
      narrative: 'Stored Procedure berhasil dijalankan.',
      output: '{"metadata":{"database_name":"TestDB","query":"EXEC sp_Alamat_GetAll;"}}',
    };

    expect(app.extractQueryFromPayload(payload)).toBe('EXEC sp_Alamat_GetAll;');
    expect(app.extractQueryFromPayload({ sql: 'SELECT * FROM table_name' })).toBe('SELECT * FROM table_name');
  });

  it('should restore a cancelled confirmation as one draft card from history', () => {
    const query = 'CREATE PROCEDURE dbo.example AS BEGIN SELECT 1; END;';
    const draft = {
      id: 'draft-1',
      query,
      timestamp: '2/10/2026, 18.01.35',
      sessionId: 'session-1',
      metadata: {
        targetTable: 'dbo.example',
        estimatedImpact: '0',
        environment: 'TestDB',
      },
    };
    historyMessages = [
      {
        message_id: 1,
        message_type: 'ai',
        status_type: 'destructive',
        sql_query: 'CREATE PROCEDURE dbo.example AS\nBEGIN SELECT 1; END;',
        content: 'Konfirmasi diperlukan.',
        created_at: '2026-10-02T10:00:00Z',
      },
      {
        message_id: 2,
        message_type: 'ai',
        status_type: 'info',
        sql_query: query,
        content: 'Operasi dibatalkan oleh pengguna.',
        created_at: '2026-10-02T10:01:00Z',
      },
    ];

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.drafts = [draft];

    app.loadSession('session-1');

    expect(app.messages).toHaveLength(1);
    expect(app.messages[0].draftQuery).toEqual(draft);
    expect(app.messages[0].status_type).toBe('info');
    expect(app.isConfirmType(app.messages[0].status_type)).toBe(false);
  });

  it('should restore result rows when returning to a previous conversation', () => {
    const sessionId = 'session-with-results';
    const query = 'EXEC dbo.siswa_test_GetById @siswa_test_id = 2023;';
    const rows = [{ nama: 'Siswa Contoh', tahun_masuk: 2023 }];
    const savedMessage = {
      id: 'ai-result',
      type: 'ai' as const,
      status_type: 'success' as const,
      timestamp: '14:09:30, 02-10-2026',
      sql: query,
      data: rows,
    };
    historyMessages = [{
      message_id: 10,
      message_type: 'ai',
      status_type: 'success',
      sql_query: query,
      content: 'Ditemukan 1 baris data.',
      created_at: '2026-10-02T10:00:00Z',
    }];

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.sessionId = 'another-session';
    app.messages = [{
      id: 'other-result',
      type: 'ai',
      status_type: 'success',
      sql: 'SELECT * FROM dbo.other_table;',
      data: [{ id: 1 }],
    }];
    app.ChatSession = [{
      id: sessionId,
      title: 'Hasil siswa',
      timestamp: Date.now(),
      messages: [savedMessage],
    }];
    localStorage.setItem('sql-agent-history', JSON.stringify(app.messages));

    app.loadSession(sessionId);

    expect(app.messages).toHaveLength(1);
    expect(app.messages[0].data).toEqual(rows);
    expect(app.messages[0].timestamp).toBe(savedMessage.timestamp);
  });

  it('should keep cached result rows when refreshing the session list', () => {
    const sessionId = 'cached-session';
    const query = 'SELECT * FROM dbo.siswa;';
    const rows = [{ nama: 'Siswa Contoh' }];
    serverSessions = [{
      session_id: sessionId,
      title: 'Data siswa',
      created_at: '2026-10-02T10:00:00Z',
    }];
    historyMessages = [{
      message_id: 20,
      message_type: 'ai',
      status_type: 'success',
      sql_query: query,
      content: 'Ditemukan 1 baris data.',
      created_at: '2026-10-02T10:00:00Z',
    }];
    localStorage.setItem('sql-agent-active-session', sessionId);
    localStorage.setItem('sql-agent-sessions', JSON.stringify([{
      id: sessionId,
      title: 'Data siswa',
      timestamp: Date.now(),
      messages: [{
        id: 'ai-cached',
        type: 'ai',
        status_type: 'success',
        sql: query,
        data: rows,
      }],
    }]));

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.loadMessages();

    expect(app.ChatSession[0].messages[0].data).toEqual(rows);
    expect(app.messages[0].data).toEqual(rows);
  });
});
