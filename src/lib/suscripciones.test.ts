// Pin de zona horaria ANTES de importar: las reglas son puras y TZ-independientes
// (comparan strings), y este pin lo demuestra — con TZ=UTC, que es justamente el
// huso en que corre Vercel Cron, los resultados siguen siendo los de Colombia.
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import {
  fechaCalendario,
  cambioProgramadoVencido,
  debeExpirar,
  restarDias,
  debeCobrarse,
  DIAS_ANTES_DE_COBRAR,
  type FilaCobro,
} from './suscripciones'

const HOY = '2026-07-27'

describe('fechaCalendario', () => {
  it('acepta YYYY-MM-DD pelado', () => {
    expect(fechaCalendario('2026-08-27')).toBe('2026-08-27')
  })
  it('recorta el timestamptz que devuelve Postgres', () => {
    expect(fechaCalendario('2026-08-27T00:00:00+00:00')).toBe('2026-08-27')
  })
  it.each([null, undefined, '', 'no-es-fecha', '27/08/2026', '2026-8-7'])(
    '%o -> cadena vacía',
    (entrada) => {
      expect(fechaCalendario(entrada)).toBe('')
    }
  )
  it('rechaza mes o día fuera de rango (el regex solo no basta)', () => {
    expect(fechaCalendario('2026-13-01')).toBe('')
    expect(fechaCalendario('2026-00-10')).toBe('')
    expect(fechaCalendario('2026-08-00')).toBe('')
    expect(fechaCalendario('2026-08-32')).toBe('')
  })
})

describe('cambioProgramadoVencido (barrido A: aplicar cambios agendados)', () => {
  it('fecha ANTERIOR a hoy: se aplica (corrida perdida se recupera sola)', () => {
    expect(cambioProgramadoVencido('2026-07-20', HOY)).toBe(true)
  })
  it('fecha IGUAL a hoy: se aplica (<=, no <)', () => {
    expect(cambioProgramadoVencido(HOY, HOY)).toBe(true)
  })
  it('fecha FUTURA: todavía no', () => {
    expect(cambioProgramadoVencido('2026-07-28', HOY)).toBe(false)
  })
  it('un mes atrás sigue aplicando (barrido, no "solo hoy")', () => {
    expect(cambioProgramadoVencido('2026-06-27', HOY)).toBe(true)
  })
  it('cruce de año: diciembre pasado se aplica', () => {
    expect(cambioProgramadoVencido('2025-12-31', HOY)).toBe(true)
  })
  it.each([null, undefined, '', 'basura'])('sin fecha usable (%o) no hace nada', (entrada) => {
    expect(cambioProgramadoVencido(entrada, HOY)).toBe(false)
  })
})

describe('debeExpirar (barrido B: expirar planes pagos)', () => {
  it('venció ayer: expira', () => {
    expect(debeExpirar('pro', '2026-07-26', HOY)).toBe(true)
  })
  it('vence HOY: NO expira todavía (el día del vencimiento es del usuario)', () => {
    expect(debeExpirar('pro', HOY, HOY)).toBe(false)
  })
  it('vence mañana: no expira', () => {
    expect(debeExpirar('pro', '2026-07-28', HOY)).toBe(false)
  })
  it('básico también expira', () => {
    expect(debeExpirar('basico', '2026-07-01', HOY)).toBe(true)
  })
  it('gratis nunca expira (no hay nada que quitar)', () => {
    expect(debeExpirar('gratis', '2020-01-01', HOY)).toBe(false)
  })
  it('sin plan_expira NO se expira (mejor un plan de más que quitar lo pagado)', () => {
    expect(debeExpirar('pro', null, HOY)).toBe(false)
    expect(debeExpirar('pro', undefined, HOY)).toBe(false)
  })
  it('plan_expira malformado NO expira', () => {
    expect(debeExpirar('pro', '2026-13-01', HOY)).toBe(false)
    expect(debeExpirar('pro', 'basura', HOY)).toBe(false)
  })
  it('sin plan (fila incompleta) no expira', () => {
    expect(debeExpirar(null, '2020-01-01', HOY)).toBe(false)
    expect(debeExpirar(undefined, '2020-01-01', HOY)).toBe(false)
  })

  // El bug que este modulo existe para evitar: si "hoy" se calculara con el
  // reloj UTC del servidor, entre 00:00 y 04:59 UTC seria ya el dia siguiente en
  // Colombia y un plan que vence HOY se expiraria un dia antes.
  it('un plan que vence hoy sobrevive aunque el día UTC ya haya avanzado', () => {
    const hoyCot = '2026-07-27' // 2026-07-28T03:00Z en COT sigue siendo el 27
    expect(debeExpirar('pro', '2026-07-27', hoyCot)).toBe(false)
    // Con el día UTC (28) se habría expirado: eso es exactamente lo prohibido.
    expect(debeExpirar('pro', '2026-07-27', '2026-07-28')).toBe(true)
  })
})

