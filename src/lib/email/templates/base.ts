// Utilidades compartidas por las plantillas de correo (HTML plano con CSS
// inline, sin react-email). Paleta MenuApp: crema #FDFBF7, naranja #E85D24,
// texto cálido #2A2523 — la misma del PDF del dashboard.

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Envuelve el cuerpo de un correo en el marco visual común (fondo crema,
// tarjeta blanca, logo y pie). `cuerpo` debe llegar ya escapado.
export function envolverHtml(cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FDFBF7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDFBF7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <div style="font-size:22px;font-weight:bold;color:#2A2523;margin-bottom:24px;">Menu<span style="color:#E85D24;">App</span></div>
          ${cuerpo}
        </td></tr>
      </table>
      <div style="max-width:480px;margin-top:16px;font-size:12px;color:#8a827c;text-align:center;">
        MenuApp — tu menú digital, listo en minutos.
      </div>
    </td></tr>
  </table>
</body>
</html>`
}
