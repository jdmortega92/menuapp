import { describe, it, expect } from 'vitest'
import { esSubidaDePlan, funcionesPorActivar } from './desbloqueos'
import { cambioPlan } from './email/templates/cambioPlan'

const nombres = (a: string | null, b: string) => funcionesPorActivar(a, b).map(f => f.nombre)

describe('funcionesPorActivar', () => {
  it('gratis → basico: lo de Básico', () => {
    expect(nombres('gratis', 'basico')).toEqual([
      'Fotos de tus platos', 'Foto de portada y logo', 'Color principal del menú', 'Sorpréndeme',
    ])
  })
  it('basico → pro: solo lo de Pro', () => {
    expect(nombres('basico', 'pro')).toEqual([
      'Combos', 'Promociones', 'Plato del día', 'Plato ganador', 'Temas y colores propios',
    ])
  })
  it('gratis → pro: todo', () => {
    expect(nombres('gratis', 'pro')).toHaveLength(9)
  })
  it('sin plan anterior cuenta como gratis', () => {
    expect(nombres(null, 'basico')).toHaveLength(4)
  })
  it.each([['pro', 'pro'], ['pro', 'basico'], ['basico', 'basico'], ['basico', 'gratis'], ['pro', 'gratis']])(
    '%s → %s no es subida: nada', (a, b) => {
      expect(funcionesPorActivar(a, b)).toEqual([])
      expect(esSubidaDePlan(a, b)).toBe(false)
    })
  it('cada una enlaza a donde se enciende', () => {
    for (const f of funcionesPorActivar('gratis', 'pro')) {
      expect(['/menu', '/menu?tab=sorprendeme', '/config?seccion=funciones', '/config?seccion=personalizacion']).toContain(f.href)
    }
  })
})

describe('correo cambioPlan: aviso de activar (CIERRE 5a)', () => {
  it('subida: incluye el aviso y el enlace a /config', () => {
    const c = cambioPlan({ plan_nuevo: 'pro', plan_anterior: 'basico', periodo_nuevo: 'mensual' })
    expect(c.text).toContain('actívalas en Configuración')
    expect(c.text).toMatch(/\/config(\s|$)/m)
    expect(c.html).toContain('/config"')
  })
  it('bajada y cambio de periodo: sin el aviso', () => {
    expect(cambioPlan({ plan_nuevo: 'gratis', plan_anterior: 'pro' }).text).not.toContain('actívalas en Configuración')
    expect(cambioPlan({ plan_nuevo: 'pro', plan_anterior: 'pro', periodo_nuevo: 'anual' }).text).not.toContain('actívalas en Configuración')
  })
})
