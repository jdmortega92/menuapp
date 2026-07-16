'use client'

import React, { useState, useEffect } from 'react'
import { Lock, ChevronDown, Eye, Utensils, MessageCircle, Star, Filter, BarChart2, CalendarDays, TrendingUp, TrendingDown, EyeOff, Download } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { fechaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { PLANES } from '@/lib/planes'
import { useDashboardStats } from '@/hooks/data/useDashboardStats'
import { useDashboardLifetime } from '@/hooks/data/useDashboardLifetime'
import { useDashboardAlertas } from '@/hooks/data/useDashboardAlertas'
import BottomNav from '@/components/BottomNav'

// ── Fuentes únicas compartidas render ↔ PDF (deuda dirigida AUDIT-DASH) ──
// Escala de intensidad del heatmap: umbrales y colores viven SOLO aquí
// (los consumen la grilla del render, la leyenda, el teaser y el PDF).
const NIVELES_HEATMAP = [
  { min: 0.75, bg: '#E85D24', texto: '#FFFFFF', destacado: true },  // Intenso
  { min: 0.5, bg: '#F5925A', texto: '#FFFFFF', destacado: true },   // Alto
  { min: 0.25, bg: '#F9B27D', texto: '#7A3310', destacado: false }, // Medio
  { min: 0, bg: '#FDE8D9', texto: '#7A3310', destacado: false },    // Bajo
]

// null cuando la celda no tiene visitas: cada superficie pinta su propio vacío.
function nivelHeatmap(valor: number, max: number) {
  if (valor <= 0 || max <= 0) return null
  const ratio = valor / max
  return NIVELES_HEATMAP.find(n => ratio >= n.min) ?? NIVELES_HEATMAP[NIVELES_HEATMAP.length - 1]
}

// Antigüedad de un plato sin vistas (en minúsculas; el PDF capitaliza la inicial).
function etiquetaAntiguedad(diasCreado: number): string {
  if (diasCreado === 0) return 'hoy'
  if (diasCreado === 1) return 'hace 1 día'
  if (diasCreado < 30) return `hace ${diasCreado} días`
  if (diasCreado < 60) return 'hace 1 mes'
  return `hace ${Math.floor(diasCreado / 30)} meses`
}

// ── Piezas visuales del restyle (DASHBOARD-VISUAL, mockups del fundador) ──
// EncabezadoSeccion: patron uniforme de encabezado de widget — icono en burbuja
// naranja suave (--color-accent-light; neutra en cards bloqueadas), titulo +
// subtitulo, y slot derecho: pill neutra de contexto (periodo, top N, dia x
// hora) o un nodo custom (candado, badge Pro). Solo presentacion — cero datos.
function EncabezadoSeccion({ icono, titulo, subtitulo, pill, derecha, neutro, style }: {
  icono: LucideIcon
  titulo: string
  subtitulo?: string
  pill?: string
  derecha?: React.ReactNode
  neutro?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', ...style }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
        background: neutro ? 'var(--bg-tertiary)' : 'var(--color-accent-light)',
        color: neutro ? 'var(--text-tertiary)' : 'var(--color-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icono icono={icono} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px', lineHeight: 1.4 }}>{subtitulo}</div>}
      </div>
      {pill && (
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {pill}
        </span>
      )}
      {derecha}
    </div>
  )
}

