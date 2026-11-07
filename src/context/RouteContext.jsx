import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouteContext = createContext(null);

function parseHash(rawHash) {
  let raw = String(rawHash || '').replace(/^#/, '').trim();
  if (!raw) raw = '/home';
  if (!raw.startsWith('/')) raw = '/' + raw;
  const questionIndex = raw.indexOf('?');
  const pathPart = questionIndex >= 0 ? raw.slice(0, questionIndex) : raw;
  const queryPart = questionIndex >= 0 ? raw.slice(questionIndex + 1) : '';
  let segments = [];
  try {
    segments = pathPart
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
  } catch {
    segments = pathPart.split('/').filter(Boolean);
  }
  return {
    raw,
    path: '/' + segments.join('/'),
    segments,
    view: segments[0] || 'home',
    id: segments[1] || null,
    query: new URLSearchParams(queryPart),
  };
}

export function RouteProvider({ children }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.replace('#/home');
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((path, { replace = false } = {}) => {
    const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
    if (replace) {
      window.location.replace(target);
    } else if (window.location.hash !== target) {
      window.location.hash = target;
    }
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
  }, []);

  const value = useMemo(() => ({ route, navigate, back }), [route, navigate, back]);
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute harus dipakai di dalam RouteProvider');
  return ctx;
}
