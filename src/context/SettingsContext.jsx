import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, initApi } from '../lib/api';
import { useToast } from './ToastContext';

const SettingsContext = createContext(null);

function deepMerge(base, patch) {
  if (Array.isArray(patch) || Array.isArray(base)) return patch ?? base;
  if (typeof base !== 'object' || base === null) return patch ?? base;
  if (typeof patch !== 'object' || patch === null) return base;
  const out = { ...base };
  for (const key of Object.keys(patch)) out[key] = deepMerge(base[key], patch[key]);
  return out;
}

export function SettingsProvider({ children }) {
  const { toast } = useToast();
  const [info, setInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [systemDark, setSystemDark] = useState(true);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [appInfo, initialSettings] = await Promise.all([api.getInfo(), api.getSettings()]);
        if (cancelled) return;
        initApi(appInfo);
        setInfo(appInfo);
        setSettings(initialSettings);
        setSystemDark(!!appInfo.systemDark);
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!window.mntx) return undefined;
    return api.onSystemTheme(({ dark }) => setSystemDark(!!dark));
  }, []);

  const updateSettings = useCallback(
    async (patch) => {
      setSettings((prev) => (prev ? deepMerge(prev, patch) : prev));
      try {
        const next = await api.setSettings(patch);
        if (next) setSettings(next);
        return next;
      } catch (err) {
        toast(`Gagal menyimpan pengaturan: ${err.message}`, 'error');
        return null;
      }
    },
    [toast]
  );

  const value = useMemo(
    () => ({ info, settings, ready, error, systemDark, updateSettings }),
    [info, settings, ready, error, systemDark, updateSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings harus dipakai di dalam SettingsProvider');
  return ctx;
}