// Sparkline minimalista (linea naranja fina, sin ejes): tendencia con los dias
// PASADOS del periodo. Devuelve null con menos de 2 puntos (periodo 'hoy').
// Solo la tarjeta de Visitas tiene serie por dia en los hooks (visitasDia);
// platos vistos y pedidos quedan sin sparkline hasta ampliar el fetch (BL.35).
function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null
  const max = Math.max(...valores, 1)
  const puntos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * 100},${22 - (v / max) * 18}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"
      style={{ width: '100%', height: '24px', display: 'block', marginTop: '8px' }}>
      <polyline points={puntos} fill="none" stroke="var(--color-accent)" strokeWidth="1.5"
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [mostrarFiltro, setMostrarFiltro] = useState(false)
  const [filtroTiempo, setFiltroTiempo] = useState<'hoy' | 'semana' | 'mes'>('semana')

  // Datos reales de Supabase
  const { usuario, restaurante: rest, cargando } = useAuth()
  const plan = (rest?.plan || 'gratis') as 'gratis' | 'basico' | 'pro'
  const restaurante = {
    nombre: rest?.nombre || 'Mi restaurante',
    iniciales: rest?.nombre ? rest.nombre.split(' ').map((w: any) => w[0]).join('').slice(0, 2).toUpperCase() : 'MR',
    plan: plan,
  }

  

  // ── Lecturas vía SWR (Refactor Fase 4). `filtroTiempo` re-keya el bundle de stats;
  //    lifetime (calificaciones) y alertas son independientes del periodo. ──
  const { data: statsData, isLoading: statsCargando } = useDashboardStats(rest?.id, filtroTiempo)
  const { data: lifetimeData, isLoading: lifetimeCargando } = useDashboardLifetime(rest?.id)
  const { data: alertasData, isLoading: alertasCargando } = useDashboardAlertas(rest?.id, plan)

  // ── Derivaciones post-fetch. Código VERBATIM del antiguo cargarStats: lo único que
  //    cambió es el ORIGEN de las filas (hooks SWR en vez de supabase.from() inline) y
  //    que cada setX(...) ahora es un valor devuelto. Ninguna fórmula/guardia cambió.
  const derivados = React.useMemo(() => {
    if (!statsData) {
      return {
        stats: { escaneos: 0, visitas: 0, pedidosWhatsapp: 0, calificacion: 0, totalResenas: 0, sesionesMenu: 0, sesionesPlato: 0, sesionesPedido: 0 },
        statsAnterior: { escaneos: 0, visitas: 0, pedidosWhatsapp: 0 },
        platosMasVistos: [] as any[],
        platosInteresBajo: [] as any[],
        platosSinVistas: [] as any[],
        horariosPico: [] as any[],
        escaneosPorDia: [] as any[],
        resenas: [] as any[],
        alertas: [] as any[],
        heatmapData: null as any,
      }
    }

    const hoy = new Date()
    const { desde, hasta, lunesSemana, hoyStr } = statsData.window

    // Filas crudas (antes lecturas supabase inline en cargarStats)
    const visitas = statsData.visitasCount
    const pedidos = statsData.pedidosCount
    const calData = lifetimeData?.calData ?? null
    const vistasData = statsData.vistasData
    const platosInfo = statsData.platosInfo
    const visitasHora = statsData.visitasHora
    const visitasDia = statsData.visitasDia
    const resenasData = lifetimeData?.resenasData ?? null
    const visitasAnt = statsData.visitasAntCount
    const vistasPlatosAnt = statsData.vistasPlatosAntCount
    const pedidosAnt = statsData.pedidosAntCount

    // ===== Embudo por sesión ===== (verbatim)
    const setMenu = new Set((statsData.sesMenuRows ?? []).map((r: any) => r.session_id))
    const setPlato = new Set((statsData.sesPlatoRows ?? []).map((r: any) => r.session_id))
    const setPedido = new Set((statsData.sesPedidoRows ?? []).map((r: any) => r.session_id))
    const sesionesMenu = setMenu.size
    const sesionesPlato = [...setPlato].filter((id: any) => setMenu.has(id)).length
    const sesionesPedido = [...setPedido].filter((id: any) => setMenu.has(id)).length

    // Calificación promedio (verbatim)
    let promedio = 0
    if (calData && calData.length > 0) {
      promedio = Math.round((calData.reduce((sum: number, c: any) => sum + c.estrellas, 0) / calData.length) * 10) / 10
    }

    // Ids de platos actuales + titular reconciliado + rankings (verbatim)
    const currentPlatoIds = (platosInfo ?? []).map((p: any) => p.id)
    let vistasPlatosCurrent = 0
    let platosMasVistos: any[] = []
    let platosInteresBajo: any[] = []
    let platosSinVistas: any[] = []
    if (platosInfo && platosInfo.length > 0) {
      const conteo: Record<string, number> = {}
      if (vistasData) {
        vistasData.forEach((v: any) => { conteo[v.plato_id] = (conteo[v.plato_id] || 0) + 1 })
      }
      vistasPlatosCurrent = currentPlatoIds.reduce((s: number, id: any) => s + (conteo[id] || 0), 0)

      const desdePeriodo = new Date(desde + 'T00:00:00')

      const platosConVistas = platosInfo
        .filter((p: any) => conteo[p.id])
        .map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          vistas: conteo[p.id],
          created_at: p.created_at,
        }))
        .sort((a: any, b: any) => b.vistas - a.vistas)

      platosMasVistos = platosConVistas.slice(0, 5)

      let interesBajo: any[] = []
      if (platosConVistas.length >= 6) {
        const promedio = platosConVistas.reduce((sum: number, p: any) => sum + p.vistas, 0) / platosConVistas.length
        const corteMinimo = Math.floor(platosConVistas.length * 0.7) // Último 30%
        interesBajo = platosConVistas
          .slice(corteMinimo)
          .filter((p: any) => p.vistas < promedio)
          .slice(0, 5)
      }
      platosInteresBajo = interesBajo

      const sinVistasPeriodo = platosInfo
        .filter((p: any) => !conteo[p.id])
        .filter((p: any) => {
          const createdAt = new Date(p.created_at)
          return createdAt < desdePeriodo
        })
        .map((p: any) => {
          const createdAt = new Date(p.created_at)
          const diasCreado = Math.floor((hoy.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
          return {
            id: p.id,
            nombre: p.nombre,
            created_at: p.created_at,
            diasCreado,
          }
        })
        .sort((a: any, b: any) => b.diasCreado - a.diasCreado) // Más viejos primero
        .slice(0, 5)
      platosSinVistas = sinVistasPeriodo
    }

    // Horarios pico + Heatmap día × hora (verbatim)
    let horariosPico: any[] = []
    let heatmapData: any = null
    if (visitasHora && visitasHora.length > 0) {
      // Ajuste a hora de Colombia (UTC-5)
      function horaColombia(timestamp: string): number {
        const fecha = new Date(timestamp)
        const utcMs = fecha.getTime() + fecha.getTimezoneOffset() * 60 * 1000
        const colMs = utcMs - 5 * 60 * 60 * 1000
        return new Date(colMs).getHours()
      }
      function diaColombia(timestamp: string): number {
        const fecha = new Date(timestamp)
        const utcMs = fecha.getTime() + fecha.getTimezoneOffset() * 60 * 1000
        const colMs = utcMs - 5 * 60 * 60 * 1000
        return new Date(colMs).getDay()
      }

      // ===== Horarios pico (lista simple) =====
      const porHora: Record<number, number> = {}
      visitasHora.forEach((v: any) => {
        const hora = horaColombia(v.created_at)
        porHora[hora] = (porHora[hora] || 0) + 1
      })
      const listaHoras = Object.entries(porHora)
        .map(([hora, cantidad]) => ({
          rango: `${parseInt(hora)}:00 — ${parseInt(hora) + 1}:00`,
          escaneos: cantidad,
        }))
        .sort((a: any, b: any) => b.escaneos - a.escaneos)
        .slice(0, 3)
      horariosPico = listaHoras

      // ===== Matriz heatmap 8 bloques × 7 días =====
      const matriz: number[][] = Array(8).fill(0).map(() => Array(7).fill(0))

      visitasHora.forEach((v: any) => {
        const hora = horaColombia(v.created_at)
        const diaJS = diaColombia(v.created_at)
        const diaMatriz = diaJS === 0 ? 6 : diaJS - 1 // lunes = 0, domingo = 6

        // Calcular bloque dividiendo la hora entre 3 (0-2 → 0, 3-5 → 1, etc.)
        const bloqueHora = Math.floor(hora / 3)

        if (bloqueHora >= 0 && bloqueHora < 8) matriz[bloqueHora][diaMatriz]++
      })

      // Encontrar el máximo para escalar colores
      let maxCelda = 0
      matriz.forEach(fila => fila.forEach(v => { if (v > maxCelda) maxCelda = v }))

      // Encontrar pico y valle
      let pico = { dia: -1, bloque: -1, valor: 0 }
      let totalVisitas = 0
      matriz.forEach((fila, b) => {
        fila.forEach((v, d) => {
          totalVisitas += v
          if (v > pico.valor) pico = { dia: d, bloque: b, valor: v }
        })
      })

      // Detectar día completamente muerto (de los 7 días del periodo)
      const visitasPorDia: number[] = Array(7).fill(0)
      matriz.forEach(fila => fila.forEach((v, d) => { visitasPorDia[d] += v }))
      const diasMuertos: number[] = []
      visitasPorDia.forEach((v, d) => { if (v === 0) diasMuertos.push(d) })

      // Solo mostrar el heatmap si hay suficientes datos (>= 20 visitas)
      const hayDatosSuficientes = totalVisitas >= 20

      heatmapData = {
        matriz,
        maxCelda,
        totalVisitas,
        pico,
        diasMuertos,
        hayDatosSuficientes,
      }
    } else {
      horariosPico = []
      heatmapData = null
    }

    // Visitas por día con fechas reales (verbatim)
    const diasCortos = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
    // "Hoy" de la MISMA ventana del fetch: flags esHoy/esFuturo siempre consistentes
    // con las filas (una Date fresca aqui divergiria si el memo re-corre sin refetch,
    // p.ej. cruce de medianoche COT con keepPreviousData).
    const hoyComparar = hoyStr

    const diasConFecha: any[] = []
    if (filtroTiempo === 'semana') {
      for (let i = 0; i < 7; i++) {
        const fecha = new Date(lunesSemana)
        fecha.setDate(lunesSemana.getDate() + i)
        const fechaStr = fechaColombia(fecha)
        diasConFecha.push({
          dia: diasCortos[fecha.getDay()],
          numero: fecha.getDate(),
          fecha: fechaStr,
          actual: 0,
          esFuturo: fechaStr > hoyComparar,
          esHoy: fechaStr === hoyComparar,
        })
      }
    } else {
      // Iterar desde..hasta inclusive. Ancla a mediodía local para que el ajuste
      // COT (-5h) de fechaColombia no cruce el límite de día.
      const start = new Date(desde + 'T12:00:00')
      const end = new Date(hasta + 'T12:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const fechaStr = fechaColombia(d)
        diasConFecha.push({
          dia: diasCortos[d.getDay()],
          numero: d.getDate(),
          fecha: fechaStr,
          actual: 0,
          esFuturo: fechaStr > hoyComparar,
          esHoy: fechaStr === hoyComparar,
        })
      }
    }

    // Llenar con datos reales
    if (visitasDia && visitasDia.length > 0) {
      const porFechaConteo: Record<string, number> = {}
      visitasDia.forEach((v: any) => {
        porFechaConteo[v.fecha] = (porFechaConteo[v.fecha] || 0) + 1
      })
      diasConFecha.forEach((d: any) => {
        d.actual = porFechaConteo[d.fecha] || 0
      })
    }

    const escaneosPorDia = diasConFecha

    // Últimas reseñas (verbatim)
    let resenas: any[] = []
    if (resenasData && resenasData.length > 0) {
      resenas = resenasData.map((r: any) => ({
        plato: r.platos?.nombre || 'Plato',
        estrellas: r.estrellas,
        comentario: r.comentario || '',
        tiempo: new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
      }))
    } else {
      resenas = []
    }

    // Mejor y peor día: mejorDia/peorDia eran ESTADO MUERTO (nunca se renderizaban —
    // render y PDF recomputan mejorDiaSemana/mejorDiaResumen aparte). Se conserva SOLO
    // el efecto observable del else (reset de platos) para no cambiar el output cuando
    // no hay visitas-día.
    if (!(visitasDia && visitasDia.length > 0)) {
      platosMasVistos = []
      platosInteresBajo = []
      platosSinVistas = []
    }

    // Periodo anterior (verbatim)
    const statsAnterior = {
      escaneos: visitasAnt || 0,
      visitas: vistasPlatosAnt || 0,
      pedidosWhatsapp: pedidosAnt || 0,
    }

    // ===== Detección de alertas ===== (verbatim; conteos/filas vienen del hook)
    const nuevasAlertas: any[] = []

    // Alerta 1: Sin visitas en últimos 3 días
    const visitasUltimos3 = alertasData?.visitasUltimos3 ?? 0
    if ((visitasUltimos3 || 0) === 0) {
      const totalVisitasHist = alertasData?.totalVisitasHist ?? 0
      if ((totalVisitasHist || 0) > 0) {
        nuevasAlertas.push({
          id: 'sin-visitas',
          tipo: 'advertencia',
          titulo: 'Sin visitas recientes',
          mensaje: 'No has recibido visitas en los últimos 3 días. Comparte tu QR o enlace en redes sociales.',
          accion: { texto: 'Ver mi QR', href: '/qr' },
        })
      }
    }

    // Alerta 2: Menú sin actualizar hace más de 30 días
    const ultimoPlato = alertasData?.ultimoPlato ?? null
    if (ultimoPlato && ultimoPlato.length > 0) {
      const ultimaActualizacion = new Date(ultimoPlato[0].updated_at)
      const diasSinActualizar = Math.floor((hoy.getTime() - ultimaActualizacion.getTime()) / (24 * 60 * 60 * 1000))

      if (diasSinActualizar > 30) {
        nuevasAlertas.push({
          id: 'menu-viejo',
          tipo: 'info',
          titulo: 'Menú sin actualizar',
          mensaje: `No actualizas tu menú hace ${diasSinActualizar} días. Los comensales valoran la frescura del contenido.`,
          accion: { texto: 'Actualizar menú', href: '/menu' },
        })
      }
    }

    // Alerta 3: Platos agotados sin desmarcar
    const platosAgotados = alertasData?.platosAgotados ?? null
    if (platosAgotados && platosAgotados.length > 0) {
      // Solo alertar si llevan más de 3 días agotados
      const agotadosViejos = platosAgotados.filter((p: any) => {
        const actualizado = new Date(p.updated_at)
        const diasAgotado = Math.floor((hoy.getTime() - actualizado.getTime()) / (24 * 60 * 60 * 1000))
        return diasAgotado >= 3
      })

      if (agotadosViejos.length > 0) {
        nuevasAlertas.push({
          id: 'platos-agotados',
          tipo: 'advertencia',
          titulo: `${agotadosViejos.length} plato${agotadosViejos.length > 1 ? 's' : ''} agotado${agotadosViejos.length > 1 ? 's' : ''}`,
          mensaje: `Tienes platos marcados como agotados hace más de 3 días. Si ya los tienes disponibles, desmárcalos.`,
          accion: { texto: 'Ver menú', href: '/menu' },
        })
      }
    }

    // Alerta 4: Plan gratis con alta actividad
    if (plan === 'gratis') {
      const visitasMes = alertasData?.visitasMes ?? 0
      if ((visitasMes || 0) >= 50) {
        nuevasAlertas.push({
          id: 'upgrade-sugerido',
          tipo: 'oportunidad',
          titulo: 'Tu menú está funcionando',
          mensaje: `Llevas ${visitasMes} visitas este mes. Con Plan Básico ves platos más vistos, embudo de conversión y más.`,
          accion: { texto: 'Ver planes', href: '/suscripcion' },
        })
      }
    }

    const alertas = nuevasAlertas

    // ===== stats ===== (verbatim)
    const stats = {
      escaneos: visitas || 0,
      visitas: vistasPlatosCurrent,
      pedidosWhatsapp: pedidos || 0,
      calificacion: promedio,
      totalResenas: calData?.length || 0,
      sesionesMenu,
      sesionesPlato,
      sesionesPedido,
    }

    return { stats, statsAnterior, platosMasVistos, platosInteresBajo, platosSinVistas, horariosPico, escaneosPorDia, resenas, alertas, heatmapData }
  }, [statsData, lifetimeData, alertasData, filtroTiempo, plan])

  const { stats, statsAnterior, platosMasVistos, platosInteresBajo, platosSinVistas, horariosPico, escaneosPorDia, resenas, alertas, heatmapData } = derivados

  const esBasico = plan === 'basico' || plan === 'pro'
  // CONTRATO DE INVOCACIÓN: esta función referencia consts declaradas MÁS ABAJO
  // en el componente (esPro, contextoTemporal, labelAnterior, varEscaneos,
  // varVisitas, varPedidos, embudoData, mejorDia). Es segura frente a TDZ SOLO
  // porque se invoca al hacer click (post-render): no llamarla durante el render
  // ni convertirla en efecto de montaje.
  async function generarReportePDF() {
    const jsPDF = (await import('jspdf')).default
    const autoTable = (await import('jspdf-autotable')).default

    // Layout mobile-first sobre A4 vertical: una sola columna, tipografía grande
    // (nada por debajo de 11pt) y varias páginas si hace falta. El reporte se lee
    // en el teléfono a "ajustar al ancho": legibilidad antes que densidad.
    const doc = new jsPDF('p', 'mm', 'a4')
    const ancho = doc.internal.pageSize.getWidth()
    const alto = doc.internal.pageSize.getHeight()
    const margen = 15
    const anchoUtil = ancho - margen * 2
    const margenInferior = 26 // reserva del footer en todas las páginas
    let y = 0

    // ===== PALETA DE MARCA MENUAPP =====
    const CREMA: [number, number, number] = [253, 251, 247]           // Fondo cálido
    const CREMA_OSCURO: [number, number, number] = [245, 239, 230]    // Superficies
    const CREMA_MEDIO: [number, number, number] = [251, 247, 240]     // Filas alternas
    const NARANJA: [number, number, number] = [232, 93, 36]           // Acento marca
    const NARANJA_CLARO: [number, number, number] = [255, 247, 232]   // Fondo advertencia
    const NARANJA_TEXTO: [number, number, number] = [138, 91, 15]     // Texto sobre naranja claro
    const NARANJA_BORDE: [number, number, number] = [232, 148, 32]    // Borde advertencia

    const TEXTO: [number, number, number] = [42, 37, 35]              // Marrón oscuro cálido
    const TEXTO_SEC: [number, number, number] = [139, 125, 112]       // Gris cálido
    const TEXTO_TER: [number, number, number] = [168, 155, 142]       // Gris cálido claro
    const BORDE: [number, number, number] = [229, 220, 208]           // Borde cálido
    const BORDE_SUAVE: [number, number, number] = [237, 228, 215]     // Separadores

    const VERDE_EXITO: [number, number, number] = [16, 131, 74]       // Verde cálido
    const VERDE_FONDO: [number, number, number] = [236, 246, 235]
    const VERDE_TEXTO: [number, number, number] = [36, 85, 40]

    const ROJO_PELIGRO: [number, number, number] = [194, 59, 59]      // Rojo cálido
    const ROJO_FONDO: [number, number, number] = [253, 237, 236]
    const ROJO_TEXTO: [number, number, number] = [107, 53, 53]

    const AZUL_INFO: [number, number, number] = [55, 112, 180]
    const AZUL_FONDO: [number, number, number] = [234, 242, 250]
    const AZUL_TEXTO: [number, number, number] = [36, 73, 120]

    // ===== FONDO DE PÁGINA =====
    function pintarFondo() {
      doc.setFillColor(...CREMA)
      doc.rect(0, 0, ancho, alto, 'F')
    }
    // autoTable agrega páginas por su cuenta cuando una tabla larga no cabe
    // (p. ej. actividad por día en 'mes'): se envuelve addPage para que TODA
    // página nueva nazca con el fondo crema, sin importar quién la cree.
    const addPageOriginal = doc.addPage.bind(doc)
    ;(doc as any).addPage = (...args: any[]) => {
      const resultado = (addPageOriginal as any)(...args)
      pintarFondo()
      return resultado
    }
    pintarFondo()

    // Salto de página si lo que viene no cabe. Se pide título + primer bloque
    // juntos para no dejar encabezados huérfanos al pie de página.
    function asegurarEspacio(alturaMinima: number) {
      if (y + alturaMinima > alto - margenInferior) {
        doc.addPage()
        y = 20
      }
    }

    // Título de sección (16pt) con subtítulo opcional (11pt)
    function tituloSeccion(texto: string, subtitulo?: string) {
      doc.setTextColor(...TEXTO)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(texto, margen, y)
      if (subtitulo) {
        doc.setTextColor(...TEXTO_SEC)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        const lineas = doc.splitTextToSize(subtitulo, anchoUtil)
        doc.text(lineas, margen, y + 6)
        y += 6 + lineas.length * 5
      } else {
        y += 6
      }
    }

    // ===== HEADER CON MARCA =====
    y = 24

    // Logo "MenuApp" con "App" en naranja
    doc.setTextColor(...TEXTO)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('Menu', margen, y)
    const anchoMenu = doc.getTextWidth('Menu')
    doc.setTextColor(...NARANJA)
    doc.text('App', margen + anchoMenu, y)

    // Etiqueta debajo del logo
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('REPORTE DE ESTADÍSTICAS', margen, y + 7)

    // Info del periodo a la derecha
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(11)
    doc.text(contextoTemporal.titulo.toUpperCase(), ancho - margen, y - 8, { align: 'right' })

    doc.setTextColor(...TEXTO)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(contextoTemporal.rango, ancho - margen, y, { align: 'right' })

    if (contextoTemporal.progreso) {
      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(contextoTemporal.progreso, ancho - margen, y + 7, { align: 'right' })
    }

    // Línea naranja separadora
    y += 13
    doc.setDrawColor(...NARANJA)
    doc.setLineWidth(0.8)
    doc.line(margen, y, ancho - margen, y)

    y += 12

    // ===== NOMBRE DEL RESTAURANTE =====
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('Restaurante', margen, y)

    y += 8
    doc.setTextColor(...TEXTO)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    const lineasNombre = doc.splitTextToSize(restaurante.nombre, anchoUtil)
    doc.text(lineasNombre, margen, y)
    y += (lineasNombre.length - 1) * 8

    // Fecha de generación
    const fechaGen = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.setTextColor(...TEXTO_TER)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generado ${fechaGen}`, margen, y + 7)

    y += 17

    // ===== RESUMEN EJECUTIVO =====
    // Línea 1: visitas con variación coloreada
    const textoInicio1 = `Recibiste ${stats.escaneos} visitas al menú`
    const textoVar = varEscaneos.valor !== 0 && statsAnterior.escaneos > 0
      ? ` (${varEscaneos.valor > 0 ? '+' : '−'}${Math.abs(varEscaneos.valor)}% vs ${labelAnterior})`
      : ''

    // Línea 2: diagnóstico del embudo — MISMA fuente que el render
    // (diagnostico.mensaje); antes el PDF reconstruía el texto desde .tipo
    // y la redacción ya había divergido (AUDIT-DASH).
    const lineaResumen2 = esPro && embudoData.visitasMenu > 0
      ? embudoData.diagnostico.mensaje
      : `Total de pedidos por WhatsApp: ${stats.pedidosWhatsapp}.`

    // Línea 3: mejor día — const `mejorDia` compartida con el render
    const lineaResumen3 = mejorDia
      ? `Mejor día: ${mejorDia.dia} ${mejorDia.numero} con ${mejorDia.actual} visitas.${horariosPico[0] ? ` Horario pico: ${horariosPico[0].rango}.` : ''}`
      : 'Aún no hay suficientes datos para identificar patrones diarios.'

    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    const anchoTextoResumen = anchoUtil - 14
    const lineasResumen2 = doc.splitTextToSize(lineaResumen2, anchoTextoResumen)
    const lineasResumen3 = doc.splitTextToSize(lineaResumen3, anchoTextoResumen)
    const interlineado = 6.5
    const totalLineasResumen = 1 + lineasResumen2.length + lineasResumen3.length
    const alturaResumen = 18 + totalLineasResumen * interlineado

    doc.setFillColor(...CREMA_OSCURO)
    doc.roundedRect(margen, y, anchoUtil, alturaResumen, 2, 2, 'F')

    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('RESUMEN EJECUTIVO', margen + 7, y + 9)

    let yResumen = y + 18
    doc.setTextColor(...TEXTO)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.text(textoInicio1, margen + 7, yResumen)
    if (textoVar) {
      const anchoInicio1 = doc.getTextWidth(textoInicio1)
      doc.setTextColor(...(varEscaneos.valor > 0 ? VERDE_EXITO : ROJO_PELIGRO))
      doc.setFont('helvetica', 'bold')
      doc.text(textoVar, margen + 7 + anchoInicio1, yResumen)
      doc.setTextColor(...TEXTO)
      doc.setFont('helvetica', 'normal')
    }
    yResumen += interlineado
    doc.text(lineasResumen2, margen + 7, yResumen)
    yResumen += lineasResumen2.length * interlineado
    doc.text(lineasResumen3, margen + 7, yResumen)

    y += alturaResumen + 14

    // ===== MÉTRICAS PRINCIPALES (tarjetas apiladas a todo el ancho) =====
    asegurarEspacio(48)
    tituloSeccion('Métricas principales')
    y += 4

    const formatearVariacion = (v: typeof varEscaneos) => {
      if (v.tipo === 'neutro' && v.texto === '—') return ''
      if (v.tipo === 'nuevo') return 'Nuevo'
      if (v.valor === 0) return 'Igual'
      const signo = v.valor > 0 ? '+' : '−'
      return `${signo}${Math.abs(v.valor)}%`
    }

    const tarjetas: { etiqueta: string; valor: string; contexto: string; variacion: typeof varEscaneos | null }[] = [
      { etiqueta: 'Visitas al menú', valor: stats.escaneos.toString(), contexto: `vs ${statsAnterior.escaneos} ${labelAnterior}`, variacion: varEscaneos },
      { etiqueta: 'Platos vistos', valor: stats.visitas.toString(), contexto: `vs ${statsAnterior.visitas} ${labelAnterior}`, variacion: varVisitas },
    ]
    if (esPro) {
      tarjetas.push({ etiqueta: 'Pedidos WhatsApp', valor: stats.pedidosWhatsapp.toString(), contexto: `vs ${statsAnterior.pedidosWhatsapp} ${labelAnterior}`, variacion: varPedidos })
      tarjetas.push({ etiqueta: 'Calificación promedio', valor: `${stats.calificacion}/5`, contexto: `histórico · ${stats.totalResenas} ${stats.totalResenas === 1 ? 'reseña' : 'reseñas'}`, variacion: null })
    }

    const alturaTarjeta = 32
    tarjetas.forEach((tarjeta) => {
      asegurarEspacio(alturaTarjeta + 5)

      doc.setFillColor(...CREMA_OSCURO)
      doc.roundedRect(margen, y, anchoUtil, alturaTarjeta, 2, 2, 'F')

      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text(tarjeta.etiqueta, margen + 7, y + 9)

      doc.setTextColor(...TEXTO)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text(tarjeta.valor, margen + 7, y + 21)

      doc.setTextColor(...TEXTO_TER)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(tarjeta.contexto, margen + 7, y + 28)

      if (tarjeta.variacion) {
        const etiquetaVar = formatearVariacion(tarjeta.variacion)
        if (etiquetaVar) {
          const colorVar = tarjeta.variacion.valor > 0 ? VERDE_EXITO
            : tarjeta.variacion.valor < 0 ? ROJO_PELIGRO
            : tarjeta.variacion.tipo === 'nuevo' ? AZUL_INFO
            : TEXTO_SEC
          doc.setTextColor(...colorVar)
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          doc.text(etiquetaVar, ancho - margen - 7, y + 21, { align: 'right' })
        }
      }

      y += alturaTarjeta + 5
    })
    y += 9

    // ===== EMBUDO DE CONVERSIÓN (solo Pro) =====
    if (esPro && embudoData.visitasMenu > 0) {
      asegurarEspacio(60)
      tituloSeccion('Embudo de conversión', 'Cuenta sesiones únicas (una visita = una sesión), no pedidos totales')

      // Porcentajes directos de embudoData: el PDF no recalcula tasas.
      autoTable(doc, {
        startY: y,
        head: [['Etapa', 'Sesiones', '% del total']],
        body: [
          ['Abrieron el menú', embudoData.visitasMenu.toString(), '100%'],
          ['Exploraron platos', embudoData.vieronPlatos.toString(), `${embudoData.tasaExploracion}%`],
          ['Pidieron por WhatsApp', embudoData.pidieron.toString(), `${embudoData.conversionFinal}%`],
        ],
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold' },
          2: { halign: 'right', textColor: NARANJA, fontStyle: 'bold' },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 10

      // Caja de diagnóstico con barra lateral de color (estilo por tipo,
      // texto SIEMPRE desde diagnostico.mensaje, igual que el render)
      const esExito = embudoData.diagnostico.tipo === 'excelente'
      const esBueno = embudoData.diagnostico.tipo === 'bueno'
      const esRegular = embudoData.diagnostico.tipo === 'regular'

      const colorFondoDiag = esExito ? VERDE_FONDO : esBueno ? AZUL_FONDO : esRegular ? NARANJA_CLARO : ROJO_FONDO
      const colorBarraDiag = esExito ? VERDE_EXITO : esBueno ? AZUL_INFO : esRegular ? NARANJA_BORDE : ROJO_PELIGRO
      const colorTextoDiag = esExito ? VERDE_TEXTO : esBueno ? AZUL_TEXTO : esRegular ? NARANJA_TEXTO : ROJO_TEXTO

      const tituloDiag = esExito ? 'Rendimiento excelente' : esBueno ? 'Rendimiento bueno' : esRegular ? 'Rendimiento regular' : 'Rendimiento bajo'

      doc.setFontSize(12)
      const lineasDiag = doc.splitTextToSize(embudoData.diagnostico.mensaje, anchoUtil - 14)
      const alturaDiag = 14 + lineasDiag.length * 6

      asegurarEspacio(alturaDiag + 6)

      doc.setFillColor(...colorFondoDiag)
      doc.roundedRect(margen, y, anchoUtil, alturaDiag, 2, 2, 'F')

      doc.setFillColor(...colorBarraDiag)
      doc.rect(margen, y, 2, alturaDiag, 'F')

      doc.setTextColor(...colorTextoDiag)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(tituloDiag, margen + 7, y + 8)

      doc.setTextColor(...colorTextoDiag)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text(lineasDiag, margen + 7, y + 15)

      y += alturaDiag + 8

      // Recomendación si existe
      if (embudoData.recomendacion) {
        doc.setFontSize(12)
        const lineasRec = doc.splitTextToSize(embudoData.recomendacion, anchoUtil - 14)
        const alturaRec = 14 + lineasRec.length * 6

        asegurarEspacio(alturaRec + 6)

        doc.setFillColor(...NARANJA_CLARO)
        doc.roundedRect(margen, y, anchoUtil, alturaRec, 2, 2, 'F')

        doc.setFillColor(...NARANJA_BORDE)
        doc.rect(margen, y, 2, alturaRec, 'F')

        doc.setTextColor(...NARANJA_TEXTO)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text('Recomendación', margen + 7, y + 8)

        doc.setTextColor(...NARANJA_TEXTO)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'normal')
        doc.text(lineasRec, margen + 7, y + 15)

        y += alturaRec + 8
      }

      y += 6
    }

    // ===== ACTIVIDAD POR DÍA =====
    const diasConDatos = escaneosPorDia.filter((d: any) => !d.esFuturo)
    if (diasConDatos.length > 0 && diasConDatos.some((d: any) => d.actual > 0) && filtroTiempo !== 'hoy') {
      asegurarEspacio(60)
      tituloSeccion('Actividad por día')

      autoTable(doc, {
        startY: y,
        head: [['Día', 'Fecha', 'Visitas', 'Estado']],
        body: escaneosPorDia.map((d: any) => {
          const etiqueta = d.esFuturo ? 'Pendiente' : d.esHoy ? 'Hoy' : d.actual === 0 ? 'Sin visitas' : ''
          return [
            d.dia.charAt(0).toUpperCase() + d.dia.slice(1),
            `${d.numero}`,
            d.esFuturo ? '—' : d.actual.toString(),
            etiqueta,
          ]
        }),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', textColor: TEXTO_SEC },
          2: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
          3: { textColor: TEXTO_TER, fontSize: 11 },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 14
    }

    // ===== HEATMAP DÍA × HORA (solo Pro) =====
    if (esPro && heatmapData && heatmapData.hayDatosSuficientes) {
      asegurarEspacio(70)
      tituloSeccion('Patrón de visitas día × hora', 'Número de visitas recibidas en cada franja horaria')

      const bloquesLabels = ['0—3h', '3—6h', '6—9h', '9—12h', '12—15h', '15—18h', '18—21h', '21—24h']
      const diasPDF = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

      // Construir body: cada fila es un bloque horario con sus 7 días
      const heatmapBody = heatmapData.matriz.map((fila: number[], b: number) => {
        return [bloquesLabels[b], ...fila.map((v: number) => v === 0 ? '—' : v.toString())]
      })

      autoTable(doc, {
        startY: y,
        head: [['Horario', ...diasPDF]],
        body: heatmapBody,
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 12, cellPadding: 3.5, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11, halign: 'center' },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'right', textColor: TEXTO_SEC, cellWidth: 26 },
        },
        didParseCell: (data: any) => {
          if (data.column.index > 0 && data.row.section === 'body') {
            const valor = parseInt(data.cell.raw as string)
            // Umbrales y colores desde NIVELES_HEATMAP (misma fuente que el render)
            const nivel = nivelHeatmap(isNaN(valor) ? 0 : valor, heatmapData.maxCelda)
            if (nivel) {
              data.cell.styles.fillColor = nivel.bg
              data.cell.styles.textColor = nivel.texto
              if (nivel.destacado) data.cell.styles.fontStyle = 'bold'
            } else {
              data.cell.styles.textColor = TEXTO_TER
            }
          }
        },
      })

      y = (doc as any).lastAutoTable.finalY + 8

      // Insight del pico y días muertos
      const bloquesInsight = ['0:00 — 3:00', '3:00 — 6:00', '6:00 — 9:00', '9:00 — 12:00', '12:00 — 15:00', '15:00 — 18:00', '18:00 — 21:00', '21:00 — 24:00']
      const diasInsight = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

      const textosInsight: string[] = []
      if (heatmapData.pico.valor > 0) {
        textosInsight.push(`Pico del periodo: ${diasInsight[heatmapData.pico.dia]} de ${bloquesInsight[heatmapData.pico.bloque]} con ${heatmapData.pico.valor} ${heatmapData.pico.valor === 1 ? 'visita' : 'visitas'}.`)
      }
      if (heatmapData.diasMuertos.length > 0) {
        const diasMuertosNombres = heatmapData.diasMuertos.map((d: number) => diasInsight[d]).join(', ')
        textosInsight.push(`Días sin actividad: ${diasMuertosNombres}. Considera promos para activarlos.`)
      }

      if (textosInsight.length > 0) {
        doc.setFontSize(12)
        const lineasInsight = doc.splitTextToSize(textosInsight.join(' '), anchoUtil - 14)
        const alturaInsight = 8 + lineasInsight.length * 6

        asegurarEspacio(alturaInsight + 6)

        doc.setFillColor(...CREMA_OSCURO)
        doc.roundedRect(margen, y, anchoUtil, alturaInsight, 2, 2, 'F')

        doc.setFillColor(...NARANJA)
        doc.rect(margen, y, 2, alturaInsight, 'F')

        doc.setTextColor(...TEXTO)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'normal')
        doc.text(lineasInsight, margen + 7, y + 8)

        y += alturaInsight + 12
      }
    }

    // ===== HORARIOS PICO (solo Básico, el heatmap lo reemplaza en Pro) =====
    if (!esPro && horariosPico.length > 0) {
      asegurarEspacio(55)
      tituloSeccion('Horarios con más visitas')

      autoTable(doc, {
        startY: y,
        head: [['Horario', 'Visitas']],
        body: horariosPico.map((h: any) => [h.rango, h.escaneos.toString()]),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 14
    }

    // ===== PLATOS MÁS VISTOS =====
    if (platosMasVistos.length > 0) {
      asegurarEspacio(55)
      tituloSeccion('Platos más vistos')

      autoTable(doc, {
        startY: y,
        head: [['#', 'Plato', 'Vistas']],
        body: platosMasVistos.map((p: any, i: number) => [(i + 1).toString(), p.nombre, p.vistas.toString()]),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { halign: 'center', cellWidth: 14, textColor: TEXTO_SEC },
          1: { fontStyle: 'bold' },
          2: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 14
    }

    // ===== PLATOS CON INTERÉS BAJO =====
    if (platosInteresBajo.length > 0) {
      asegurarEspacio(60)
      tituloSeccion('Platos con interés bajo', 'Reciben visitas pero pocos los exploran. Revisa foto, descripción o precio.')

      autoTable(doc, {
        startY: y,
        head: [['Plato', 'Vistas']],
        body: platosInteresBajo.map((p: any) => [p.nombre, p.vistas.toString()]),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold', textColor: NARANJA_BORDE },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 14
    }

    // ===== PLATOS SIN VISTAS =====
    if (platosSinVistas.length > 0) {
      asegurarEspacio(60)
      const tituloSinVistas = `Sin vistas ${filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}`
      tituloSeccion(tituloSinVistas, 'Revisa si están activos y considera promocionarlos.')

      autoTable(doc, {
        startY: y,
        head: [['Plato', 'Antigüedad']],
        body: platosSinVistas.map((p: any) => {
          // Misma etiqueta que el render (fuente única), capitalizada para el PDF
          const antiguedad = etiquetaAntiguedad(p.diasCreado)
          return [p.nombre, antiguedad.charAt(0).toUpperCase() + antiguedad.slice(1)]
        }),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 13, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', textColor: TEXTO_SEC },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 14
    }

    // ===== ÚLTIMAS RESEÑAS =====
    if (esPro && resenas.length > 0) {
      asegurarEspacio(60)
      tituloSeccion('Últimas reseñas de comensales')

      autoTable(doc, {
        startY: y,
        head: [['Plato', 'Calif.', 'Comentario', 'Fecha']],
        body: resenas.map((r: any) => [
          r.plato,
          `${r.estrellas}/5`,
          r.comentario || '—',
          r.tiempo,
        ]),
        margin: { left: margen, right: margen, top: 20, bottom: margenInferior },
        styles: { fontSize: 12, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 11 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 38 },
          1: { halign: 'center', textColor: NARANJA_BORDE, fontStyle: 'bold', cellWidth: 20 },
          3: { halign: 'right', textColor: TEXTO_SEC, cellWidth: 24 },
        },
      })
    }

    // ===== FOOTER EN TODAS LAS PÁGINAS =====
    // 11pt (antes 7pt, ilegible en el teléfono): marca + restaurante a la
    // izquierda, paginación a la derecha; se trunca el nombre si no cabe.
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    let marcaFooter = `MenuApp · ${restaurante.nombre}`
    while (doc.getTextWidth(marcaFooter) > anchoUtil - 40 && marcaFooter.length > 12) {
      marcaFooter = `${marcaFooter.slice(0, -4).trimEnd()}…`
    }
    const totalPaginas = doc.getNumberOfPages()
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i)

      // Línea separadora suave
      doc.setDrawColor(...BORDE)
      doc.setLineWidth(0.3)
      doc.line(margen, alto - 16, ancho - margen, alto - 16)

      // Marca
      doc.setFontSize(11)
      doc.setTextColor(...TEXTO_TER)
      doc.setFont('helvetica', 'normal')
      doc.text(marcaFooter, margen, alto - 9)
      doc.text(`Página ${i} de ${totalPaginas}`, ancho - margen, alto - 9, { align: 'right' })
    }

    // ===== DESCARGAR =====
    const periodoNombre = filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'semana' : 'mes'
    const fechaArchivo = new Date().toISOString().split('T')[0]
    const nombreArchivo = `menuapp-${restaurante.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${periodoNombre}-${fechaArchivo}.pdf`
    doc.save(nombreArchivo)
  }
  const esPro = plan === 'pro'

  // ===== Contexto temporal =====
  const hoyDate = new Date()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const mesesCorto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const diasSemanaLargo = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

  function obtenerContextoTemporal() {
    if (filtroTiempo === 'hoy') {
      return {
        titulo: 'Hoy',
        rango: `${diasSemanaLargo[hoyDate.getDay()]} ${hoyDate.getDate()} de ${meses[hoyDate.getMonth()]}`,
        progreso: '',
      }
    }
    if (filtroTiempo === 'semana') {
      // Semana desde lunes (estándar ISO colombiano)
      const diaActual = hoyDate.getDay()
      const diasDesdeLunes = diaActual === 0 ? 6 : diaActual - 1
      const lunes = new Date(hoyDate)
      lunes.setDate(hoyDate.getDate() - diasDesdeLunes)
      const domingo = new Date(lunes)
      domingo.setDate(lunes.getDate() + 6)

      const mismoMes = lunes.getMonth() === domingo.getMonth()
      const rango = mismoMes
        ? `${lunes.getDate()} — ${domingo.getDate()} ${mesesCorto[lunes.getMonth()]}`
        : `${lunes.getDate()} ${mesesCorto[lunes.getMonth()]} — ${domingo.getDate()} ${mesesCorto[domingo.getMonth()]}`

      return {
        titulo: 'Esta semana',
        rango,
        progreso: `día ${diasDesdeLunes + 1} de 7`,
      }
    }
    // Mes
    const diasEnMes = new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0).getDate()
    return {
      titulo: 'Este mes',
      rango: `${meses[hoyDate.getMonth()].charAt(0).toUpperCase() + meses[hoyDate.getMonth()].slice(1)} ${hoyDate.getFullYear()}`,
      progreso: `día ${hoyDate.getDate()} de ${diasEnMes}`,
    }
  }

  const contextoTemporal = obtenerContextoTemporal()

  // ===== Comparación con periodo anterior =====
  const labelAnterior = filtroTiempo === 'hoy' ? 'ayer' : filtroTiempo === 'semana' ? 'la semana pasada' : 'el mes pasado'

  function calcularVariacion(actual: number, anterior: number) {
    if (anterior === 0 && actual === 0) return { tipo: 'neutro', texto: '—', valor: 0 }
    if (anterior === 0) return { tipo: 'nuevo', texto: 'nuevo', valor: 0 }
    const pct = Math.round(((actual - anterior) / anterior) * 100)
    if (pct === 0) return { tipo: 'neutro', texto: 'igual', valor: 0 }
    return {
      tipo: pct > 0 ? 'positivo' : 'negativo',
      texto: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`,
      valor: pct,
    }
  }

  function BadgeVariacion({ variacion }: { variacion: ReturnType<typeof calcularVariacion> }) {
    if (variacion.tipo === 'neutro' && variacion.texto === '—') return null
    const colores = {
      positivo: { bg: 'var(--color-success-light)', text: 'var(--color-success)' },
      negativo: { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' },
      neutro: { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' },
      nuevo: { bg: 'var(--color-accent-light)', text: 'var(--color-accent-dark)' },
    }
    const c = colores[variacion.tipo as keyof typeof colores]
    return (
      <span style={{
        fontSize: '10px',
        fontWeight: 500,
        padding: '2px 6px',
        borderRadius: '4px',
        background: c.bg,
        color: c.text,
        whiteSpace: 'nowrap',
      }}>
        {variacion.texto}
      </span>
    )
  }

  const varEscaneos = calcularVariacion(stats.escaneos, statsAnterior.escaneos)
  const varVisitas = calcularVariacion(stats.visitas, statsAnterior.visitas)
  const varPedidos = calcularVariacion(stats.pedidosWhatsapp, statsAnterior.pedidosWhatsapp)

  // Mejor día del periodo (días pasados con visitas): fuente única para el
  // render (Actividad por día) y el PDF (resumen ejecutivo); antes ambos
  // recomputaban la misma fórmula por su lado (AUDIT-DASH).
  const mejorDia = escaneosPorDia
    .filter((d: any) => !d.esFuturo && d.actual > 0)
    .sort((a: any, b: any) => b.actual - a.actual)[0]
  // ===== Embudo de conversión por sesión (menú → pedido) =====
  // 2 etapas anidadas: sesiones que abrieron el menú → sesiones que pidieron
  // (entre las que abrieron). La exploración de platos es engagement lateral, NO
  // una etapa intermedia obligatoria (un pedido directo de combo/promo cuenta sin
  // abrir detalle de plato). Todas las tasas quedan 0-100% por construcción.
  const embudoData = (() => {
    const visitasMenu = stats.sesionesMenu     // sesiones que abrieron el menú
    const exploraron = stats.sesionesPlato     // engagement: vieron ≥1 plato (⊆ menú)
    const pidieron = stats.sesionesPedido       // pidieron (⊆ menú)

    const conversionFinal = visitasMenu > 0 ? Math.round((pidieron / visitasMenu) * 100) : 0
    const tasaExploracion = visitasMenu > 0 ? Math.round((exploraron / visitasMenu) * 100) : 0

    // Diagnóstico SOLO según conversión menú→pedido. Sin afirmar un "promedio del
    // sector" (era un benchmark hardcodeado sin fuente).
    let diagnostico: { tipo: 'excelente' | 'bueno' | 'regular' | 'mejorable' | 'sin_datos'; mensaje: string } = {
      tipo: 'sin_datos',
      mensaje: 'Comparte tu menú para empezar a ver datos de conversión.',
    }
    if (visitasMenu > 0) {
      if (conversionFinal >= 15) {
        diagnostico = { tipo: 'excelente', mensaje: `${conversionFinal}% de las sesiones que abrieron el menú terminaron en un pedido. Tu menú está convirtiendo muy bien.` }
      } else if (conversionFinal >= 10) {
        diagnostico = { tipo: 'bueno', mensaje: `${conversionFinal}% de las sesiones terminaron en un pedido. Buen ritmo, con espacio para optimizar.` }
      } else if (conversionFinal >= 5) {
        diagnostico = { tipo: 'regular', mensaje: `${conversionFinal}% de las sesiones terminaron en un pedido. Hay oportunidades claras de mejora.` }
      } else {
        diagnostico = { tipo: 'mejorable', mensaje: `${conversionFinal}% de las sesiones terminaron en un pedido. Revisa fotos, precios y descripciones para impulsar el pedido.` }
      }
    }

    // Recomendación según exploración / conversión (sin etapa-plato como fuga).
    let recomendacion = ''
    if (visitasMenu >= 10) {
      if (tasaExploracion < 40) {
        recomendacion = 'Pocas sesiones abren el detalle de un plato. Mejora las fotos de portada y los nombres de las categorías para invitar a explorar.'
      } else if (conversionFinal < 5) {
        recomendacion = 'Exploran el menú pero pocos piden. Revisa precios, descripciones y el flujo de pedido por WhatsApp.'
      }
    }

    return {
      visitasMenu,
      vieronPlatos: exploraron,    // engagement (expuesto para el PDF y la línea de engagement)
      pidieron,
      conversionFinal,
      tasaExploracion,             // % de sesiones que exploraron platos (engagement, no fuga)
      tasaPedido: conversionFinal, // compat PDF: "tasa de paso" menú→pedido (≤100%)
      diagnostico,
      recomendacion,
    }
  })()

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  // Splash hasta que resuelvan auth + las 3 lecturas SWR (evita el parpadeo a cero
  // inicial). En el toggle de periodo, keepPreviousData mantiene statsCargando=false,
  // así que NO reaparece el splash al cambiar de periodo.
  if (cargando || statsCargando || lifetimeCargando || alertasCargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  if (!usuario) return null

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '80px', position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Bienvenido</div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>{restaurante.nombre}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 500, padding: '3px 8px', borderRadius: '4px',
              background: esPro ? 'var(--color-warning-light)' : 'var(--bg-tertiary)',
              color: esPro ? 'var(--color-warning)' : 'var(--text-secondary)',
            }}>
              {esPro ? 'Pro' : esBasico ? 'Básico' : 'Gratis'}
            </div>
            <div onClick={() => setMostrarPerfil(!mostrarPerfil)} style={{
              width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: 500, color: 'white', cursor: 'pointer', overflow: 'hidden',
            }}>
              {rest?.logo_url ? (
                <img src={rest.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : restaurante.iniciales}
            </div>
          </div>
        </div>

        {/* Dropdown perfil */}
        {mostrarPerfil && (
          <>
            <div onClick={() => setMostrarPerfil(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 60 }} />
            <div style={{
              position: 'absolute', right: '20px', top: '64px', zIndex: 70,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)', overflow: 'hidden', width: '260px',
              boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.2s ease',
            }}>
              <div style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 500, color: 'white', overflow: 'hidden' }}>
                  {rest?.logo_url ? (
                    <img src={rest.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : restaurante.iniciales}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{restaurante.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{usuario?.email || ''}</div>
                </div>
              </div>
              {[
                ...(rest?.slug ? [{ label: 'Ver mi menú', sub: 'Abrir en pestaña nueva', href: '/' + rest.slug, external: true }] : []),
                { label: 'Mi suscripción', sub: esPro ? 'Plan Pro' : esBasico ? 'Plan Básico' : 'Plan Gratis', href: '/suscripcion' },
                { label: 'Mis facturas', sub: 'Descargar y compartir', href: '/facturas' },
                { label: 'Invitar restaurantes', sub: 'Gana meses gratis', href: '/referidos' },
                // Oculto hasta implementar i18n real (hoy solo existe español).
                // { label: 'Idioma', sub: 'Español', href: '#' },
              ].map((item: any, i: number) => (
                <div key={i} onClick={() => { setMostrarPerfil(false); if (item.external) { window.open(item.href, '_blank', 'noopener') } else { router.push(item.href) } }} style={{
                  padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                }}>
                  <div>
                    <div style={{ fontSize: '13px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: item.label === 'Invitar restaurantes' ? 'var(--color-green)' : 'var(--text-tertiary)' }}>{item.sub}</div>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </div>
              ))}
              <div onClick={async () => {
                setMostrarPerfil(false)
                const { cerrarSesion } = await import('@/lib/auth')
                await cerrarSesion()
                router.push('/login')
              }} style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-danger)', cursor: 'pointer' }}>
                Cerrar sesión
              </div>
            </div>
          </>
        )}

        {/* Alertas de inactividad */}
        {alertas.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            {alertas.map((a: any) => {
              const colores = {
                advertencia: {
                  bg: 'var(--color-warning-light)',
                  border: 'var(--color-warning)',
                  text: 'var(--color-warning)',
                },
                info: {
                  bg: 'var(--bg-tertiary)',
                  border: 'var(--border-medium)',
                  text: 'var(--text-secondary)',
                },
                oportunidad: {
                  bg: 'var(--color-success-light)',
                  border: 'var(--color-green)',
                  text: 'var(--color-green)',
                },
              }
              const c = colores[a.tipo as keyof typeof colores] || colores.info

              return (
                <div key={a.id} style={{
                  background: c.bg,
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  marginBottom: '8px',
                  borderLeft: `3px solid ${c.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: c.text,
                      marginBottom: '2px',
                    }}>
                      {a.titulo}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: c.text,
                      opacity: 0.85,
                      lineHeight: 1.4,
                    }}>
                      {a.mensaje}
                    </div>
                  </div>
                  {a.accion && (
                    <div onClick={() => router.push(a.accion.href)} style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: c.text,
                      background: 'rgba(255,255,255,0.6)',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                      {a.accion.texto} →
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Contexto temporal */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ position: 'relative' }}>
            <div className="card" style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Estás viendo
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {contextoTemporal.titulo}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {contextoTemporal.rango}
                  {contextoTemporal.progreso && (
                    <span style={{ color: 'var(--text-tertiary)' }}> · {contextoTemporal.progreso}</span>
                  )}
                </div>
              </div>
              <Boton variante="secundario" tamano="sm" onClick={() => setMostrarFiltro(!mostrarFiltro)} style={{ marginLeft: '12px' }}>
                Cambiar <Icono icono={ChevronDown} size={14} />
              </Boton>
            </div>

            {mostrarFiltro && (
              <>
                <div onClick={() => setMostrarFiltro(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                <div style={{
                  position: 'absolute', right: '16px', top: 'calc(100% - 4px)', zIndex: 70,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden', width: '160px',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  {[
                    { id: 'hoy', label: 'Hoy' },
                    { id: 'semana', label: 'Esta semana' },
                    { id: 'mes', label: 'Este mes' },
                  ].map((f: any, i: number) => (
                    <div key={f.id} onClick={() => { setFiltroTiempo(f.id as any); setMostrarFiltro(false) }}
                      style={{
                        padding: '11px 14px', fontSize: '13px', cursor: 'pointer',
                        background: filtroTiempo === f.id ? 'var(--color-accent-light)' : 'transparent',
                        color: filtroTiempo === f.id ? 'var(--color-accent-dark)' : 'var(--text-primary)',
                        borderBottom: i < 2 ? '1px solid var(--border-light)' : 'none',
                        fontWeight: filtroTiempo === f.id ? 500 : 400,
                      }}>
                      {f.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Números grandes — restyle DASHBOARD-VISUAL: burbuja de icono +
            badge de variacion + numero grande + sparkline (solo Visitas:
            unica serie por dia disponible en los hooks; ver Sparkline). */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono icono={Eye} size={15} />
                </div>
                <BadgeVariacion variacion={varEscaneos} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '8px' }}>{stats.escaneos}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Visitas al menú</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                vs {statsAnterior.escaneos} {labelAnterior}
              </div>
              <Sparkline valores={escaneosPorDia.filter((d: any) => !d.esFuturo).map((d: any) => d.actual)} />
            </div>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono icono={Utensils} size={15} />
                </div>
                <BadgeVariacion variacion={varVisitas} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '8px' }}>{stats.visitas}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Platos vistos</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                vs {statsAnterior.visitas} {labelAnterior}
              </div>
              {/* Sparkline diferido a BL.35: vistas_platos (#5) no trae fecha. */}
            </div>
          </div>
        </div>
        {stats.escaneos === 0 && stats.visitas === 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {filtroTiempo === 'hoy'
                ? 'Aún no hay visitas hoy. Los datos se actualizan en tiempo real cuando los comensales abren tu menú.'
                : 'Comparte tu enlace o QR para empezar a recibir visitas. Los datos aparecen aquí automáticamente.'}
            </div>
          </div>
        )}

        {/* Pedidos WhatsApp + Calificación */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icono icono={MessageCircle} size={15} />
                  </div>
                  <BadgeVariacion variacion={varPedidos} />
                </div>
                <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '8px' }}>{stats.pedidosWhatsapp}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  vs {statsAnterior.pedidosWhatsapp} {labelAnterior}
                </div>
                {/* Sparkline diferido a BL.35: pedidos_whatsapp (#2) es head-count sin filas. */}
              </div>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono icono={Star} size={15} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '8px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 500 }}>{stats.calificacion}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>/5</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>histórico · {stats.totalResenas} reseñas</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px', opacity: 0.5 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono icono={Lock} size={15} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '14px', opacity: 0.5 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono icono={Lock} size={15} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>Calificación promedio</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
            </div>
          </div>
        )}

        {/* Embudo de conversión */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <EncabezadoSeccion
                icono={Filter}
                titulo="Embudo de conversión"
                subtitulo="Cuenta sesiones únicas (una visita = una sesión), no pedidos totales"
                pill={embudoData.visitasMenu > 0 ? `${embudoData.conversionFinal}% final` : undefined}
              />

              {/* Etapa 1: Abrieron el menú (sesiones) */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px' }}>Sesiones que abrieron el menú</span>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{embudoData.visitasMenu}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--color-accent)', borderRadius: '3px' }} />
                </div>
              </div>

              {/* Paso menú → pedido */}
              {embudoData.visitasMenu > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 4px', padding: '4px 0' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>↓</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {embudoData.conversionFinal}% llegó al pedido
                  </span>
                </div>
              )}

              {/* Etapa 2: Pidieron por WhatsApp (sesiones, ⊆ abrieron el menú) */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px' }}>Sesiones que pidieron</span>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{embudoData.pidieron}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${embudoData.conversionFinal}%`, background: 'var(--color-accent)', borderRadius: '3px', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Engagement (NO es una etapa del embudo): exploración de platos */}
              {embudoData.visitasMenu > 0 && (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  marginBottom: '12px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}>
                  De las sesiones que abrieron el menú, <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{embudoData.tasaExploracion}%</span> exploró el detalle de algún plato
                  <span style={{ color: 'var(--text-tertiary)' }}> ({embudoData.vieronPlatos} {embudoData.vieronPlatos === 1 ? 'sesión' : 'sesiones'})</span>.
                </div>
              )}

              {/* Caption: alcance del embudo */}
              {embudoData.visitasMenu > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Embudo basado en sesiones registradas (desde la activación del seguimiento por sesión). Las visitas anteriores no se incluyen.
                </div>
              )}

              {/* Diagnóstico principal */}
              {embudoData.diagnostico.tipo !== 'sin_datos' && (
                <div style={{
                  background: embudoData.diagnostico.tipo === 'excelente' ? 'var(--color-success-light)'
                    : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-success-light)'
                    : embudoData.diagnostico.tipo === 'regular' ? 'var(--color-warning-light)'
                    : 'var(--color-danger-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  marginBottom: embudoData.recomendacion ? '8px' : 0,
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    marginBottom: '3px',
                    color: embudoData.diagnostico.tipo === 'excelente' ? 'var(--color-success)'
                      : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-success)'
                      : embudoData.diagnostico.tipo === 'regular' ? 'var(--color-warning)'
                      : 'var(--color-danger)',
                  }}>
                    {embudoData.diagnostico.tipo === 'excelente' ? 'Rendimiento excelente'
                      : embudoData.diagnostico.tipo === 'bueno' ? 'Rendimiento bueno'
                      : embudoData.diagnostico.tipo === 'regular' ? 'Rendimiento regular'
                      : 'Rendimiento bajo'}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    lineHeight: 1.4,
                    color: embudoData.diagnostico.tipo === 'excelente' ? 'var(--color-success)'
                      : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-success)'
                      : embudoData.diagnostico.tipo === 'regular' ? 'var(--color-warning)'
                      : 'var(--color-danger)',
                    opacity: 0.85,
                  }}>
                    {embudoData.diagnostico.mensaje}
                  </div>
                </div>
              )}

              {/* Recomendación accionable */}
              {embudoData.recomendacion && (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  borderLeft: '2px solid var(--color-warning)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' }}>
                    Recomendación
                  </div>
                  <div style={{ fontSize: '11px', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                    {embudoData.recomendacion}
                  </div>
                </div>
              )}

              {/* Estado vacío */}
              {embudoData.visitasMenu === 0 && (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}>
                  Aún no hay datos de conversión. Comparte tu QR o enlace para empezar a medir cómo los comensales recorren tu menú.
                </div>
              )}
            </div>
          </div>
        ) : !esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '16px', opacity: 0.5 }}>
              <EncabezadoSeccion
                icono={Filter}
                titulo="Embudo de conversión"
                subtitulo="Disponible en Plan Pro"
                neutro
                derecha={<span style={{ color: 'var(--text-tertiary)', lineHeight: 0 }}><Icono icono={Lock} size={18} /></span>}
                style={{ marginBottom: 0 }}
              />
            </div>
          </div>
        ) : null}

        {/* Actividad por día */}
        {esBasico && filtroTiempo !== 'hoy' && (() => {
          const diasConDatos = escaneosPorDia.filter((d: any) => !d.esFuturo && d.actual > 0)
          const totalVisitasSemana = escaneosPorDia.reduce((s: number, d: any) => s + d.actual, 0)
          const promedioDiario = diasConDatos.length > 0 ? Math.round(totalVisitasSemana / diasConDatos.length) : 0
          const maxDia = Math.max(...escaneosPorDia.map((d: any) => d.actual), 1)
          // 'mes' puede tener hasta 31 barras: gap más fino para que compriman sin
          // scroll, y etiquetas dispersas (ver más abajo).
          const esMesChart = filtroTiempo === 'mes'
          const gapChart = esMesChart ? '2px' : '6px'

          // Mejor día real: const `mejorDia` compartida con el PDF (fuente única)
          const mejorDiaSemana = mejorDia

          // Mejor horario (ya lo tenemos en horariosPico)
          const topHorario = horariosPico[0]

          return (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <EncabezadoSeccion
                  icono={BarChart2}
                  titulo="Actividad por día"
                  subtitulo={esMesChart
                    ? `${contextoTemporal.rango} · días 1–${escaneosPorDia[escaneosPorDia.length - 1]?.numero ?? ''}`
                    : contextoTemporal.rango}
                  pill={esMesChart ? 'Este mes' : 'Esta semana'}
                />

                {/* Gráfica */}
                <div style={{ display: 'flex', alignItems: 'end', gap: gapChart, height: '90px', marginBottom: '6px', position: 'relative' }}>
                  {/* Línea de promedio */}
                  {promedioDiario > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${(promedioDiario / maxDia) * 80}px`,
                      borderTop: '1px dashed var(--border-light)',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }} />
                  )}

                  {escaneosPorDia.map((d: any, i: number) => {
                    const esMejor = mejorDiaSemana && d.fecha === mejorDiaSemana.fecha && d.actual > 0
                    const altura = d.actual > 0 ? Math.max((d.actual / maxDia) * 80, 6) : 3
                    const color = d.esFuturo
                      ? 'var(--border-light)'
                      : esMejor
                      ? 'var(--color-green)'
                      : d.esHoy
                      ? 'var(--color-accent)'
                      : d.actual > 0
                      ? 'var(--color-accent)'
                      : 'var(--bg-tertiary)'

                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative', zIndex: 2 }}>
                        <span style={{
                          fontSize: '10px',
                          color: esMejor ? 'var(--color-green)' : d.esFuturo ? 'var(--text-tertiary)' : d.actual > 0 ? 'var(--color-accent)' : 'var(--text-tertiary)',
                          fontWeight: esMejor ? 500 : 400,
                          opacity: d.esFuturo ? 0.4 : 1,
                        }}>
                          {d.esFuturo ? '—' : d.actual > 0 ? d.actual : ''}
                        </span>
                        <div style={{
                          width: '100%',
                          background: color,
                          borderRadius: '3px',
                          height: `${altura}px`,
                          opacity: d.esFuturo ? 0.3 : 1,
                          transition: 'height 0.3s',
                        }} />
                      </div>
                    )
                  })}
                </div>

                {/* Labels de días con fecha. En 'mes' (hasta 31 días) se ocultan los
                    nombres de día y solo se muestra el número en días clave (1, cada
                    múltiplo de 5, y hoy) para que no colisionen; en 'semana' se
                    conserva el nombre + número como antes. */}
                <div style={{ display: 'flex', gap: gapChart, fontSize: '10px' }}>
                  {escaneosPorDia.map((d: any, i: number) => {
                    const mostrarNumero = esMesChart
                      ? (d.numero === 1 || d.numero % 5 === 0 || d.esHoy)
                      : true
                    return (
                      <div key={i} style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'center',
                        color: d.esHoy ? 'var(--color-accent)' : d.esFuturo ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        fontWeight: d.esHoy ? 500 : 400,
                        opacity: d.esFuturo ? 0.5 : 1,
                        lineHeight: 1.3,
                      }}>
                        {!esMesChart && <div>{d.dia}</div>}
                        <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{mostrarNumero ? d.numero : ''}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Resumen inteligente */}
                {totalVisitasSemana > 0 && (
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginTop: '14px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}>
                    {mejorDiaSemana && (
                      <div>
                        Mejor día: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{mejorDiaSemana.dia} {mejorDiaSemana.numero}</span> con <span style={{ color: 'var(--color-green)', fontWeight: 500 }}>{mejorDiaSemana.actual} visitas</span>
                        {topHorario && <>. Horario pico: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{topHorario.rango}</span></>}
                        .
                      </div>
                    )}
                    {!mejorDiaSemana && topHorario && (
                      <div>Horario con más movimiento: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{topHorario.rango}</span>.</div>
                    )}
                    {promedioDiario > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        Promedio: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{promedioDiario} {promedioDiario === 1 ? 'visita' : 'visitas'} por día</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Estado vacío */}
                {totalVisitasSemana === 0 && (
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginTop: '14px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}>
                    Sin visitas esta semana. Comparte tu QR para empezar a recibir tráfico.
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Heatmap: Patrón de visitas día × hora (solo Pro, con datos suficientes) */}
        {esPro && filtroTiempo !== 'hoy' && heatmapData && heatmapData.hayDatosSuficientes && (() => {
          const bloquesHoras = [
            { label: '0—3h', descripcion: '0:00 — 3:00' },
            { label: '3—6h', descripcion: '3:00 — 6:00' },
            { label: '6—9h', descripcion: '6:00 — 9:00' },
            { label: '9—12h', descripcion: '9:00 — 12:00' },
            { label: '12—15h', descripcion: '12:00 — 15:00' },
            { label: '15—18h', descripcion: '15:00 — 18:00' },
            { label: '18—21h', descripcion: '18:00 — 21:00' },
            { label: '21—24h', descripcion: '21:00 — 24:00' },
          ]
          const diasLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

          // Color según intensidad: umbrales/colores desde NIVELES_HEATMAP
          // (misma fuente que el PDF, la leyenda y el teaser)
          function colorHeatmap(valor: number, max: number): { bg: string; opacity: number } {
            const nivel = nivelHeatmap(valor, max)
            if (!nivel) return { bg: '#F5EFE6', opacity: 0.3 }
            return { bg: nivel.bg, opacity: 1 }
          }

          // Resumen en lenguaje natural
          const picoTextoDia = diasLabels[heatmapData.pico.dia]
          const picoTextoHora = bloquesHoras[heatmapData.pico.bloque]?.descripcion
          const tieneDiasMuertos = heatmapData.diasMuertos.length > 0
          const diasMuertosTexto = heatmapData.diasMuertos.map((d: number) => diasLabels[d]).join(', ')

          // Hoy en el formato del heatmap
          const hoyDia = new Date()
          const diaJSHoy = hoyDia.getDay()
          const diaMatrizHoy = diaJSHoy === 0 ? 6 : diaJSHoy - 1

          return (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <EncabezadoSeccion
                  icono={CalendarDays}
                  titulo="Patrón de visitas"
                  subtitulo="Número de visitas recibidas en cada franja horaria"
                  pill="día × hora"
                  style={{ marginBottom: '4px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                  {contextoTemporal.rango}
                </div>

                {/* Grid del heatmap */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '44px repeat(7, 1fr)',
                  gap: '3px',
                  fontSize: '9px',
                }}>
                  {/* Fila de labels de días */}
                  <div></div>
                  {diasLabels.map((d: string, i: number) => (
                    <div key={i} style={{
                      textAlign: 'center',
                      color: i === diaMatrizHoy ? 'var(--color-accent)' : 'var(--text-secondary)',
                      fontWeight: i === diaMatrizHoy ? 500 : 400,
                      paddingBottom: '4px',
                    }}>
                      {d}
                    </div>
                  ))}

                  {/* Filas del heatmap */}
                  {bloquesHoras.map((bloque: any, b: number) => (
                    <React.Fragment key={`row-${b}`}>
                      <div style={{
                        color: 'var(--text-secondary)',
                        paddingRight: '6px',
                        textAlign: 'right',
                        alignSelf: 'center',
                        fontSize: '9px',
                        lineHeight: 1.1,
                      }}>
                        {bloque.label}
                      </div>
                      {heatmapData.matriz[b].map((valor: number, d: number) => {
                        const color = colorHeatmap(valor, heatmapData.maxCelda)
                        const esPicoCelda = heatmapData.pico.bloque === b && heatmapData.pico.dia === d
                        const nivel = nivelHeatmap(valor, heatmapData.maxCelda)
                        const colorTexto = nivel ? nivel.texto : 'var(--text-tertiary)'
                        return (
                          <div
                            key={`c-${b}-${d}`}
                            title={`${diasLabels[d]} ${bloque.descripcion}: ${valor} ${valor === 1 ? 'visita' : 'visitas'}`}
                            style={{
                              aspectRatio: '1',
                              background: color.bg,
                              opacity: color.opacity,
                              borderRadius: '6px',
                              position: 'relative',
                              border: esPicoCelda ? '1.5px solid var(--color-accent)' : 'none',
                              boxShadow: esPicoCelda ? '0 0 0 1px white' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: valor > 0 ? 500 : 400,
                              color: colorTexto,
                            }}
                          >
                            {valor > 0 ? valor : ''}
                          </div>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>

                {/* Leyenda de colores */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  fontSize: '9px',
                  color: 'var(--text-tertiary)',
                }}>
                  <span>Menos visitas</span>
                  <div style={{ width: '14px', height: '10px', background: '#FBF7F0', border: '0.5px solid var(--border-light)', borderRadius: '2px' }} />
                  {[...NIVELES_HEATMAP].reverse().map((nivel) => (
                    <div key={nivel.bg} style={{ width: '14px', height: '10px', background: nivel.bg, borderRadius: '2px' }} />
                  ))}
                  <span>Más visitas</span>
                </div>

                {/* Cómo leer el heatmap */}
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  marginTop: '10px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    background: '#E85D24',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {heatmapData.pico.valor}
                  </div>
                  <span>
                    = <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {heatmapData.pico.valor} {heatmapData.pico.valor === 1 ? 'visita' : 'visitas'}
                    </span> en esa franja horaria
                  </span>
                </div>

                {/* Resumen inteligente */}
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  marginTop: '14px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}>
                  {heatmapData.pico.valor > 0 && (
                    <>
                      Pico del periodo: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {picoTextoDia} {picoTextoHora}
                      </span> con <span style={{ color: '#E85D24', fontWeight: 500 }}>
                        {heatmapData.pico.valor} {heatmapData.pico.valor === 1 ? 'visita' : 'visitas'}
                      </span>.
                    </>
                  )}
                  {tieneDiasMuertos && (
                    <>
                      {' '}Días sin actividad: <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>
                        {diasMuertosTexto}
                      </span>. Considera promos para activarlos.
                    </>
                  )}
                </div>

                
              </div>
            </div>
          )
        })()}

        {/* Heatmap insuficiente: mensaje motivador para Pro con poca data */}
        {esPro && filtroTiempo !== 'hoy' && heatmapData && !heatmapData.hayDatosSuficientes && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <EncabezadoSeccion
                icono={CalendarDays}
                titulo="Patrón de visitas"
                pill="día × hora"
                style={{ marginBottom: '6px' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Necesitas al menos 20 visitas en el periodo para ver el mapa de calor día × hora.
                Llevas {heatmapData.totalVisitas}. Comparte más tu QR para desbloquearlo.
              </div>
            </div>
          </div>
        )}

        {/* Teaser del heatmap para Básico (upsell a Pro) */}
        {esBasico && !esPro && filtroTiempo !== 'hoy' && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px', position: 'relative', overflow: 'hidden' }}>
              <EncabezadoSeccion
                icono={CalendarDays}
                titulo="Patrón de visitas"
                subtitulo="Descubre tus días y horas de mayor tráfico"
                neutro
                derecha={
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-warning-light)',
                    color: 'var(--color-warning)',
                    flexShrink: 0,
                  }}>
                    Plan Pro
                  </div>
                }
              />

              {/* Mini-preview del heatmap con datos de ejemplo (blureado) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '24px repeat(7, 1fr)',
                gap: '3px',
                fontSize: '9px',
                filter: 'blur(2px)',
                pointerEvents: 'none',
                userSelect: 'none',
                opacity: 0.7,
              }}>
                <div></div>
                {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d: string, i: number) => (
                  <div key={i} style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingBottom: '4px' }}>{d}</div>
                ))}
                {[
                  [0, 0, 0, 0, 0, 0, 0],
                  [0, 0, 0, 0, 0, 0, 0],
                  [1, 2, 1, 2, 3, 0, 0],
                  [2, 3, 2, 2, 3, 1, 0],
                  [4, 6, 5, 9, 4, 2, 1],
                  [0, 1, 2, 1, 0, 0, 0],
                  [3, 5, 6, 8, 4, 2, 0],
                  [0, 1, 0, 2, 0, 1, 0],
                ].map((fila, b) => (
                  <React.Fragment key={`preview-${b}`}>
                    <div style={{ color: 'var(--text-tertiary)', paddingRight: '4px', textAlign: 'right', alignSelf: 'center' }}>
                      {['0—3h', '3—6h', '6—9h', '9—12h', '12—15h', '15—18h', '18—21h', '21—24h'][b]}
                    </div>
                    {fila.map((v: number, d: number) => {
                      const nivel = nivelHeatmap(v, 9)
                      const bg = nivel ? nivel.bg : '#F5EFE6'
                      return (
                        <div key={`pv-${b}-${d}`} style={{
                          aspectRatio: '1',
                          background: bg,
                          opacity: v === 0 ? 0.3 : 1,
                          borderRadius: '6px',
                        }} />
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>

              {/* Overlay CTA sobre el preview */}
              <div onClick={() => router.push('/suscripcion')} style={{
                background: 'var(--color-warning-light)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginTop: '14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '2px' }}>
                    Desbloquea el mapa de calor
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-warning)', opacity: 0.85, lineHeight: 1.4 }}>
                    Ve en qué días y horas recibes más visitas. Detecta momentos muertos y optimiza tu operación.
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)', whiteSpace: 'nowrap' }}>
                  Ver Pro →
                </span>
              </div>
            </div>
          </div>
        )}

        

        {/* ===== BLOQUE 1: Platos más vistos (top performers) ===== */}
        {esBasico ? (
          platosMasVistos.length > 0 ? (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <EncabezadoSeccion
                  icono={TrendingUp}
                  titulo="Platos más vistos"
                  subtitulo="Los que están generando más interés en tu menú"
                  pill={`top ${platosMasVistos.length}`}
                />
                {platosMasVistos.map((p: any, i: number) => (
                  <div key={i} style={{ marginBottom: i < platosMasVistos.length - 1 ? '10px' : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: i === 0 ? 500 : 400 }}>{p.nombre}</span>
                      <span style={{ color: 'var(--color-accent)', fontSize: '11px' }}>
                        {p.vistas} {p.vistas === 1 ? 'vista' : 'vistas'}
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(p.vistas / platosMasVistos[0].vistas) * 100}%`,
                        background: 'var(--color-accent)',
                        borderRadius: '3px',
                        opacity: 1 - i * 0.15,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <EncabezadoSeccion
                  icono={TrendingUp}
                  titulo="Platos más vistos"
                  style={{ marginBottom: '10px' }}
                />
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  Aún no hay vistas a platos en este periodo
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Los datos aparecen cuando los comensales abren el detalle de un plato
                </div>
              </div>
            </div>
          )
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '16px', opacity: 0.5 }}>
              <EncabezadoSeccion
                icono={TrendingUp}
                titulo="Platos más vistos"
                subtitulo="Disponible en Plan Básico"
                neutro
                derecha={<span style={{ color: 'var(--text-tertiary)', lineHeight: 0 }}><Icono icono={Lock} size={18} /></span>}
                style={{ marginBottom: 0 }}
              />
            </div>
          </div>
        )}

        {/* ===== BLOQUE 2: Platos con interés bajo ===== */}
        {esBasico && platosInteresBajo.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <EncabezadoSeccion
                icono={TrendingDown}
                titulo="Con interés bajo"
                subtitulo="Reciben visitas pero pocos los exploran. Revisa foto, descripción o precio."
                pill="últimos del ranking"
              />
              {platosInteresBajo.map((p: any, i: number) => (
                <div key={i} style={{ marginBottom: i < platosInteresBajo.length - 1 ? '10px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                    <span>{p.nombre}</span>
                    <span style={{ color: 'var(--color-warning)', fontSize: '11px' }}>
                      {p.vistas} {p.vistas === 1 ? 'vista' : 'vistas'}
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${platosMasVistos[0]?.vistas ? (p.vistas / platosMasVistos[0].vistas) * 100 : 20}%`,
                      background: 'var(--color-warning)',
                      borderRadius: '3px',
                      opacity: 0.8,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== BLOQUE 3: Sin vistas en el periodo ===== */}
        {esBasico && platosSinVistas.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <EncabezadoSeccion
                icono={EyeOff}
                titulo={`Sin vistas ${filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}`}
                subtitulo="Estos platos no recibieron vistas en el periodo. Revisa si están activos y considera promocionarlos."
                pill={`${platosSinVistas.length} ${platosSinVistas.length === 1 ? 'plato' : 'platos'}`}
              />
              {platosSinVistas.map((p: any, i: number) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: i < platosSinVistas.length - 1 ? '6px' : 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.nombre}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    {etiquetaAntiguedad(p.diasCreado)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

       

        {/* Últimas reseñas */}
        {esPro && resenas.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <EncabezadoSeccion
                icono={Star}
                titulo="Últimas reseñas"
                subtitulo="de todo el historial"
                style={{ marginBottom: '12px' }}
              />
              {resenas.map((r: any, i: number) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < resenas.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>{r.plato}</span>
                    <div style={{ fontSize: '11px', color: 'var(--color-warning)' }}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
                  </div>
                  {r.comentario && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.comentario}</div>}
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{r.tiempo}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Descargar reporte */}
        {esPro && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div onClick={generarReportePDF} style={{
              background: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
              padding: '14px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', cursor: 'pointer',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Descargar reporte</div>
                <div style={{ fontSize: '11px', color: 'var(--bg-secondary)', opacity: 0.6, marginTop: '2px' }}>PDF · {filtroTiempo === 'hoy' ? 'Hoy' : filtroTiempo === 'semana' ? 'Esta semana' : 'Este mes'}</div>
              </div>
              <span style={{ color: 'var(--bg-secondary)', lineHeight: 0 }}><Icono icono={Download} size={18} /></span>
            </div>
          </div>
        )}

        {/* Upsell */}
        {!esPro && (
          <div style={{ padding: '0 20px', marginBottom: '16px' }}>
            {plan === 'gratis' ? (
              <div onClick={() => router.push('/suscripcion')} style={{
                background: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
                padding: '16px', textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Desbloquear estadísticas</div>
                <div style={{ fontSize: '12px', color: 'var(--bg-secondary)', opacity: 0.7, marginTop: '4px' }}>Plan Básico desde ${formatoPrecio(PLANES.basico.precioMensual)}/mes</div>
              </div>
            ) : (
              <div onClick={() => router.push('/suscripcion')} style={{
                background: 'var(--color-warning-light)', borderRadius: 'var(--radius-md)',
                padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)' }}>Plan Pro</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-warning)', opacity: 0.8, marginTop: '2px' }}>WhatsApp stats + calificaciones</div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 500 }}>Ver →</span>
              </div>
            )}
          </div>
        )}

        <BottomNav />

      </div>

      
    </div>
  )
}