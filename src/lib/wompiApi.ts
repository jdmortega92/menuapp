import { leerClaimsAceptacion, type ClaimsAceptacion } from './wompi'

// ── Llamadas HTTP a la API de Wompi (F4.c-4) ─────────────────────────────
// SEPARADO de lib/wompi.ts A PROPOSITO: ese modulo es puro y unit-testeable
// (firmas, fechas, parsers) y debe seguir siendolo. Aqui vive todo lo que hace
// red y todo lo que toca la LLAVE PRIVADA.
//
// LLAVE PRIVADA: WOMPI_PRIVATE_KEY. Sin prefijo NEXT_PUBLIC_, asi que Next
// jamas la inlinea en el bundle del navegador; y este modulo solo lo importan
// route handlers (server). El spike (F4.c-2/Q1) probo que POST y GET de
// /v1/payment_sources y POST /v1/tokens/nequi EXIGEN la privada: la publica
// devuelve 401. Por eso el enrolamiento es 100% server-side y no existe
// ninguna variante de esto que pueda correr en el navegador.
//
// GET /v1/merchants/{public_key} es la excepcion: NO lleva Authorization, la
// llave publica va en el path.

// Sandbox por DEFECTO: si la variable falta, se prefiere fallar contra el
// entorno de pruebas antes que golpear produccion por accidente.
const BASE = (process.env.WOMPI_API_URL ?? 'https://sandbox.wompi.co/v1').replace(/\/+$/, '')

function llavePrivada(): string {
  return (process.env.WOMPI_PRIVATE_KEY ?? '').trim()
}

function llavePublica(): string {
  return (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? '').trim()
}

/** Se loguea la LONGITUD de cada credencial, nunca el valor (mismo patron que
 *  /api/wompi/checkout y el cron): un valor truncado pasa el guard de "existe"
 *  y solo se detecta por su longitud. */
export function credencialesListas(etiqueta: string): boolean {
  const priv = llavePrivada()
  const pub = llavePublica()
  console.info(`[${etiqueta}] creds len: WOMPI_PRIVATE_KEY=${priv.length} NEXT_PUBLIC_WOMPI_PUBLIC_KEY=${pub.length}`)
  return priv.length > 0 && pub.length > 0
}

/** Resultado uniforme: las rutas deciden que responder, nadie lanza. */
export type ResultadoWompi<T> =
  | { ok: true; datos: T }
  | { ok: false; status: number; mensaje: string }

async function pedir<T>(
  url: string,
  init: RequestInit,
  etiqueta: string
): Promise<ResultadoWompi<T>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, cache: 'no-store' })
  } catch (err) {
    // Red caida: status 0 para que el llamador lo trate como transitorio.
    console.error(`[${etiqueta}] fallo de red:`, err instanceof Error ? err.message : 'desconocido')
    return { ok: false, status: 0, mensaje: 'Sin conexion con la pasarela' }
  }

  let cuerpo: unknown = null
  try {
    cuerpo = await res.json()
  } catch {
    cuerpo = null
  }

  if (!res.ok) {
    // El cuerpo de error de Wompi puede traer datos del usuario: se loguea el
    // STATUS y el tipo de error, jamas el payload completo.
    const tipo =
      (cuerpo as { error?: { type?: string } } | null)?.error?.type ?? 'sin tipo'
    console.error(`[${etiqueta}] Wompi respondio ${res.status} (${tipo})`)
    return { ok: false, status: res.status, mensaje: tipo }
  }

  return { ok: true, datos: (cuerpo as { data?: T })?.data as T }
}

// ── Acceptance tokens ────────────────────────────────────────────────────
// SIEMPRE FRESCOS. El spike probo dos cosas: son de UN SOLO USO (reusar el par
// -> 422 "El token de aceptacion ya fue usado") y el END_USER_POLICY expira en
// EXACTAMENTE 1 hora. Cachearlos romperia el siguiente enrolamiento; por eso
// no hay memoizacion aqui y no debe agregarse.

