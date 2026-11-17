import type { CSSProperties } from 'react';

interface CupProps {
  color: string;
  size?: number;
}

/** Pote de gelato desenhado em SVG, na cor do sabor. */
export function Cup({ color, size = 64 }: CupProps) {
  return (
    <svg
      className="cup"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ '--flavor': color } as CSSProperties}
    >
      {/* bola de gelato */}
      <path className="cup__scoop" d="M13 31c0-17 38-17 38 0z" />
      <path className="cup__shine" d="M21 23c3-4 8-6 12-6" />
      {/* pote */}
      <path
        className="cup__body"
        d="M9.5 31h45l-5.2 25.4a2.6 2.6 0 0 1-2.6 2.1H17.3a2.6 2.6 0 0 1-2.6-2.1z"
      />
      {/* faixa com a cor do sabor */}
      <path className="cup__band" d="M12.2 41h39.6l-1.1 5.4H13.3z" />
    </svg>
  );
}
