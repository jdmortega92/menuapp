'use client'

import { formato12h } from '@/lib/time'
import { glowBoton, gradientHeader } from '@/lib/brandTints'

// Presentación/landing del restaurante (solo origen enlace web; en QR se entra
// directo al menú). El gate (!mostrarMenu) vive en la página. `ahora`/`horaActual`
// llegan como props (mismo timestamp por-render del useTick de la página).
export default function RestaurantLanding({
  restaurante,
  horariosRest,
  esBasicoPublico,
  color,
  ahora,
  horaActual,
  whatsappActivo,
  onVerMenu,
}: {
  restaurante: any
  horariosRest: any[]
  esBasicoPublico: boolean
  color: string
  ahora: Date
  horaActual: string
  whatsappActivo: boolean | undefined
  onVerMenu: () => void
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Portada: banner sin texto encima (banner solo desde plan Básico) */}
      <div style={{
        height: '200px',
        background: (esBasicoPublico && restaurante.banner_url)
          ? `url(${restaurante.banner_url}) center/cover`
          : gradientHeader(color),
        position: 'relative',
      }}>
        {esBasicoPublico && restaurante.banner_url && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.15) 100%)',
          }} />
        )}
      </div>

      {/* Identidad del restaurante: logo + nombre + estado */}
      <div style={{
        padding: '0 20px',
        marginTop: '-36px',
        position: 'relative',
      }}>
        {/* Logo circular sobre fondo claro */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--theme-surface)',
          border: '4px solid var(--theme-bg)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 600,
          color: color,
          marginBottom: '14px',
          overflow: 'hidden',
        }}>
          {esBasicoPublico && restaurante.logo_url ? (
            <img
              src={restaurante.logo_url}
              alt={restaurante.nombre}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            restaurante.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
          )}
        </div>

        {/* Nombre */}
        <div style={{
          fontSize: '22px',
          fontWeight: 'var(--theme-title-weight)' as any,
          fontFamily: 'var(--theme-font-display)',
          letterSpacing: 'var(--theme-title-letter-spacing)',
          textTransform: 'var(--theme-title-transform)' as any,
          lineHeight: 1.2,
          color: 'var(--theme-text)',
          marginBottom: '6px',
        }}>
          {restaurante.nombre}
        </div>

        {/* Meta: estado + tipo + ciudad */}
        {(() => {
          if (horariosRest.length === 0) {
            return (
              <div style={{
                fontSize: '12px',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
              }}>
                <span style={{ textTransform: 'capitalize' }}>{restaurante.tipo}</span>
                <span>·</span>
                <span>{restaurante.ciudad}</span>
              </div>
            )
          }

          const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
          const diaHoy = diasSemana[ahora.getDay()]
          const horarioHoy = horariosRest.find((h: any) => h.dia === diaHoy)

          let estadoBadge = null
          let estadoTexto = null

          if (horarioHoy?.cerrado) {
            estadoBadge = (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--color-danger)',
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: 'var(--color-danger)',
                }} />
                Cerrado hoy
              </span>
            )
          } else if (horarioHoy) {
            const apertura = horarioHoy.hora_apertura.slice(0, 5)
            const cierre = horarioHoy.hora_cierre.slice(0, 5)
            const abiertoAhora = horaActual >= apertura && horaActual <= cierre

            if (abiertoAhora) {
              estadoBadge = (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--color-green)',
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--color-green)',
                  }} />
                  Abierto
                </span>
              )
              estadoTexto = `Cierra a las ${formato12h(horarioHoy.hora_cierre)}`
            } else if (horaActual < apertura) {
              estadoBadge = (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--theme-text-subtle)',
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--theme-text-subtle)',
                  }} />
                  Cerrado
                </span>
              )
              estadoTexto = `Abre a las ${formato12h(horarioHoy.hora_apertura)}`
            } else {
              estadoBadge = (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--theme-text-subtle)',
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--theme-text-subtle)',
                  }} />
                  Cerrado
                </span>
              )
              estadoTexto = 'Abre mañana'
            }
          }

          return (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                fontSize: '12px',
                color: 'var(--theme-text-muted)',
                marginBottom: estadoTexto ? '4px' : '0',
              }}>
                {estadoBadge}
                {estadoBadge && <span>·</span>}
                <span style={{ textTransform: 'capitalize' }}>{restaurante.tipo}</span>
                <span>·</span>
                <span>{restaurante.ciudad}</span>
              </div>
              {estadoTexto && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--theme-text-subtle)',
                }}>
                  {estadoTexto}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Info */}
      <div style={{ padding: '20px', flex: 1 }}>
        {/* Descripción */}
        <div style={{
          fontSize: '14px',
          color: 'var(--theme-text-muted)',
          lineHeight: 1.6,
          marginBottom: '20px',
          overflowWrap: 'break-word',
        }}>
          {restaurante?.descripcion || ''}
        </div>

        {/* Horario */}
        {horariosRest.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '10px',
              color: 'var(--theme-text)',
            }}>
              Horario
            </div>
            <div style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 'var(--theme-radius-card)',
              boxShadow: 'var(--theme-shadow-card)',
              overflow: 'hidden',
            }}>
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((dia: string, i: number) => {
                const h = horariosRest.find((x: any) => x.dia === dia)
                if (!h) return null
                return (
                  <div key={dia} style={{
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: i < 6 ? '1px solid var(--theme-border)' : 'none',
                    fontSize: '13px',
                    color: 'var(--theme-text)',
                  }}>
                    <span>{dia}</span>
                    <span style={{ color: h.cerrado ? 'var(--color-danger)' : 'var(--theme-text-muted)' }}>
                      {h.cerrado ? 'Cerrado' : `${formato12h(h.hora_apertura)} — ${formato12h(h.hora_cierre)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Dirección */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '10px',
            color: 'var(--theme-text)',
          }}>
            Ubicación
          </div>
          {restaurante.direccion && (
            <div onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(restaurante.direccion + ', ' + restaurante.ciudad)}`, '_blank')}
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                borderRadius: 'var(--theme-radius-card)',
                boxShadow: 'var(--theme-shadow-card)',
                padding: '14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--theme-text)' }}>{restaurante.direccion}</div>
                <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>{restaurante.ciudad}</div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--color-info)' }}>Ver mapa →</span>
            </div>
          )}
        </div>

        {/* WhatsApp info */}
        {whatsappActivo && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 'var(--theme-radius-card)',
              boxShadow: 'var(--theme-shadow-card)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <span style={{ fontSize: '20px' }}>💬</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>Pedidos por WhatsApp</div>
                <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Arma tu pedido en el menú y envíalo directo</div>
              </div>
            </div>
          </div>
        )}

        {/* Botón ver menú */}
        <div onClick={onVerMenu} style={{
          background: color,
          color: 'white',
          borderRadius: 'var(--theme-radius-button)',
          padding: '16px',
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: 500,
          cursor: 'pointer',
          boxShadow: glowBoton(color),
        }}>
          Ver menú
        </div>

        {/* Powered by */}
        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'var(--theme-text-subtle)' }}>
          Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
        </div>
      </div>
    </div>
  )
}