describe('restarDias', () => {
  it('resta dentro del mismo mes', () => {
    expect(restarDias('2026-07-27', 3)).toBe('2026-07-24')
  })
  it('cruza el inicio de mes', () => {
    expect(restarDias('2026-07-02', 3)).toBe('2026-06-29')
  })
  it('cruza el inicio de año', () => {
    expect(restarDias('2026-01-02', 3)).toBe('2025-12-30')
  })
  it('cae en un 29 de febrero bisiesto sin inventar el 30', () => {
    expect(restarDias('2028-03-01', 1)).toBe('2028-02-29')
    expect(restarDias('2027-03-01', 1)).toBe('2027-02-28')
  })
  it('restar 0 es la identidad', () => {
    expect(restarDias('2026-07-27', 0)).toBe('2026-07-27')
  })
  it('mantiene el zero-padding (no "2026-7-4")', () => {
    expect(restarDias('2026-07-07', 3)).toBe('2026-07-04')
  })
  it.each([null, undefined, '', 'basura', '2026-13-01'])('sin fecha usable (%o) -> vacío', (entrada) => {
    expect(restarDias(entrada, 3)).toBe('')
  })
})

// ── debeCobrarse: la regla que mueve plata ──
// Cada test de abajo nombra un caso en el que cobrar seria un error caro, no un
// bug de estado. Se parte de una fila que SI se cobra y se rompe UNA cosa a la
// vez: asi ningun test pasa por accidente porque otra condicion ya bloqueaba.
describe('debeCobrarse (barrido C: cobro automatico)', () => {
  // Vence en 3 dias exactos: el primer dia de la ventana con N=3.
  const EXPIRA = '2026-07-30'
  const base: FilaCobro = {
    plan: 'pro',
    periodo_plan: 'mensual',
    plan_expira: EXPIRA,
    cobro_automatico: true,
    plan_programado: null,
    fuente: {
      estado: 'AVAILABLE',
      predeterminada: true,
      wompi_payment_source_id: 357841,
      ultimo_cobro_periodo: null,
    },
  }

  it('la fila completa y en ventana SÍ se cobra', () => {
    expect(debeCobrarse(base, HOY)).toBe(true)
  })

  it('N es 3 (si esto cambia, cambia el colchón ante un fallo)', () => {
    expect(DIAS_ANTES_DE_COBRAR).toBe(3)
  })

  describe('opt-in', () => {
    it('sin cobro_automatico NO se cobra', () => {
      expect(debeCobrarse({ ...base, cobro_automatico: false }, HOY)).toBe(false)
    })
    it('cobro_automatico ausente (fila vieja) NO es un sí', () => {
      expect(debeCobrarse({ ...base, cobro_automatico: undefined }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, cobro_automatico: null }, HOY)).toBe(false)
    })
  })

  describe('plan y periodo', () => {
    it('gratis nunca se cobra', () => {
      expect(debeCobrarse({ ...base, plan: 'gratis' }, HOY)).toBe(false)
    })
    it('básico también se cobra', () => {
      expect(debeCobrarse({ ...base, plan: 'basico' }, HOY)).toBe(true)
    })
    it('un plan desconocido NO se cobra (no se puede tarifar)', () => {
      expect(debeCobrarse({ ...base, plan: 'enterprise' }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, plan: null }, HOY)).toBe(false)
    })
    it('anual se cobra igual', () => {
      expect(debeCobrarse({ ...base, periodo_plan: 'anual' }, HOY)).toBe(true)
    })
    it('un periodo raro NO se cobra: se tarificaría como mensual en silencio', () => {
      expect(debeCobrarse({ ...base, periodo_plan: 'semestral' }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, periodo_plan: null }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, periodo_plan: undefined }, HOY)).toBe(false)
    })
  })

  // EL TEST QUE JUSTIFICA TODO EL MODULO: quien canceló no se cobra, y no
  // depende del orden de los barridos del cron.
  describe('cancelación pendiente', () => {
    it('con plan_programado NO se cobra, aunque todo lo demás califique', () => {
      expect(debeCobrarse({ ...base, plan_programado: 'gratis' }, HOY)).toBe(false)
    })
    it('tampoco con una bajada a otro plan pago agendada', () => {
      expect(debeCobrarse({ ...base, plan_programado: 'basico' }, HOY)).toBe(false)
    })
    it('plan_programado vacío o null no bloquea (es la fila normal)', () => {
      expect(debeCobrarse({ ...base, plan_programado: '' }, HOY)).toBe(true)
      expect(debeCobrarse({ ...base, plan_programado: undefined }, HOY)).toBe(true)
    })
  })

  describe('fuente de pago', () => {
    it('sin fuente NO se cobra', () => {
      expect(debeCobrarse({ ...base, fuente: null }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, fuente: undefined }, HOY)).toBe(false)
    })
    it.each(['PENDING', 'ERROR', 'VOIDED'])('una fuente %s NO se cobra', (estado) => {
      expect(debeCobrarse({ ...base, fuente: { ...base.fuente, estado } }, HOY)).toBe(false)
    })
    it('una fuente que no es la predeterminada NO se cobra', () => {
      expect(debeCobrarse({ ...base, fuente: { ...base.fuente, predeterminada: false } }, HOY)).toBe(false)
    })
    it('sin payment_source_id numérico NO se cobra (no hay contra qué cobrar)', () => {
      expect(debeCobrarse({ ...base, fuente: { ...base.fuente, wompi_payment_source_id: null } }, HOY)).toBe(false)
      // Un id que llegue como string tampoco pasa: Wompi lo quiere numérico.
      expect(
        debeCobrarse(
          { ...base, fuente: { ...base.fuente, wompi_payment_source_id: '357841' as unknown as number } },
          HOY
        )
      ).toBe(false)
    })
  })

  describe('ventana de cobro', () => {
    it('4 días antes todavía NO (fuera de la ventana)', () => {
      expect(debeCobrarse(base, '2026-07-26')).toBe(false)
    })
    it('exactamente 3 días antes: primer día que cobra', () => {
      expect(debeCobrarse(base, '2026-07-27')).toBe(true)
    })
    it('2 y 1 día antes siguen cobrando (una corrida perdida se recupera)', () => {
      expect(debeCobrarse(base, '2026-07-28')).toBe(true)
      expect(debeCobrarse(base, '2026-07-29')).toBe(true)
    })
    it('el DÍA del vencimiento es la última oportunidad, no un error', () => {
      expect(debeCobrarse(base, EXPIRA)).toBe(true)
    })
    it('ya vencido NO se cobra: eso lo resuelve el barrido de expiración', () => {
      expect(debeCobrarse(base, '2026-07-31')).toBe(false)
    })
    it('la ventana funciona cruzando el fin de mes', () => {
      const fila = { ...base, plan_expira: '2026-08-01' }
      expect(debeCobrarse(fila, '2026-07-28')).toBe(false)
      expect(debeCobrarse(fila, '2026-07-29')).toBe(true)
      expect(debeCobrarse(fila, '2026-08-01')).toBe(true)
    })
    it('sin plan_expira o con fecha malformada NO se cobra', () => {
      expect(debeCobrarse({ ...base, plan_expira: null }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, plan_expira: '2026-13-01' }, HOY)).toBe(false)
      expect(debeCobrarse({ ...base, plan_expira: 'basura' }, HOY)).toBe(false)
    })
    it('acepta el timestamptz que devuelve Postgres', () => {
      expect(debeCobrarse({ ...base, plan_expira: `${EXPIRA}T00:00:00+00:00` }, HOY)).toBe(true)
    })
  })

  describe('latch por periodo (anti doble cobro)', () => {
    it('ya intentado para ESTE plan_expira: no se vuelve a intentar', () => {
      const fila = { ...base, fuente: { ...base.fuente, ultimo_cobro_periodo: EXPIRA } }
      expect(debeCobrarse(fila, HOY)).toBe(false)
      // Y sigue bloqueado todos los días restantes de la ventana: sin escalera
      // de reintentos (F4-DECISIONES).
      expect(debeCobrarse(fila, '2026-07-29')).toBe(false)
      expect(debeCobrarse(fila, EXPIRA)).toBe(false)
    })
    it('el latch del periodo ANTERIOR no bloquea el siguiente', () => {
      const fila = { ...base, fuente: { ...base.fuente, ultimo_cobro_periodo: '2026-06-30' } }
      expect(debeCobrarse(fila, HOY)).toBe(true)
    })
    it('compara por fecha calendario, no por string crudo', () => {
      const fila = { ...base, fuente: { ...base.fuente, ultimo_cobro_periodo: `${EXPIRA}T00:00:00+00:00` } }
      expect(debeCobrarse(fila, HOY)).toBe(false)
    })
  })

  it('una fila vacía no cobra nada (fail-closed)', () => {
    expect(debeCobrarse({}, HOY)).toBe(false)
  })
})
