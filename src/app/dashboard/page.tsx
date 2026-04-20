'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'

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

  const [stats, setStats] = useState({
    escaneos: 0,
    visitas: 0,
    pedidosWhatsapp: 0,
    calificacion: 0,
    totalResenas: 0,
  })

  const [statsAnterior, setStatsAnterior] = useState({
    escaneos: 0,
    visitas: 0,
    pedidosWhatsapp: 0,
  })

  const [platosMasVistos, setPlatosMasVistos] = useState<any[]>([])
  const [platosInteresBajo, setPlatosInteresBajo] = useState<any[]>([])
  const [platosSinVistas, setPlatosSinVistas] = useState<any[]>([])
  const [horariosPico, setHorariosPico] = useState<any[]>([])
  const [escaneosPorDia, setEscaneosPorDia] = useState<any[]>([])
  const [resenas, setResenas] = useState<any[]>([])
  const [mejorDia, setMejorDia] = useState<{ dia: string; cantidad: number } | null>(null)
  const [peorDia, setPeorDia] = useState<{ dia: string; cantidad: number } | null>(null)
  const [alertas, setAlertas] = useState<any[]>([])
  const [heatmapData, setHeatmapData] = useState<any>(null)

  useEffect(() => {
    if (!rest?.id) return
    async function cargarStats() {
      const supabase = createClient()
      const hoy = new Date()
      // Fecha en zona horaria Colombia (UTC-5) para evitar desfase con toISOString
      function fechaColombia(d: Date): string {
        const offsetCol = -5 * 60 // Colombia está en UTC-5 (en minutos)
        const offsetLocal = d.getTimezoneOffset()
        const ajuste = (offsetLocal - offsetCol) * 60 * 1000
        const fechaAjustada = new Date(d.getTime() - ajuste)
        return fechaAjustada.toISOString().split('T')[0]
      }
      const hoyStr = fechaColombia(hoy)
      let desde = ''
      let hasta = hoyStr
      let desdeAnterior = ''
      let hastaAnterior = ''

      if (filtroTiempo === 'hoy') {
        desde = hoyStr
        hasta = hoyStr
        const ayer = fechaColombia(new Date(hoy.getTime() - 24 * 60 * 60 * 1000))
        desdeAnterior = ayer
        hastaAnterior = ayer
      } else if (filtroTiempo === 'semana') {
        desde = fechaColombia(new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000))
        hasta = hoyStr
        desdeAnterior = fechaColombia(new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000))
        hastaAnterior = fechaColombia(new Date(hoy.getTime() - 8 * 24 * 60 * 60 * 1000))
      } else {
        const yyyy = hoy.getFullYear()
        const mm = String(hoy.getMonth() + 1).padStart(2, '0')
        desde = `${yyyy}-${mm}-01`
        hasta = hoyStr

        const mesAnterior = hoy.getMonth() === 0 ? 12 : hoy.getMonth()
        const yearAnterior = hoy.getMonth() === 0 ? yyyy - 1 : yyyy
        const mmAnterior = String(mesAnterior).padStart(2, '0')
        const ultimoDiaMesAnterior = new Date(yearAnterior, mesAnterior, 0).getDate()
        desdeAnterior = `${yearAnterior}-${mmAnterior}-01`
        hastaAnterior = `${yearAnterior}-${mmAnterior}-${String(ultimoDiaMesAnterior).padStart(2, '0')}`
      }

      // Visitas al menú
      const { count: visitas } = await supabase
        .from('visitas_menu')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)


      // Pedidos WhatsApp
      const { count: pedidos } = await supabase
        .from('pedidos_whatsapp')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

      // Calificación promedio
      const { data: calData } = await supabase
        .from('calificaciones')
        .select('estrellas')
        .eq('restaurante_id', rest!.id)

      let promedio = 0
      if (calData && calData.length > 0) {
        promedio = Math.round((calData.reduce((sum: number, c: any) => sum + c.estrellas, 0) / calData.length) * 10) / 10
      }

      // Vistas de platos
      const { count: vistasPlatos } = await supabase
        .from('vistas_platos')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

      // Platos más vistos
      const { data: vistasData } = await supabase
        .from('vistas_platos')
        .select('plato_id')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

      // Siempre cargar todos los platos (con created_at) para análisis de antigüedad
      const { data: platosInfo } = await supabase
        .from('platos')
        .select('id, nombre, created_at')
        .eq('restaurante_id', rest!.id)

      if (platosInfo && platosInfo.length > 0) {
        const conteo: Record<string, number> = {}
        if (vistasData) {
          vistasData.forEach((v: any) => { conteo[v.plato_id] = (conteo[v.plato_id] || 0) + 1 })
        }

        // Fecha de inicio del periodo para filtrar por antigüedad del plato
        const desdePeriodo = new Date(desde + 'T00:00:00')

        // Platos con vistas (ordenados de más a menos)
        const platosConVistas = platosInfo
          .filter((p: any) => conteo[p.id])
          .map((p: any) => ({
            id: p.id,
            nombre: p.nombre,
            vistas: conteo[p.id],
            created_at: p.created_at,
          }))
          .sort((a: any, b: any) => b.vistas - a.vistas)

        // ===== Platos más vistos (top 5) =====
        setPlatosMasVistos(platosConVistas.slice(0, 5))

        // ===== Interés bajo: platos con vistas pero en el 30% más bajo =====
        // Solo aplica si hay al menos 6 platos con vistas (si no, ya los muestra el top)
        let interesBajo: any[] = []
        if (platosConVistas.length >= 6) {
          const promedio = platosConVistas.reduce((sum: number, p: any) => sum + p.vistas, 0) / platosConVistas.length
          const corteMinimo = Math.floor(platosConVistas.length * 0.7) // Último 30%
          interesBajo = platosConVistas
            .slice(corteMinimo)
            .filter((p: any) => p.vistas < promedio)
            .slice(0, 5)
        }
        setPlatosInteresBajo(interesBajo)

        // ===== Sin vistas en el periodo (solo platos creados antes del periodo) =====
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
        setPlatosSinVistas(sinVistasPeriodo)
      } else {
        setPlatosMasVistos([])
        setPlatosInteresBajo([])
        setPlatosSinVistas([])
      }

      // Horarios pico + Heatmap día × hora
      const { data: visitasHora } = await supabase
        .from('visitas_menu')
        .select('created_at, fecha')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

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
        setHorariosPico(listaHoras)

        // ===== Matriz heatmap 8 bloques × 7 días =====
        // Bloques de 3 horas cubriendo las 24h: 0-3, 3-6, 6-9, 9-12, 12-15, 15-18, 18-21, 21-24
        // Días: lun(0), mar(1), mié(2), jue(3), vie(4), sáb(5), dom(6)
        // JS usa domingo=0, lunes=1... así que mapeamos: lun=1→0, mar=2→1... dom=0→6
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

        setHeatmapData({
          matriz,
          maxCelda,
          totalVisitas,
          pico,
          diasMuertos,
          hayDatosSuficientes,
        })
      } else {
        setHorariosPico([])
        setHeatmapData(null)
      }

      // Visitas por día con fechas reales
      const { data: visitasDia } = await supabase
        .from('visitas_menu')
        .select('fecha')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

      const diasCortos = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

      // Calcular lunes de esta semana
      const diaHoy = hoy.getDay()
      const diasDesdeLunesSem = diaHoy === 0 ? 6 : diaHoy - 1
      const lunesSemana = new Date(hoy)
      lunesSemana.setDate(hoy.getDate() - diasDesdeLunesSem)
      lunesSemana.setHours(0, 0, 0, 0)

      // Construir array de 7 días (lun a dom) con fechas reales
      const diasConFecha: any[] = []
      for (let i = 0; i < 7; i++) {
        const fecha = new Date(lunesSemana)
        fecha.setDate(lunesSemana.getDate() + i)
        const yyyy = fecha.getFullYear()
        const mm = String(fecha.getMonth() + 1).padStart(2, '0')
        const dd = String(fecha.getDate()).padStart(2, '0')
        const fechaStr = `${yyyy}-${mm}-${dd}`

        const hoyComparar = fechaColombia(hoy)
        const esFuturo = fechaStr > hoyComparar
        const esHoy = fechaStr === hoyComparar

        diasConFecha.push({
          dia: diasCortos[fecha.getDay()],
          numero: fecha.getDate(),
          fecha: fechaStr,
          actual: 0,
          esFuturo,
          esHoy,
        })
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

      setEscaneosPorDia(diasConFecha)

      // Últimas reseñas
      const { data: resenasData } = await supabase
        .from('calificaciones')
        .select('*, platos(nombre)')
        .eq('restaurante_id', rest!.id)
        .order('created_at', { ascending: false })
        .limit(3)

      if (resenasData && resenasData.length > 0) {
        setResenas(resenasData.map((r: any) => ({
          plato: r.platos?.nombre || 'Plato',
          estrellas: r.estrellas,
          comentario: r.comentario || '',
          tiempo: new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
        })))
      } else {
        setResenas([])
      }

      // Mejor y peor día
      if (visitasDia && visitasDia.length > 0) {
        const porFecha: Record<string, number> = {}
        visitasDia.forEach((v: any) => { porFecha[v.fecha] = (porFecha[v.fecha] || 0) + 1 })
        const fechas = Object.entries(porFecha).sort((a: any, b: any) => b[1] - a[1])
        if (fechas.length > 0) {
          setMejorDia({ dia: new Date(fechas[0][0] + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }), cantidad: fechas[0][1] })
          setPeorDia({ dia: new Date(fechas[fechas.length - 1][0] + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }), cantidad: fechas[fechas.length - 1][1] })
        }
      } else {
        setPlatosMasVistos([])
        setPlatosInteresBajo([])
        setPlatosSinVistas([])
      }

      // ===== Datos del periodo anterior =====
      const { count: visitasAnt } = await supabase
        .from('visitas_menu')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desdeAnterior)
        .lte('fecha', hastaAnterior)

      const { count: vistasPlatosAnt } = await supabase
        .from('vistas_platos')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desdeAnterior)
        .lte('fecha', hastaAnterior)

      const { count: pedidosAnt } = await supabase
        .from('pedidos_whatsapp')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desdeAnterior)
        .lte('fecha', hastaAnterior)

      setStatsAnterior({
        escaneos: visitasAnt || 0,
        visitas: vistasPlatosAnt || 0,
        pedidosWhatsapp: pedidosAnt || 0,
      })

      // ===== Detección de alertas =====
      const nuevasAlertas: any[] = []

      // Alerta 1: Sin visitas en últimos 3 días
      const hace3Dias = fechaColombia(new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000))
      const { count: visitasUltimos3 } = await supabase
        .from('visitas_menu')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', hace3Dias)
        .lte('fecha', hoyStr)

      if ((visitasUltimos3 || 0) === 0) {
        // Verificar si el restaurante tiene al menos 1 visita histórica
        const { count: totalVisitasHist } = await supabase
          .from('visitas_menu')
          .select('*', { count: 'exact', head: true })
          .eq('restaurante_id', rest!.id)

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
      const { data: ultimoPlato } = await supabase
        .from('platos')
        .select('updated_at')
        .eq('restaurante_id', rest!.id)
        .order('updated_at', { ascending: false })
        .limit(1)


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
      const { data: platosAgotados } = await supabase
        .from('platos')
        .select('id, nombre, updated_at')
        .eq('restaurante_id', rest!.id)
        .eq('disponible', false)

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
        const primerDiaMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
        const { count: visitasMes } = await supabase
          .from('visitas_menu')
          .select('*', { count: 'exact', head: true })
          .eq('restaurante_id', rest!.id)
          .gte('fecha', primerDiaMes)
          .lte('fecha', hoyStr)

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

      setAlertas(nuevasAlertas)

      setStats({
        escaneos: visitas || 0,
        visitas: vistasPlatos || 0,
        pedidosWhatsapp: pedidos || 0,
        calificacion: promedio,
        totalResenas: calData?.length || 0,
      })
    }
    cargarStats()
  }, [rest?.id, filtroTiempo])

  const esBasico = plan === 'basico' || plan === 'pro'
  async function generarReportePDF() {
    const jsPDF = (await import('jspdf')).default
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF('p', 'mm', 'a4')
    const ancho = doc.internal.pageSize.getWidth()
    const alto = doc.internal.pageSize.getHeight()
    const margen = 20
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
    pintarFondo()

    // ===== HEADER CON MARCA =====
    y = 22

    // Logo "MenuApp" con "App" en naranja
    doc.setTextColor(...TEXTO)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('Menu', margen, y)
    const anchoMenu = doc.getTextWidth('Menu')
    doc.setTextColor(...NARANJA)
    doc.text('App', margen + anchoMenu, y)

    // Etiqueta debajo del logo
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('REPORTE DE ESTADÍSTICAS', margen, y + 5)

    // Info del periodo a la derecha
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(8)
    doc.text(contextoTemporal.titulo.toUpperCase(), ancho - margen, y - 6, { align: 'right' })

    doc.setTextColor(...TEXTO)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(contextoTemporal.rango, ancho - margen, y, { align: 'right' })

    if (contextoTemporal.progreso) {
      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(contextoTemporal.progreso, ancho - margen, y + 5, { align: 'right' })
    }

    // Línea naranja separadora
    y += 10
    doc.setDrawColor(...NARANJA)
    doc.setLineWidth(0.8)
    doc.line(margen, y, ancho - margen, y)

    y += 10

    // ===== NOMBRE DEL RESTAURANTE =====
    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Restaurante', margen, y)

    y += 6
    doc.setTextColor(...TEXTO)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(restaurante.nombre, margen, y)

    // Fecha de generación
    const fechaGen = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.setTextColor(...TEXTO_TER)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generado ${fechaGen}`, margen, y + 5)

    y += 14

    // ===== RESUMEN EJECUTIVO =====
    doc.setFillColor(...CREMA_OSCURO)
    doc.roundedRect(margen, y, ancho - margen * 2, 32, 2, 2, 'F')

    doc.setTextColor(...TEXTO_SEC)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('RESUMEN EJECUTIVO', margen + 6, y + 7)

    doc.setTextColor(...TEXTO)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    // Línea 1: visitas con variación coloreada
    const textoInicio1 = `Recibiste ${stats.escaneos} visitas al menú`
    doc.text(textoInicio1, margen + 6, y + 14)
    const anchoInicio1 = doc.getTextWidth(textoInicio1)

    if (varEscaneos.valor !== 0 && statsAnterior.escaneos > 0) {
      const signo = varEscaneos.valor > 0 ? '+' : '−'
      const textoVar = ` (${signo}${Math.abs(varEscaneos.valor)}% vs ${labelAnterior})`
      doc.setTextColor(...(varEscaneos.valor > 0 ? VERDE_EXITO : ROJO_PELIGRO))
      doc.setFont('helvetica', 'bold')
      doc.text(textoVar, margen + 6 + anchoInicio1, y + 14)
    }

    doc.setTextColor(...TEXTO)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    // Línea 2: conversión
    const lineaResumen2 = esPro && embudoData.visitasMenu > 0
      ? `Conversión del ${embudoData.conversionFinal}% — ${embudoData.diagnostico.tipo === 'excelente' ? 'por encima del promedio del sector.'
        : embudoData.diagnostico.tipo === 'bueno' ? 'en el promedio del sector.'
        : embudoData.diagnostico.tipo === 'regular' ? 'por debajo del promedio (10%).'
        : 'muy por debajo del promedio.'}`
      : `Total de pedidos por WhatsApp: ${stats.pedidosWhatsapp}.`
    doc.text(lineaResumen2, margen + 6, y + 20)

    // Línea 3: mejor día
    const mejorDiaResumen = escaneosPorDia.filter((d: any) => !d.esFuturo && d.actual > 0).sort((a: any, b: any) => b.actual - a.actual)[0]
    const lineaResumen3 = mejorDiaResumen
      ? `Mejor día: ${mejorDiaResumen.dia} ${mejorDiaResumen.numero} con ${mejorDiaResumen.actual} visitas.${horariosPico[0] ? ` Horario pico: ${horariosPico[0].rango}.` : ''}`
      : 'Aún no hay suficientes datos para identificar patrones diarios.'
    doc.text(lineaResumen3, margen + 6, y + 26)

    y += 40

    // ===== MÉTRICAS PRINCIPALES =====
    doc.setTextColor(...TEXTO)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Métricas principales', margen, y)
    y += 5

    const formatearVariacion = (v: typeof varEscaneos) => {
      if (v.tipo === 'neutro' && v.texto === '—') return '—'
      if (v.tipo === 'nuevo') return 'Nuevo'
      const signo = v.valor > 0 ? '+' : '−'
      return `${signo}${Math.abs(v.valor)}%`
    }

    const metricasBody = [
      ['Visitas al menú', stats.escaneos.toString(), statsAnterior.escaneos.toString(), formatearVariacion(varEscaneos)],
      ['Platos vistos', stats.visitas.toString(), statsAnterior.visitas.toString(), formatearVariacion(varVisitas)],
    ]

    if (esPro) {
      metricasBody.push(['Pedidos WhatsApp', stats.pedidosWhatsapp.toString(), statsAnterior.pedidosWhatsapp.toString(), formatearVariacion(varPedidos)])
      metricasBody.push(['Calificación', `${stats.calificacion}/5`, `${stats.totalResenas} reseñas`, '—'])
    }

    ;autoTable(doc, {
      startY: y,
      head: [['Métrica', 'Actual', labelAnterior.charAt(0).toUpperCase() + labelAnterior.slice(1), 'Cambio']],
      body: metricasBody,
      margin: { left: margen, right: margen },
      styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
      headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: CREMA_MEDIO },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right', fontStyle: 'bold' },
        2: { halign: 'right', textColor: TEXTO_SEC },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.column.index === 3 && data.row.section === 'body') {
          const texto = data.cell.raw as string
          if (texto.startsWith('+')) data.cell.styles.textColor = VERDE_EXITO
          else if (texto.startsWith('−')) data.cell.styles.textColor = ROJO_PELIGRO
          else if (texto === 'Nuevo') data.cell.styles.textColor = AZUL_INFO
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 12

    // ===== EMBUDO DE CONVERSIÓN (solo Pro) =====
    if (esPro && embudoData.visitasMenu > 0) {
      if (y > 210) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Embudo de conversión', margen, y)
      y += 5

      ;autoTable(doc, {
        startY: y,
        head: [['Etapa', 'Cantidad', '% del total', 'Tasa de paso']],
        body: [
          ['Abrieron el menú', embudoData.visitasMenu.toString(), '100%', '—'],
          ['Vieron detalle de platos', embudoData.vieronPlatos.toString(), `${Math.round((embudoData.vieronPlatos / embudoData.visitasMenu) * 100)}%`, `${embudoData.tasaExploracion}%`],
          ['Pidieron por WhatsApp', embudoData.pidieron.toString(), `${Math.round((embudoData.pidieron / embudoData.visitasMenu) * 100)}%`, `${embudoData.tasaPedido}%`],
        ],
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold' },
          2: { halign: 'right', textColor: TEXTO_SEC },
          3: { halign: 'right', textColor: NARANJA, fontStyle: 'bold' },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 8

      // Caja de diagnóstico con barra lateral de color
      const esExito = embudoData.diagnostico.tipo === 'excelente'
      const esBueno = embudoData.diagnostico.tipo === 'bueno'
      const esRegular = embudoData.diagnostico.tipo === 'regular'

      const colorFondoDiag = esExito ? VERDE_FONDO : esBueno ? AZUL_FONDO : esRegular ? NARANJA_CLARO : ROJO_FONDO
      const colorBarraDiag = esExito ? VERDE_EXITO : esBueno ? AZUL_INFO : esRegular ? NARANJA_BORDE : ROJO_PELIGRO
      const colorTituloDiag = esExito ? VERDE_TEXTO : esBueno ? AZUL_TEXTO : esRegular ? NARANJA_TEXTO : ROJO_TEXTO
      const colorCuerpoDiag = esExito ? VERDE_TEXTO : esBueno ? AZUL_TEXTO : esRegular ? NARANJA_TEXTO : ROJO_TEXTO

      const tituloDiag = esExito ? 'Rendimiento excelente' : esBueno ? 'Rendimiento bueno' : esRegular ? 'Rendimiento regular' : 'Rendimiento bajo'

      const lineasDiag = doc.splitTextToSize(embudoData.diagnostico.mensaje, ancho - margen * 2 - 12)
      const alturaDiag = 12 + lineasDiag.length * 4

      doc.setFillColor(...colorFondoDiag)
      doc.roundedRect(margen, y, ancho - margen * 2, alturaDiag, 2, 2, 'F')

      doc.setFillColor(...colorBarraDiag)
      doc.rect(margen, y, 2, alturaDiag, 'F')

      doc.setTextColor(...colorTituloDiag)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(tituloDiag, margen + 6, y + 7)

      doc.setTextColor(...colorCuerpoDiag)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(lineasDiag, margen + 6, y + 12)

      y += alturaDiag + 6

      // Recomendación si existe
      if (embudoData.recomendacion) {
        if (y > 245) { doc.addPage(); pintarFondo(); y = 20 }

        const lineasRec = doc.splitTextToSize(embudoData.recomendacion, ancho - margen * 2 - 12)
        const alturaRec = 12 + lineasRec.length * 4

        doc.setFillColor(...NARANJA_CLARO)
        doc.roundedRect(margen, y, ancho - margen * 2, alturaRec, 2, 2, 'F')

        doc.setFillColor(...NARANJA_BORDE)
        doc.rect(margen, y, 2, alturaRec, 'F')

        doc.setTextColor(...NARANJA_TEXTO)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Recomendación', margen + 6, y + 7)

        doc.setTextColor(...NARANJA_TEXTO)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(lineasRec, margen + 6, y + 12)

        y += alturaRec + 10
      }
    }

    // ===== ACTIVIDAD POR DÍA =====
    const diasConDatos = escaneosPorDia.filter((d: any) => !d.esFuturo)
    if (diasConDatos.length > 0 && diasConDatos.some((d: any) => d.actual > 0) && filtroTiempo !== 'hoy') {
      if (y > 210) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Actividad por día', margen, y)
      y += 5

      ;autoTable(doc, {
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
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 3.5, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', textColor: TEXTO_SEC },
          2: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
          3: { textColor: TEXTO_TER, fontSize: 8 },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // ===== HEATMAP DÍA × HORA (solo Pro) =====
    if (esPro && heatmapData && heatmapData.hayDatosSuficientes) {
      if (y > 190) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Patrón de visitas día × hora', margen, y)

      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('Número de visitas recibidas en cada franja horaria', margen, y + 4)
      y += 9

      const bloquesLabels = ['0—3h', '3—6h', '6—9h', '9—12h', '12—15h', '15—18h', '18—21h', '21—24h']
      const diasPDF = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

      // Construir body: cada fila es un bloque horario con sus 7 días
      const heatmapBody = heatmapData.matriz.map((fila: number[], b: number) => {
        return [bloquesLabels[b], ...fila.map((v: number) => v === 0 ? '—' : v.toString())]
      })

      ;autoTable(doc, {
        startY: y,
        head: [['Horario', ...diasPDF]],
        body: heatmapBody,
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 3, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1, halign: 'center' },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8, halign: 'center' },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'right', textColor: TEXTO_SEC, cellWidth: 22 },
        },
        didParseCell: (data: any) => {
          if (data.column.index > 0 && data.row.section === 'body') {
            const valor = parseInt(data.cell.raw as string)
            if (!isNaN(valor) && valor > 0) {
              const ratio = heatmapData.maxCelda > 0 ? valor / heatmapData.maxCelda : 0
              if (ratio >= 0.75) {
                data.cell.styles.fillColor = [232, 93, 36]
                data.cell.styles.textColor = [255, 255, 255]
                data.cell.styles.fontStyle = 'bold'
              } else if (ratio >= 0.5) {
                data.cell.styles.fillColor = [245, 146, 90]
                data.cell.styles.textColor = [255, 255, 255]
                data.cell.styles.fontStyle = 'bold'
              } else if (ratio >= 0.25) {
                data.cell.styles.fillColor = [249, 178, 125]
                data.cell.styles.textColor = [122, 51, 16]
              } else {
                data.cell.styles.fillColor = [253, 232, 217]
                data.cell.styles.textColor = [122, 51, 16]
              }
            } else {
              data.cell.styles.textColor = TEXTO_TER
            }
          }
        },
      })

      y = (doc as any).lastAutoTable.finalY + 6

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
        const textoInsightCompleto = textosInsight.join(' ')
        const lineasInsight = doc.splitTextToSize(textoInsightCompleto, ancho - margen * 2 - 12)
        const alturaInsight = 8 + lineasInsight.length * 4

        doc.setFillColor(...CREMA_OSCURO)
        doc.roundedRect(margen, y, ancho - margen * 2, alturaInsight, 2, 2, 'F')

        doc.setFillColor(...NARANJA)
        doc.rect(margen, y, 2, alturaInsight, 'F')

        doc.setTextColor(...TEXTO)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(lineasInsight, margen + 6, y + 6)

        y += alturaInsight + 10
      }
    }

    // ===== HORARIOS PICO (solo Básico, el heatmap lo reemplaza en Pro) =====
    if (!esPro && horariosPico.length > 0) {
      if (y > 225) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Horarios con más visitas', margen, y)
      y += 5

      ;autoTable(doc, {
        startY: y,
        head: [['Horario', 'Visitas']],
        body: horariosPico.map((h: any) => [h.rango, h.escaneos.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // ===== PLATOS MÁS VISTOS =====
    if (platosMasVistos.length > 0) {
      if (y > 210) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Platos más vistos', margen, y)
      y += 5

      ;autoTable(doc, {
        startY: y,
        head: [['#', 'Plato', 'Vistas']],
        body: platosMasVistos.map((p: any, i: number) => [(i + 1).toString(), p.nombre, p.vistas.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12, textColor: TEXTO_SEC },
          1: { fontStyle: 'bold' },
          2: { halign: 'right', fontStyle: 'bold', textColor: NARANJA },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 10
    }

    // ===== PLATOS CON INTERÉS BAJO =====
    if (platosInteresBajo.length > 0) {
      if (y > 210) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Platos con interés bajo', margen, y)

      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('Reciben visitas pero pocos los exploran. Revisa foto, descripción o precio.', margen, y + 4)
      y += 9

      ;autoTable(doc, {
        startY: y,
        head: [['Plato', 'Vistas']],
        body: platosInteresBajo.map((p: any) => [p.nombre, p.vistas.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', fontStyle: 'bold', textColor: NARANJA_BORDE },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 10
    }

    // ===== PLATOS SIN VISTAS =====
    if (platosSinVistas.length > 0) {
      if (y > 210) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      const tituloSinVistas = `Sin vistas ${filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}`
      doc.text(tituloSinVistas, margen, y)

      doc.setTextColor(...TEXTO_SEC)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('Revisa si están activos y considera promocionarlos.', margen, y + 4)
      y += 9

      ;autoTable(doc, {
        startY: y,
        head: [['Plato', 'Antigüedad']],
        body: platosSinVistas.map((p: any) => {
          const antiguedad = p.diasCreado === 0 ? 'Hoy'
            : p.diasCreado === 1 ? 'Hace 1 día'
            : p.diasCreado < 30 ? `Hace ${p.diasCreado} días`
            : p.diasCreado < 60 ? 'Hace 1 mes'
            : `Hace ${Math.floor(p.diasCreado / 30)} meses`
          return [p.nombre, antiguedad]
        }),
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right', textColor: TEXTO_SEC },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // ===== ÚLTIMAS RESEÑAS =====
    if (esPro && resenas.length > 0) {
      if (y > 195) { doc.addPage(); pintarFondo(); y = 20 }

      doc.setTextColor(...TEXTO)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Últimas reseñas de comensales', margen, y)
      y += 5

      ;autoTable(doc, {
        startY: y,
        head: [['Plato', 'Calificación', 'Comentario', 'Fecha']],
        body: resenas.map((r: any) => [
          r.plato,
          `${r.estrellas}/5`,
          r.comentario || '—',
          r.tiempo,
        ]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 8, cellPadding: 4, textColor: TEXTO, lineColor: BORDE_SUAVE, lineWidth: 0.1 },
        headStyles: { fillColor: CREMA_OSCURO, textColor: TEXTO_SEC, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: CREMA_MEDIO },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 35 },
          1: { halign: 'center', textColor: NARANJA_BORDE, fontStyle: 'bold', cellWidth: 22 },
          2: { cellWidth: 80 },
          3: { halign: 'right', textColor: TEXTO_SEC, cellWidth: 25 },
        },
      })
    }

    // ===== FOOTER EN TODAS LAS PÁGINAS =====
    const totalPaginas = doc.getNumberOfPages()
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i)

      // Línea separadora suave
      doc.setDrawColor(...BORDE)
      doc.setLineWidth(0.3)
      doc.line(margen, alto - 15, ancho - margen, alto - 15)

      // Marca
      doc.setFontSize(7)
      doc.setTextColor(...TEXTO_TER)
      doc.setFont('helvetica', 'normal')
      doc.text('MenuApp · Menú digital para restaurantes', margen, alto - 9)
      doc.text(`${restaurante.nombre}`, ancho / 2, alto - 9, { align: 'center' })
      doc.text(`Página ${i} de ${totalPaginas}`, ancho - margen, alto - 9, { align: 'right' })
    }

    // ===== DESCARGAR =====
    const periodoNombre = filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'semana' : 'mes'
    const fechaArchivo = new Date().toISOString().split('T')[0]
    const nombreArchivo = `menuapp-${restaurante.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${periodoNombre}-${fechaArchivo}.pdf`
    doc.save(nombreArchivo)
  }
  const esPro = plan === 'pro'
  const maxEscaneo = escaneosPorDia.length > 0 ? Math.max(...escaneosPorDia.map((d: any) => d.actual), 1) : 1
  const textoFiltro = filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'

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
      nuevo: { bg: 'var(--color-info-light)', text: 'var(--color-info)' },
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
  // ===== Embudo de conversión inteligente =====
  const embudoData = (() => {
    const visitasMenu = stats.escaneos
    const vieronPlatos = stats.visitas
    const pidieron = stats.pedidosWhatsapp

    // Tasas de paso entre etapas
    const tasaExploracion = visitasMenu > 0 ? (vieronPlatos / visitasMenu) * 100 : 0
    const tasaPedido = vieronPlatos > 0 ? (pidieron / vieronPlatos) * 100 : 0
    const conversionFinal = visitasMenu > 0 ? (pidieron / visitasMenu) * 100 : 0

    // Fuga en cada etapa (cuántos se fueron)
    const fugaExploracion = visitasMenu > 0 ? ((visitasMenu - vieronPlatos) / visitasMenu) * 100 : 0
    const fugaPedido = vieronPlatos > 0 ? ((vieronPlatos - pidieron) / vieronPlatos) * 100 : 0

    // Benchmark del sector (restaurantes con menú digital)
    // Fuentes: promedio observado 8-15% conversión final
    const benchmarkConversion = 10
    const diferenciaBenchmark = conversionFinal - benchmarkConversion

    // Identificar la mayor fuga
    const mayorFuga = fugaExploracion >= fugaPedido
      ? { etapa: 'menu_a_plato', pct: Math.round(fugaExploracion), perdidos: visitasMenu - vieronPlatos }
      : { etapa: 'plato_a_pedido', pct: Math.round(fugaPedido), perdidos: vieronPlatos - pidieron }

    // Diagnóstico del rendimiento general
    let diagnostico: { tipo: 'excelente' | 'bueno' | 'regular' | 'mejorable' | 'sin_datos'; mensaje: string } = {
      tipo: 'sin_datos',
      mensaje: 'Comparte tu menú para empezar a ver datos de conversión.',
    }
    if (visitasMenu > 0) {
      if (conversionFinal >= 15) {
        diagnostico = { tipo: 'excelente', mensaje: `Conversión del ${Math.round(conversionFinal)}% — por encima del promedio del sector (10%). Tu menú está funcionando muy bien.` }
      } else if (conversionFinal >= 10) {
        diagnostico = { tipo: 'bueno', mensaje: `Conversión del ${Math.round(conversionFinal)}% — en el promedio del sector. Hay espacio para optimizar.` }
      } else if (conversionFinal >= 5) {
        diagnostico = { tipo: 'regular', mensaje: `Conversión del ${Math.round(conversionFinal)}% — por debajo del promedio (10%). Hay oportunidades claras de mejora.` }
      } else {
        diagnostico = { tipo: 'mejorable', mensaje: `Conversión del ${Math.round(conversionFinal)}% — muy por debajo del promedio (10%). Revisa los puntos de fuga.` }
      }
    }

    // Recomendación según dónde está la mayor fuga
    let recomendacion = ''
    if (visitasMenu >= 10) {
      if (mayorFuga.etapa === 'menu_a_plato' && mayorFuga.pct >= 50) {
        recomendacion = 'Muchos abren el menú pero no entran a ningún plato. Mejora las fotos de portada y los nombres de las categorías.'
      } else if (mayorFuga.etapa === 'plato_a_pedido' && mayorFuga.pct >= 70) {
        recomendacion = 'Ven los platos pero no piden. Revisa precios, descripciones y tiempos de entrega que muestras.'
      }
    }

    return {
      visitasMenu, vieronPlatos, pidieron,
      tasaExploracion: Math.round(tasaExploracion),
      tasaPedido: Math.round(tasaPedido),
      conversionFinal: Math.round(conversionFinal * 10) / 10,
      mayorFuga,
      diagnostico,
      recomendacion,
      benchmarkConversion,
      diferenciaBenchmark: Math.round(diferenciaBenchmark * 10) / 10,
    }
  })()

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  if (cargando) {
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
              background: esPro ? 'var(--color-warning-light)' : esBasico ? 'var(--color-info-light)' : 'var(--bg-tertiary)',
              color: esPro ? 'var(--color-warning)' : esBasico ? 'var(--color-info)' : 'var(--text-secondary)',
            }}>
              {esPro ? 'Pro' : esBasico ? 'Básico' : 'Gratis'}
            </div>
            <div onClick={() => setMostrarPerfil(!mostrarPerfil)} style={{
              width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-info)',
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
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 500, color: 'white', overflow: 'hidden' }}>
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
                { label: 'Mi suscripción', sub: esPro ? 'Plan Pro' : esBasico ? 'Plan Básico' : 'Plan Gratis', href: '/suscripcion' },
                { label: 'Mis facturas', sub: 'Descargar y compartir', href: '/facturas' },
                { label: 'Invitar restaurantes', sub: 'Gana meses gratis', href: '/referidos' },
                { label: 'Idioma', sub: 'Español', href: '#' },
              ].map((item: any, i: number) => (
                <div key={i} onClick={() => { setMostrarPerfil(false); router.push(item.href) }} style={{
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
                  bg: 'var(--color-info-light)',
                  border: 'var(--color-info)',
                  text: 'var(--color-info)',
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
              <div onClick={() => setMostrarFiltro(!mostrarFiltro)} style={{
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginLeft: '12px',
              }}>
                Cambiar ↓
              </div>
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
                        background: filtroTiempo === f.id ? 'var(--color-info-light)' : 'transparent',
                        color: filtroTiempo === f.id ? 'var(--color-info)' : 'var(--text-primary)',
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

        {/* Números grandes */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Visitas al menú</div>
                <BadgeVariacion variacion={varEscaneos} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.escaneos}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                vs {statsAnterior.escaneos} {labelAnterior}
              </div>
            </div>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Platos vistos</div>
                <BadgeVariacion variacion={varVisitas} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.visitas}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                vs {statsAnterior.visitas} {labelAnterior}
              </div>
            </div>
          </div>
        </div>
        {stats.escaneos === 0 && stats.visitas === 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ background: 'var(--color-info-light)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '12px', color: 'var(--color-info)' }}>
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
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                  <BadgeVariacion variacion={varPedidos} />
                </div>
                <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.pedidosWhatsapp}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  vs {statsAnterior.pedidosWhatsapp} {labelAnterior}
                </div>
              </div>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 500 }}>{stats.calificacion}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>/5</div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>de {stats.totalResenas} reseñas</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
            </div>
          </div>
        )}

        {/* Embudo de conversión */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Embudo de conversión</div>
                {embudoData.visitasMenu > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {embudoData.conversionFinal}% final
                  </div>
                )}
              </div>

              {/* Etapa 1: Visitaron el menú */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px' }}>Abrieron el menú</span>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{embudoData.visitasMenu}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--color-info)', borderRadius: '3px' }} />
              </div>

              {/* Paso 1 → 2 */}
              {embudoData.visitasMenu > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 4px', padding: '4px 0' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>↓</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {embudoData.tasaExploracion}% continuó explorando
                    {embudoData.mayorFuga.etapa === 'menu_a_plato' && embudoData.mayorFuga.pct >= 50 && (
                      <span style={{ color: 'var(--color-warning)', marginLeft: '6px' }}>· mayor fuga</span>
                    )}
                  </span>
                </div>
              )}

              {/* Etapa 2: Vieron platos */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px' }}>Vieron detalle de platos</span>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{embudoData.vieronPlatos}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${embudoData.tasaExploracion}%`, background: 'var(--color-info)', borderRadius: '3px', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Paso 2 → 3 */}
              {embudoData.vieronPlatos > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 4px', padding: '4px 0' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>↓</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {embudoData.tasaPedido}% llegó al pedido
                    {embudoData.mayorFuga.etapa === 'plato_a_pedido' && embudoData.mayorFuga.pct >= 50 && (
                      <span style={{ color: 'var(--color-warning)', marginLeft: '6px' }}>· mayor fuga</span>
                    )}
                  </span>
                </div>
              )}

              {/* Etapa 3: Pidieron */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px' }}>Pidieron por WhatsApp</span>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{embudoData.pidieron}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${embudoData.visitasMenu > 0 ? (embudoData.pidieron / embudoData.visitasMenu) * 100 : 0}%`, background: 'var(--color-green)', borderRadius: '3px', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Diagnóstico principal */}
              {embudoData.diagnostico.tipo !== 'sin_datos' && (
                <div style={{
                  background: embudoData.diagnostico.tipo === 'excelente' ? 'var(--color-success-light)'
                    : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-info-light)'
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
                      : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-info)'
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
                      : embudoData.diagnostico.tipo === 'bueno' ? 'var(--color-info)'
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
                  background: 'var(--color-info-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  fontSize: '11px',
                  color: 'var(--color-info)',
                  lineHeight: 1.4,
                }}>
                  Aún no hay datos de conversión. Comparte tu QR o enlace para empezar a medir cómo los comensales recorren tu menú.
                </div>
              )}
            </div>
          </div>
        ) : !esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>🔒</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Embudo de conversión</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Disponible en Plan Pro</div>
            </div>
          </div>
        ) : null}

        {/* Actividad por día */}
        {esBasico && filtroTiempo !== 'hoy' && (() => {
          const diasConDatos = escaneosPorDia.filter((d: any) => !d.esFuturo && d.actual > 0)
          const totalVisitasSemana = escaneosPorDia.reduce((s: number, d: any) => s + d.actual, 0)
          const promedioDiario = diasConDatos.length > 0 ? Math.round(totalVisitasSemana / diasConDatos.length) : 0
          const maxDia = Math.max(...escaneosPorDia.map((d: any) => d.actual), 1)

          // Mejor día real (solo de días con datos)
          const mejorDiaSemana = [...diasConDatos].sort((a: any, b: any) => b.actual - a.actual)[0]

          // Mejor horario (ya lo tenemos en horariosPico)
          const topHorario = horariosPico[0]

          return (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Actividad por día</div>
                  {promedioDiario > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      prom. {promedioDiario}/día
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                  {contextoTemporal.rango}
                </div>

                {/* Gráfica */}
                <div style={{ display: 'flex', alignItems: 'end', gap: '6px', height: '90px', marginBottom: '6px', position: 'relative' }}>
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
                      ? 'var(--color-info)'
                      : d.actual > 0
                      ? 'var(--color-info)'
                      : 'var(--bg-tertiary)'

                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative', zIndex: 2 }}>
                        <span style={{
                          fontSize: '10px',
                          color: esMejor ? 'var(--color-green)' : d.esFuturo ? 'var(--text-tertiary)' : d.actual > 0 ? 'var(--color-info)' : 'var(--text-tertiary)',
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

                {/* Labels de días con fecha */}
                <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                  {escaneosPorDia.map((d: any, i: number) => (
                    <div key={i} style={{
                      flex: 1,
                      textAlign: 'center',
                      color: d.esHoy ? 'var(--color-info)' : d.esFuturo ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      fontWeight: d.esHoy ? 500 : 400,
                      opacity: d.esFuturo ? 0.5 : 1,
                      lineHeight: 1.3,
                    }}>
                      <div>{d.dia}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{d.numero}</div>
                    </div>
                  ))}
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
                      <>
                        Mejor día: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{mejorDiaSemana.dia} {mejorDiaSemana.numero}</span> con <span style={{ color: 'var(--color-green)', fontWeight: 500 }}>{mejorDiaSemana.actual} visitas</span>
                        {topHorario && <>. Horario pico: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{topHorario.rango}</span></>}
                        .
                      </>
                    )}
                    {!mejorDiaSemana && topHorario && (
                      <>Horario con más movimiento: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{topHorario.rango}</span>.</>
                    )}
                  </div>
                )}

                {/* Estado vacío */}
                {totalVisitasSemana === 0 && (
                  <div style={{
                    background: 'var(--color-info-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginTop: '14px',
                    fontSize: '11px',
                    color: 'var(--color-info)',
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

          // Función de color naranja escalado según intensidad
          function colorHeatmap(valor: number, max: number): { bg: string; opacity: number } {
            if (valor === 0) return { bg: '#F5EFE6', opacity: 0.3 }
            const ratio = valor / max
            if (ratio >= 0.75) return { bg: '#E85D24', opacity: 1 }      // Intenso
            if (ratio >= 0.5) return { bg: '#F5925A', opacity: 1 }       // Alto
            if (ratio >= 0.25) return { bg: '#F9B27D', opacity: 1 }      // Medio
            return { bg: '#FDE8D9', opacity: 1 }                          // Bajo
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Patrón de visitas</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>día × hora</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                  Número de visitas recibidas en cada franja horaria
                </div>
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
                      color: i === diaMatrizHoy ? 'var(--color-info)' : 'var(--text-secondary)',
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
                        const ratio = heatmapData.maxCelda > 0 ? valor / heatmapData.maxCelda : 0
                        const colorTexto = ratio >= 0.5 ? 'white' : valor === 0 ? 'var(--text-tertiary)' : '#7a3310'
                        return (
                          <div
                            key={`c-${b}-${d}`}
                            title={`${diasLabels[d]} ${bloque.descripcion}: ${valor} ${valor === 1 ? 'visita' : 'visitas'}`}
                            style={{
                              aspectRatio: '1',
                              background: color.bg,
                              opacity: color.opacity,
                              borderRadius: '3px',
                              position: 'relative',
                              border: esPicoCelda ? '1.5px solid var(--color-accent, #E85D24)' : 'none',
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
                  <span>menos</span>
                  <div style={{ width: '14px', height: '10px', background: '#FBF7F0', border: '0.5px solid var(--border-light)', borderRadius: '1px' }} />
                  <div style={{ width: '14px', height: '10px', background: '#FDE8D9', borderRadius: '1px' }} />
                  <div style={{ width: '14px', height: '10px', background: '#F9B27D', borderRadius: '1px' }} />
                  <div style={{ width: '14px', height: '10px', background: '#F5925A', borderRadius: '1px' }} />
                  <div style={{ width: '14px', height: '10px', background: '#E85D24', borderRadius: '1px' }} />
                  <span>más</span>
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
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Patrón de visitas</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Patrón de visitas</div>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'var(--color-warning-light)',
                  color: 'var(--color-warning)',
                }}>
                  Plan Pro
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                Descubre tus días y horas de mayor tráfico
              </div>

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
                      const max = 9
                      const ratio = v / max
                      const bg = v === 0 ? '#F5EFE6'
                        : ratio >= 0.75 ? '#E85D24'
                        : ratio >= 0.5 ? '#F5925A'
                        : ratio >= 0.25 ? '#F9B27D'
                        : '#FDE8D9'
                      return (
                        <div key={`pv-${b}-${d}`} style={{
                          aspectRatio: '1',
                          background: bg,
                          opacity: v === 0 ? 0.3 : 1,
                          borderRadius: '3px',
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Platos más vistos</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    top {platosMasVistos.length}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Los que están generando más interés en tu menú
                </div>
                {platosMasVistos.map((p: any, i: number) => (
                  <div key={i} style={{ marginBottom: i < platosMasVistos.length - 1 ? '10px' : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: i === 0 ? 500 : 400 }}>{p.nombre}</span>
                      <span style={{ color: 'var(--color-info)', fontSize: '11px' }}>
                        {p.vistas} {p.vistas === 1 ? 'vista' : 'vistas'}
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(p.vistas / platosMasVistos[0].vistas) * 100}%`,
                        background: 'var(--color-info)',
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
              <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
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
            <div className="card" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>🔒</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Platos más vistos</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Disponible en Plan Básico</div>
            </div>
          </div>
        )}

        {/* ===== BLOQUE 2: Platos con interés bajo ===== */}
        {esBasico && platosInteresBajo.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Con interés bajo</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  últimos del ranking
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
                Reciben visitas pero pocos los exploran. Revisa foto, descripción o precio.
              </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  Sin vistas {filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  {platosSinVistas.length} {platosSinVistas.length === 1 ? 'plato' : 'platos'}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
                Estos platos no recibieron vistas en el periodo. Revisa si están activos y considera promocionarlos.
              </div>
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
                    {p.diasCreado === 0 ? 'hoy'
                      : p.diasCreado === 1 ? 'hace 1 día'
                      : p.diasCreado < 30 ? `hace ${p.diasCreado} días`
                      : p.diasCreado < 60 ? 'hace 1 mes'
                      : `hace ${Math.floor(p.diasCreado / 30)} meses`}
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
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Últimas reseñas</div>
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
              <span style={{ fontSize: '16px', color: 'var(--bg-secondary)' }}>↓</span>
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
                <div style={{ fontSize: '12px', color: 'var(--bg-secondary)', opacity: 0.7, marginTop: '4px' }}>Plan Básico desde $15.000/mes</div>
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

        {/* Bottom nav */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          maxWidth: '500px', minWidth: '320px', margin: '0 auto',
        }}>
          {[
            { icon: '◉', label: 'Inicio', href: '/dashboard', active: true },
            { icon: '≡', label: 'Menú', href: '/menu', active: false },
            { icon: '◻', label: 'QR', href: '/qr', active: false },
            { icon: '⊙', label: 'Config', href: '/config', active: false },
          ].map((item: any, i: number) => (
            <div key={i} onClick={() => router.push(item.href)} style={{
              flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer',
              color: item.active ? 'var(--color-info)' : 'var(--text-tertiary)',
              fontWeight: item.active ? 500 : 400,
            }}>
              <div style={{ fontSize: '16px', marginBottom: '2px' }}>{item.icon}</div>
              <div style={{ fontSize: '10px' }}>{item.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}