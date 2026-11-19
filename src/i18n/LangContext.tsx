import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Idioma escolhido, lembrado no navegador. Cada área (cliente, staff) tem sua própria
 * chave e lista de idiomas; na primeira visita usa o idioma do aparelho, se houver.
 */
interface LangState<L extends string> {
  lang: L;
  setLang: (lang: L) => void;
}

const LangContext = createContext<LangState<string> | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function detect<L extends string>(supported: readonly L[], fallback: L, storageKey: string): L {
  const stored = readStored(storageKey);
  if (stored && (supported as readonly string[]).includes(stored)) return stored as L;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.slice(0, 2).toLowerCase();
    if ((supported as readonly string[]).includes(base)) return base as L;
  }
  return fallback;
}

export function LangProvider<L extends string>({
  supported,
  fallback,
  storageKey,
  children,
}: {
  supported: readonly L[];
  fallback: L;
  storageKey: string;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<L>(() => detect(supported, fallback, storageKey));

  const setLang = useCallback(
    (next: L) => {
      setLangState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* navegação privada: só não lembra a escolha */
      }
    },
    [storageKey],
  );

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]) as unknown as LangState<string>;
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLangState<L extends string>(): LangState<L> {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('LangProvider fehlt');
  return ctx as unknown as LangState<L>;
}
