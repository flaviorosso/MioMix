import type { ReactNode } from 'react';

/** Bandeiras em SVG (emojis de bandeira não aparecem no Windows). */
export const FLAGS: Record<string, ReactNode> = {
  de: (
    <svg viewBox="0 0 5 3" aria-hidden="true">
      <rect width="5" height="1" y="0" fill="#000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  ),
  pt: (
    <svg viewBox="0 0 20 14" aria-hidden="true">
      <rect width="20" height="14" fill="#009C3B" />
      <path d="M10 1.6 18.2 7 10 12.4 1.8 7Z" fill="#FFDF00" />
      <circle cx="10" cy="7" r="3.1" fill="#002776" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="flag-uk">
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <g clipPath="url(#flag-uk)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#C8102E" strokeWidth="2.4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  ),
};

/** Seletor de idioma: botões com bandeira e código (DE · PT · EN). */
export function LangSwitcher<L extends string>({
  langs,
  value,
  onChange,
  label,
}: {
  langs: readonly L[];
  value: L;
  onChange: (lang: L) => void;
  label: string;
}) {
  return (
    <div className="lang-switch" role="group" aria-label={label}>
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-switch__btn${l === value ? ' is-active' : ''}`}
          aria-pressed={l === value}
          lang={l === 'pt' ? 'pt-BR' : l}
          onClick={() => onChange(l)}
        >
          <span className="lang-switch__flag">{FLAGS[l]}</span>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
