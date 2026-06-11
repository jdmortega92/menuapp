'use client'

import type { MutableRefObject } from 'react'
import CampoTexto from '@/components/ui/CampoTexto'

// Arma una frase de vinculaciones a partir de cláusulas con count > 0, con
// singular/plural por sustantivo y unión española natural (a; a y b; a, b y c).
// Devuelve null si no hay ninguna cláusula con count > 0. Compartido por el modal
// de borrado de variante y el de borrado de plato (en /menu) y por las notas de
// fila _pendingDelete de este editor.
export function construirTextoVinculaciones(clausulas: { n: number; sing: string; plur: string }[]): string | null {
  const partes = clausulas
    .filter(c => c.n > 0)
    .map(c => `${c.n} ${c.n === 1 ? c.sing : c.plur}`)
  if (partes.length === 0) return null
  return partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

// ── VarianteEditor — filas de variantes compartidas entre crear y editar plato ──
// Presentacional + event-up: el DUEÑO (la página, por ahora) conserva el estado.
// Los commits de tecleo (CampoTexto) suben por onFieldCommit para pasar por el
// espejo en ref del dueño (lectura sincrónica al guardar); las operaciones de
// click (agregar/quitar/reordenar/marcar/deshacer) suben el array completo por
// onRowsChange (setState plano, nunca compiten con un guardado en el mismo tick).
// allowPendingDelete: false = modo crear (✕ quita directo); true = modo editar
// (✕ en filas persistidas marca _pendingDelete — visible, tachada, con Deshacer;
// las frescas se quitan directo). La validación (mínimo 2 sobrevivientes, campos
// por fila) vive en validarPlato del dueño; aquí solo se PINTAN los errores.
// Layout de dos líneas por fila (BL.40): línea 1 inputs, línea 2 botones.
export type VarianteRow = {
  id?: string
  nombre: string
  precio: string
  _pendingDelete?: boolean
}

// Datos para las notas de fila marcada (modo editar): referencias en memoria a
// combos/promos y si la variante es el plato del día / ganador actual.
type PendingMeta = {
  combos: any[]
  promos: any[]
  diaVarianteId: string | null
  ganadorVarianteId: string | null
}

export default function VarianteEditor({
  variantes,
  intento,
  errores,
  onFieldCommit,
  onRowsChange,
  flushRegistry,
  allowPendingDelete,
  pendingMeta,
}: {
  variantes: VarianteRow[]
  intento: boolean
  errores: Record<string, string>
  onFieldCommit: (i: number, patch: Partial<{ nombre: string; precio: string }>) => void
  onRowsChange: (rows: VarianteRow[]) => void
  flushRegistry: MutableRefObject<Set<() => void>>
  allowPendingDelete: boolean
  pendingMeta?: PendingMeta
}) {
  function moverFila(i: number, offset: -1 | 1) {
    const nuevas = [...variantes]
    ;[nuevas[i], nuevas[i + offset]] = [nuevas[i + offset], nuevas[i]]
    onRowsChange(nuevas)
  }

  function quitarFila(i: number) {
    const v = variantes[i]
    if (allowPendingDelete && v.id) {
      // Persistida → marcar para quitar (sigue visible, tachada).
      onRowsChange(variantes.map((x, idx) => idx === i ? { ...x, _pendingDelete: true } : x))
    } else {
      // Fresca (sin id, nunca guardada) → quitar directo.
      onRowsChange(variantes.filter((_, idx) => idx !== i))
    }
  }

  return (
    <div style={{ marginBottom: '10px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
        Variantes
      </div>

      {variantes.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Aún no agregaste variantes
        </div>
      )}

      {variantes.map((v, i) => {
        const pending = !!v._pendingDelete
        const esUltima = i === variantes.length - 1
        // Referencias en memoria (solo se muestran si la fila está marcada).
        const combosRef = pending && v.id && pendingMeta ? pendingMeta.combos.filter(c => (c.combo_platos || []).some((cp: any) => cp.variante_id === v.id)).length : 0
        const promosRef = pending && v.id && pendingMeta ? pendingMeta.promos.filter(p => p.activo && (p.promoPlatos || []).some((pp: any) => pp.variante_id === v.id)).length : 0
        const esDiaVar = pending && !!v.id && pendingMeta?.diaVarianteId === v.id
        const esGanadorVar = pending && !!v.id && pendingMeta?.ganadorVarianteId === v.id
        const textoRefs = pending
          ? construirTextoVinculaciones([
              { n: combosRef, sing: 'combo', plur: 'combos' },
              { n: promosRef, sing: 'promo', plur: 'promos' },
            ])
          : null
        return (
        <div key={v.id ?? `new-${i}`} style={{
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: esUltima ? 'none' : '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', opacity: pending ? 0.55 : 1 }}>
          <CampoTexto
            type="text"
            placeholder="Ej: Pequeña"
            value={v.nombre}
            maxLength={30}
            disabled={pending}
            onCommit={(val) => onFieldCommit(i, { nombre: val })}
            flushRegistry={flushRegistry}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 8px',
              border: `1px solid ${intento && errores[`variante_${i}_nombre`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
              borderRadius: '4px',
              fontSize: '13px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              textDecoration: pending ? 'line-through' : 'none',
            }}
          />

          <CampoTexto
            type="number"
            inputMode="numeric"
            placeholder="$0"
            value={v.precio}
            disabled={pending}
            onCommit={(val) => onFieldCommit(i, { precio: val })}
            flushRegistry={flushRegistry}
            style={{
              width: '90px',
              padding: '6px 8px',
              border: `1px solid ${intento && errores[`variante_${i}_precio`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
              borderRadius: '4px',
              fontSize: '13px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              textDecoration: pending ? 'line-through' : 'none',
            }}
          />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
          <button
            type="button"
            disabled={pending || i === 0}
            onClick={() => {
              if (pending || i === 0) return
              moverFila(i, -1)
            }}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              cursor: (pending || i === 0) ? 'not-allowed' : 'pointer',
              opacity: (pending || i === 0) ? 0.4 : 1,
              fontSize: '11px',
              color: 'var(--text-primary)',
            }}
            aria-label="Mover arriba"
          >
            ▲
          </button>

          <button
            type="button"
            disabled={pending || esUltima}
            onClick={() => {
              if (pending || esUltima) return
              moverFila(i, 1)
            }}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              cursor: (pending || esUltima) ? 'not-allowed' : 'pointer',
              opacity: (pending || esUltima) ? 0.4 : 1,
              fontSize: '11px',
              color: 'var(--text-primary)',
            }}
            aria-label="Mover abajo"
          >
            ▼
          </button>

          {!pending && (
            <button
              type="button"
              onClick={() => quitarFila(i)}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid var(--color-danger)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--color-danger)',
                fontSize: '12px',
              }}
              aria-label="Eliminar variante"
            >
              ✕
            </button>
          )}
          </div>
          {intento && (errores[`variante_${i}_nombre`] || errores[`variante_${i}_precio`]) && (
            <div style={{ marginTop: '3px', marginLeft: '2px', fontSize: '11px', color: 'var(--color-danger)' }}>
              {errores[`variante_${i}_nombre`] && <div>{errores[`variante_${i}_nombre`]}</div>}
              {errores[`variante_${i}_precio`] && <div>{errores[`variante_${i}_precio`]}</div>}
            </div>
          )}
          {pending && (
            <div style={{ marginTop: '3px', marginLeft: '2px' }}>
              {esDiaVar && (
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 500 }}>
                  Es tu Plato del Día actual — se quitará al guardar.
                </div>
              )}
              {esGanadorVar && (
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', fontWeight: 500 }}>
                  Es tu Plato Ganador actual — se quitará al guardar.
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    onRowsChange(variantes.map((x, idx) => idx === i ? { ...x, _pendingDelete: false } : x))
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid var(--color-danger)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--color-danger)',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  aria-label="Deshacer quitar variante"
                >
                  ↩ Deshacer
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Se quitará al guardar.{textoRefs ? ` Está en ${textoRefs}.` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
        )
      })}

      <button
        type="button"
        onClick={() => {
          onRowsChange([...variantes, { nombre: '', precio: '' }])
        }}
        style={{
          marginTop: '4px',
          padding: '6px 12px',
          background: 'transparent',
          border: '1px dashed var(--border-light)',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px',
          color: 'var(--text-primary)',
          width: '100%',
        }}
      >
        + Agregar variante
      </button>

      {intento && errores.variantes && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-danger)' }}>
          {errores.variantes}
        </div>
      )}
    </div>
  )
}
