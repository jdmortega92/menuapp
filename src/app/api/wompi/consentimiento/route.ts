import { NextResponse } from 'next/server'
import { obtenerParAceptacion } from '@/lib/wompiApi'

// F4.c-4 — permalinks de los DOS contratos que el usuario debe poder leer
// ANTES de marcar las casillas.
//
// Por que una ruta y no dos constantes: el spike verifico que los permalinks
// REALES no coinciden con los que muestra la documentacion de Wompi. Cablearlos
// significaria enlazar a un documento que podria no ser el vigente — es decir,
// pedir consentimiento sobre un texto que el usuario no vio. Se leen vivos.
//
// Solo se devuelven los PERMALINKS. Los acceptance tokens que trae la misma
// respuesta se DESCARTAN aqui a proposito: son de un solo uso, y el navegador
// no tiene nada que hacer con ellos (la fuente de pago la crea el server).

export async function GET() {
  const par = await obtenerParAceptacion('wompi/consentimiento')
  if (!par.ok) {
    return NextResponse.json({ error: 'No disponible' }, { status: 502 })
  }
  return NextResponse.json({
    politica: par.datos.politica.permalink,
    datos: par.datos.datos.permalink,
  })
}
