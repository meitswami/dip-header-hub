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
};
