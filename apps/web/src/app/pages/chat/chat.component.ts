import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService, AiResponse } from '../../services/ai.service';
import { AuthService, AuthUser } from '../../services/auth.service';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ChatMetadata {
  database: string;
  table: string;
  row_count: number;
  timestamp: string;
  query: string;
  query_type?: string;
  estimatedImpact?: number;
  column_name?: string;
  old_column?: string;
  new_column?: string;
  error_message?: string;
  error_hint?: string;
}

export interface ConversationItem {
  title: string;
  preview: string;
  active?: boolean;
}

export interface ConversationGroup {
  label: string;
  items: ConversationItem[];
}

export interface DraftQuery {
  id: string;
  query: string;
  timestamp: string;
  sessionId?: string;
  metadata: {
    targetTable: string;
    estimatedImpact: string;
    environment: string;
  };
}

export interface ChatMessage {
  id: string;
  messageId?: number;
  type: 'user' | 'ai';
  text?: string;
  status_text?: string;
  status_type?: 'info' | 'success' | 'warning' | 'danger' | 'rate_limit' |
                'destructive' | 'forbidden' | 'unauthorized' | 'creation' | 'confirm' |
                'approved' | 'clarification' | 'import_success' | 'confirm_create_table' | 'confirm_rename_column' |
                'confirm_alter_drop_column' | 'confirm_alter_add_column' | 'confirm_alter_foreign_key' | 'confirm_alter_table';
  narrative?: string;
  metadata?: ChatMetadata;
  data?: unknown[];
  dashboard_url?: string;
  timestamp?: string;
  sql?: string;
  expiresIn?: number;
  countdownInterval?: ReturnType<typeof setInterval> | null;
  draftQuery?: DraftQuery;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

@Component({
  selector: 'app-chat',
  standalone: true,
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
  imports: [CommonModule, FormsModule]
})

export class ChatComponent implements OnInit {
  sidebarCollapsed = false;
  userMenuOpen = false;
  logoutModalOpen = false;
  messages: ChatMessage[] = [];
  messageText = '';
  isLoading = false;
  searchModalOpen = false;
  searchQuery = '';
  drafts: DraftQuery[] = [];
  sessionId = '';

  toastVisible = false;
  fileErrorToastVisible = false;
  fileErrorMessage = '';
  shareToastVisible = false;
  deleteModalVisible = false;
  rateLimitToastVisible = false;
  rateLimitToastMessage = '';

  sessionToDeleteId = '';
  sessionToDeleteTitle = '';
  ChatSession: ChatSession[] = [];
  availableDatabases: string[] = [];
  selectedDatabase = 'TestDB';
  databasesLoaded = false;
  schemaPanelOpen = false;
  schemaLoading = false;
  activeMenuId: string | null = null;
  schemaData: {
    tables: {
      name: string;
      columns: {
        name: string;
        type: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
      }[]
    }[];
    procedures: {
      name: string;
      created_at?: string;
      last_altered?: string
    }[];
    views: { name: string }[];
  } = { tables: [], procedures: [], views: [] };
  activeSchemaTab: 'tables' | 'procedures' | 'views' = 'tables';
  expandedTables: { [key: string]: boolean } = {};
  schemaSearchQuery = '';
  currentUser: AuthUser | null = null;

  selectedFile: File | null = null;
  parsedFileData: any[] = []; 

  userPanelOpen = false;
  usersList: any[] = [];
  usersLoading = false;
  usersError = '';
  userSearchQuery = '';

  showCreateUserForm = false;
  showNewUserPassword = false; 
  newUser = { username: '', password: '', fullname: '' };
  newUserRoles: string[] = ['db_datareader'];
  userFormError = '';
  userFormSuccess = '';

  showAddRoleForm = false;
  addRoleUserId: number | null = null;
  addRoleSelection: string[] = [];
  addRoleError = '';
  addRoleSuccess = '';

  showDeleteUserSection = false;
  deleteConfirmModalOpen = false;
  deleteUserId: number | null = null;
  deleteError = '';
  deleteSuccess = '';

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('mainInput') mainInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatStream') chatStream!: ElementRef<HTMLDivElement>;

  readonly conversationGroups: ConversationGroup[] = [
    {
      label: 'Hari Ini',
      items: [
        { title: 'Tampilkan data dari tabel', preview: 'SELECT COUNT(*)...', active: true },
        { title: 'Total tunggakan SPP Bantul', preview: 'SUM(tunggakan_spp) ...' },
        { title: 'Sekolah dengan siswa paling banyak', preview: 'ORDER BY total_siswa DESC' },
      ],
    },
    {
      label: '7 Hari Terakhir',
      items: [
        { title: 'Jumlah sekolah per kota', preview: 'GROUP BY kota ...' },
        { title: 'Data siswa kategori boarding', preview: 'WHERE status = ...' },
        { title: 'Analisa mutasi data', preview: 'SELECT tanggal, COUNT(*) ...' },
      ],
    },
    {
      label: '30 Hari Terakhir',
      items: [
        { title: 'Dataset siswa aktif', preview: 'SELECT * FROM tbl_siswa ...' },
        { title: 'Laporan akreditasi sekolah', preview: 'AVG(nilai_akreditasi) ...' },
      ],
    },
  ];

  private readonly aiService = inject(AiService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly METADATA_FIELDS = [
    'narrative',
    'row_count',
    'query_type',
    'timestamp',
    'original_query',
    'database_name',
    'table_name',
    'column_name',
    'column_names',
    'old_column',
    'old_column_name',
    'new_column',
    'new_column_name',
  ];

  readonly availableRoles = [
    'db_owner', 
    'db_securityadmin', 
    'db_accessadmin', 
    'db_ddladmin',
    'db_datawriter', 
    'db_datareader', 
    'db_backupoperator',
    'db_denydatareader', 
    'db_denydatawriter'
  ];

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.currentUser = this.authService.getCurrentUser();
    this.sessionId = this.aiService.generateSessionId();
    this.loadMessages();
    this.loadDrafts();
    this.loadDatabases();
    setTimeout(() => this.scrollToBottom());

    const urlParams = new URLSearchParams(window.location.search);
    const sharedSessionId = urlParams.get('session');

    if (sharedSessionId && /^web-\d+-[a-z0-9]+$/.test(sharedSessionId)) {
      setTimeout(() => this.loadSession(sharedSessionId), 1000);
    }
  }

  isDbOwner(): boolean {
    const role = this.currentUser?.role || '';
    return role.split(',').map(r => r.trim()).includes('db_owner');
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.searchModalOpen) this.closeSearchModal();
  }

  @HostListener('document:keydown.control.k', ['$event'])
  onSearchShortcut(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    keyboardEvent.preventDefault();
    this.openSearchModal();
  }

