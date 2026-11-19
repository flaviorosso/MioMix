/** Logo Ciao Ciao – Gelato classico dal 1985 (provisório: recortado da prova da gráfica). */
export function BrandLogo({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src="/brand/logo-ciaociao-black.png"
      alt="Ciao Ciao – Gelato classico dal 1985"
      width={size}
      height={size}
      decoding="async"
    />
  );
}
