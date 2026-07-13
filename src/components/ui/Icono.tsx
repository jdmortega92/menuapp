import type { CSSProperties } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

// ── Icono — punto UNICO de estilo de iconografia (Fase A UI) ──
// cambiar libreria o trazo SOLO aqui. Todos los consumidores pasan el
// componente lucide por `icono`; este wrapper fija los defaults de casa
// (size 20, trazo 2, currentColor) y marca el SVG como decorativo — el
// aria-label vive en el pressable que lo envuelve, nunca en el icono.
export default function Icono({
  icono: IconoSvg,
  size = 20,
  strokeWidth = 2,
  color = 'currentColor',
  ...rest
}: { icono: LucideIcon } & LucideProps) {
  return <IconoSvg size={size} strokeWidth={strokeWidth} color={color} aria-hidden="true" {...rest} />
}

// Caja estandar de boton-de-icono del admin: 26px visuales (icono 16 +
// padding 5). Combinar con className="tap-target-44" (globals.css) para
// llegar a 44x44 efectivos sin crecer el layout. Objeto module-level:
// identidad estable, seguro dentro de componentes memoizados (BL.13).
export const estiloBotonIcono: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '5px',
  background: 'transparent',
  border: 'none',
  lineHeight: 0,
}
