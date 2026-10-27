'use client'

import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'

// Selector de color de /config (COLOR-PICKER restyle, extraído en CIERRE P2b para
// marca, fondo y tarjetas): paleta curada + campo hex; el picker nativo queda
// oculto tras "más colores..." (fallback, no camino primario).

// Luminancia percibida aproximada (sRGB ponderado) para decidir el color del
// check sobre un swatch: fondo claro -> check oscuro, fondo oscuro -> blanco.
function esColorClaro(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

// Valida #RRGGBB (el # inicial es opcional al teclear) y normaliza a
// '#RRGGBB' mayusculas — el formato que persisten color_principal,
// tema_fondo y tema_superficie (y que exigen sus CHECK en la base).
const HEX_6 = /^#?([0-9a-fA-F]{6})$/
export function normalizarHex(v: string): string | null {
  const m = v.trim().match(HEX_6)
  return m ? `#${m[1].toUpperCase()}` : null
}

export interface PresetColor {
  color: string
  nombre: string
}

export default function SelectorColor({ valor, onChange, presets, etiquetaHex, presetBloqueado, avisoOcultos }: {
  /** '#RRGGBB' actual. */
  valor: string
  /** Solo recibe valores válidos y normalizados. */
  onChange: (hex: string) => void
  presets: PresetColor[]
  /** aria-label del campo hex. */
  etiquetaHex: string
  /** Presets que no se ofrecen (p.ej. bloqueo por choque de marca): NO se
   *  renderizan. El valor actual se sigue viendo en el swatch junto al campo hex
   *  aunque esté bloqueado, y el campo hex y el picker nativo no se filtran: ese
   *  caso lo avisa /config con su mensaje y sugerencias. */
  presetBloqueado?: (hex: string) => boolean
  /** Línea discreta bajo la fila cuando se ocultó al menos un preset. */
  avisoOcultos?: string
}) {
  // Borrador del campo hex: null = espejo de `valor`; string = lo que el usuario
  // esta tecleando. Se propaga SOLO cuando valida (#RRGGBB) y se descarta al
  // salir del campo — sin efectos de sincronizacion.
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const inputColorNativoRef = useRef<HTMLInputElement>(null)
  const draftInvalido = hexDraft !== null && normalizarHex(hexDraft) === null

  const visibles = presetBloqueado ? presets.filter(c => !presetBloqueado(c.color)) : presets
  const hayOcultos = visibles.length < presets.length

  return (
    <div>
      {visibles.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          {visibles.map(c => (
            <div key={c.color} onClick={() => { onChange(c.color); setHexDraft(null) }}
              role="button" aria-label={c.nombre} title={c.nombre}
              style={{
                width: '36px', height: '36px', borderRadius: 'var(--radio-boton)', background: c.color, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: esColorClaro(c.color) ? 'var(--text-primary)' : 'white',
                border: esColorClaro(c.color) ? '1px solid var(--border-light)' : 'none',
                boxShadow: valor === c.color ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c.color}` : 'none',
                transition: 'box-shadow 0.15s ease',
              }}>
              {valor === c.color && <Icono icono={Check} size={16} />}
            </div>
          ))}
        </div>
      )}
      {hayOcultos && avisoOcultos && (
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
          {avisoOcultos}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radio-boton)', background: valor, border: '1px solid var(--border-light)', flexShrink: 0 }} />
        <input
          className="input"
          value={hexDraft ?? valor}
          onChange={(e) => {
            const v = e.target.value
            setHexDraft(v)
            const norm = normalizarHex(v)
            if (norm) onChange(norm)
          }}
          onBlur={() => setHexDraft(null)}
          maxLength={7}
          placeholder="#RRGGBB"
          spellCheck={false}
          aria-label={etiquetaHex}
          style={{
            width: '110px',
            borderColor: draftInvalido ? 'var(--color-danger)' : undefined,
          }}
        />
        <Boton variante="terciario" tono="neutro" tamano="sm"
          onClick={() => inputColorNativoRef.current?.click()}
          style={{ padding: '0 8px' }}>
          más colores...
        </Boton>
        <input
          ref={inputColorNativoRef}
          type="color"
          value={valor}
          onChange={(e) => { const norm = normalizarHex(e.target.value); if (norm) onChange(norm); setHexDraft(null) }}
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
      </div>
      {draftInvalido && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>
          Formato: #RRGGBB (6 dígitos hexadecimales)
        </div>
      )}
    </div>
  )
}
