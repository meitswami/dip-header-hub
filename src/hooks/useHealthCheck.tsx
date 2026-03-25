import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
<<<<<<< HEAD
import { getOllamaFetchBase } from '@/hooks/useOllamaSettings';
=======
>>>>>>> 190780503942b273a628c5916becb363ed820f3a

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

<<<<<<< HEAD
    // Ollama — hit /api/tags (use proxy for local URL to avoid CORS)
=======
    // Ollama — hit /api/tags
>>>>>>> 190780503942b273a628c5916becb363ed820f3a
    const ollamaUrl = (() => {
      try {
        const raw = localStorage.getItem('dip-ollama-settings');
        if (raw) return JSON.parse(raw).url || 'http://localhost:11434';
      } catch {}
      return 'http://localhost:11434';
    })();
<<<<<<< HEAD
    const ollamaFetchBase = getOllamaFetchBase(ollamaUrl);

    const ollamaPromise = fetch(`${ollamaFetchBase}/api/tags`, { signal: AbortSignal.timeout(5000) })
=======

    const ollamaPromise = fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
>>>>>>> 190780503942b273a628c5916becb363ed820f3a
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
