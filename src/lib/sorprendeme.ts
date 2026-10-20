// ── Sorpréndeme: cuando aparece en el menu publico (CIERRE P1) ───────────
// Regla PURA y unica. Antes vivia repartida entre useMenuVisibility (que
// devolvia true con 0, 1 o 3+ categorias elegidas) y la pagina, y con menos de
// 2 elegidas el boton aparecia igual y caia a un fallback que tomaba hasta 3
// platos al azar de CUALQUIER categoria, sin mirar horarios.
//
// Aparece SOLO si se cumplen todas:
//   1. el dueno lo tiene encendido (config.sorprendeme_activo);
//   2. plan Basico o Pro;
//   3. EXACTAMENTE 2 categorias elegidas;
//   4. las 2 abiertas ahora por horario;
//   5. sin busqueda activa.
export function sorprendemeDisponible(p: {
  activo: boolean | null | undefined
  plan: string | null | undefined
  categoriasElegidas: string[] | null | undefined
  /** Ids de las categorias abiertas AHORA (la lista ya filtrada por horario). */
  categoriasAbiertasIds: string[]
  busqueda: string
}): boolean {
  if (p.activo !== true) return false
  if (p.plan !== 'basico' && p.plan !== 'pro') return false
  const elegidas = p.categoriasElegidas ?? []
  if (elegidas.length !== 2) return false
  if (!elegidas.every((id) => p.categoriasAbiertasIds.includes(id))) return false
  if (p.busqueda.trim() !== '') return false
  return true
}