  private static readonly MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  private static readonly ALLOWED_UPLOAD_MIME = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'application/pdf',
    '',
  ]);

  private showFileError(message: string): void {
    this.fileErrorMessage = message;
    this.fileErrorToastVisible = true;
    setTimeout(() => {
      this.fileErrorToastVisible = false;
      this.cdr.detectChanges();
    }, 4000);
    this.removeSelectedFile();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0] as File | undefined;
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const extAllowed = ['.xlsx', '.xls', '.csv', '.pdf'].some(ext => lowerName.endsWith(ext));
    if (!extAllowed) {
      this.showFileError('Format file tidak didukung. Harap unggah file dengan format Excel (.xlsx, .xls), CSV, atau PDF.');
      return;
    }
    if (!ChatComponent.ALLOWED_UPLOAD_MIME.has(file.type)) {
      this.showFileError(`MIME file tidak diizinkan: ${file.type || 'unknown'}.`);
      return;
    }
    if (file.size > ChatComponent.MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      this.showFileError(`Ukuran file ${mb} MB melebihi batas 5 MB.`);
      return;
    }

    this.selectedFile = file;

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv') || lowerName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const headers = rawArray[0] as string[];

          this.parsedFileData = rawArray.slice(1).map((row: any) => {
            const obj: any = {};
            headers.forEach((header, index) => { obj[header] = row[index]; });
            return obj;
          });
          this.messageText = `Tolong masukkan data dari file ${file.name} ini ke tabel `;
          this.cdr.detectChanges();
        } catch {
          this.showFileError('File tidak bisa diparse. Pastikan format Excel/CSV valid.');
        }
      };
      reader.onerror = () => this.showFileError('Gagal membaca file.');
      reader.readAsArrayBuffer(file);
    } else {
      this.parsedFileData = [];
      this.messageText = `Tolong baca dan masukkan data dari file PDF ${file.name} ini ke tabel `;
      this.cdr.detectChanges();
    }
  }

  removeSelectedFile() {
    this.selectedFile = null;
    this.parsedFileData = [];
    const fileInput = document.getElementById('fileUpload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  private convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  openUserPanel(): void {
    if (!this.isDbOwner()) return;
    this.userPanelOpen = true;
    this.usersError = '';
    this.closeAllForms();
    this.loadUsers();
    this.cdr.detectChanges();
  }

  closeUserPanel(): void {
    this.userPanelOpen = false;
    this.closeAllForms();
    this.cdr.detectChanges();
  }

  closeAllForms(): void {
    this.showCreateUserForm = false;
    this.showAddRoleForm = false;
    this.showDeleteUserSection = false;
    this.userFormError = '';
    this.userFormSuccess = '';
    this.addRoleError = '';
    this.addRoleSuccess = '';
    this.deleteError = '';
    this.deleteSuccess = '';
    this.cdr.detectChanges();
  }

  toggleCreateUserForm(): void {
    this.showCreateUserForm = !this.showCreateUserForm;
    if (this.showCreateUserForm) {
      this.showAddRoleForm = false;
      this.showDeleteUserSection = false;
      this.newUser = { username: '', password: '', fullname: '' };
      this.newUserRoles = ['db_datareader'];
      this.userFormError = '';
      this.userFormSuccess = '';
    }
    this.cdr.detectChanges();
  }

  toggleAddRoleForm(): void {
    this.showAddRoleForm = !this.showAddRoleForm;
    if (this.showAddRoleForm) {
      this.showCreateUserForm = false;
      this.showDeleteUserSection = false;
      this.addRoleUserId = null;
      this.addRoleSelection = [];
      this.addRoleError = '';
      this.addRoleSuccess = '';
    }
    this.cdr.detectChanges();
  }

  toggleDeleteUserSection(): void {
    this.showDeleteUserSection = !this.showDeleteUserSection;
    if (this.showDeleteUserSection) {
      this.showCreateUserForm = false;
      this.showAddRoleForm = false;
      this.deleteUserId = null;
      this.deleteError = '';
      this.deleteSuccess = '';
    }
    this.cdr.detectChanges();
  }

  loadUsers(): void {
    this.usersLoading = true;
    this.usersError = '';
    this.cdr.detectChanges();

    this.authService.listUsers().subscribe({
      next: (res: any) => {
        this.usersList = res.users || res || [];
        this.usersLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.usersError = err.error?.error || 'Gagal memuat daftar user';
        this.usersList = [];
        this.usersLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  filteredUsers(): any[] {
    const term = this.userSearchQuery.trim().toLowerCase();
    if (!term) return this.usersList;
    return this.usersList.filter(u =>
      (u.username || '').toLowerCase().includes(term) ||
      (u.fullname || '').toLowerCase().includes(term) ||
      (u.role || '').toLowerCase().includes(term)
    );
  }

  parseRoles(roleString: string): string[] {
    if (!roleString) return [];
    return roleString.split(',').map(r => r.trim()).filter(Boolean);
  }

  toggleNewUserRole(role: string): void {
    const idx = this.newUserRoles.indexOf(role);
    if (idx > -1) {
      this.newUserRoles.splice(idx, 1);
    } else {
      this.newUserRoles.push(role);
    }
    this.cdr.detectChanges();
  }

  toggleAddRoleSelection(role: string): void {
    const idx = this.addRoleSelection.indexOf(role);
    if (idx > -1) {
      this.addRoleSelection.splice(idx, 1);
    } else {
      this.addRoleSelection.push(role);
    }
    this.cdr.detectChanges();
  }

  submitCreateUser(): void {
    this.userFormError = '';
    this.userFormSuccess = '';

    if (!this.newUser.username || this.newUser.username.length < 3) {
      this.userFormError = 'Username minimal 3 karakter';
      this.cdr.detectChanges();
      return;
    }
    if (!this.newUser.password || this.newUser.password.length < 8) {
      this.userFormError = 'Password minimal 8 karakter';
      this.cdr.detectChanges();
      return;
    }
    if (this.newUserRoles.length === 0) {
      this.userFormError = 'Pilih minimal 1 role';
      this.cdr.detectChanges();
      return;
    }

    const payload = {
      username: this.newUser.username,
      password: this.newUser.password,
      fullname: this.newUser.fullname || this.newUser.username,
      role: this.newUserRoles.join(',')
    };

    this.authService.createUser(payload).subscribe({
      next: (res: any) => {
        this.userFormSuccess = res.message || 'User berhasil dibuat';
        this.newUser = { username: '', password: '', fullname: '' };
        this.newUserRoles = ['db_datareader'];
        this.loadUsers();
        setTimeout(() => {
          this.showCreateUserForm = false;
          this.userFormSuccess = '';
          this.cdr.detectChanges();
        }, 1500);
      },
      error: (err) => {
        this.userFormError = err.error?.error || 'Gagal membuat user';
        this.cdr.detectChanges();
      }
    });
  }

  submitAddRole(): void {
    this.addRoleError = '';
    this.addRoleSuccess = '';

    if (!this.addRoleUserId) {
      this.addRoleError = 'Pilih user terlebih dahulu';
      this.cdr.detectChanges();
      return;
    }
    if (this.addRoleSelection.length === 0) {
      this.addRoleError = 'Pilih minimal 1 role';
      this.cdr.detectChanges();
      return;
    }

    this.authService.updateUserRole(this.addRoleUserId, this.addRoleSelection.join(',')).subscribe({
      next: () => {
        this.addRoleSuccess = 'Role berhasil diperbarui';
        this.loadUsers();
        setTimeout(() => {
          this.showAddRoleForm = false;
          this.addRoleSuccess = '';
          this.cdr.detectChanges();
        }, 1500);
      },
      error: (err) => {
        this.addRoleError = err.error?.error || 'Gagal update role';
        this.cdr.detectChanges();
      }
    });
  }

  submitDeleteUser(): void {
    this.deleteError = '';
    this.deleteSuccess = '';

    if (!this.deleteUserId) {
      this.deleteError = 'Pilih user yang ingin dihapus';
      this.cdr.detectChanges();
      return;
    }

    const user = this.usersList.find(u => u.user_id === this.deleteUserId);
    if (!user) {
      this.deleteError = 'User tidak ditemukan';
      this.cdr.detectChanges();
      return;
    }

    if (user.user_id === this.currentUser?.user_id) {
      this.deleteError = 'Anda tidak dapat menghapus akun sendiri';
      this.cdr.detectChanges();
      return;
    }

    this.authService.deleteUser(this.deleteUserId).subscribe({
      next: () => {
        this.deleteSuccess = 'User berhasil dihapus';
        this.deleteUserId = null;
        this.loadUsers();
        setTimeout(() => {
          this.showDeleteUserSection = false;
          this.deleteSuccess = '';
          this.cdr.detectChanges();
        }, 1500);
      },
      error: (err) => {
        this.deleteError = err.error?.error || 'Gagal menghapus user';
        this.cdr.detectChanges();
      }
    });
  }

  getSelectedDeleteUser(): any {
    if (!this.deleteUserId) return null;
    return this.usersList.find(u => Number(u.user_id) === Number(this.deleteUserId)) || null;
  }

  askDeleteUser(): void {
    this.deleteError = '';
    this.deleteSuccess = '';

    if (!this.deleteUserId) {
      this.deleteError = 'Pilih user yang ingin dihapus';
      this.cdr.detectChanges();
      return;
    }

    const user = this.getSelectedDeleteUser();
    if (!user) {
      this.deleteError = 'User tidak ditemukan';
      this.cdr.detectChanges();
      return;
    }

    if (user.user_id === this.currentUser?.user_id) {
      this.deleteError = 'Anda tidak dapat menghapus akun sendiri';
      this.cdr.detectChanges();
      return;
    }

    this.deleteConfirmModalOpen = true;
    this.cdr.detectChanges();
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmModalOpen = false;
    this.cdr.detectChanges();
  }

  confirmDeleteUser(): void {
    this.deleteConfirmModalOpen = false;
    this.submitDeleteUser();
  }

  onAddRoleUserChange(userId: any): void {
    const numericId = Number(userId);
    this.addRoleUserId = isNaN(numericId) ? null : numericId;

    if (this.addRoleUserId) {
      const user = this.usersList.find(u => Number(u.user_id) === this.addRoleUserId);
      if (user) {
        this.addRoleSelection = this.parseRoles(user.role);
      } else {
        this.addRoleSelection = [];
      }
    } else {
      this.addRoleSelection = [];
    }
    this.cdr.detectChanges();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('sql-sidebar-collapsed', String(this.sidebarCollapsed));
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
    this.cdr.detectChanges();
  }

  logout(): void {
    this.userMenuOpen = false;
    this.logoutModalOpen = true;
    this.cdr.detectChanges();
  }

  cancelLogout(): void {
    this.logoutModalOpen = false;
    this.cdr.detectChanges();
  }

  confirmLogout(): void {
    this.logoutModalOpen = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  newConversation(): void {
    if (this.messages.length > 0) {
      this.saveMessages(false);
    }

    this.messages = [];
    this.messageText = '';
    this.sessionId = this.aiService.generateSessionId();
    localStorage.removeItem('sql-agent-active-session');
    setTimeout(() => this.focusInput());
    this.cdr.detectChanges();
  }

  loadMessages(): void {
    this.aiService.getSessions().subscribe({
      next: (res: any) => {
        const sessions = res.sessions || res || [];
        let savedSessions: ChatSession[] = [];
        try {
          const storedSessions = localStorage.getItem('sql-agent-sessions');
          savedSessions = storedSessions ? JSON.parse(storedSessions) as ChatSession[] : [];
        } catch (error) {
          console.error('Failed to load cached session messages:', error);
        }

        const parseSqlDate = (dateStr: any): number => {
          if (!dateStr) return Date.now();
          let time = new Date(dateStr).getTime();
          if (isNaN(time)) {
            time = new Date(String(dateStr).replace(' ', 'T')).getTime();
          }
          return isNaN(time) ? Date.now() : time;
        };

        this.ChatSession = sessions.map((s: any) => ({
          id: s.session_id,
          title: s.title || 'Percakapan Baru',
          timestamp: parseSqlDate(s.updated_at || s.created_at),
          messages: savedSessions.find(session => session.id === s.session_id)?.messages ?? [],
        }));

        this.sortSessions();

        this.ChatSession.sort((a, b) => b.timestamp - a.timestamp);

        const activeSessionId = localStorage.getItem('sql-agent-active-session');
        const activeSession = activeSessionId
          ? this.ChatSession.find(s => s.id === activeSessionId)
          : this.ChatSession[0];

        if (activeSession) {
          this.sessionId = activeSession.id;
          this.loadSessionMessages(activeSession.id);
        } else {
          this.sessionId = this.aiService.generateSessionId();
          this.messages = [];
        }

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load sessions from SQL:', err);
        this.loadLocalMessages();
      }
    });

    const collapsed = localStorage.getItem('sql-sidebar-collapsed');
    this.sidebarCollapsed = collapsed === 'true';
  }

  private loadSessionMessages(sessionId: string): void {
    this.aiService.getHistory(sessionId).subscribe({
      next: (res: any) => {
        const rawMessages = res.messages || res || [];
        const normalizeSql = (sql: unknown): string =>
          typeof sql === 'string' ? sql.trim().replace(/\s+/g, ' ') : '';
        const sessionDrafts = this.drafts.filter(
          (draft) => !draft.sessionId || draft.sessionId === sessionId
        );

        const isConfirmStatus = (s: string) => {
          if (!s) return false;
          return s === 'destructive' || s.startsWith('confirm_');
        };

        const parseSqlDate = (dateStr: any): Date => {
          if (!dateStr) return new Date();
          let d = new Date(dateStr);
          if (isNaN(d.getTime())) {
            d = new Date(String(dateStr).replace(' ', 'T'));
          }
          return isNaN(d.getTime()) ? new Date() : d;
        };

        const localMessagesMap = new Map<string, ChatMessage>();
        const localSession = this.ChatSession.find(session => session.id === sessionId);
        localSession?.messages.forEach(message => {
          if (message.type === 'ai' && message.sql) {
            localMessagesMap.set(normalizeSql(message.sql), message);
          }
        });

        const messagesByQuery = new Map<string, any>();

        rawMessages.forEach((m: any) => {
          let parsedMetadata: any;
          try {
            if (m.metadata) {
              parsedMetadata = typeof m.metadata === 'string'
                ? JSON.parse(m.metadata)
                : m.metadata;
            }
          } catch (error) {
            console.error('Failed to parse history message metadata:', error);
          }

          const sql = m.sql_query || m.sql || parsedMetadata?.query || parsedMetadata?.original_query || '';
          const sqlKey = normalizeSql(sql);
          const savedDraft = m.message_type === 'ai'
            ? sessionDrafts.find((draft) => normalizeSql(draft.query) === sqlKey)
            : undefined;
          const normalizedMessage = {
            ...m,
            sql_query: sql,
            metadata: parsedMetadata,
            status_type: savedDraft ? 'info' : m.status_type,
            status_text: savedDraft ? 'Draft Query' : m.status_text,
            draftQuery: savedDraft,
          };
          const key = sqlKey && m.message_type === 'ai'
            ? `ai::${sqlKey}`
            : `msg-${m.message_id}`;

          const existing = messagesByQuery.get(key);

          if (!existing) {
            messagesByQuery.set(key, normalizedMessage);
            return;
          }

          const existingIsConfirm = isConfirmStatus(existing.status_type);
          const currentIsConfirm = isConfirmStatus(normalizedMessage.status_type);
          const existingIsDraft = Boolean(existing.draftQuery);
          const currentIsDraft = Boolean(normalizedMessage.draftQuery);

          if (currentIsDraft && !existingIsDraft) {
            messagesByQuery.set(key, normalizedMessage);
            return;
          }

          if (existingIsDraft && !currentIsDraft) {
            return;
          }

          if (existingIsConfirm && !currentIsConfirm) {
            messagesByQuery.set(key, normalizedMessage);
            return;
          }

          if (existingIsConfirm === currentIsConfirm) {
            if ((normalizedMessage.message_id || 0) > (existing.message_id || 0)) {
              messagesByQuery.set(key, normalizedMessage);
            }
          }
        });

        const deduplicatedMessages = Array.from(messagesByQuery.values())
          .sort((a, b) => (a.message_id || 0) - (b.message_id || 0));

        const finalMessages: any[] = [];
        const seenKeys = new Set<string>();

        for (const msg of deduplicatedMessages) {
          const normalizedContent = (msg.content || '').trim();
          const normalizedSql = normalizeSql(msg.sql_query || msg.sql || '');
          const msgStatus = msg.status_type || '';

          const dedupKey = msg.message_type === 'ai'
            ? `ai:${normalizedSql}:${msgStatus}`
            : `user:${normalizedContent}`;

          if (seenKeys.has(dedupKey)) {
            const existingIdx = finalMessages.findIndex(m => {
              const c = (m.content || '').trim();
              const s = normalizeSql(m.sql_query || m.sql || '');
              return m.message_type === 'ai'
                ? normalizeSql(s) === normalizedSql && (m.status_type || '') === msgStatus
                : c === normalizedContent;
            });
            
            if (existingIdx > -1) {
              const existing = finalMessages[existingIdx];
              const existingId = existing.message_id || 0;
              const currentId = msg.message_id || 0;
              if (currentId > existingId) {
                finalMessages[existingIdx] = msg;
              }
            }
            continue;
          }

          seenKeys.add(dedupKey);
          finalMessages.push(msg);
        }

        this.messages = finalMessages.map((m: any) => {
          const sqlKey = normalizeSql(m.sql_query || m.sql || '');
          const localMsg = localMessagesMap.get(sqlKey);

          const finalStatusType = (localMsg && localMsg.status_type) ? localMsg.status_type : m.status_type;
          const finalStatusText = (localMsg && localMsg.status_text) ? localMsg.status_text : m.status_text;

          let parsedData = m.data;
          if (typeof parsedData === 'string') {
            try {
              parsedData = JSON.parse(parsedData);
            } catch (e) {
              console.error('Failed to parse table data from API', e);
              parsedData = [];
            }
          }

          const mapped: ChatMessage = {
            id: `msg-${m.message_id}`,
            messageId: m.message_id,
            type: m.message_type as 'user' | 'ai',
            text: m.message_type === 'user' ? m.content : undefined,
            narrative: m.message_type === 'ai' ? m.content : undefined,
            status_type: finalStatusType,
            sql: m.sql_query,
            metadata: m.metadata,
            status_text: finalStatusText,
            draftQuery: m.draftQuery,
            timestamp: this.formatTimestamp(parseSqlDate(m.created_at)),
            data: (Array.isArray(parsedData) && parsedData.length > 0) ? parsedData : (localMsg?.data || undefined),
          };

          if (localMsg && localMsg.dashboard_url) {
            mapped.dashboard_url = localMsg.dashboard_url;
          }
          return mapped;
        });

        setTimeout(() => this.scrollToBottom(), 100);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load history from SQL:', err);
        this.messages = [];
        this.cdr.detectChanges();
      }
    });
  }

  private loadLocalMessages(): void {
    try {
      const savedSessions = localStorage.getItem('sql-agent-sessions');
      this.ChatSession = savedSessions ? JSON.parse(savedSessions) as ChatSession[] : [];

      const activeSessionId = localStorage.getItem('sql-agent-active-session');

      if (activeSessionId) {
        const activeSession = this.ChatSession.find(s => s.id === activeSessionId);

        if (activeSession) {
          this.sessionId = activeSession.id;
          this.messages = activeSession.messages;
        } else {
          this.sessionId = this.aiService.generateSessionId();
          this.messages = [];
        }
      } else {
        this.sessionId = this.aiService.generateSessionId();
        this.messages = [];
      }

      if (this.messages.length === 0 && this.ChatSession.length > 0) {
        this.sessionId = this.ChatSession[0].id;
        this.messages = this.ChatSession[0].messages;
      }

    } catch (error) {
      console.error('Failed to load local messages:', error);
      this.ChatSession = [];
      this.messages = [];
      this.sessionId = this.aiService.generateSessionId();
    }
  }

  loadSession(sessionId: string): void {
    this.saveMessages(false);
    this.sessionId = sessionId;
    localStorage.setItem('sql-agent-active-session', sessionId);
    this.sortSessions();
    this.loadSessionMessages(sessionId);
    this.cdr.detectChanges();
  }

  toggleMenu(event: Event, sessionId: string): void {
    event.stopPropagation();
    this.activeMenuId = this.activeMenuId === sessionId ? null : sessionId;
    this.cdr.detectChanges();
  }

  shareSession(sessionId: string, event: Event): void {
    event.stopPropagation();
    const shareUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      this.shareToastVisible = true;

      this.cdr.detectChanges(); 
      
      setTimeout(() => {
        this.shareToastVisible = false;
        this.cdr.detectChanges();
      }, 6000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
    
    this.activeMenuId = null;
    this.cdr.detectChanges();
  }

  askDeleteSession(sessionId: string, title: string, event: Event): void {
    event.stopPropagation();
    this.sessionToDeleteId = sessionId;
    this.sessionToDeleteTitle = title;
    this.deleteModalVisible = true;
    this.activeMenuId = null;
    this.cdr.detectChanges();
  }

  confirmDelete(): void {
    const sessionId = this.sessionToDeleteId;
    if (!sessionId) return;

    this.aiService.deleteSessionFromDB(sessionId).subscribe({
      next: () => console.log('Session deleted from DB'),
      error: (err) => console.error('Failed to delete session from DB:', err)
    });

    this.ChatSession = this.ChatSession.filter(s => s.id !== sessionId);
    
    if (this.sessionId === sessionId) {
      this.newConversation();
    }

    localStorage.setItem('sql-agent-sessions', JSON.stringify(this.ChatSession));
    this.deleteModalVisible = false;
    this.sessionToDeleteId = '';
    this.sessionToDeleteTitle = '';
    this.cdr.detectChanges();
  }

  cancelDelete(): void {
    this.deleteModalVisible = false;
    this.sessionToDeleteId = '';
    this.sessionToDeleteTitle = '';
    this.cdr.detectChanges();
  }
  
  loadDatabases(): void {
    if (this.databasesLoaded) return;
    this.aiService.getDatabases().subscribe({
      next: (res: any) => {
        this.availableDatabases = res.databases || [];
        this.databasesLoaded = true;

        const saved = localStorage.getItem('sql-agent-selected-db');
        if (saved && this.availableDatabases.includes(saved)) {
          this.selectedDatabase = saved;
        } else if (this.availableDatabases.length > 0) {
          this.selectedDatabase = this.availableDatabases[0];
        }

        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        console.error('Failed to load databases:', err);
        this.availableDatabases = ['TestDB'];
        this.databasesLoaded = true;
      }
    });
  }

  onDatabaseChange(): void {
    localStorage.setItem('sql-agent-selected-db', this.selectedDatabase);
    console.log('Database switched to:', this.selectedDatabase);

    if (this.schemaPanelOpen) {
      this.schemaData = { tables: [], procedures: [], views: [] };
      this.expandedTables = {};
      this.loadSchema();
    }
  }

  toggleSchemaPanel(): void {
    this.schemaPanelOpen = !this.schemaPanelOpen;
    if (this.schemaPanelOpen) {
      this.loadSchema();
    }
  }

  loadSchema(): void {
    this.schemaLoading = true;
    this.cdr.detectChanges();

    this.aiService.getSchema(this.selectedDatabase).subscribe({
      next: (res: any) => {
        const views = res.views || [];
        const viewNames = new Set(views.map((v: any) => v.name.toLowerCase()));
        const filteredTables = (res.tables || []).filter(
          (t: any) => !viewNames.has(t.name.toLowerCase())
        );

        this.schemaData = {
          tables: filteredTables,
          procedures: res.procedures || [],
          views: views
        };
        this.schemaLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        console.error('Failed to load schema:', err);
        this.schemaData = { tables: [], procedures: [], views: [] };
        this.schemaLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  refreshSchema(): void {
    this.loadSchema();
  }

  setSchemaTab(tab: 'tables' | 'procedures' | 'views'): void {
    this.activeSchemaTab = tab;
    this.schemaSearchQuery = '';
  }

  toggleTable(tableName: string): void {
    this.expandedTables[tableName] = !this.expandedTables[tableName];
  }

  getFilteredSchemaItems(): any[] {
    const term = this.schemaSearchQuery.toLowerCase().trim();

    if (this.activeSchemaTab === 'tables') {
      if (!term) return this.schemaData.tables;
      return this.schemaData.tables.filter(t => t.name.toLowerCase().includes(term));
    }

    if (this.activeSchemaTab === 'procedures') {
      if (!term) return this.schemaData.procedures;
      return this.schemaData.procedures.filter(p => p.name.toLowerCase().includes(term));
    }

    if (this.activeSchemaTab === 'views') {
      if (!term) return this.schemaData.views;
      return this.schemaData.views.filter(v => v.name.toLowerCase().includes(term));
    }

    return [];
  }

  dbDropdownOpen = false;

  toggleDbDropdown(event: Event): void {
    event.stopPropagation();
    this.dbDropdownOpen = !this.dbDropdownOpen;
  }

  selectDatabase(db: string): void {
    this.selectedDatabase = db;
    this.dbDropdownOpen = false;
    this.onDatabaseChange();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      this.dbDropdownOpen = false;
    }
    if (!target.closest('.conversation-actions')) {
      this.activeMenuId = null;
    }
    if (!target.closest('.sidebar-user')) {
      this.userMenuOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseDropdown(): void {
    if (this.dbDropdownOpen) {
      this.dbDropdownOpen = false;
    }
    if (this.activeMenuId) {
      this.activeMenuId = null;
    }
    if (this.userMenuOpen) {
      this.userMenuOpen = false;
    }
    if (this.logoutModalOpen) {
      this.logoutModalOpen = false;
    }
  }

  private sortSessions(): void {
    this.ChatSession = [...this.ChatSession].sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      return tsB - tsA;
    });
  }

  trackBySessionId(index: number, item: any): string {
    return item?.id || index.toString();
  }

  saveMessages(forceUpdate: boolean = true): void {
    if (this.messages.length === 0) return;

    const firstUserMsg = this.messages.find(m => m.type === 'user');
    const title = firstUserMsg?.text
      ? firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '')
      : 'Percakapan Baru';

    const existingIndex = this.ChatSession.findIndex(s => s.id === this.sessionId);

    let timestamp = Date.now();
    if (existingIndex > -1 && !forceUpdate) {
      timestamp = this.ChatSession[existingIndex].timestamp || Date.now();
    }

    const sessionData: ChatSession = {
      id: this.sessionId,
      title: title,
      timestamp: timestamp,
      messages: this.messages,
    };

    let updated: ChatSession[];
    if (existingIndex > -1) {
      updated = [...this.ChatSession];
      updated[existingIndex] = sessionData;
    } else {
      updated = [sessionData, ...this.ChatSession];
    }

    this.ChatSession = updated;
    this.sortSessions();
    this.cdr.detectChanges();

    localStorage.setItem('sql-agent-sessions', JSON.stringify(this.ChatSession));
    localStorage.setItem('sql-agent-active-session', this.sessionId);
    localStorage.setItem('sql-agent-history', JSON.stringify(this.messages));
  }

  async sendMessage(): Promise<void> {
    const prompt = this.messageText.trim();
    if (!prompt || this.isLoading) return;

    const filePayload = this.parsedFileData.length > 0 ? this.parsedFileData : undefined;
    const fileBase64 = this.selectedFile && this.selectedFile.name.endsWith('.pdf') ? await this.convertFileToBase64(this.selectedFile) : undefined;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: prompt,
      timestamp: this.formatTimestamp(),
    };

    const confirmTypes = [
      'destructive',
      'confirm_create_table',
      'confirm_rename_column',
      'confirm_alter_drop_column',
      'confirm_alter_add_column',
      'confirm_alter_foreign_key',
      'confirm_alter_table'
    ];

    this.messages = [...this.messages, userMessage];
    this.messageText = '';
    this.isLoading = true;
    this.saveMessages();
    this.sortSessions();  
    this.cdr.detectChanges();
    this.scrollToBottom();

    this.aiService.saveMessageToHistory({
      sessionId: this.sessionId,
      type: 'user',
      content: prompt,
      database: this.selectedDatabase,
      userId: this.currentUser?.user_id ?? null,   
    }).subscribe({
      next: () => console.log('User saved'),
      error: (err) => console.error('Failed:', err)
    });

    this.aiService.sendMessage(prompt, this.sessionId, this.selectedDatabase, filePayload, fileBase64).subscribe({
      next: (response: AiResponse) => {
        let parsed: any = response;

        try {
          const outputValue = (response as any)?.output;
          if (typeof outputValue === 'string') {
            const normalized = outputValue.trim();
            if (normalized.startsWith('{') || normalized.startsWith('[')) {
              parsed = JSON.parse(normalized);
            }
          }
        } catch (error) {
          console.error('Parse error:', error);
          parsed = response;
        }

        const payload: any = parsed ?? response;
        const responseData: any = response;

        if (payload.status_text === 'Batas Request Tercapai' || payload.error_code === 'RATE_LIMIT_EXCEEDED' || payload.status_type === 'rate_limit') {
          this.rateLimitToastMessage = payload.narrative || 'Batas maksimal request tercapai. Silakan coba lagi nanti.';
          this.rateLimitToastVisible = true;
          setTimeout(() => {
            this.rateLimitToastVisible = false;
            this.cdr.detectChanges();
          }, 5000);
          
          payload.status_type = 'rate_limit'; 
        }

        const extractedQuery = this.extractQueryFromPayload(payload) || this.extractQueryFromPayload(responseData) || '';
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          type: 'ai',
          status_text: payload.status_text ?? response.status_text,
          status_type: payload.status_type ?? responseData?.status_type ?? response.status_type,
          narrative: payload.narrative ?? responseData?.narrative ?? response.narrative,
          metadata: {
            database:
              payload.metadata?.database_name ??
              payload.metadata?.database ??
              responseData?.metadata?.database_name ??
              responseData?.metadata?.database ??
              '-',
            table:
              payload.metadata?.table_name ??
              payload.metadata?.table ??
              responseData?.metadata?.table_name ??
              responseData?.metadata?.table ??
              '-',
            row_count: payload.metadata?.row_count ?? responseData?.metadata?.row_count ?? 0,
            timestamp: this.formatTimestamp(),
            query: payload.metadata?.query ?? responseData?.metadata?.query ?? extractedQuery,
            query_type:
              payload.metadata?.query_type ??
              responseData?.metadata?.query_type ??
              payload.query_type ??
              responseData?.query_type ??
              'SELECT',
            estimatedImpact:
              payload.metadata?.estimated_impact ??
              payload.metadata?.estimatedImpact ??
              responseData?.metadata?.estimated_impact ??
              responseData?.metadata?.estimatedImpact ??
              payload?.metadata?.row_count ??
              responseData?.metadata?.row_count ?? 0,
            column_name: payload.metadata?.column_name ?? responseData?.metadata?.column_name ?? '-',
            old_column: payload.metadata?.old_column ?? responseData?.metadata?.old_column ?? '-',
            new_column: payload.metadata?.new_column ?? responseData?.metadata?.new_column ?? '-',
            error_message: payload.metadata?.error_message ?? responseData?.metadata?.error_message ?? '',
            error_hint: payload.metadata?.error_hint ?? responseData?.metadata?.error_hint ?? ''
          },
          data: Array.isArray(payload.data) ? payload.data : (Array.isArray(response.data) ? response.data : []),
          dashboard_url: payload.dashboard_url ?? response.dashboard_url,
          timestamp: this.formatTimestamp(),
          sql:
            extractedQuery ||
            payload.query ||
            payload.sql ||
            payload.metadata?.query ||
            responseData?.query ||
            responseData?.sql,
          expiresIn: payload.expiresIn ?? responseData?.expiresIn,
        };

        if (confirmTypes.includes(payload.status_type)) {
          if (aiMessage.sql && this.isSpRenameQuery(aiMessage.sql)) {
            const renameInfo = this.extractRenameInfoFromQuery(aiMessage.sql);

            if (!aiMessage.metadata) {
              aiMessage.metadata = {
                database: this.selectedDatabase,
                table: '-',
                row_count: 0,
                timestamp: this.formatTimestamp(),
                query: aiMessage.sql,
              };
            }

            if (renameInfo.table !== '-' && (!aiMessage.metadata.table || aiMessage.metadata.table === 'sp_rename' || aiMessage.metadata.table === '-')) {
              aiMessage.metadata.table = renameInfo.table;
            }
            if (renameInfo.oldColumn !== '-') {
              aiMessage.metadata.old_column = renameInfo.oldColumn;
              aiMessage.metadata.column_name = renameInfo.oldColumn;
            }
            if (renameInfo.newColumn !== '-') {
              aiMessage.metadata.new_column = renameInfo.newColumn;
            }
            if (!aiMessage.metadata.query_type || aiMessage.metadata.query_type === 'QUERY') {
              aiMessage.metadata.query_type = 'EXEC sp_rename';
            }
          }
          aiMessage.expiresIn = payload.expiresIn ?? responseData?.expiresIn ?? 300;
          this.startCountdown(aiMessage);

          if (!aiMessage.status_text) {
            const statusMap: Record<string, string> = {
              'confirm_create_table': 'Konfirmasi Pembuatan Tabel',
              'confirm_rename_column': 'Konfirmasi Ubah Nama Kolom',
              'confirm_alter_drop_column': 'Konfirmasi Hapus Kolom',
              'confirm_alter_add_column': 'Konfirmasi Tambah Kolom',
              'confirm_alter_foreign_key': 'Konfirmasi Foreign Key',
              'confirm_alter_table': 'Konfirmasi Perubahan Tabel',
              'destructive': 'Konfirmasi Diperlukan'
            };
            aiMessage.status_text = statusMap[payload.status_type] ?? 'Konfirmasi Diperlukan';
          }
        }

        if (payload.status_type === 'forbidden') {
          aiMessage.status_text = payload.status_text ?? 'Operasi Ditolak';
          aiMessage.narrative = payload.narrative ?? 'Operasi ini tidak diizinkan oleh sistem. Silakan salin query dan jalankan manual jika diperlukan.';
          aiMessage.sql = payload.query ?? payload.metadata?.query ?? aiMessage.sql;
        }

        if (payload.status_type === 'clarification') {
          aiMessage.status_text = payload.status_text ?? 'Perlu Klarifikasi';
          aiMessage.narrative = payload.narrative ?? '';
          aiMessage.sql = '';
        }

        this.aiService.saveMessageToHistory({
          sessionId: this.sessionId,
          type: 'ai',
          content: aiMessage.narrative,
          sql: aiMessage.sql,
          statusType: aiMessage.status_type,
          metadata: aiMessage.metadata,
          data: aiMessage.data,
          database: this.selectedDatabase,
          userId: this.currentUser?.user_id ?? null,   
        }).subscribe({
          next: (res: any) => {
            console.log('AI message saved. ID:', res?.message_id);
            if (res && res.message_id) {
              aiMessage.messageId = res.message_id;
            }
          },
          error: (err) => console.error('Failed to save AI message:', err)
        });

        this.messages = [...this.messages, aiMessage];
        this.isLoading = false;
        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();
        this.removeSelectedFile();
      },

      error: (error: unknown) => {
      const errObj: any = error;
        if (errObj.status === 429 || errObj.error?.error_code === 'RATE_LIMIT_EXCEEDED') {
          const msg = errObj.error?.notification?.message || errObj.error?.message || 'Batas request tercapai. Silakan coba lagi nanti.';
          this.rateLimitToastMessage = msg;
          this.rateLimitToastVisible = true;
          setTimeout(() => {
            this.rateLimitToastVisible = false;
            this.cdr.detectChanges();
          }, 5000);

          this.messages = [
            ...this.messages,
            {
              id: `err-${Date.now()}`,
              type: 'ai',
              status_text: 'Batas Request Tercapai',
              status_type: 'rate_limit',
              narrative: msg,
              metadata: { database: this.selectedDatabase, table: '-', row_count: 0, timestamp: this.formatTimestamp(), query: '' },
              timestamp: this.formatTimestamp(),
            }
          ];
          this.isLoading = false;
          this.saveMessages();
          this.cdr.detectChanges();
          this.scrollToBottom();
          return;   
        }

        console.error('AI request failed', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        this.messages = [
          ...this.messages,
          {
            id: `err-${Date.now()}`,
            type: 'ai',
            status_text: 'Terjadi Kesalahan',
            status_type: 'danger',
            narrative: errorMsg || 'Request gagal diproses. Silakan coba lagi.',
            metadata: {
              database: 'TestDB',
              table: '-',
              row_count: 0,
              timestamp: this.formatTimestamp(),
              query: '',
            },
            timestamp: this.formatTimestamp(),
          },
        ];
        this.isLoading = false;
        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
    });
  }

  onSubmitKeydown(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      keyboardEvent.preventDefault();
      this.sendMessage();
    }
  }

  confirmDestructive(msg: ChatMessage): void {
    if (!msg.sql) return;

    if (msg.countdownInterval) {
      clearInterval(msg.countdownInterval);
      msg.countdownInterval = null;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    const originalStatus = msg.status_type || '';
    const specialOps = [
      'confirm_create_table',
      'confirm_rename_column',
      'confirm_alter_drop_column',
      'confirm_alter_add_column',
      'confirm_alter_foreign_key',
      'confirm_alter_table'
    ];
    const isSpecialOp = specialOps.includes(originalStatus);
    const statusTextMap: Record<string, string> = {
      'confirm_create_table': 'Tabel Berhasil Dibuat',
      'confirm_rename_column': 'Nama Kolom Berhasil Diubah',
      'confirm_alter_drop_column': 'Kolom Berhasil Dihapus',
      'confirm_alter_add_column': 'Kolom Berhasil Ditambahkan',
      'confirm_alter_foreign_key': 'Foreign Key Berhasil Ditambahkan',
      'confirm_alter_table': 'Struktur Tabel Berhasil Diubah'
    };

    this.aiService.confirmOperation(
      msg.sql,
      this.sessionId,
      (msg as any).pending_id,
      this.selectedDatabase
      ).subscribe({
      next: (response: AiResponse) => {
        msg.id = `approved-${Date.now()}`;

        if (isSpecialOp && msg.sql && this.isAlterTableQuery(msg.sql) && !this.isCreateTableQuery(msg.sql)) {
          const alterInfo = this.extractAlterInfoFromQuery(msg.sql);

          if (!msg.metadata) {
            msg.metadata = {
              database: this.selectedDatabase,
              table: '-',
              row_count: 0,
              timestamp: this.formatTimestamp(),
              query: msg.sql,
            };
          }

          if (alterInfo.table !== '-') {
            msg.metadata.table = alterInfo.table;
          }

          if (alterInfo.column !== '-') {
            msg.metadata.column_name = alterInfo.column;
          }

          if (alterInfo.operation !== 'QUERY') {
            msg.metadata.query_type = alterInfo.operation;
          }
        }

        if (isSpecialOp && msg.sql && this.isSpRenameQuery(msg.sql)) {
          const renameInfo = this.extractRenameInfoFromQuery(msg.sql);

          if (!msg.metadata) {
            msg.metadata = {
              database: this.selectedDatabase,
              table: '-',
              row_count: 0,
              timestamp: this.formatTimestamp(),
              query: msg.sql,
            };
          }

          if (renameInfo.table !== '-') {
            msg.metadata.table = renameInfo.table;
          }

          if (renameInfo.oldColumn !== '-') {
            msg.metadata.old_column = renameInfo.oldColumn;
            msg.metadata.column_name = renameInfo.oldColumn;
          }

          if (renameInfo.newColumn !== '-') {
            msg.metadata.new_column = renameInfo.newColumn;
          }

          if (msg.metadata.query_type !== 'EXEC sp_rename') {
            msg.metadata.query_type = 'EXEC sp_rename';
          }
        }

        if (isSpecialOp) {
          msg.status_type = 'success';
          msg.status_text = statusTextMap[originalStatus] || 'Operasi Berhasil';
          msg.narrative = 'Operasi berhasil dijalankan ke database ' + this.selectedDatabase + '.';
        } else {
          msg.status_type = 'approved';
          msg.status_text = 'Persetujuan Dibuat';
          msg.narrative = 'Persetujuan telah dibuat. Query berhasil dijalankan ke database.';
        }

        msg.timestamp = this.formatTimestamp();

        if (msg.metadata) {
          msg.metadata.row_count = response.metadata?.row_count ?? msg.metadata.row_count ?? 0;
          msg.metadata.timestamp = this.formatTimestamp();
        }

        if (response.data) {
          msg.data = response.data;
        }

        if (msg.messageId) {
          this.aiService.updateMessage({
            messageId: msg.messageId,
            statusType: msg.status_type || 'approved',
            narrative: msg.narrative,
            sql: msg.sql,
          }).subscribe({
            next: () => console.log('Message status updated in DB'),
            error: (err) => console.error('Failed to update message in DB:', err)
          });
        }

        this.messages = [...this.messages];

        const activeSession = this.ChatSession.find(s => s.id === this.sessionId);
        if (activeSession) {
          activeSession.messages = [...this.messages];
        }

        localStorage.setItem('sql-agent-sessions', JSON.stringify(this.ChatSession));
        localStorage.setItem('sql-agent-active-session', this.sessionId);

        this.isLoading = false;
        this.saveMessages(true);
        this.cdr.detectChanges();
        this.scrollToBottom();

        if (this.schemaPanelOpen) {
          this.refreshSchema();
        }
      },
      error: (error: unknown) => {
        console.error('Confirm operation failed', error);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  cancelDestructive(msg: ChatMessage): void {

    if (msg.countdownInterval) {
      clearInterval(msg.countdownInterval);
      msg.countdownInterval = null;
    }

    console.log('Cancel Destructive operation:');
    console.log('Full msg:', JSON.stringify(msg));
    console.log('estimatedImpact:', msg.metadata?.estimatedImpact);

    const query = msg.sql ?? '';
    const targetTable = this.extractObjectNameFromQuery(query) !== '-' 
      ? this.extractObjectNameFromQuery(query) 
      : (msg.metadata?.table ?? (msg.metadata as any)?.table_name ?? '-');

    const affectedRows = msg.metadata?.estimatedImpact ?? (msg.metadata as any)?.estimated_impact ?? 0;
    const draft: DraftQuery = {
      id: `draft-${Date.now()}`,
      query,
      timestamp: this.formatTimestamp(),
      sessionId: this.sessionId,
      metadata: {
        targetTable,
        estimatedImpact: String(affectedRows),
        environment: msg.metadata?.database ?? 'TestDB',
      },
    };

    this.aiService.cancelOperation(query, this.sessionId, this.selectedDatabase).subscribe({
      next: () => {
        this.drafts = [draft, ...this.drafts];
        this.saveDrafts();

        const draftMessage: ChatMessage = {
          id: `draft-${Date.now()}`,
          type: 'ai',
          status_text: 'Draft Query',
          status_type: 'info',
          narrative: 'Operasi dibatalkan oleh pengguna. Query disimpan sebagai draft dan belum dieksekusi.',
          metadata: {
            database: msg.metadata?.database ?? 'TestDB',
            table: targetTable,
            row_count: affectedRows,
            timestamp: draft.timestamp,
            query: draft.query,
            estimatedImpact: affectedRows,
          },
          timestamp: draft.timestamp,
          sql: draft.query,
          draftQuery: draft,
        };

        this.messages = this.messages.filter((item) => item.id !== msg.id);
        this.messages = [...this.messages, draftMessage];

        if (msg.messageId) {
          this.aiService.updateMessage({
            messageId: msg.messageId,
            statusType: 'info',
            narrative: draftMessage.narrative,
            sql: msg.sql,
          }).subscribe({
            next: () => console.log('Cancelled message updated in DB'),
            error: (err) => console.error('Failed to update cancelled message:', err)
          });
        }

        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: (error: unknown) => {
        console.error('Cancel operation failed', error);
      },
    });
  }

  editingMessageId: string | null = null;
  inlineEditText = '';

  isEditingMessage(msg: ChatMessage): boolean {
    return this.editingMessageId === msg.id;
  }

  startInlineEdit(msg: ChatMessage): void {
    this.editingMessageId = msg.id;
    this.inlineEditText = msg.sql ?? '';
    this.cdr.detectChanges();
  }

  cancelInlineEdit(): void {
    this.editingMessageId = null;
    this.inlineEditText = '';
    this.cdr.detectChanges();
  }

  saveInlineEdit(msg: ChatMessage): void {
    const newQuery = this.inlineEditText.trim();
    if (!newQuery) return;

    if (msg.countdownInterval) {
      clearInterval(msg.countdownInterval);
      msg.countdownInterval = null;
    }

    const database = this.selectedDatabase;

    this.editingMessageId = null;
    this.inlineEditText = '';

    const newObjectName = this.extractObjectNameFromQuery(newQuery);
    const newQueryType = this.detectQueryTypeFromQuery(newQuery);

    msg.sql = newQuery;
    if (msg.metadata) {
      msg.metadata.query = newQuery;
      msg.metadata.timestamp = this.formatTimestamp();

      if (newObjectName !== '-') {
        msg.metadata.table = newObjectName;
      }

      if (newQueryType !== 'QUERY') {
        msg.metadata.query_type = newQueryType;
      }
    }
    msg.status_text = 'Menjalankan Query...';
    msg.status_type = 'info';
    msg.narrative = 'Query sedang dieksekusi ke database...';
    msg.timestamp = this.formatTimestamp();

    this.messages = [...this.messages];
    this.isLoading = true;
    this.saveMessages();
    this.cdr.detectChanges();
    this.scrollToBottom();

    this.aiService.executeDirectQuery(newQuery, this.sessionId, database).subscribe({
      next: (response: AiResponse) => {
        let parsed: any = response;
        const payload: any = parsed ?? response;

        if (msg.metadata) {
          msg.metadata.row_count = payload.metadata?.row_count ?? 0;
          msg.metadata.query_type = payload.metadata?.query_type ?? newQueryType;
          msg.metadata.table = newObjectName !== '-' ? newObjectName : (payload.metadata?.table ?? msg.metadata.table);
          msg.metadata.estimatedImpact = payload.metadata?.estimated_impact ?? 0;
          msg.metadata.timestamp = this.formatTimestamp();
        }

        msg.status_type = 'approved';
        msg.status_text = payload.status_text ?? 'Query Berhasil Dijalankan';
        msg.narrative = payload.narrative ?? 'Query berhasil dijalankan ke database.';
        msg.timestamp = this.formatTimestamp();

        if (msg.metadata) {
          msg.metadata.row_count = payload.metadata?.row_count ?? 0;
          msg.metadata.query_type = payload.metadata?.query_type ?? newQueryType;
          msg.metadata.table = payload.metadata?.table ?? newObjectName;
          msg.metadata.estimatedImpact = payload.metadata?.estimated_impact ?? 0;
          msg.metadata.timestamp = this.formatTimestamp();
        }

        if (msg.messageId) {
          this.aiService.updateMessage({
            messageId: msg.messageId,
            statusType: msg.status_type,
            narrative: msg.narrative,
            sql: msg.sql,
          }).subscribe({
            next: () => console.log('Edited message updated in DB'),
            error: (err) => console.error('Failed to update edited message:', err)
          });
        }

        const activeSession = this.ChatSession.find(s => s.id === this.sessionId);
        if (activeSession) {
          activeSession.messages = [...this.messages];
        }

        localStorage.setItem('sql-agent-sessions', JSON.stringify(this.ChatSession));
        localStorage.setItem('sql-agent-active-session', this.sessionId);

        this.messages = [...this.messages];
        this.isLoading = false;
        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();

        if (this.schemaPanelOpen) {
          this.refreshSchema();
        }
      },
      error: (error: unknown) => {
        console.error('Direct execute failed:', error);
        const errorMsg = error instanceof Error ? error.message : 'Gagal mengeksekusi query';

        msg.status_type = 'danger';
        msg.status_text = 'Eksekusi Gagal';
        msg.narrative = 'Query gagal dieksekusi: ' + errorMsg;
        msg.timestamp = this.formatTimestamp();

        this.messages = [...this.messages];
        this.isLoading = false;
        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();
      }
    });
  }

  extractObjectNameFromQuery(query: string): string {
    if (!query) return '-';
    const q = query.trim();

    const viewMatch = q.match(/(?:CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?VIEW\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (viewMatch) return viewMatch[1].replace(/[\[\]]/g, '');

    const spMatch = q.match(/(?:CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (spMatch) return spMatch[1].replace(/[\[\]]/g, '');

    const tableMatch = q.match(/CREATE\s+TABLE\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (tableMatch) return tableMatch[1].replace(/[\[\]]/g, '');

    const alterMatch = q.match(/ALTER\s+TABLE\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (alterMatch) return alterMatch[1].replace(/[\[\]]/g, '');

    const execMatch = q.match(/EXEC(?:UTE)?\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (execMatch) return execMatch[1].replace(/[\[\]]/g, '');

    const fromMatch = q.match(/\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+(\[?[a-zA-Z0-9_]+\]?(?:\.[a-zA-Z0-9_]+)?)/i);
    if (fromMatch) return fromMatch[1].replace(/[\[\]]/g, '');

    return '-';
  }

  detectQueryTypeFromQuery(query: string): string {
    const u = (query || '').toUpperCase().trim();
    if (/^CREATE\s+(OR\s+ALTER\s+)?PROCEDURE/.test(u)) return 'CREATE PROCEDURE';
    if (/^ALTER\s+PROCEDURE/.test(u)) return 'ALTER PROCEDURE';
    if (/^DROP\s+PROCEDURE/.test(u)) return 'DROP PROCEDURE';
    if (/^CREATE\s+(OR\s+ALTER\s+)?VIEW/.test(u)) return 'CREATE VIEW';
    if (/^ALTER\s+VIEW/.test(u)) return 'ALTER VIEW';
    if (/^DROP\s+VIEW/.test(u)) return 'DROP VIEW';
    if (/^CREATE\s+TABLE/.test(u)) return 'CREATE TABLE';
    if (/^ALTER\s+TABLE/.test(u)) return 'ALTER TABLE';
    if (/^DROP\s+TABLE/.test(u)) return 'DROP TABLE';
    if (/^DELETE/.test(u)) return 'DELETE';
    if (/^UPDATE/.test(u)) return 'UPDATE';
    if (/^INSERT/.test(u)) return 'INSERT';
    if (/^EXEC/.test(u)) return 'EXEC';
    if (/^SELECT/.test(u)) return 'SELECT';
    return 'QUERY';
  }

  rerunDraft(draft: DraftQuery): void {
    if (!draft.query) return;

    this.isLoading = true;
    this.cdr.detectChanges();

    this.aiService.confirmOperation(
      draft.query,
      this.sessionId,
      undefined,
      this.selectedDatabase).subscribe({
      next: (response: AiResponse) => {

        this.messages = this.messages.filter(
          (item) => item.draftQuery?.id !== draft.id
        );

        const approvedMessage: ChatMessage = {
          id: `rerun-${Date.now()}`,
          type: 'ai',
          status_text: 'Query Dijalankan Ulang',
          status_type: 'approved',
          narrative: 'Query dari draft berhasil dijalankan ulang ke database',
          metadata: {
            database: draft.metadata.environment ?? 'TestDB',
            table: draft.metadata.targetTable ?? '-',
            row_count: Number(draft.metadata.estimatedImpact) ?? 0,
            timestamp: this.formatTimestamp(),
            query: draft.query,
            query_type: 'EXECUTE',
            estimatedImpact: Number(draft.metadata.estimatedImpact) ?? 0,
          },
          sql: draft.query,
          data: response.data ?? [],
          dashboard_url: response.dashboard_url,
          timestamp: this.formatTimestamp(),
        };

        this.messages = [...this.messages, approvedMessage];
        this.drafts = this.drafts.filter((savedDraft) => savedDraft.id !== draft.id);
        this.saveDrafts();

        this.aiService.saveMessageToHistory({
          sessionId: this.sessionId,
          type: 'ai',
          content: approvedMessage.narrative,
          sql: approvedMessage.sql,
          statusType: 'approved',
          metadata: approvedMessage.metadata,
          data: approvedMessage.data,
          database: this.selectedDatabase,
          userId: this.currentUser?.user_id ?? null,   
        }).subscribe({
          next: (res: any) => {
            console.log('Rerun saved. ID:', res?.message_id);
            if (res && res.message_id) {
              approvedMessage.messageId = res.message_id;
            }
          },
          error: (err) => console.error('Failed to save rerun:', err)
        });

        this.isLoading = false;
        this.saveMessages();
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: (error: unknown) => {
        console.error('Rerun draft failed', error);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  copySql(sql: string): void {
    if (!sql) return;

    navigator.clipboard.writeText(sql).then(() => {
      this.toastVisible = true;
      setTimeout(() => {
        this.toastVisible = false;
      }, 1500);
    });
  }

  exportToExcel(data: any[], filename: string) {
    if (!data || data.length === 0) return;
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  exportToCSV(data: any[], filename: string) {
    if (!data || data.length === 0) return;
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportToPDF(data: any[], filename: string) {
    if (!data || data.length === 0) return;
    const doc = new jsPDF('landscape');
    
    const columns = Object.keys(data[0]).map(key => ({
      header: this.formatColumnName(key), 
      dataKey: key
    }));

    autoTable(doc, {
      columns: columns,
      body: data,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      startY: 20,
    });

    doc.text(`Data Export - ${filename}`, 14, 15);
    doc.save(`${filename}.pdf`);
  }

  filteredConversations(): { label: string; items: any[] }[] {
    const term = this.searchQuery.trim().toLowerCase();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    const groups: { label: string; items: any[] }[] = [
      { label: 'Hari Ini', items: [] },
      { label: 'Kemarin', items: [] },
      { label: '7 Hari Terakhir', items: [] },
      { label: '30 Hari Terakhir', items: [] },
    ];

    const sortedSessions = [...this.ChatSession].sort((a, b) => {
      const tsA = Number(a.timestamp) || 0;
      const tsB = Number(b.timestamp) || 0;
      return tsB - tsA;
    });

    sortedSessions.forEach(session => {
      const sessionDate = new Date(session.timestamp);
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate()).getTime();
      const diffDays = Math.floor((today - sessionDay) / oneDayMs);
      
      let groupIndex = -1;

      if (diffDays === 0) groupIndex = 0;      
      else if (diffDays === 1) groupIndex = 1;  
      else if (diffDays <= 7) groupIndex = 2;   
      else if (diffDays <= 30) groupIndex = 3;  

      if (groupIndex === -1) return; 

      const matchesSearch = !term ||
        session.title.toLowerCase().includes(term);

      if (matchesSearch) {
        groups[groupIndex].items.push({
          id: session.id,
          title: session.title,
          preview: this.getSessionPreview(session),
          active: session.id === this.sessionId,
        });
      }
    });

    return groups.filter(g => g.items.length > 0);
  }

  private getSessionPreview(session: ChatSession): string {
    if (session.messages && session.messages.length > 0) {
      const firstUserMsg = session.messages.find(m => m.type === 'user');
      if (firstUserMsg?.text) {
        return firstUserMsg.text.substring(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '');
      }
    }
    return 'Klik untuk membuka';
  }

  scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatStream?.nativeElement) {
        this.chatStream.nativeElement.scrollTop = this.chatStream.nativeElement.scrollHeight;
      }
    });
  }

  startCountdown(msg: ChatMessage): void {
    const finalStatuses = ['approved', 'success', 'danger', 'forbidden'];
    if (finalStatuses.includes(msg.status_type || '')) {
      return;
    }

    if (msg.countdownInterval) {
      clearInterval(msg.countdownInterval);
    }

    msg.expiresIn = msg.expiresIn ?? 300;
    msg.countdownInterval = setInterval(() => {
      const value = (msg.expiresIn ?? 0) - 1;
      msg.expiresIn = value;

      if (value <= 0) {
        clearInterval(msg.countdownInterval!);
        msg.countdownInterval = null;
        msg.status_text = 'Kadaluarsa';
        msg.status_type = 'danger';

        if (msg.messageId) {
          this.aiService.updateMessage({
            messageId: msg.messageId,
            statusType: 'danger',
            narrative: 'Query telah kadaluarsa karena tidak ada konfirmasi.',
            sql: msg.sql,
          }).subscribe({
            next: () => console.log('Expired message updated in DB'),
            error: (err) => console.error('Failed to update expired message:', err)
          });
        }
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  formatCountdown(seconds: number | undefined | null): string {
    const total = Math.max(0, seconds ?? 0);

    if (total <= 0) return 'Kadaluarsa';

    const mins = Math.floor(total / 60);
    const secs = total % 60;

    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  }

  saveDrafts(): void {
    localStorage.setItem('sql-agent-drafts', JSON.stringify(this.drafts));
  }

  loadDrafts(): void {
    try {
      const saved = localStorage.getItem('sql-agent-drafts');
      if (!saved) {
        this.drafts = [];
        return;
      }
      const parsed = JSON.parse(saved) as DraftQuery[];
      this.drafts = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to load drafts', error);
      this.drafts = [];
    }
  }

  openSearchModal(): void { this.searchModalOpen = true; }
  closeSearchModal(): void { this.searchModalOpen = false; }

  isStatusType(
    status: ChatMessage['status_type'] | undefined,
    target: ChatMessage['status_type']
  ): boolean {
    return status === target;
  }

  isConfirmType(status: string | undefined): boolean {
    if (!status) return false;
    const confirmTypes = [
      'destructive',
      'confirm_create_table',
      'confirm_rename_column',
      'confirm_alter_drop_column',
      'confirm_alter_add_column',
      'confirm_alter_foreign_key',
      'confirm_alter_table'
    ];
    return confirmTypes.includes(status);
  }

  isCreationSql(sql: string | undefined | null): boolean {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();
    return (
      upper.startsWith('CREATE PROCEDURE') ||
      upper.startsWith('CREATE OR ALTER PROCEDURE') ||
      upper.startsWith('ALTER PROCEDURE') ||
      upper.startsWith('DROP PROCEDURE') ||
      upper.startsWith('CREATE VIEW') ||
      upper.startsWith('CREATE OR ALTER VIEW') ||
      upper.startsWith('ALTER VIEW') ||
      upper.startsWith('DROP VIEW') ||
      upper.startsWith('BACKUP DATABASE') ||
      upper.startsWith('BACKUP LOG')
    );
  }

  extractQueryFromPayload(payload: unknown): string {
    const seen = new Set<object>();
    const queryKeyNames = ['query', 'sql', 'statement'];

    const findQuery = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return findQuery(JSON.parse(trimmed));
          } catch {
            return trimmed;
          }
        }

        if (/^(?:exec(?:ute)?\s|select\s|insert\s|update\s|delete\s|create\s|alter\s|drop\s|backup\s)/i.test(trimmed)) {
          return trimmed;
        }

        return '';
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const result = findQuery(item);
          if (result) return result;
        }
        return '';
      }

      if (typeof value !== 'object') return '';
      if (seen.has(value)) return '';
      seen.add(value);

      const record = value as Record<string, unknown>;

      for (const key of Object.keys(record)) {
        const keyLower = key.toLowerCase();
        if (queryKeyNames.includes(keyLower)) {
          const candidate = typeof record[key] === 'string' ? record[key].trim() : '';
          if (candidate && /^(?:exec(?:ute)?\s|select\s|insert\s|update\s|delete\s|create\s|alter\s|drop\s|backup\s)/i.test(candidate)) {
            return candidate;
          }
        }

        const found = findQuery(record[key]);
        if (found) return found;
      }

      return '';
    };

    return findQuery(payload);
  }

  getTableName(metadata?: Partial<ChatMetadata> | null, sql?: string): string {
    if (sql) {
      const spMatch = sql.match(/(?:CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
      if (spMatch) return spMatch[1].replace(/[\[\]]/g, '');

      const viewMatch = sql.match(/(?:CREATE|ALTER|DROP)\s+(?:OR\s+ALTER\s+)?VIEW\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
      if (viewMatch) return viewMatch[1].replace(/[\[\]]/g, '');
    }

    const tableFromMetadata = metadata?.table ?? (metadata as any)?.table_name ?? '';
    if (tableFromMetadata && tableFromMetadata !== '-' && tableFromMetadata !== 'sp_rename') {
      return tableFromMetadata;
    }

    if (sql && /sp_rename/i.test(sql)) {
      const renameInfo = this.extractRenameInfoFromQuery(sql);
      return renameInfo.table;
    }

    return this.extractTableNameFromSql(sql ?? '');
  }

  getEstimatedImpact(metadata?: Partial<ChatMetadata> | null): number {
    return metadata?.estimatedImpact ?? (metadata as any)?.estimated_impact ?? 0;
  }

  private extractTableNameFromSql(sql: string): string {
    if (!sql) return '-';

    const normalizedSql = sql.replace(/\[(.*?)\]/g, '$1').replace(/\s+/g, ' ').trim();
    const match = normalizedSql.match(/\b(?:FROM|JOIN|UPDATE|INTO|DELETE)\s+([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\b/i);

    return match?.[1] ?? '-';
  }

  getDataColumns(obj: unknown): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj as Record<string, unknown>).filter(
      (key) => !this.METADATA_FIELDS.includes(key),
    );
  }

  getObjectKeys(obj: unknown): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj as Record<string, unknown>);
  }

  getRowValue(row: unknown, key: string): unknown {
    if (!row || typeof row !== 'object') return undefined;
    return (row as Record<string, unknown>)[key];
  }

  getObjectLabel(sql: string | undefined): string {
    if (!sql) return 'Nama Objek';
    const upper = (sql || '').toUpperCase();

    if (upper.includes('SP_RENAME')) return 'Nama Tabel';
    if (upper.includes('PROCEDURE')) return 'Nama Stored Procedure (SP)';
    if (/^EXEC(UTE)?\s/i.test(upper)) return 'Nama Stored Procedure (SP)';
    if (upper.includes('VIEW')) return 'Nama View';
    if (upper.includes('BACKUP')) return 'Nama Database';

    return 'Nama Tabel';
  }

  isTableDisplay(sql: string | undefined | null): boolean {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();

    if (upper.startsWith('SELECT')) return true;
    if (/^EXEC(UTE)?\s/i.test(upper)) return true;
    if (upper.includes('FROM dbo.v_') || upper.includes('FROM dbo.vw_') || upper.includes('FROM vw_')) return true;

    return false;
  }

  isDataDisplayQuery(sql: string | undefined | null): boolean {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();

    if (upper.startsWith('SELECT')) return true;
    if (/^EXEC(UTE)?\s/i.test(upper)) return true;
    if (upper.includes('FROM dbo.v_') || upper.includes('FROM dbo.vw_') || upper.includes('FROM vw_')) return true;

    return false;
  }

  isSpRenameQuery(sql: string | undefined | null): boolean {
    if (!sql) return false;
    return /sp_rename/i.test(sql);
  }

  isCreateTableQuery(sql: string | undefined | null): boolean {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();
    return upper.startsWith('CREATE TABLE');
  }

  isAlterTableQuery(sql: string | undefined | null): boolean {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();
    return upper.startsWith('ALTER TABLE');
  }

  extractRenameInfoFromQuery(sql: string): { table: string; oldColumn: string; newColumn: string } {
    const result = { table: '-', oldColumn: '-', newColumn: '-' };
    if (!sql) return result;

    const match = sql.match(/sp_rename\s+['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
    if (match) {
      const parts = match[1].split('.');
      if (parts.length >= 3) {
        result.table = parts.slice(0, parts.length - 1).join('.');
        result.oldColumn = parts[parts.length - 1];
      } else if (parts.length === 2) {
        result.table = parts[0];
        result.oldColumn = parts[1];
      }
      result.newColumn = match[2];
    }

    return result;
  }

  extractAlterInfoFromQuery(sql: string): { table: string; column: string; operation: string } {
    const result = { table: '-', column: '-', operation: 'ALTER TABLE' };
    if (!sql) return result;

    const tableMatch = sql.match(/ALTER\s+TABLE\s+(?:\[?dbo\]?\.)?(\[[^\]]+\]|[a-zA-Z0-9_]+)/i);
    if (tableMatch) result.table = tableMatch[1].replace(/[\[\]]/g, '');

    const dropMatch = sql.match(/DROP\s+COLUMN\s+\[?([a-zA-Z0-9_]+)\]?/i);
    if (dropMatch) {
      result.column = dropMatch[1];
      result.operation = 'ALTER TABLE DROP COLUMN';
      return result;
    }

    const addMatch = sql.match(/ADD\s+(?!CONSTRAINT)\[?([a-zA-Z0-9_]+)\]?/i);
    if (addMatch) {
      result.column = addMatch[1];
      result.operation = 'ALTER TABLE ADD COLUMN';
      return result;
    }

    const alterMatch = sql.match(/ALTER\s+COLUMN\s+\[?([a-zA-Z0-9_]+)\]?/i);
    if (alterMatch) {
      result.column = alterMatch[1];
      result.operation = 'ALTER TABLE ALTER COLUMN';
      return result;
    }

    const fkMatch = sql.match(/FOREIGN\s+KEY\s*\(\s*\[?([a-zA-Z0-9_]+)\]?\s*\)/i);
    if (fkMatch) {
      result.column = fkMatch[1];
      result.operation = 'ALTER TABLE FOREIGN KEY';
      return result;
    }

    return result;
  }

  extractColumnDefinitions(sql: string | undefined | null): { name: string; type: string }[] {
    if (!sql) return [];

    const match = sql.match(/\(\s*([\s\S]*?)\s*\)\s*;?\s*$/);
    if (!match) return [];

    const inner = match[1];

    const parseColumnDef = (def: string): { name: string; type: string } => {
      if (/^CONSTRAINT\s/i.test(def)) {
        return { name: '(constraint)', type: def };
      }
      const parts = def.trim().split(/\s+/);
      const name = parts[0] || '-';
      const type = parts.slice(1).join(' ') || '-';
      return { name, type };
    };

    const columns: { name: string; type: string }[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];
      if (char === '(') depth++;
      if (char === ')') depth--;

      if (char === ',' && depth === 0) {
        if (current.trim()) columns.push(parseColumnDef(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) columns.push(parseColumnDef(current.trim()));

    return columns;
  }

  getDisplayColumns(data: unknown[] | undefined): string[] {
    if (!data || !Array.isArray(data) || data.length === 0) return [];

    const firstRow = data[0];
    if (!firstRow || typeof firstRow !== 'object') return [];

    return Object.keys(firstRow as Record<string, unknown>).filter(
      (key) => !this.METADATA_FIELDS.includes(key)
    )
  }

  formatDisplayValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    if (value instanceof Date) return value.toLocaleDateString('id-ID');
    if (typeof value === 'number') return value.toLocaleString('id-ID');
    if (typeof value === 'object') return JSON.stringify(value);

    return String(value);
  }

  formatColumnName(name: string): string {
    if (!name) return '-';

    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    if (value instanceof Date) return value.toLocaleDateString('id-ID');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private focusInput(): void {
    setTimeout(() => {
      this.mainInput?.nativeElement?.focus();
    });
  }

  private formatTimestamp(date: Date = new Date()): string {
    if (!date || isNaN(date.getTime())) {
      date = new Date();
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();

    return `${hours}-${minutes}-${seconds} : ${day}-${month}-${year}`;
  }
}