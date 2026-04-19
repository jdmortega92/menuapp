'use client'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

// Formatea un número crudo a formato "300 123 4567"
function formatearTelefono(numeros: string): string {
  const limpio = numeros.replace(/\D/g, '').slice(0, 10)
  if (limpio.length === 0) return ''
  if (limpio.length <= 3) return limpio
  if (limpio.length <= 6) return `${limpio.slice(0, 3)} ${limpio.slice(3)}`
  return `${limpio.slice(0, 3)} ${limpio.slice(3, 6)} ${limpio.slice(6)}`
}

export default function PhoneInput({
  value,
  onChange,
  placeholder = '300 123 4567',
  disabled,
  required,
}: PhoneInputProps) {
  // value siempre se almacena sin formato ("3001234567"), pero se muestra formateado
  const valorMostrado = formatearTelefono(value)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Extraer solo dígitos del valor ingresado
    const soloDigitos = e.target.value.replace(/\D/g, '').slice(0, 10)
    onChange(soloDigitos)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Permitir teclas de control
    const teclasPermitidas = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End',
    ]
    if (teclasPermitidas.includes(e.key)) return
    // Permitir Ctrl/Cmd + A/C/V/X
    if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return
    // Solo aceptar números
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault()
    }
  }

  // Validación visual
  const esValido = value.length === 0 || (value.length === 10 && value.startsWith('3'))
  const mostrarError = value.length > 0 && value.length < 10
  const mostrarAdvertenciaPrefijo = value.length >= 1 && !value.startsWith('3')

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Prefijo fijo +57 */}
        <div style={{
          position: 'absolute',
          left: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          pointerEvents: 'none',
          zIndex: 1,
        }}>
          +57
        </div>
        <input
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={placeholder}
          value={valorMostrado}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          required={required}
          style={{ paddingLeft: '48px', width: '100%' }}
        />
      </div>

      {/* Mensaje de validación */}
      {mostrarError && (
        <div style={{
          fontSize: '11px',
          color: 'var(--color-warning)',
          marginTop: '4px',
        }}>
          El número debe tener 10 dígitos ({value.length}/10)
        </div>
      )}
      {mostrarAdvertenciaPrefijo && (
        <div style={{
          fontSize: '11px',
          color: 'var(--color-warning)',
          marginTop: '4px',
        }}>
          Los números de celular en Colombia empiezan con 3
        </div>
      )}
    </div>
  )
}