import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ServiceStatus = 'ok' | 'error' | 'checking';

export interface HealthState {
  database: ServiceStatus;
  ollama: ServiceStatus;
  storage: ServiceStatus;
}

export function useHealthCheck(intervalMs = 60_000) {
  const [health, setHealth] = useState<HealthState>({
    database: 'checking',
    ollama: 'checking',
    storage: 'checking',
  });

  const check = useCallback(async () => {
    // Database — simple query
    const dbPromise = (async (): Promise<ServiceStatus> => {
      try {
        const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        return error ? 'error' : 'ok';
      } catch { return 'error'; }
    })();

    // Ollama — hit /api/tags
    const ollamaUrl = (() => {
      try {
        const raw = localStorage.getItem('dip-ollama-settings');
        if (raw) return JSON.parse(raw).url || 'http://localhost:11434';
      } catch {}
      return 'http://localhost:11434';
    })();

    const ollamaPromise = fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
      .then(r => (r.ok ? 'ok' : 'error') as ServiceStatus)
      .catch(() => 'error' as ServiceStatus);

    // Storage — list buckets
    const storagePromise = (async (): Promise<ServiceStatus> => {
      try {
        const { error } = await supabase.storage.listBuckets();
        return error ? 'error' : 'ok';
      } catch { return 'error'; }
    })();

    const [database, ollama, storage] = await Promise.all([dbPromise, ollamaPromise, storagePromise]);
    setHealth({ database, ollama, storage });
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { health, recheck: check };
}
