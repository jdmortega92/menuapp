'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FacturasPage() {
  const router = useRouter()
  const [mostrarFiltro, setMostrarFiltro] = useState(false)
  const [mesSeleccionado, setMesSeleccionado] = useState<number | null>(null)
  const [anoSeleccionado, setAnoSeleccionado] = useState(2026)

  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const mesesCompletos = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  const facturas = [
    { id: '1', numero: 'MNU-2026-0342', mes: 3, ano: 2026, monto: 15000, estado: 'pagada', metodo: 'Nequi', fecha: '15 mar 2026' },
    { id: '2', numero: 'MNU-2026-0298', mes: 2, ano: 2026, monto: 15000, estado: 'pagada', metodo: 'Nequi', fecha: '15 feb 2026' },
    { id: '3', numero: 'MNU-2026-0215', mes: 1, ano: 2026, monto: 15000, estado: 'pagada', metodo: 'PSE', fecha: '15 ene 2026' },
    { id: '4', numero: 'MNU-2025-1180', mes: 12, ano: 2025, monto: 15000, estado: 'pagada', metodo: 'Nequi', fecha: '15 dic 2025' },
    { id: '5', numero: 'MNU-2025-1102', mes: 11, ano: 2025, monto: 15000, estado: 'pagada', metodo: 'Tarjeta', fecha: '15 nov 2025' },
  ]

  const facturasFiltradas = facturas.filter(f => {
    if (mesSeleccionado !== null && f.mes !== mesSeleccionado) return false
    if (f.ano !== anoSeleccionado) return false
    return true
  })

  const totalFiltrado = facturasFiltradas.reduce((sum, f) => sum + f.monto, 0)

  function aplicarFiltro() {
    setMostrarFiltro(false)
  }

  function limpiarFiltro() {
    setMesSeleccionado(null)
    setAnoSeleccionado(2026)
    setMostrarFiltro(false)
  }

  const filtroActivo = mesSeleccionado !== null

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
            <span style={{ fontSize: '18px', fontWeight: 500 }}>Mis facturas</span>
          </div>
          <div onClick={() => setMostrarFiltro(true)} style={{
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
            padding: '7px 12px', fontSize: '12px', cursor: 'pointer',
            background: filtroActivo ? 'var(--color-info-light)' : 'var(--bg-secondary)',
            color: filtroActivo ? 'var(--color-info)' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            Filtrar <span style={{ fontSize: '10px' }}>↓</span>
          </div>
        </div>

        {/* Datos de facturación */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div className="card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Datos de facturación</div>
              <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Editar</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              La Parrilla de Juan<br />
              NIT: 900.123.456-7<br />
              Cra 70 #45-12, Laureles, Medellín
            </div>
          </div>
        </div>

        {/* Filtro activo pill */}
        {filtroActivo && (
          <div style={{ padding: '0 20px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{
                padding: '5px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: 500,
                background: 'var(--color-info-light)', color: 'var(--color-info)',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                {meses[mesSeleccionado! - 1]} {anoSeleccionado}
                <span onClick={limpiarFiltro} style={{ cursor: 'pointer' }}>✕</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {facturasFiltradas.length} factura{facturasFiltradas.length !== 1 ? 's' : ''} · ${totalFiltrado.toLocaleString('es-CO')}
              </div>
            </div>
          </div>
        )}

        {/* Resumen del periodo */}
        {!filtroActivo && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total {anoSeleccionado}</div>
                <div style={{ fontSize: '18px', fontWeight: 500, marginTop: '2px' }}>${totalFiltrado.toLocaleString('es-CO')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Facturas</div>
                <div style={{ fontSize: '18px', fontWeight: 500, marginTop: '2px' }}>{facturasFiltradas.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de facturas */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historial</div>

          {facturasFiltradas.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Sin facturas</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No hay facturas para este periodo</div>
            </div>
          ) : (
            facturasFiltradas.map((factura) => (
              <div key={factura.id} className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{mesesCompletos[factura.mes - 1]} {factura.ano}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>#{factura.numero}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>${factura.monto.toLocaleString('es-CO')}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-green)', marginTop: '2px' }}>Pagada</div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: '8px', borderTop: '1px solid var(--border-light)',
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{factura.fecha} · {factura.metodo}</div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Descargar</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Compartir</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Descargar ZIP */}
        {facturasFiltradas.length > 0 && (
          <div style={{ padding: '0 20px', marginTop: '6px', marginBottom: '16px' }}>
            <div style={{
              border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)',
              padding: '14px', textAlign: 'center', cursor: 'pointer',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Descargar {facturasFiltradas.length} factura{facturasFiltradas.length !== 1 ? 's' : ''} en ZIP</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Ideal para enviar al contador</div>
            </div>
          </div>
        )}

        {/* Tip */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--color-info-light)', borderRadius: 'var(--radius-md)',
            padding: '12px', fontSize: '12px', color: 'var(--color-info)',
          }}>
            Las facturas se generan automáticamente cada mes después del pago.
          </div>
        </div>

      </div>

      {/* === OVERLAY: Filtro tipo rueda === */}
      {mostrarFiltro && (
        <>
          <div onClick={() => setMostrarFiltro(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60,
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
            background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0',
            animation: 'slideUp 0.3s ease',
          }}>
            {/* Header del selector */}
            <div style={{
              padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <span onClick={() => setMostrarFiltro(false)} style={{ fontSize: '14px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>Cancelar</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>Filtrar por periodo</span>
              <span onClick={aplicarFiltro} style={{ fontSize: '14px', color: 'var(--color-info)', fontWeight: 500, cursor: 'pointer' }}>Listo</span>
            </div>

            {/* Selector de año */}
            <div style={{ padding: '16px 20px 8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Año</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[2025, 2026].map(ano => (
                  <div key={ano} onClick={() => setAnoSeleccionado(ano)} style={{
                    flex: 1, padding: '10px', textAlign: 'center', borderRadius: 'var(--radius-sm)',
                    fontSize: '14px', fontWeight: anoSeleccionado === ano ? 500 : 400, cursor: 'pointer',
                    background: anoSeleccionado === ano ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                    color: anoSeleccionado === ano ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                  }}>
                    {ano}
                  </div>
                ))}
              </div>
            </div>

            {/* Selector de mes */}
            <div style={{ padding: '12px 20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Mes</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {meses.map((mes, i) => {
                  const mesNum = i + 1
                  const tieneFactura = facturas.some(f => f.mes === mesNum && f.ano === anoSeleccionado)
                  return (
                    <div key={mes} onClick={() => setMesSeleccionado(mesSeleccionado === mesNum ? null : mesNum)} style={{
                      padding: '10px', textAlign: 'center', borderRadius: 'var(--radius-sm)',
                      fontSize: '13px', cursor: tieneFactura ? 'pointer' : 'default',
                      background: mesSeleccionado === mesNum ? 'var(--color-info)' : tieneFactura ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      color: mesSeleccionado === mesNum ? 'white' : tieneFactura ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      border: `1px solid ${mesSeleccionado === mesNum ? 'var(--color-info)' : tieneFactura ? 'var(--border-light)' : 'transparent'}`,
                      fontWeight: mesSeleccionado === mesNum ? 500 : 400,
                      opacity: tieneFactura ? 1 : 0.4,
                    }}>
                      {mes}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Atajos rápidos */}
            <div style={{ padding: '8px 20px 24px', display: 'flex', gap: '8px' }}>
              <div onClick={() => { setMesSeleccionado(3); setAnoSeleccionado(2026); }} style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '12px',
                textAlign: 'center', border: '1px solid var(--border-light)', cursor: 'pointer',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              }}>Este mes</div>
              <div onClick={() => { setMesSeleccionado(null); setAnoSeleccionado(2026); }} style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '12px',
                textAlign: 'center', border: '1px solid var(--border-light)', cursor: 'pointer',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              }}>Este año</div>
              <div onClick={limpiarFiltro} style={{
                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '12px',
                textAlign: 'center', border: '1px solid var(--border-light)', cursor: 'pointer',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              }}>Todas</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}