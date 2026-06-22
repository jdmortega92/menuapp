'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase-browser'

// Modal de calificación (se apila SOBRE el detalle de plato: stackLevel={1}).
// Estado del formulario (estrellas/tags/comentario/enviada) vive AQUÍ: el
// render condicional del padre monta una instancia fresca por apertura, lo que
// reemplaza el reset manual que antes hacía el botón "Calificar este plato".
// El insert + mutate del aggregate viven aquí; el prepend optimista a las
// reseñas del detalle sale por onResenaCreada.
export default function CalificarModal({
  plato,
  restauranteId,
  restauranteNombre,
  color,
  themeClass,
  onClose,
  onResenaCreada,
}: {
  plato: any
  restauranteId: string
  restauranteNombre: string
  color: string
  themeClass: string
  onClose: () => void
  onResenaCreada: (resena: any) => void
}) {
  const [calEstrellas, setCalEstrellas] = useState(0)
  const [calTags, setCalTags] = useState<string[]>([])
  const [calComentario, setCalComentario] = useState('')
  const [calEnviada, setCalEnviada] = useState(false)

  const tagsDisponibles = [
    { id: 'buena_porcion', label: 'Buena porción' },
    { id: 'buen_sabor', label: 'Buen sabor' },
    { id: 'buena_presentacion', label: 'Buena presentación' },
    { id: 'buen_precio', label: 'Buen precio' },
    { id: 'rapido', label: 'Rápido' },
    { id: 'fresco', label: 'Fresco' },
  ]
  const textoEstrellas = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']

  function toggleTag(id: string) {
    setCalTags(calTags.includes(id) ? calTags.filter(t => t !== id) : [...calTags, id])
  }

  async function enviarCalificacion() {
    if (calEstrellas === 0) return
    const supabase = createClient()

    // Guardar en Supabase y obtener la reseña recién creada
    const { data: nuevaResena } = await supabase
      .from('calificaciones')
      .insert({
        plato_id: plato.id,
        restaurante_id: restauranteId,
        estrellas: calEstrellas,
        tags: calTags,
        comentario: calComentario || null,
      })
      .select()
      .single()

    // Optimistic update: agregar la nueva reseña al estado local inmediatamente
    // Así el usuario la ve al cerrar el modal de calificar, sin recargar el plato
    if (nuevaResena) {
      onResenaCreada(nuevaResena)
    }

    mutate(['calificaciones-aggregate', restauranteId])

    setCalEnviada(true)
    setTimeout(() => { onClose() }, 2000)
  }

  // ===== Estado 2: Confirmación de envío =====
  if (calEnviada) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        maxWidth={440}
        showClose={false}
        themeClass={themeClass}
        stackLevel={1}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
          <div style={{
            fontSize: '18px',
            fontWeight: 'var(--theme-title-weight)' as any,
            fontFamily: 'var(--theme-font-display)',
            letterSpacing: 'var(--theme-title-letter-spacing)',
            textTransform: 'var(--theme-title-transform)' as any,
            color: 'var(--theme-text)',
            marginBottom: '6px',
          }}>
            ¡Gracias!
          </div>
          <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>Tu calificación ayuda a otros comensales</div>
        </div>
      </Modal>
    )
  }

  // ===== Estado 1: Formulario =====
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Calificar plato"
      maxWidth={500}
      themeClass={themeClass}
      stackLevel={1}
    >
      {/* Plato que va a calificar */}
      <div style={{ background: 'var(--theme-surface-muted)', border: '1px solid var(--theme-border)', borderRadius: 'var(--theme-radius-card)', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color, flexShrink: 0, overflow: 'hidden' }}>
          {plato.foto_url ? (
            <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : plato.nombre.charAt(0)}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>{plato.nombre}</div>
          <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>{restauranteNombre}</div>
        </div>
      </div>

      {/* Estrellas */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>¿Qué te pareció?</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} onClick={() => setCalEstrellas(n)} style={{
              fontSize: '36px', cursor: 'pointer',
              color: n <= calEstrellas ? '#F2A623' : 'var(--theme-border-strong)',
              transition: 'transform 0.15s',
              transform: n <= calEstrellas ? 'scale(1.1)' : 'scale(1)',
            }}>★</span>
          ))}
        </div>
        {calEstrellas > 0 && <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>{textoEstrellas[calEstrellas]}</div>}
      </div>

      {/* Tags rápidos */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>¿Qué destacas? (opcional)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {tagsDisponibles.map(tag => (
            <div key={tag.id} onClick={() => toggleTag(tag.id)} style={{
              padding: '8px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              background: calTags.includes(tag.id) ? 'var(--theme-text)' : 'var(--theme-surface)',
              color: calTags.includes(tag.id) ? 'var(--theme-surface)' : 'var(--theme-text-muted)',
              border: calTags.includes(tag.id) ? '1px solid var(--theme-text)' : '1px solid var(--theme-border)',
              transition: 'all 0.15s',
            }}>{tag.label}</div>
          ))}
        </div>
      </div>

      {/* Comentario */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Comentario (opcional)</div>
        <div style={{ position: 'relative' }}>
          <textarea value={calComentario} onChange={(e) => { if (e.target.value.length <= 200) setCalComentario(e.target.value) }}
            placeholder="Cuéntanos más sobre tu experiencia..."
            style={{
              width: '100%', padding: '12px', border: '1px solid var(--theme-border)', borderRadius: 'var(--theme-radius-image)',
              fontSize: '13px', fontFamily: 'var(--theme-font-body)', outline: 'none', resize: 'none', minHeight: '80px',
              background: 'var(--theme-surface)', color: 'var(--theme-text)',
            }} />
          <span style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', color: calComentario.length > 180 ? 'var(--color-warning)' : 'var(--theme-text-subtle)' }}>
            {calComentario.length}/200
          </span>
        </div>
      </div>

      {/* Enviar */}
      <div onClick={enviarCalificacion} style={{
        background: calEstrellas > 0 ? 'var(--theme-text)' : 'var(--theme-border)',
        color: calEstrellas > 0 ? 'var(--theme-surface)' : 'var(--theme-text-subtle)',
        borderRadius: 'var(--theme-radius-button)', padding: '16px', textAlign: 'center',
        fontSize: '15px', fontWeight: 500, cursor: calEstrellas > 0 ? 'pointer' : 'default',
        marginBottom: '12px',
      }}>
        Enviar calificación
      </div>

      <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--theme-text-subtle)' }}>
        Tu reseña es anónima y ayuda a otros comensales
      </div>
    </Modal>
  )
}
