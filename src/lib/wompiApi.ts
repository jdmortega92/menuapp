import { leerClaimsAceptacion, type ClaimsAceptacion } from './wompi'

// ── Llamadas HTTP a la API de Wompi (F4.c-4) ─────────────────────────────
// SEPARADO de lib/wompi.ts A PROPOSITO: ese modulo es puro y unit-testeable
// (firmas, fechas, parsers) y debe seguir siendolo. Aqui vive todo lo que hace
// red y todo lo que toca las credenciales.
//
// QUE LLAVE USA CADA ENDPOINT — esto NO es intercambiable y confundirlo da 401:
//   GET  /v1/merchants/{public_key}  -> NINGUNA cabecera. La llave publica va en
//        el PATH; mandar Authorization aqui no aporta nada.
//   POST /v1/tokens/nequi            -> PUBLICA. La tokenizacion es la operacion
//        pensada para ser segura desde el cliente (por eso el Widget puede
//        tokenizar una tarjeta sin exponer nada). Mandar la privada da 401.
//   POST /v1/tokens/cards            -> PUBLICA (mismo motivo). F4.c-6.
//   POST /v1/payment_sources         -> PRIVADA. Probado en el spike F4.c-2/Q1:
//        sin auth -> 401 INVALID_ACCESS_TOKEN; con pub_test_ -> 401 "Solicitud
//        no autorizada"; con prv_test_ -> 201. Igual el GET de la fuente.
//   POST /v1/transactions            -> PRIVADA. No se usa en F4.c-4 (es F4.c-5).
//
// La regla de fondo: TOKENIZAR es publico, GUARDAR y COBRAR son privados.
//
// WOMPI_PRIVATE_KEY no lleva prefijo NEXT_PUBLIC_, asi que Next jamas la
// inlinea en el bundle del navegador; y este modulo solo lo importan route
// handlers (server). El enrolamiento con Nequi, de hecho, NO necesita la llave
// privada en ningun momento: la usa solo el webhook, al crear la fuente.

// Sandbox por DEFECTO: si la variable falta, se prefiere fallar contra el
// entorno de pruebas antes que golpear produccion por accidente.
const BASE = (process.env.WOMPI_API_URL ?? 'https://sandbox.wompi.co/v1').replace(/\/+$/, '')

/** Que credencial viaja en la cabecera Authorization de una llamada. */
export type Llave = 'publica' | 'privada' | 'ninguna'

function valorDe(llave: Llave): string {
  if (llave === 'publica') return (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? '').trim()
  if (llave === 'privada') return (process.env.WOMPI_PRIVATE_KEY ?? '').trim()
  return ''
}

/** Verifica SOLO las credenciales que la operacion necesita de verdad. Se
 *  loguea la LONGITUD de cada una, jamas el valor: un valor truncado o con un
 *  newline pegado pasa el guard de "existe" y solo se delata por su longitud. */
export function credencialesListas(etiqueta: string, necesita: Llave[]): boolean {
  const detalle = necesita.map((l) => `${l}=${valorDe(l).length}`).join(' ')
  console.info(`[${etiqueta}] creds len: ${detalle}`)
  return necesita.every((l) => valorDe(l).length > 0)
}

/** Resultado uniforme: las rutas deciden que responder, nadie lanza. */
export type ResultadoWompi<T> =
  | { ok: true; datos: T }
  | { ok: false; status: number; mensaje: string }

async function pedir<T>(p: {
  metodo: 'GET' | 'POST'
  /** Ruta para el LOG (sin ids ni llaves), no la URL real. */
  ruta: string
  url: string
  llave: Llave
  cuerpo?: unknown
  etiqueta: string
}): Promise<ResultadoWompi<T>> {
  const credencial = valorDe(p.llave)
  if (p.llave !== 'ninguna' && !credencial) {
    console.error(`[${p.etiqueta}] ${p.metodo} ${p.ruta} SIN llave ${p.llave} configurada`)
    return { ok: false, status: 500, mensaje: `Falta la llave ${p.llave}` }
  }

  // Este sello es la linea que hace diagnosticable un 401 de un vistazo: dice
  // QUE llave se uso en QUE ruta y con que longitud. Sin el, un 401 no
  // distingue entre llave equivocada, ausente o truncada — que fue exactamente
  // el bug de la primera version (tokenizacion firmada con la privada).
  const sello =
    p.llave === 'ninguna'
      ? `${p.metodo} ${p.ruta} llave=ninguna`
      : `${p.metodo} ${p.ruta} llave=${p.llave}(len=${credencial.length})`

  const headers: Record<string, string> = {}
  if (p.cuerpo !== undefined) headers['Content-Type'] = 'application/json'
  if (p.llave !== 'ninguna') headers.Authorization = `Bearer ${credencial}`

  let res: Response
  try {
    res = await fetch(p.url, {
      method: p.metodo,
      headers,
      body: p.cuerpo === undefined ? undefined : JSON.stringify(p.cuerpo),
      cache: 'no-store',
    })
  } catch (err) {
    // Red caida: status 0 para que el llamador lo trate como transitorio.
    console.error(`[${p.etiqueta}] ${sello} -> fallo de red:`, err instanceof Error ? err.message : 'desconocido')
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
    // STATUS y el TIPO de error, jamas el payload completo.
    const tipo = (cuerpo as { error?: { type?: string } } | null)?.error?.type ?? 'sin tipo'
    console.error(`[${p.etiqueta}] ${sello} -> ${res.status} (${tipo})`)
    return { ok: false, status: res.status, mensaje: tipo }
  }

  console.info(`[${p.etiqueta}] ${sello} -> ${res.status}`)
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
  const pub = valorDe('publica')
  if (!pub) return { ok: false, status: 500, mensaje: 'Falta la llave publica' }

  // La llave publica va en el PATH; NO se manda cabecera Authorization.
  const res = await pedir<MerchantResponse>({
    metodo: 'GET',
    ruta: '/merchants/{public_key}',
    url: `${BASE}/merchants/${pub}`,
    llave: 'ninguna',
    etiqueta,
  })
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
// LLAVE PUBLICA: tokenizar es la operacion pensada para ser segura desde el
// cliente. Con la PRIVADA responde 401 (bug de la primera version de F4.c-4).
// Devuelve HTTP 200 (no 201) con status "PENDING": el usuario todavia tiene que
// aprobar en su app. La respuesta trae phone Y phone_number duplicados y NO
// trae "name" (difiere de la doc; spike F4.c-2/Q4).

export interface TokenNequi {
  id: string
  status: string
}

export async function crearTokenNequi(
  telefono: string,
  etiqueta: string
): Promise<ResultadoWompi<TokenNequi>> {
  return pedir<TokenNequi>({
    metodo: 'POST',
    ruta: '/tokens/nequi',
    url: `${BASE}/tokens/nequi`,
    llave: 'publica',
    cuerpo: { phone_number: telefono },
    etiqueta,
  })
}

// ── Fuente de pago ───────────────────────────────────────────────────────
// LLAVE PRIVADA, sin alternativa: probado en el spike (F4.c-2/Q1). Es lo que
// obliga a que el enrolamiento sea 100% server-side.
//
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
  return pedir<FuenteWompi>({
    metodo: 'POST',
    ruta: '/payment_sources',
    url: `${BASE}/payment_sources`,
    llave: 'privada',
    cuerpo: {
      type: 'NEQUI',
      token: p.tokenId,
      customer_email: p.email,
      acceptance_token: p.par.politicaToken,
      accept_personal_auth: p.par.datosToken,
    },
    etiqueta,
  })
}
