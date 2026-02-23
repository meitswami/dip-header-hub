import { useState, useEffect, useCallback } from 'react';

export interface OllamaSettings {
  url: string;
  model: string;
}

const STORAGE_KEY = 'dip-ollama-settings';

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
