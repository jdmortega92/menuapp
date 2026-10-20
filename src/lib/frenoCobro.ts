// ── Freno de emergencia del cobro automatico (CIERRE 4) ──────────────────
// El cobro automatico queda APAGADO hasta que Julian lo encienda a proposito:
// solo NEXT_PUBLIC_COBRO_AUTOMATICO === 'true' (exacto) lo habilita. Sin la
// variable, o con cualquier otro valor ('1', 'TRUE', ' true'), esta apagado.
// Fail-closed: equivocarse aqui en la direccion de "apagado" no le mueve
// plata a nadie.
//
// NEXT_PUBLIC_ a proposito: el mismo valor lo leen el server (el freno real:
// cron y /api/wompi/cobro-automatico) y el navegador (/suscripcion oculta todo
// lo que promete renovacion automatica). Next inlinea el valor en el bundle
// cliente en BUILD, asi que cambiarlo exige redesplegar.
//
// El default lee process.env.NEXT_PUBLIC_COBRO_AUTOMATICO LITERAL: es la forma
// que Next reemplaza en el bundle del navegador. Los tests pasan el valor.
export function cobroAutomaticoHabilitado(
  valor: string | undefined = process.env.NEXT_PUBLIC_COBRO_AUTOMATICO
): boolean {
  return valor === 'true'
}
