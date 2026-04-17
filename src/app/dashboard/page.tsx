'use client'

import { useState, useEffect } from 'react'
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
  const [platosMenusVistos, setPlatosMenusVistos] = useState<any[]>([])
  const [horariosPico, setHorariosPico] = useState<any[]>([])
  const [escaneosPorDia, setEscaneosPorDia] = useState<any[]>([])
  const [resenas, setResenas] = useState<any[]>([])
  const [mejorDia, setMejorDia] = useState<{ dia: string; cantidad: number } | null>(null)
  const [peorDia, setPeorDia] = useState<{ dia: string; cantidad: number } | null>(null)
  const [alertas, setAlertas] = useState<any[]>([])

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

      if (vistasData && vistasData.length > 0) {
        const conteo: Record<string, number> = {}
        vistasData.forEach((v: any) => { conteo[v.plato_id] = (conteo[v.plato_id] || 0) + 1 })
        const { data: platosInfo } = await supabase
          .from('platos')
          .select('id, nombre')
          .eq('restaurante_id', rest!.id)
        if (platosInfo) {
          // Platos con vistas (ordenados de más a menos)
          const conVistas = Object.entries(conteo)
            .map(([id, vistas]) => ({
              id,
              nombre: platosInfo.find((p: any) => p.id === id)?.nombre || 'Plato',
              vistas,
            }))
            .sort((a: any, b: any) => b.vistas - a.vistas)

          // Platos sin ninguna vista
          const sinVistas = platosInfo
            .filter((p: any) => !conteo[p.id])
            .map((p: any) => ({ id: p.id, nombre: p.nombre, vistas: 0 }))

          setPlatosMasVistos(conVistas.slice(0, 5))
          setPlatosMenusVistos([...conVistas.slice(5), ...sinVistas].slice(0, 5))
        }
      } else {
        setPlatosMasVistos([])
      }

      // Horarios pico
      const { data: visitasHora } = await supabase
        .from('visitas_menu')
        .select('created_at')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
        .lte('fecha', hasta)

      if (visitasHora && visitasHora.length > 0) {
        const porHora: Record<number, number> = {}
        visitasHora.forEach((v: any) => {
          const hora = new Date(v.created_at).getHours()
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
      } else {
        setHorariosPico([])
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
        setPlatosMenusVistos([])
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

      console.log('🔍 ALERTA MENU VIEJO', {
        ultimoPlato,
        tieneData: ultimoPlato && ultimoPlato.length > 0,
      })

      if (ultimoPlato && ultimoPlato.length > 0) {
        const ultimaActualizacion = new Date(ultimoPlato[0].updated_at)
        const diasSinActualizar = Math.floor((hoy.getTime() - ultimaActualizacion.getTime()) / (24 * 60 * 60 * 1000))

        console.log('🔍 DIAS SIN ACTUALIZAR', {
          ultimaActualizacion: ultimoPlato[0].updated_at,
          diasSinActualizar,
          pasaUmbral: diasSinActualizar > 30,
        })

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
    const margen = 20
    let y = 20

    // Header
    doc.setFillColor(30, 30, 30)
    doc.rect(0, 0, ancho, 40, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('MenuApp', margen, 18)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Reporte de estadísticas', margen, 26)
    doc.setFontSize(9)
    doc.text(`${restaurante.nombre} · ${filtroTiempo === 'hoy' ? 'Hoy' : filtroTiempo === 'semana' ? 'Esta semana' : 'Este mes'}`, margen, 33)

    // Fecha de generación
    const fechaGen = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.setFontSize(8)
    doc.text(`Generado: ${fechaGen}`, ancho - margen, 33, { align: 'right' })

    y = 50

    // Métricas principales
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen general', margen, y)
    y += 10

    const metricas = [
      ['Visitas al menú', stats.escaneos.toString()],
      ['Platos vistos', stats.visitas.toString()],
      ['Pedidos WhatsApp', stats.pedidosWhatsapp.toString()],
      ['Calificación promedio', `${stats.calificacion}/5 (${stats.totalResenas} reseñas)`],
    ]

    ;autoTable(doc, {
      startY: y,
      head: [['Métrica', 'Valor']],
      body: metricas,
      margin: { left: margen, right: margen },
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    })

    y = (doc as any).lastAutoTable.finalY + 12

    // Embudo de conversión
    if (stats.escaneos > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Embudo de conversión', margen, y)
      y += 10

      const pctPlatos = stats.escaneos > 0 ? Math.round((stats.visitas / stats.escaneos) * 100) : 0
      const pctPedidos = stats.escaneos > 0 ? Math.round((stats.pedidosWhatsapp / stats.escaneos) * 100) : 0

      ;autoTable(doc, {
        startY: y,
        head: [['Etapa', 'Cantidad', 'Conversión']],
        body: [
          ['Visitaron el menú', stats.escaneos.toString(), '100%'],
          ['Vieron platos', stats.visitas.toString(), `${pctPlatos}%`],
          ['Pidieron por WhatsApp', stats.pedidosWhatsapp.toString(), `${pctPedidos}%`],
        ],
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Platos más vistos
    if (platosMasVistos.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Platos más vistos', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['#', 'Plato', 'Vistas']],
        body: platosMasVistos.map((p: any, i: number) => [(i + 1).toString(), p.nombre, p.vistas.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Platos menos vistos
    if (platosMenusVistos.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Platos menos vistos', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['Plato', 'Vistas']],
        body: platosMenusVistos.map((p: any) => [p.nombre, p.vistas === 0 ? 'Sin vistas' : p.vistas.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Horarios pico
    if (horariosPico.length > 0) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Horarios con más visitas', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['Horario', 'Visitas']],
        body: horariosPico.map((h: any) => [h.rango, h.escaneos.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Visitas por día
    if (escaneosPorDia.length > 0 && escaneosPorDia.some((d: any) => d.actual > 0)) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Visitas por día de la semana', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['Día', 'Visitas']],
        body: escaneosPorDia.map((d: any) => [d.dia, d.actual.toString()]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Mejor y peor día
    if (mejorDia && peorDia) {
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Mejor y peor día', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['', 'Día', 'Visitas']],
        body: [
          ['Mejor día', mejorDia.dia, mejorDia.cantidad.toString()],
          ['Peor día', peorDia.dia, peorDia.cantidad.toString()],
        ],
        margin: { left: margen, right: margen },
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
      })

      y = (doc as any).lastAutoTable.finalY + 12
    }

    // Últimas reseñas
    if (resenas.length > 0) {
      if (y > 230) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Últimas reseñas', margen, y)
      y += 10

      ;autoTable(doc, {
        startY: y,
        head: [['Plato', 'Estrellas', 'Comentario', 'Fecha']],
        body: resenas.map((r: any) => [r.plato, '★'.repeat(r.estrellas), r.comentario || '—', r.tiempo]),
        margin: { left: margen, right: margen },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: { 2: { cellWidth: 60 } },
      })
    }

    // Footer en todas las páginas
    const totalPaginas = doc.getNumberOfPages()
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`MenuApp · ${restaurante.nombre} · Página ${i} de ${totalPaginas}`, ancho / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
    }

    // Descargar
    const periodo = filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'semana' : 'mes'
    doc.save(`reporte-${restaurante.nombre.toLowerCase().replace(/\s+/g, '-')}-${periodo}.pdf`)
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

        {/* Platos más vistos */}
        {esBasico ? (
          platosMasVistos.length > 0 ? (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Platos más vistos</div>
                {platosMasVistos.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                      <span>{p.nombre}</span>
                      <span style={{ color: 'var(--color-info)', fontSize: '11px' }}>{p.vistas} vistas</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(p.vistas / platosMasVistos[0].vistas) * 100}%`, background: 'var(--color-info)', borderRadius: '3px', opacity: 1 - i * 0.15 }} />
                    </div>
                  </div>
                ))}
                {platosMenusVistos.length > 0 && (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '16px', marginBottom: '12px' }}>Platos menos vistos</div>
                    {platosMenusVistos.map((p: any, i: number) => (
                      <div key={i} style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                          <span style={{ color: p.vistas === 0 ? 'var(--text-tertiary)' : 'var(--color-danger)' }}>{p.nombre}</span>
                          <span style={{ color: p.vistas === 0 ? 'var(--text-tertiary)' : 'var(--color-danger)', fontSize: '11px' }}>{p.vistas === 0 ? 'Sin vistas' : `${p.vistas} vistas`}</span>
                        </div>
                        {p.vistas > 0 && platosMasVistos[0]?.vistas > 0 && (
                          <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(p.vistas / platosMasVistos[0].vistas) * 100}%`, background: 'var(--color-danger)', borderRadius: '3px', opacity: 0.7 }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 20px', marginBottom: '14px' }}>
              <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Sin datos de platos vistos para este periodo</div>
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