export interface ParAceptacion {
  politicaToken: string
  datosToken: string
  politica: ClaimsAceptacion
  datos: ClaimsAceptacion
}

interface MerchantResponse {
  presigned_acceptance?: { acceptance_token?: string; permalink?: string }
  presigned_personal_data_auth?: { acceptance_token?: string; permalink?: string }
}

export async function obtenerParAceptacion(etiqueta: string): Promise<ResultadoWompi<ParAceptacion>> {
  const pub = llavePublica()
  if (!pub) return { ok: false, status: 500, mensaje: 'Falta la llave publica' }

  const res = await pedir<MerchantResponse>(`${BASE}/merchants/${pub}`, { method: 'GET' }, etiqueta)
  if (!res.ok) return res

  const politicaToken = res.datos?.presigned_acceptance?.acceptance_token ?? ''
  const datosToken = res.datos?.presigned_personal_data_auth?.acceptance_token ?? ''
  if (!politicaToken || !datosToken) {
    return { ok: false, status: 502, mensaje: 'Wompi no devolvio el par de aceptacion' }
  }

  // El permalink se prefiere del CUERPO de la respuesta y se cae a los claims
  // del JWT. El spike verifico que los permalinks reales NO son los que muestra
  // la doc, asi que jamas se cablean aqui: siempre salen de la respuesta viva.
  const politica = leerClaimsAceptacion(politicaToken)
  const datos = leerClaimsAceptacion(datosToken)
  return {
    ok: true,
    datos: {
      politicaToken,
      datosToken,
      politica: {
        ...politica,
        permalink: res.datos?.presigned_acceptance?.permalink ?? politica.permalink,
      },
      datos: {
        ...datos,
        permalink: res.datos?.presigned_personal_data_auth?.permalink ?? datos.permalink,
      },
    },
  }
}

// ── Token de Nequi ───────────────────────────────────────────────────────
// POST /v1/tokens/nequi devuelve HTTP 200 (no 201) con status "PENDING": el
// usuario todavia tiene que aprobar en su app. La respuesta trae phone Y
// phone_number duplicados y NO trae "name" (difiere de la doc; spike F4.c-2).

export interface TokenNequi {
  id: string
  status: string
}

export async function crearTokenNequi(
  telefono: string,
  etiqueta: string
): Promise<ResultadoWompi<TokenNequi>> {
  const priv = llavePrivada()
  if (!priv) return { ok: false, status: 500, mensaje: 'Falta la llave privada' }

  return pedir<TokenNequi>(
    `${BASE}/tokens/nequi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${priv}` },
      body: JSON.stringify({ phone_number: telefono }),
    },
    etiqueta
  )
}

// ── Fuente de pago ───────────────────────────────────────────────────────
// El par de aceptacion que se consume aqui tiene que ser DISTINTO del que se
// capturo al enrolar: aquel ya cumplio su papel (evidencia de lo que el usuario
// acepto) y, si se reusara, Wompi responderia 422 "ya fue usado".

export interface FuenteWompi {
  id: number
  status: string
  public_data?: { phone_number?: string; phone?: string; type?: string }
}

export async function crearFuenteNequi(
  p: { tokenId: string; email: string; par: ParAceptacion },
  etiqueta: string
): Promise<ResultadoWompi<FuenteWompi>> {
  const priv = llavePrivada()
  if (!priv) return { ok: false, status: 500, mensaje: 'Falta la llave privada' }

  return pedir<FuenteWompi>(
    `${BASE}/payment_sources`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${priv}` },
      body: JSON.stringify({
        type: 'NEQUI',
        token: p.tokenId,
        customer_email: p.email,
        acceptance_token: p.par.politicaToken,
        accept_personal_auth: p.par.datosToken,
      }),
    },
    etiqueta
  )
}
