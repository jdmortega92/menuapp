import { describe, it, expect } from 'vitest'
import {
  desbloqueosConfirmados,
  funcionesPorActivar,
  leerPlanAntesDePagar,
  serializarPlanAntesDePagar,
  VIGENCIA_PLAN_ANTES_MS,
} from './desbloqueos'
import { estadoRetornoDeResultado, type ResultadoAplicar } from './pagos/transaccion'

// Smoke 5a: confirmar una renovacion ya aplicada (pro -> pro, 'duplicado', sin
// sessionStorage) mostro la lista gratis -> pro. El aviso solo puede salir con
// un plan anterior CONFIABLE y de rango menor.

const AHORA = 1_800_000_000_000

describe('desbloqueosConfirmados', () => {
  it('el caso del smoke: sin plan anterior → nada (no se asume gratis)', () => {
    expect(desbloqueosConfirmados(null, 'pro')).toEqual([])
    expect(desbloqueosConfirmados(undefined, 'pro')).toEqual([])
    expect(desbloqueosConfirmados('', 'pro')).toEqual([])
  })
  it('mismo plan → nada', () => {
    for (const p of ['gratis', 'basico', 'pro']) expect(desbloqueosConfirmados(p, p)).toEqual([])
  })
  it('bajada → nada', () => {
    expect(desbloqueosConfirmados('pro', 'basico')).toEqual([])
    expect(desbloqueosConfirmados('pro', 'gratis')).toEqual([])
    expect(desbloqueosConfirmados('basico', 'gratis')).toEqual([])
  })
  it('plan anterior desconocido → nada', () => {
    expect(desbloqueosConfirmados('oro', 'pro')).toEqual([])
    expect(desbloqueosConfirmados('basico', 'oro')).toEqual([])
  })
  it('subida real → la lista de esa subida', () => {
    expect(desbloqueosConfirmados('basico', 'pro')).toEqual(funcionesPorActivar('basico', 'pro'))
    expect(desbloqueosConfirmados('basico', 'pro')).toHaveLength(5)
    expect(desbloqueosConfirmados('gratis', 'pro')).toHaveLength(9)
    expect(desbloqueosConfirmados('gratis', 'basico')).toHaveLength(4)
  })
})

describe('funcionesPorActivar: mismo plan y bajada', () => {
  it('devuelve [] para mismo plan y para bajada', () => {
    expect(funcionesPorActivar('pro', 'pro')).toEqual([])
    expect(funcionesPorActivar('basico', 'basico')).toEqual([])
    expect(funcionesPorActivar('pro', 'basico')).toEqual([])
    expect(funcionesPorActivar('pro', 'gratis')).toEqual([])
  })
})

describe('registro "plan antes de pagar" en sessionStorage', () => {
  it('ida y vuelta dentro de la vigencia', () => {
    const raw = serializarPlanAntesDePagar('basico', AHORA)
    expect(JSON.parse(raw)).toEqual({ plan: 'basico', ts: AHORA })
    expect(leerPlanAntesDePagar(raw, AHORA + 60_000)).toBe('basico')
    expect(leerPlanAntesDePagar(raw, AHORA + VIGENCIA_PLAN_ANTES_MS)).toBe('basico')
  })
  it('mas de 2 horas → no se cree', () => {
    const raw = serializarPlanAntesDePagar('basico', AHORA)
    expect(leerPlanAntesDePagar(raw, AHORA + VIGENCIA_PLAN_ANTES_MS + 1)).toBeNull()
  })
  it('ts del futuro (mas de 1 min) → no se cree', () => {
    expect(leerPlanAntesDePagar(serializarPlanAntesDePagar('basico', AHORA + 120_000), AHORA)).toBeNull()
  })
  it.each([
    ['vacio', ''],
    ['null', null],
    ['valor viejo en texto plano', 'pro'],
    ['valor viejo en texto plano gratis', 'gratis'],
    ['JSON de un string', '"basico"'],
    ['JSON roto', '{"plan":"basico"'],
    ['sin ts', '{"plan":"basico"}'],
    ['ts no numerico', '{"plan":"basico","ts":"ayer"}'],
    ['plan desconocido', `{"plan":"oro","ts":${AHORA}}`],
    ['plan no string', `{"plan":2,"ts":${AHORA}}`],
    ['array', '[1,2]'],
  ])('%s → null', (_, raw) => {
    expect(leerPlanAntesDePagar(raw as string | null, AHORA)).toBeNull()
  })
})

describe('de punta a punta (sin red): lo que vera la pagina', () => {
  // Reproduce la decision de /suscripcion: planAnterior de la ruta si vino; si
  // no, el registro de sessionStorage; luego desbloqueosConfirmados.
  function lista(planAnteriorRuta: string | null, rawStorage: string | null, planNuevo: string) {
    const planAntes = planAnteriorRuta ?? leerPlanAntesDePagar(rawStorage, AHORA)
    return desbloqueosConfirmados(planAntes, planNuevo)
  }
  it('duplicado + sin storage (el smoke) → sin lista', () => {
    const r: ResultadoAplicar = { tipo: 'duplicado' }
    expect(estadoRetornoDeResultado(r)).toBe('aprobado')
    expect(lista(null, null, 'pro')).toEqual([])
  })
  it('duplicado + storage viejo en texto plano → sin lista', () => {
    expect(lista(null, 'gratis', 'pro')).toEqual([])
  })
  it('duplicado + storage vencido → sin lista', () => {
    expect(lista(null, serializarPlanAntesDePagar('basico', AHORA - VIGENCIA_PLAN_ANTES_MS - 1), 'pro')).toEqual([])
  })
  it('duplicado + storage fresco de una subida → lista', () => {
    expect(lista(null, serializarPlanAntesDePagar('basico', AHORA - 30_000), 'pro')).toHaveLength(5)
  })
  it('duplicado + storage fresco de una renovacion (pro → pro) → sin lista', () => {
    expect(lista(null, serializarPlanAntesDePagar('pro', AHORA - 30_000), 'pro')).toEqual([])
  })
  it('aplicado por el retorno: manda la fila antes del RPC, aunque el storage diga otra cosa', () => {
    expect(lista('pro', serializarPlanAntesDePagar('gratis', AHORA), 'pro')).toEqual([])
    expect(lista('basico', null, 'pro')).toHaveLength(5)
  })
})
