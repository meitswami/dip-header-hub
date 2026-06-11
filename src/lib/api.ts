/**
 * DIP backend API client. No Supabase.
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  const { params, ...init } = options;
  const url = params ? `${API_BASE}${path}?${new URLSearchParams(params)}` : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || 'Request failed');
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : ({} as T);
}

export const api = {
  getCases: () => request<{ id: string; title: string; fir_number?: string; sections?: string; status?: string; case_date?: string }[]>(`/cases`),

  getCase: (id: string) => request<{ id: string; title: string; fir_number?: string; sections?: string; status?: string; complainant?: string; accused?: string; description?: string; case_date?: string; created_at?: string }>(`/cases/${id}`),

  getCaseSummary: (id: string) => request<{ id: string; title: string; summary: string }>(`/cases/${id}/summary`),

  getCaseStats: (id: string) => request<{ cdr_count: number; ipdr_count: number; tower_count: number; sdr_count: number }>(`/cases/${id}/stats`),

  getCaseCdr: (caseId: string, limit = 1000) =>
    request<any[]>(`/cases/${caseId}/cdr`, { params: { limit: String(limit) } }),

  getSummaryStats: (caseId: string) =>
    request<{ total_cdr_records?: number; total_unique_numbers?: number; total_calls?: number; night_call_percentage?: number; total_ipdr_records?: number; total_tower_records?: number }>(`/cases/${caseId}/summary_stats`),

  getCommonNumbers: (caseId: string, minFiles: number) =>
    request<{ total_files: number; results: { number: string; fileCount: number; fileNames: string[]; totalCalls: number }[] }>(
      `/cases/${caseId}/common_numbers`,
      { params: { min_files: String(minFiles) } }
    ),

  deleteAlias: (aliasId: string) => request<{ ok: boolean }>(`/aliases/${aliasId}`, { method: 'DELETE' }),

  createCase: (body: { title: string; fir_number?: string; sections?: string; status?: string; complainant?: string; accused?: string; description?: string; case_date?: string }) =>
    request<{ id: string; title: string }>(`/cases`, { method: 'POST', body: JSON.stringify(body) }),

  getAliases: (caseId: string) =>
    request<{ phone_number: string; alias_name: string }[]>(`/cases/${caseId}/aliases`),

  createOrUpdateAlias: (caseId: string, phone_number: string, alias_name: string) =>
    request<{ id: string }>(`/aliases`, {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, phone_number, alias_name }),
    }),

  getPersonProfiles: (caseId: string) =>
    request<{ id: string; name: string; phone_numbers: string[] }[]>(`/cases/${caseId}/person_profiles`),

  createPerson: (caseId: string, name: string, phone_numbers?: string[]) =>
    request<{ id: string; name: string; phone_numbers: string[] }>(`/person_profiles`, {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, name, phone_numbers: phone_numbers || [] }),
    }),

  updatePersonPhones: (profileId: string, phone_numbers: string[]) =>
    request<{ id: string }>(`/person_profiles/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone_numbers }),
    }),

  upload: async (
    caseId: string,
    dataType: string,
    file: File,
    opts?: {
      period_from?: string;
      period_to?: string;
      notes?: string;
      phone_number?: string;
      alias_name?: string;
      uploaded_by?: string;
    }
  ) => {
    const form = new FormData();
    form.append('case_id', caseId);
    form.append('data_type', dataType);
    form.append('file', file);
    if (opts?.period_from) form.append('period_from', opts.period_from);
    if (opts?.period_to) form.append('period_to', opts.period_to);
    if (opts?.notes) form.append('notes', opts.notes);
    if (opts?.phone_number) form.append('phone_number', opts.phone_number);
    if (opts?.alias_name) form.append('alias_name', opts.alias_name);
    if (opts?.uploaded_by) form.append('uploaded_by', opts.uploaded_by);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as { detail?: string }).detail || 'Upload failed');
    }
    return res.json() as Promise<{ status: string; inserted?: number; evidence_log_id?: string }>;
  },

  chat: (payload: { caseId: string; messages: { role: string; content: string }[]; styleLevel?: string }) =>
    request<{ content: string }>(`/chat`, { method: 'POST', body: JSON.stringify(payload) }),

  getCdrSample: (caseId: string, number: string) =>
    request<{ calling_number: string; called_number: string; call_date: string | null; call_type: string | null; duration: number | null; file_id?: string; raw_data?: Record<string, any> }[]>(
      `/cases/${caseId}/cdr_sample`,
      { params: { number } }
    ),

  getNumbersSearch: (caseId: string, q: string) =>
    request<{ number: string; count: number }[]>(`/cases/${caseId}/numbers`, { params: { q } }),

  getChatLogs: (caseId: string, limit?: number) =>
    request<{ content: string; role: string; created_at: string | null }[]>(
      `/cases/${caseId}/chat_logs`,
      limit != null ? { params: { limit: String(limit) } } : {}
    ),

  // -----------------------------------------------------------------------
  // Knowledge Base (universal document understanding + RAG)
  // -----------------------------------------------------------------------

  kbStatus: () =>
    request<{
      embedding: { loaded: boolean; model: string; dim: number; error: string | null };
      chat_model_fast: string;
      chat_model_accurate: string;
      ollama_url: string;
    }>(`/kb/status`),

  kbFiles: (caseId?: string | null, includeGlobal = true) =>
    request<KbDocument[]>(`/kb/files`, {
      params: {
        ...(caseId ? { case_id: caseId } : {}),
        include_global: String(includeGlobal),
      },
    }),

  kbDelete: (docId: string) =>
    request<{ ok: boolean }>(`/kb/files/${docId}`, { method: 'DELETE' }),

  kbUpload: async (
    file: File,
    opts?: {
      caseId?: string | null;
      category?: string;
      tags?: string[];
      title?: string;
      uploadedBy?: string;
    }
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.caseId) form.append('case_id', opts.caseId);
    if (opts?.category) form.append('category', opts.category);
    if (opts?.tags?.length) form.append('tags', opts.tags.join(','));
    if (opts?.title) form.append('title', opts.title);
    if (opts?.uploadedBy) form.append('uploaded_by', opts.uploadedBy);
    const res = await fetch(`${API_BASE}/kb/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as { detail?: string }).detail || 'Upload failed');
    }
    return res.json() as Promise<KbDocument>;
  },

  kbQuery: (payload: {
    question: string;
    case_id?: string | null;
    document_ids?: string[];
    include_global?: boolean;
    tier?: 'fast' | 'accurate';
    style_level?: 'simple' | 'intermediate' | 'expert';
  }) =>
    request<{ content: string; citations: KbCitation[] }>(`/kb/query`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  kbSearch: (payload: {
    question: string;
    case_id?: string | null;
    document_ids?: string[];
    include_global?: boolean;
  }) =>
    request<{
      citations: KbCitation[];
      structured_fact: string | null;
      entities_in_question: Record<string, string[]>;
      context_block: string;
    }>(`/kb/search`, { method: 'POST', body: JSON.stringify(payload) }),

  explainTerm: (term: string, caseId?: string | null) =>
    request<ExplainResult>(`/explain`, {
      params: { term, ...(caseId ? { case_id: caseId } : {}) },
    }),

  // -----------------------------------------------------------------------
  // Live MySQL connector (admin feature)
  // -----------------------------------------------------------------------

  mysqlList: () => request<MysqlConnection[]>(`/mysql/connections`),

  mysqlCreate: (body: MysqlConnectionInput) =>
    request<MysqlConnection>(`/mysql/connections`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  mysqlUpdate: (id: string, body: MysqlConnectionInput) =>
    request<MysqlConnection>(`/mysql/connections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  mysqlDelete: (id: string) =>
    request<{ ok: boolean }>(`/mysql/connections/${id}`, { method: 'DELETE' }),

  mysqlTest: (id: string) =>
    request<{ ok: boolean; server_version?: string; error?: string }>(
      `/mysql/connections/${id}/test`,
      { method: 'POST' }
    ),

  mysqlSchema: (id: string) =>
    request<MysqlSchema>(`/mysql/connections/${id}/schema`),

  mysqlSample: (id: string, table: string, limit = 50) =>
    request<MysqlResult>(
      `/mysql/connections/${id}/tables/${encodeURIComponent(table)}/sample`,
      { params: { limit: String(limit) } }
    ),

  mysqlQuery: (id: string, sql: string, maxRows = 500) =>
    request<MysqlResult>(`/mysql/connections/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ sql, max_rows: maxRows }),
    }),
};

export interface MysqlConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl_enabled: boolean;
  notes: string | null;
  created_at: string | null;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

export interface MysqlConnectionInput {
  name: string;
  host: string;
  port?: number;
  database: string;
  username: string;
  password?: string;
  ssl_enabled?: boolean;
  notes?: string;
}

export interface MysqlSchema {
  database: string;
  tables: {
    name: string;
    estimated_rows: number;
    columns: { name: string; type: string; nullable: boolean; key: string }[];
  }[];
}

export interface MysqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  count: number;
  truncated?: boolean;
  table?: string;
}

export interface ExplainResult {
  term: string;
  matched: boolean;
  key?: string;
  category?: string;
  short?: string;
  short_hi?: string;
  detail?: string;
  detail_hi?: string;
  aliases?: string[];
  examples?: string[];
  abbreviation?: string;
  message?: string;
}

// -----------------------------------------------------------------------
// Streaming chat (SSE) — `onMeta` fires once with citations; `onDelta` fires
// for each token; `onDone` fires at the end. Returns an AbortController so
// the UI can cancel.
// -----------------------------------------------------------------------

export interface KbCitation {
  index: number;
  document_id: string;
  chunk_id: string;
  file_name: string | null;
  title: string | null;
  source_type: string | null;
  locator: string;
  score: number;
  preview: string;
}

export interface KbDocument {
  id: string;
  case_id: string | null;
  file_name: string;
  title: string | null;
  category: string | null;
  source_type: string | null;
  status: 'processing' | 'completed' | 'error';
  error_message: string | null;
  chunk_count: number;
  language: string | null;
  tags: string[];
  file_size: number | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string | null;
}

export interface ChatStreamPayload {
  caseId: string;
  messages: { role: string; content: string }[];
  styleLevel?: 'simple' | 'intermediate' | 'expert';
  tier?: 'fast' | 'accurate';
  document_ids?: string[];
}

export function streamChat(
  payload: ChatStreamPayload,
  handlers: {
    onMeta?: (meta: { citations: KbCitation[]; structured_fact: string | null; entities_in_question: Record<string, string[]> }) => void;
    onDelta?: (delta: string) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  }
): AbortController {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 2);
          if (!frame.startsWith('data: ')) continue;
          const json = frame.slice(6).trim();
          if (!json) continue;
          try {
            const parsed = JSON.parse(json);
            if (parsed.type === 'meta') handlers.onMeta?.(parsed);
            else if (parsed.type === 'delta') handlers.onDelta?.(parsed.content || '');
            else if (parsed.type === 'done') handlers.onDone?.();
          } catch {
            // ignore malformed frames
          }
        }
      }
      handlers.onDone?.();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err as Error);
    }
  })();
  return controller;
}
