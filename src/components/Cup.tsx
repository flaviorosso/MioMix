import { useId, type CSSProperties } from 'react';

interface CupProps {
  color: string;
  size?: number;
}

// Contorno do pote (mais largo em cima), no estilo da arte "Classico" escolhida para os potes reais.
const BODY = 'M9.5 31h45l-5.2 25.4a2.6 2.6 0 0 1-2.6 2.1H17.3a2.6 2.6 0 0 1-2.6-2.1z';

/**
 * Pote Ciao Ciao "Classico": pote branco com filete duplo abaixo da tampa, logo e faixa fina embaixo
 * (1 cor, preto). A bola de gelato por cima fica na cor do sabor.
 */
export function Cup({ color, size = 64 }: CupProps) {
  const clipId = `cup-clip-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className="cup"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ '--flavor': color } as CSSProperties}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>
      {/* bola de gelato */}
      <path className="cup__scoop" d="M13 31c0-17 38-17 38 0z" />
      <path className="cup__shine" d="M21 23c3-4 8-6 12-6" />
      {/* pote branco */}
      <path className="cup__body" d={BODY} />
      <g clipPath={`url(#${clipId})`}>
        {/* filete duplo logo abaixo da tampa */}
        <rect className="cup__ink" x="8" y="33.6" width="48" height="0.9" />
        <rect className="cup__ink" x="8" y="35.3" width="48" height="0.45" />
        {/* logo */}
        <image href="/brand/logo-ciaociao-black.png" x="24.5" y="37" width="15" height="15" />
        {/* faixa "Gelato artigianale · Schweinfurt" (sugerida por uma linha pontilhada) */}
        <rect className="cup__ink" x="8" y="52.6" width="48" height="0.45" />
        <line className="cup__text" x1="18" y1="54.25" x2="46" y2="54.25" />
        <rect className="cup__ink" x="8" y="55.5" width="48" height="0.45" />
      </g>
      {/* contorno por cima de tudo */}
      <path className="cup__outline" d={BODY} />
    </svg>
  );
}
