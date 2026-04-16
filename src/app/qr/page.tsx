'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import QRCode from 'qrcode'

export default function MiQRPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando } = useAuth()
  const [copiado, setCopiado] = useState(false)
  const [tabFormato, setTabFormato] = useState<'mesa' | 'enlace'>('mesa')
  const [mesas, setMesas] = useState(8)

  const restaurante = {
    nombre: rest?.nombre || 'Mi restaurante',
    slug: rest?.slug || 'mi-restaurante',
  }
  const urlBase = 'menuapp.co'
  const urlMenu = `${urlBase}/${restaurante.slug}`
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [qrGenerado, setQrGenerado] = useState(false)
  const urlCompleta = `https://menuapp-iota.vercel.app/${restaurante.slug}`

  useEffect(() => {
    if (qrCanvasRef.current && restaurante.slug) {
      QRCode.toCanvas(qrCanvasRef.current, urlCompleta, {
        width: 200,
        margin: 2,
        color: { dark: '#1A1A18', light: '#FFFFFF' },
      }, () => setQrGenerado(true))
    }
  }, [restaurante.slug, urlCompleta])

  function descargarQR(formato: 'png' | 'svg', url: string, nombre: string) {
    if (formato === 'png') {
      QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: '#1A1A18', light: '#FFFFFF' } }, (err: any, dataUrl: string) => {
        if (err) return
        const link = document.createElement('a')
        link.download = `${nombre}.png`
        link.href = dataUrl
        link.click()
      })
    } else {
      QRCode.toString(url, { type: 'svg', width: 600, margin: 2, color: { dark: '#1A1A18', light: '#FFFFFF' } }, (err: any, svgString: string) => {
        if (err) return
        const blob = new Blob([svgString], { type: 'image/svg+xml' })
        const link = document.createElement('a')
        link.download = `${nombre}.svg`
        link.href = URL.createObjectURL(blob)
        link.click()
      })
    }
  }

  function compartirEnlace(red: string) {
    const texto = `Mira el menú de ${restaurante.nombre}: ${urlCompleta}`
    if (red === 'WhatsApp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    } else if (red === 'Facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlCompleta)}`, '_blank')
    } else {
      navigator.share?.({ title: restaurante.nombre, text: texto, url: urlCompleta })
        .catch(() => { navigator.clipboard.writeText(urlCompleta) })
    }
  }

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  function copiarEnlace() {
    try {
      navigator.clipboard.writeText(urlCompleta)
    } catch {
      const input = document.createElement('input')
      input.value = urlCompleta
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }
  if (cargando) {
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
  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '80px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Mi QR</div>
        </div>

        {/* QR grande */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '200px', height: '200px', margin: '0 auto 16px', borderRadius: '12px', overflow: 'hidden', background: 'white', padding: '8px' }}>
              <canvas ref={qrCanvasRef} style={{ width: '100%', height: '100%' }} />
            </div>

            <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>{restaurante.nombre}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-info)', marginBottom: '16px' }}>{urlMenu}</div>

            {/* Copiar enlace */}
            <div
              onClick={copiarEnlace}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)', cursor: 'pointer',
                background: copiado ? 'var(--color-green-light)' : 'var(--bg-secondary)',
                color: copiado ? 'var(--color-green)' : 'var(--text-primary)',
                fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
              }}
            >
              {copiado ? '✓ Enlace copiado' : 'Copiar enlace'}
            </div>
          </div>
        </div>

        {/* URL personalizada */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div className="card" style={{ padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>URL de tu menú</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0',
              border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 12px', background: 'var(--bg-tertiary)',
                fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
              }}>
                {urlBase}/
              </div>
              <input
                className="input"
                value={restaurante.slug}
                readOnly
                style={{ border: 'none', borderRadius: 0, fontSize: '13px', fontWeight: 500 }}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
              Este es el enlace que compartes con tus clientes
            </div>
          </div>
        </div>

        {/* Tabs: QR para mesas / Enlace web */}
        <div style={{ padding: '0 20px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {['mesa', 'enlace'].map((tab) => (
              <div key={tab} onClick={() => setTabFormato(tab as 'mesa' | 'enlace')}
                style={{
                  flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
                  fontWeight: tabFormato === tab ? 500 : 400,
                  color: tabFormato === tab ? 'var(--color-info)' : 'var(--text-tertiary)',
                  borderBottom: `2px solid ${tabFormato === tab ? 'var(--color-info)' : 'var(--border-light)'}`,
                }}>
                {tab === 'mesa' ? 'QR para mesas' : 'Enlace web'}
              </div>
            ))}
          </div>
        </div>

        {/* QR para mesas */}
        {tabFormato === 'mesa' && (
          <div style={{ padding: '0 20px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Cada mesa tiene su propio QR. El comensal escanea y ve el menú sin WhatsApp.
            </div>

            {/* Lista de mesas */}
            {Array.from({ length: mesas }).map((_, i) => (
              <div key={i} className="card" style={{
                padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: 'var(--bg-tertiary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)',
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>Mesa {i + 1}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{urlMenu}?qr=mesa{i + 1}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span onClick={() => descargarQR('png', `${urlCompleta}?qr=mesa${i + 1}`, `mesa-${i + 1}-${restaurante.slug}`)} style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>PNG</span>
                  <span onClick={() => descargarQR('svg', `${urlCompleta}?qr=mesa${i + 1}`, `mesa-${i + 1}-${restaurante.slug}`)} style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>SVG</span>
                </div>
              </div>
            ))}

            {/* Agregar mesa */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <div onClick={() => setMesas(mesas + 1)} style={{
                flex: 1, border: '1px dashed var(--border-medium)', borderRadius: 'var(--radius-md)',
                padding: '14px', textAlign: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: '13px', color: 'var(--color-info)' }}>+ Agregar mesa</span>
              </div>
              {mesas > 1 && (
                <div onClick={() => setMesas(mesas - 1)} style={{
                  flex: 1, border: '1px dashed var(--border-medium)', borderRadius: 'var(--radius-md)',
                  padding: '14px', textAlign: 'center', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-danger)' }}>- Quitar mesa</span>
                </div>
              )}
            </div>

            {/* Descargar todos */}
            <div onClick={async () => {
              for (let i = 0; i < mesas; i++) {
                await new Promise(r => setTimeout(r, 300))
                descargarQR('png', `${urlCompleta}?qr=mesa${i + 1}`, `mesa-${i + 1}-${restaurante.slug}`)
              }
            }} style={{
              background: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
              padding: '14px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', cursor: 'pointer', marginBottom: '14px',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Descargar todos los QR</div>
                <div style={{ fontSize: '11px', color: 'var(--bg-secondary)', opacity: 0.6, marginTop: '2px' }}>{mesas} mesas en PNG</div>
              </div>
              <span style={{ fontSize: '16px', color: 'var(--bg-secondary)' }}>↓</span>
            </div>

            {/* Tip */}
            <div style={{
              background: 'var(--color-info-light)', borderRadius: 'var(--radius-md)',
              padding: '12px', fontSize: '12px', color: 'var(--color-info)', marginBottom: '14px',
            }}>
              Imprime los QR y pégalos en cada mesa. Cuando el comensal escanea, llega directo al menú y el pedido le aparece al mesero.
            </div>
          </div>
        )}

        {/* Enlace web */}
        {tabFormato === 'enlace' && (
          <div style={{ padding: '0 20px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Comparte este enlace por redes sociales o WhatsApp. El cliente ve la presentación del restaurante y puede pedir por WhatsApp.
            </div>

            {/* Preview del enlace */}
            <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Vista previa</div>
              <div style={{
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                padding: '12px',
              }}>
                <div style={{ fontSize: '12px', color: 'var(--color-info)', marginBottom: '4px' }}>https://{urlMenu}</div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>{restaurante.nombre}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Menú digital · Ve los platos y pide por WhatsApp</div>
              </div>
            </div>

            {/* Compartir */}
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Compartir por</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              {[
                { icon: '💬', label: 'WhatsApp' },
                { icon: '📷', label: 'Instagram' },
                { icon: '📘', label: 'Facebook' },
                { icon: '↗', label: 'Otro' },
              ].map((red, i) => (
                <div key={i} onClick={() => compartirEnlace(red.label)} className="card" style={{
                  flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{red.icon}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{red.label}</div>
                </div>
              ))}
            </div>

            {/* Descargar QR general */}
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Descargar QR del enlace</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              {[
                { formato: 'PNG', desc: 'Para redes sociales' },
                { formato: 'SVG', desc: 'Alta calidad' },
              ].map((f, i) => (
                <div key={i} onClick={() => descargarQR(f.formato.toLowerCase() as 'png' | 'svg', urlCompleta, `qr-${restaurante.slug}`)} className="card" style={{
                  flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>{f.formato}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Tip */}
            <div style={{
              background: 'var(--color-info-light)', borderRadius: 'var(--radius-md)',
              padding: '12px', fontSize: '12px', color: 'var(--color-info)', marginBottom: '14px',
            }}>
              Pon este enlace en tu bio de Instagram, en tu página de Facebook, o envíalo por WhatsApp a tus clientes frecuentes.
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          maxWidth: '500px', minWidth: '320px', margin: '0 auto',
        }}>
          {[
            { icon: '◉', label: 'Inicio', href: '/dashboard', active: false },
            { icon: '≡', label: 'Menú', href: '/menu', active: false },
            { icon: '◻', label: 'QR', href: '/qr', active: true },
            { icon: '⊙', label: 'Config', href: '/config', active: false },
          ].map((item, i) => (
            <div key={i} onClick={() => router.push(item.href)} style={{
              flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer',
              color: item.active ? 'var(--color-info)' : 'var(--text-tertiary)',
              fontWeight: item.active ? 500 : 400,
            }}>
              <div style={{ fontSize: '16px', marginBottom: '2px' }}>{item.icon}</div>
              <div style={{ fontSize: '10px' }}>{item.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}