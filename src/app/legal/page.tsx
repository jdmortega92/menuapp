'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LegalPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'terminos' | 'privacidad'>('terminos')

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Legal</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '24px' }}>
          {['terminos', 'privacidad'].map((t) => (
            <div key={t} onClick={() => setTab(t as typeof tab)}
              style={{
                flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? 'var(--color-info)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${tab === t ? 'var(--color-info)' : 'var(--border-light)'}`,
              }}>
              {t === 'terminos' ? 'Términos y condiciones' : 'Política de privacidad'}
            </div>
          ))}
        </div>

        {/* Términos y condiciones */}
        {tab === 'terminos' && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>Términos y condiciones de uso</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>Última actualización: abril 2026</div>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>1. Aceptación de los términos</div>
            <p style={{ marginBottom: '16px' }}>Al registrarte y usar MenuApp, aceptas estos términos y condiciones. Si no estás de acuerdo, no uses la plataforma. MenuApp es una plataforma de menús digitales con código QR para restaurantes y negocios de alimentos en Colombia.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>2. Descripción del servicio</div>
            <p style={{ marginBottom: '16px' }}>MenuApp permite a los restaurantes crear menús digitales accesibles mediante códigos QR y enlaces web. Los comensales pueden ver el menú, armar pedidos y enviarlos por WhatsApp. La plataforma ofrece planes Gratis, Básico y Pro con diferentes funcionalidades.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>3. Registro y cuenta</div>
            <p style={{ marginBottom: '16px' }}>Para usar MenuApp debes crear una cuenta con un correo electrónico válido. Eres responsable de mantener la confidencialidad de tu contraseña y de toda la actividad que ocurra bajo tu cuenta. Debes notificarnos inmediatamente si sospechas uso no autorizado.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>4. Planes y pagos</div>
            <p style={{ marginBottom: '16px' }}>MenuApp ofrece un plan gratuito con funciones limitadas y planes de pago con funciones adicionales. Los pagos son mensuales y se procesan a través de pasarelas de pago autorizadas. Las suscripciones se renuevan automáticamente hasta que el usuario cancele. No se realizan reembolsos por periodos parciales.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>5. Uso aceptable</div>
            <p style={{ marginBottom: '16px' }}>Te comprometes a usar MenuApp solo para fines legales relacionados con la operación de un negocio de alimentos. No puedes usar la plataforma para publicar contenido ilegal, ofensivo, engañoso o que infrinja derechos de terceros. Nos reservamos el derecho de suspender cuentas que violen estos términos.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>6. Contenido del usuario</div>
            <p style={{ marginBottom: '16px' }}>Eres responsable del contenido que publicas en tu menú, incluyendo nombres de platos, descripciones, precios y fotografías. MenuApp no se hace responsable por la exactitud de los precios o la disponibilidad de los platos publicados por los restaurantes.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>7. Propiedad intelectual</div>
            <p style={{ marginBottom: '16px' }}>MenuApp y todo su diseño, código, marca y contenido son propiedad de sus creadores y están protegidos por las leyes de derechos de autor de Colombia. El contenido que publiques en tu menú sigue siendo tuyo.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>8. Limitación de responsabilidad</div>
            <p style={{ marginBottom: '16px' }}>MenuApp se proporciona "tal como está". No garantizamos disponibilidad ininterrumpida del servicio. No somos responsables de pérdidas de datos, interrupciones del servicio, ni de transacciones entre restaurantes y comensales. MenuApp no interviene en la relación comercial entre el restaurante y sus clientes.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>9. Cancelación</div>
            <p style={{ marginBottom: '16px' }}>Puedes cancelar tu cuenta en cualquier momento desde la sección de Configuración. Al cancelar, perderás acceso a las funciones de pago pero tus datos se conservarán por 30 días. Después de ese periodo, se eliminarán permanentemente.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>10. Modificaciones</div>
            <p style={{ marginBottom: '16px' }}>Nos reservamos el derecho de modificar estos términos en cualquier momento. Te notificaremos por correo electrónico sobre cambios significativos. El uso continuado de la plataforma después de los cambios constituye aceptación de los nuevos términos.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>11. Legislación aplicable</div>
            <p style={{ marginBottom: '16px' }}>Estos términos se rigen por las leyes de la República de Colombia. Cualquier disputa se resolverá ante los tribunales competentes de la ciudad de Popayán, Cauca.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>12. Contacto</div>
            <p style={{ marginBottom: '16px' }}>Para preguntas sobre estos términos, escríbenos a soporte@menuapp.co</p>
          </div>
        )}

        {/* Política de privacidad */}
        {tab === 'privacidad' && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>Política de privacidad y tratamiento de datos</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>Última actualización: abril 2026 · Conforme a la Ley 1581 de 2012</div>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>1. Responsable del tratamiento</div>
            <p style={{ marginBottom: '16px' }}>MenuApp, con domicilio en Popayán, Cauca, Colombia, es responsable del tratamiento de los datos personales recolectados a través de la plataforma.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>2. Datos que recolectamos</div>
            <p style={{ marginBottom: '8px' }}>De los restaurantes (usuarios registrados): correo electrónico, nombre del negocio, tipo de negocio, ciudad, número de WhatsApp, dirección (opcional), y datos de pago para suscripciones.</p>
            <p style={{ marginBottom: '16px' }}>De los comensales (visitantes del menú): no recolectamos datos personales. Las calificaciones son anónimas. Los pedidos por WhatsApp se envían directamente al restaurante sin pasar por nuestros servidores.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>3. Finalidad del tratamiento</div>
            <p style={{ marginBottom: '16px' }}>Usamos tus datos para: crear y mantener tu cuenta, generar tu menú digital y código QR, procesar pagos de suscripciones, enviarte notificaciones sobre tu cuenta y el servicio, mejorar la plataforma con datos agregados y anónimos.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>4. Autorización</div>
            <p style={{ marginBottom: '16px' }}>Al registrarte en MenuApp, autorizas el tratamiento de tus datos personales conforme a esta política. Esta autorización es libre, previa, expresa e informada, según lo establece la Ley 1581 de 2012.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>5. Derechos del titular</div>
            <p style={{ marginBottom: '16px' }}>Como titular de tus datos, tienes derecho a: conocer, actualizar y rectificar tus datos personales, solicitar prueba de la autorización otorgada, ser informado sobre el uso de tus datos, revocar la autorización y solicitar la eliminación de tus datos, y presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>6. Almacenamiento y seguridad</div>
            <p style={{ marginBottom: '16px' }}>Tus datos se almacenan en servidores seguros de Supabase con cifrado en tránsito y en reposo. Implementamos políticas de seguridad a nivel de fila (RLS) para que cada restaurante solo pueda acceder a sus propios datos. Las contraseñas se almacenan con hash bcrypt y nunca en texto plano.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>7. Compartición de datos</div>
            <p style={{ marginBottom: '16px' }}>No vendemos, alquilamos ni compartimos tus datos personales con terceros, excepto con procesadores de pago autorizados para gestionar tus suscripciones, y cuando sea requerido por autoridades colombianas competentes.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>8. Cookies y analítica</div>
            <p style={{ marginBottom: '16px' }}>MenuApp utiliza cookies técnicas necesarias para el funcionamiento de la plataforma. No utilizamos cookies de seguimiento publicitario. Podemos recopilar datos anónimos de uso para mejorar el servicio.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>9. Retención de datos</div>
            <p style={{ marginBottom: '16px' }}>Conservamos tus datos mientras mantengas tu cuenta activa. Si cancelas tu cuenta, conservaremos tus datos por 30 días en caso de que desees reactivarla. Después de ese periodo, tus datos serán eliminados permanentemente.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>10. Menores de edad</div>
            <p style={{ marginBottom: '16px' }}>MenuApp no está dirigido a menores de 18 años. No recolectamos deliberadamente datos de menores. Si descubrimos que hemos recolectado datos de un menor, los eliminaremos inmediatamente.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>11. Cambios a esta política</div>
            <p style={{ marginBottom: '16px' }}>Podemos actualizar esta política periódicamente. Te notificaremos por correo electrónico sobre cambios significativos. La fecha de última actualización se indica al inicio de este documento.</p>

            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>12. Contacto y quejas</div>
            <p style={{ marginBottom: '16px' }}>Para ejercer tus derechos como titular de datos o presentar quejas relacionadas con el tratamiento de tus datos personales, escríbenos a: soporte@menuapp.co. También puedes presentar quejas ante la Superintendencia de Industria y Comercio (SIC) en www.sic.gov.co.</p>
          </div>
        )}

      </div>
    </div>
  )
}