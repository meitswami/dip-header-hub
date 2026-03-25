import { useState, useEffect, useCallback } from 'react';

export interface OllamaSettings {
  url: string;
  model: string;
}

const STORAGE_KEY = 'dip-ollama-settings';

<<<<<<< HEAD
/** Base URL to use for browser fetch (avoids CORS by using Vite proxy when Ollama is local). */
export function getOllamaFetchBase(url: string): string {
  const u = url.replace(/\/+$/, '');
  if (typeof window === 'undefined') return u;
  if (u === 'http://localhost:11434' || u === 'http://127.0.0.1:11434') return `${window.location.origin}/ollama`;
  return u;
}

=======
>>>>>>> 190780503942b273a628c5916becb363ed820f3a
const DEFAULTS: OllamaSettings = {
  url: 'http://localhost:11434',
  model: 'phi3:mini',
};

function getStored(): OllamaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function useOllamaSettings() {
  const [settings, setSettingsState] = useState<OllamaSettings>(getStored);

  const save = useCallback((next: Partial<OllamaSettings>) => {
    setSettingsState(prev => {
      const merged = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  return { settings, save, defaults: DEFAULTS };
}
