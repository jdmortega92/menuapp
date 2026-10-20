#!/usr/bin/env node
// Simulador LOCAL del webhook de Wompi (CIERRE 3). Firma un evento
// transaction.updated igual que Wompi y lo manda a /api/wompi/eventos del
// servidor de desarrollo. Sin dependencias: Node 18+ (fetch y crypto nativos).
//
// USO (con `npm run dev` corriendo):
//   node scripts/simular-webhook-wompi.mjs --reference <ref> --amount <centavos>
//        [--status APPROVED|DECLINED|VOIDED|ERROR] [--times N] [--parallel]
//
//   --reference  la referencia que el webhook parsea. Pago MANUAL, mismo formato
//                que construirReferencia en src/lib/wompi.ts:32-40:
//                  sub_<restauranteId>_<plan>_<periodo>_<timestamp>
//                Ejemplo para el restaurante de prueba (pro mensual):
//                  sub_c8a8c0d2-5887-4dd2-a37a-266fe4b856bf_pro_mensual_1760000000000
//                El ultimo segmento solo tiene que ser unico: usa Date.now().
//   --amount     amount_in_cents. Debe ser centavosDe(plan, periodo) de
//                src/lib/planes.ts (pro mensual = 2900000) o el webhook no
//                otorga nada (eso es justo la prueba de monto distinto).
//   --status     default APPROVED.
//   --times      cuantas veces mandar el MISMO evento (default 1). Simula las
//                reentregas de Wompi: mismo body, mismo id, mismo timestamp.
//                Sin --parallel van uno detras de otro, y desde el segundo los
//                corta el SELECT por numero de la ruta antes de la funcion.
//   --parallel   bandera sin valor. Con --times N manda los N envios A LA VEZ
//                (Promise.all) con el cuerpo firmado una sola vez: ejercita la
//                carrera que resuelve aplicar_pago_aprobado (ON CONFLICT).
//                Con --times 1 (o sin --times) manda uno solo.
//
// Seguridad: lee WOMPI_EVENTS_SECRET de .env.local y JAMAS lo imprime (ni su
// longitud). Solo manda a http://localhost:3000; cualquier otro host se rechaza.

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DESTINO = 'http://localhost:3000/api/wompi/eventos'

function salir(mensaje) {
  console.error(`[simular-webhook] ${mensaje}`)
  process.exit(1)
}

// Banderas sin valor: su sola presencia las enciende.
const BANDERAS = new Set(['parallel'])

function leerArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const clave = argv[i]
    if (!clave.startsWith('--')) salir(`argumento inesperado: ${clave}`)
    if (BANDERAS.has(clave.slice(2))) {
      args[clave.slice(2)] = true
      continue
    }
    const valor = argv[i + 1]
    if (valor === undefined || valor.startsWith('--')) salir(`falta el valor de ${clave}`)
    args[clave.slice(2)] = valor
    i++
  }
  return args
}

function leerSecreto() {
  let contenido
  try {
    contenido = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    salir('no se pudo leer .env.local (correr desde la raiz del repo)')
  }
  for (const linea of contenido.split(/\r?\n/)) {
    const m = linea.match(/^\s*WOMPI_EVENTS_SECRET\s*=\s*(.*)\s*$/)
    if (m) {
      const valor = m[1].replace(/^['"]|['"]$/g, '').trim()
      if (valor) return valor
    }
  }
  salir('WOMPI_EVENTS_SECRET no esta en .env.local')
}

// Espejo de resolverPath + calcularChecksumEvento, src/lib/wompi.ts:230-243.
// Si esas lineas cambian, esto tiene que cambiar igual.
function resolverPath(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object') return acc[key]
    return undefined
  }, obj)
}

function calcularChecksumEvento(event, secret) {
  const props = event.signature?.properties ?? []
  const data = event.data
  const concatValores = props.map((p) => String(resolverPath(data, p))).join('')
  const cadena = `${concatValores}${event.timestamp}${secret}`
  return createHash('sha256').update(cadena).digest('hex').toUpperCase()
}

const args = leerArgs(process.argv.slice(2))
const reference = args.reference
if (!reference) salir('falta --reference')
const amount = Number(args.amount)
if (!Number.isInteger(amount) || amount < 0) salir('--amount debe ser un entero de centavos')
const status = args.status ?? 'APPROVED'
const veces = args.times === undefined ? 1 : Number(args.times)
if (!Number.isInteger(veces) || veces < 1) salir('--times debe ser un entero >= 1')

const url = new URL(DESTINO)
if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '3000') {
  salir(`destino rechazado: ${url.href}`)
}

const secreto = leerSecreto()

// Misma forma que lee la ruta: data.transaction.{reference,status,
// amount_in_cents,payment_method_type}, signature.{properties,checksum} y
// timestamp. Las propiedades firmadas son las que Wompi manda de verdad
// (F4.c-2/Q2): transaction.id, transaction.status, transaction.amount_in_cents.
const event = {
  event: 'transaction.updated',
  data: {
    transaction: {
      id: `sim-${randomUUID()}`,
      reference,
      status,
      amount_in_cents: amount,
      currency: 'COP',
      payment_method_type: 'NEQUI',
    },
  },
  signature: {
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
  },
  timestamp: Math.floor(Date.now() / 1000),
  environment: 'test',
}
const checksum = calcularChecksumEvento(event, secreto)
event.signature.checksum = checksum
const cuerpo = JSON.stringify(event)

// Un envio del MISMO cuerpo firmado. Nunca lanza: devuelve la linea a imprimir.
async function enviar(i) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Event-Checksum': checksum },
      body: cuerpo,
    })
    const texto = await res.text()
    return `[simular-webhook] envio ${i}/${veces}: HTTP ${res.status} ${texto}`
  } catch (err) {
    return `[simular-webhook] envio ${i}/${veces}: fallo la conexion (${err?.message ?? err})`
  }
}

if (args.parallel) {
  // Todos a la vez: reentregas CONCURRENTES, el caso que la funcion
  // aplicar_pago_aprobado resuelve con ON CONFLICT (numero). Las lineas se
  // imprimen en orden de indice cuando terminan todos.
  const indices = Array.from({ length: veces }, (_, k) => k + 1)
  const lineas = await Promise.all(indices.map((i) => enviar(i)))
  for (const linea of lineas) console.log(linea)
} else {
  for (let i = 1; i <= veces; i++) {
    console.log(await enviar(i))
  }
}
