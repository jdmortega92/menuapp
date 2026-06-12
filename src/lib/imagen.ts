// Recorta una imagen (objectURL/dataURL) al rectángulo pixelCrop de
// react-easy-crop y la reescala a ancho×alto, como JPEG 0.82. Parametrizado
// para los dos pipelines de crop del admin: /menu (platos 800×450, 16:9) y
// /config (logo 400×400 redondo, banner 1200×400 3:1) — Fase 3, antes vivía
// duplicado en cada página (la de /menu con 800×450 hardcodeado).
export function recortarImagen(imageSrc: string, pixelCrop: any, ancho: number, alto: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      canvas.width = ancho
      canvas.height = alto
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, ancho, alto
      )
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.82)
    }
    img.src = imageSrc
  })
}
