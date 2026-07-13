'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useFacturas } from '@/hooks/data/useFacturas'
import { formatoPrecio } from '@/lib/precio'
import type { Factura } from '@/types'

// Etiqueta y color por estado de factura (tabla facturas, F4.a-1).
const ESTADOS: Record<Factura['estado'], { label: string; color: string; bg: string }> = {
  pendiente: { label: 'Pendiente', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  aprobada: { label: 'Pagada', color: 'var(--color-green)', bg: 'var(--color-green-light)' },
  rechazada: { label: 'Rechazada', color: 'var(--color-danger)', bg: 'transparent' },
  anulada: { label: 'Anulada', color: 'var(--text-tertiary)', bg: 'transparent' },
}

// Nombre de mes para el periodo facturado (periodo_mes 1-12 de la tabla).
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FacturasPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando } = useAuth()
  const { data: facturas, isLoading: facturasCargando } = useFacturas(rest?.id)

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  if (cargando || (rest?.id && facturasCargando)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  if (!usuario) return null

  const lista = facturas ?? []

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Mis facturas</span>
        </div>

        {/* Lista de facturas */}
        <div style={{ padding: '0 20px' }}>
          {lista.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Aún no tienes pagos registrados</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Cuando pagues un plan, tus facturas aparecerán aquí.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historial</div>
              {lista.map((factura) => {
                const estado = ESTADOS[factura.estado] ?? ESTADOS.pendiente
                const periodoLabel = `${MESES[factura.periodo_mes - 1] ?? factura.periodo_mes} ${factura.periodo_ano}`
                return (
                  <div key={factura.id} className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{periodoLabel}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>#{factura.numero} · {factura.metodo_pago}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>${formatoPrecio(factura.monto)}</div>
                        <div style={{ fontSize: '10px', color: estado.color, marginTop: '2px' }}>{estado.label}</div>
                      </div>
                    </div>
                    <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-light)', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      {factura.estado === 'aprobada' && factura.fecha_pago
                        ? `Pagada el ${fechaCorta(factura.fecha_pago)}`
                        : `Creada el ${fechaCorta(factura.created_at)}`}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
