'use client'

import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { recortarImagen } from '@/lib/imagen'

// ── CropModal — overlay de recorte de imagen (Fase 3) ──
// UI compartida por /menu (foto de plato 16:9) y /config (logo redondo, banner
// 3:1). Posee crop/zoom/croppedAreaPixels INTERNAMENTE: el dueño solo guarda el
// puntero (qué imagen y a qué pertenece) y monta el modal condicionalmente —
// cada apertura arranca en crop {0,0} / zoom 1 por fresh-mount, sin resets.
// "Listo" recorta a anchoSalida×altoSalida (lib/imagen) y entrega el BLOB por
// onConfirm; el upload/persistencia es del dueño (storage path, tabla y mutate
// difieren por página).
export default function CropModal({
  imagen,
  aspect,
  cropShape,
  titulo,
  anchoSalida,
  altoSalida,
  onConfirm,
  onCancel,
}: {
  imagen: string
  aspect: number
  cropShape?: 'rect' | 'round'
  titulo: string
  anchoSalida: number
  altoSalida: number
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  async function confirmar() {
    if (!croppedAreaPixels) return
    const blob = await recortarImagen(imagen, croppedAreaPixels, anchoSalida, altoSalida)
    onConfirm(blob)
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 80 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', maxWidth: '500px', minWidth: '320px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span onClick={onCancel} style={{ fontSize: '14px', color: 'white', cursor: 'pointer' }}>Cancelar</span>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>{titulo}</span>
          <span onClick={confirmar} style={{ fontSize: '14px', color: '#4CAF50', fontWeight: 500, cursor: 'pointer' }}>Listo</span>
        </div>

        {/* Área de recorte */}
        <div style={{ position: 'relative', flex: 1 }}>
          <Cropper
            image={imagen}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            cropShape={cropShape}
          />
        </div>

        {/* Controles */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '300px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>-</span>
            <input type="range" min={1} max={3} step={0.1} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#4CAF50' }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>+</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Arrastra para ajustar · Zoom para acercar</div>
        </div>
      </div>
    </>
  )
}
