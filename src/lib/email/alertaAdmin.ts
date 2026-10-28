import { enviarEmail } from './sender'
import { alertaRevision } from './templates/alertaRevision'
import type { FilaRevision } from '@/lib/pagos/conciliacion'

// SOLO SERVIDOR (CIERRE 5b). UN correo por corrida del cron a ALERTAS_EMAIL con
// todas las filas que entraron a REVISION en esa corrida. Sin ALERTAS_EMAIL se
// loguea UNA vez que falta (nunca el valor) y se sigue: una alerta perdida no
// puede tumbar la corrida. Nunca lanza.

export type ResultadoAlerta = 'enviada' | 'sin_filas' | 'sin_destino' | 'fallo'

export async function enviarAlertaRevision(filas: FilaRevision[], etiqueta: string): Promise<ResultadoAlerta> {
  const destino = (process.env.ALERTAS_EMAIL ?? '').trim()
  if (!destino) {
    console.error(`[${etiqueta}] falta ALERTAS_EMAIL`)
    return filas.length === 0 ? 'sin_filas' : 'sin_destino'
  }
  if (filas.length === 0) return 'sin_filas'
  try {
    const r = await enviarEmail({ to: destino, ...alertaRevision(filas) })
    if ((r as { error?: unknown } | undefined)?.error) {
      console.error(`[${etiqueta}] alerta de REVISION no se envio filas=${filas.length}`)
      return 'fallo'
    }
    return 'enviada'
  } catch {
    console.error(`[${etiqueta}] alerta de REVISION no se envio filas=${filas.length}`)
    return 'fallo'
  }
}
