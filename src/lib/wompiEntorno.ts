// ── Entorno de Wompi (CIERRE 4, W-1 / E-2) ───────────────────────────────
// Antes la base de la API salia de WOMPI_API_URL con sandbox POR DEFECTO,
// mientras el Checkout Web elige su entorno por la llave publica: las dos
// mitades de la integracion podian apuntar a entornos distintos sin un solo
// error ni una linea de log (cobros automaticos a sandbox mientras los pagos
// manuales iban a produccion).
//
// Ahora el entorno sale de las LLAVES, que son las que Wompi usa para decidir:
//   prv_test_ -> test -> https://sandbox.wompi.co/v1
//   prv_prod_ -> prod -> https://production.wompi.co/v1
// y se FALLA CERRADO si algo no cuadra: prefijo privado desconocido, llave
// publica de otro entorno, o un WOMPI_API_URL que apunte a otro lado. Ningun
// mensaje de error incluye material de las llaves.

export type EntornoWompi = 'test' | 'prod'

export type ResolucionEntorno =
  | { ok: true; entorno: EntornoWompi; apiBase: string }
  | { ok: false; error: string }

export const API_WOMPI: Record<EntornoWompi, string> = {
  test: 'https://sandbox.wompi.co/v1',
  prod: 'https://production.wompi.co/v1',
}

function entornoPorPrefijo(llave: string, tipo: 'prv' | 'pub'): EntornoWompi | null {
  if (llave.startsWith(`${tipo}_test_`)) return 'test'
  if (llave.startsWith(`${tipo}_prod_`)) return 'prod'
  return null
}

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Regla PURA: recibe los valores (ya leidos del entorno) y decide. */
export function resolverEntornoWompi(p: {
  privada?: string | null
  publica?: string | null
  apiUrl?: string | null
}): ResolucionEntorno {
  const privada = (p.privada ?? '').trim()
  const publica = (p.publica ?? '').trim()
  const apiUrl = (p.apiUrl ?? '').trim()

  const entorno = entornoPorPrefijo(privada, 'prv')
  if (!entorno) {
    return { ok: false, error: 'WOMPI_PRIVATE_KEY falta o no empieza por prv_test_ ni prv_prod_' }
  }

  const entornoPublica = entornoPorPrefijo(publica, 'pub')
  if (!entornoPublica) {
    return { ok: false, error: 'NEXT_PUBLIC_WOMPI_PUBLIC_KEY falta o no empieza por pub_test_ ni pub_prod_' }
  }
  if (entornoPublica !== entorno) {
    return {
      ok: false,
      error: `llaves de entornos distintos: privada=${entorno} publica=${entornoPublica}`,
    }
  }

  const apiBase = API_WOMPI[entorno]
  if (apiUrl) {
    const otro: EntornoWompi = entorno === 'test' ? 'prod' : 'test'
    if (sinBarraFinal(apiUrl) === API_WOMPI[otro]) {
      return { ok: false, error: `WOMPI_API_URL apunta a ${otro} pero las llaves son de ${entorno}` }
    }
    if (sinBarraFinal(apiUrl) !== apiBase) {
      return { ok: false, error: `WOMPI_API_URL no es la API de Wompi para ${entorno}` }
    }
  }

  return { ok: true, entorno, apiBase }
}

// Una sola linea de log por proceso con el entorno resuelto (nunca llaves).
let entornoLogueado = false

/** Lee process.env y resuelve. SOLO servidor: la llave privada no existe en el
 *  navegador. Lo usan lib/wompiApi y el webhook. */
export function entornoWompiActual(): ResolucionEntorno {
  const r = resolverEntornoWompi({
    privada: process.env.WOMPI_PRIVATE_KEY,
    publica: process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY,
    apiUrl: process.env.WOMPI_API_URL,
  })
  if (!r.ok) {
    console.error(`[wompi] entorno no resuelto: ${r.error}`)
  } else if (!entornoLogueado) {
    entornoLogueado = true
    console.info(`[wompi] entorno=${r.entorno} api=${new URL(r.apiBase).host}`)
  }
  return r
}
