// Variables de color que el menú público calcula UNA vez y pasa como style inline
// junto a themeClass (CIERRE P2a). La raíz del menú y el wrapper temático de
// ui/Modal reciben el mismo objeto, así que un modal nunca pisa lo que la página
// definió. Las variables --theme-* siguen saliendo de la clase .theme-*; aquí
// solo se agregan las que dependen del fondo o de la marca (tintes, semánticos
// legibles, placa Ganador) y, en P2b, la paleta propia de un tema personalizado.

import { borderFuerte, borderSutil, glowBoton, gradientHeader, tintPlaceholder, washHero, washSutil } from './brandTints'
import {
  TEMAS_BASE, ajustarTono, esFondoOscuro, mezclar, textoSobreEstricto, varsColorTema,
  type ColoresTema, type TemaBaseId,
} from './temaColor'

/** Copia de los semánticos de :root en globals.css (test de deriva en temaColor.test.ts). */
export const SEMANTICOS = {
  ok: '#1D9E75',      // --color-green
  peligro: '#E24B4A', // --color-danger
  aviso: '#F2A623',   // --color-warning
  info: '#378ADD',    // --color-info
  rating: '#F2A623',  // --color-rating
}

/** Placa "Ganador": identidad dorada. Sobre fondo claro, los tokens --gold-* de
 *  siempre; sobre fondo oscuro, un dorado profundo (no una isla clara). */
export const GANADOR_CLARO = {
  bgStart: 'var(--gold-bg-start)',
  bgEnd: 'var(--gold-bg-end)',
  borde: 'var(--gold-border)',
  tinte: 'var(--gold-tint)',
  tinta: 'var(--gold-ink)',
  texto: '#1A1A18',
  textoMuted: '#6B6A65',
}
export const GANADOR_OSCURO = {
  bgStart: '#2E2512',
  bgEnd: '#241C0D',
  borde: '#F2C24D59',
  tinte: '#F2C24D24',
  tinta: '#F2C24D',
  texto: '#F5F0E1',
  textoMuted: '#CDBF9C',
}

/** Style inline del menú público para un tema base (y, en P2b, una paleta propia).
 *  Devuelve propiedades CSS planas: castear a CSSProperties en el call site. */
export function estiloMenuPublico(base: TemaBaseId, marca: string, paleta?: ColoresTema): Record<string, string> {
  const p = paleta ?? TEMAS_BASE[base]
  const oscuro = esFondoOscuro(p.bg)
  // Los semánticos se leen sobre fondo, tarjeta y superficie apagada: deben
  // cumplir contra los tres.
  const fondos = [p.bg, p.surface, p.surfaceMuted]
  const ok = ajustarTono(SEMANTICOS.ok, fondos, 4.5)
  const infoFondo = mezclar(p.surface, SEMANTICOS.info, oscuro ? 0.18 : 0.1)
  const g = oscuro ? GANADOR_OSCURO : GANADOR_CLARO
  return {
    colorScheme: oscuro ? 'dark' : 'light',
    ...(paleta ? varsColorTema(paleta) : {}),
    // Marca (tintes según el fondo REAL bajo cada uno)
    '--marca-tinte': tintPlaceholder(marca, p.surface),
    '--marca-lavado': washHero(marca, p.bg),
    '--marca-lavado-sutil': washSutil(marca, p.bg),
    '--marca-borde-fuerte': borderFuerte(marca, p.surface),
    '--marca-borde-sutil': borderSutil(marca, p.bg),
    '--marca-gradiente': gradientHeader(marca, p.bg),
    '--marca-glow': glowBoton(marca, p.bg),
    // Semánticos legibles: texto >= 4.5:1, iconos/estrellas >= 3:1
    '--tema-ok': ok,
    '--tema-ok-sobre': textoSobreEstricto(ok), // semántico: regla estricta de 4.5:1
    '--tema-peligro': ajustarTono(SEMANTICOS.peligro, fondos, 4.5),
    '--tema-aviso': ajustarTono(SEMANTICOS.aviso, fondos, 4.5),
    '--tema-info': ajustarTono(SEMANTICOS.info, [infoFondo], 4.5),
    '--tema-info-fondo': infoFondo,
    '--tema-rating': ajustarTono(SEMANTICOS.rating, fondos, 3),
    '--tema-rating-texto': ajustarTono(SEMANTICOS.rating, fondos, 4.5),
    // Placa Ganador
    '--ganador-bg-start': g.bgStart,
    '--ganador-bg-end': g.bgEnd,
    '--ganador-borde': g.borde,
    '--ganador-tinte': g.tinte,
    '--ganador-tinta': g.tinta,
    '--ganador-texto': g.texto,
    '--ganador-texto-muted': g.textoMuted,
  }
}
