// Utilidad de validación de contraseñas para MenuApp
// Reglas: 8+ caracteres, mayúscula, minúscula, número y símbolo especial

export interface PasswordRequirement {
  id: string
  label: string
  cumple: boolean
}

export interface PasswordValidationResult {
  requirements: PasswordRequirement[]
  isValid: boolean
  strength: 'vacio' | 'debil' | 'media' | 'fuerte'
  strengthLabel: string
  strengthColor: string
}

export function validatePassword(password: string): PasswordValidationResult {
  const pwd = password || ''

  const requirements: PasswordRequirement[] = [
    {
      id: 'longitud',
      label: 'Mínimo 8 caracteres',
      cumple: pwd.length >= 8,
    },
    {
      id: 'mayuscula',
      label: 'Al menos una letra mayúscula (A-Z)',
      cumple: /[A-Z]/.test(pwd),
    },
    {
      id: 'minuscula',
      label: 'Al menos una letra minúscula (a-z)',
      cumple: /[a-z]/.test(pwd),
    },
    {
      id: 'numero',
      label: 'Al menos un número (0-9)',
      cumple: /[0-9]/.test(pwd),
    },
    {
      id: 'especial',
      label: 'Al menos un símbolo (!@#$%&*...)',
      cumple: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd),
    },
  ]

  const cumplidos = requirements.filter(r => r.cumple).length
  const isValid = cumplidos === requirements.length && !/\s/.test(pwd)

  let strength: 'vacio' | 'debil' | 'media' | 'fuerte' = 'vacio'
  let strengthLabel = ''
  let strengthColor = 'var(--border-light)'

  if (pwd.length === 0) {
    strength = 'vacio'
  } else if (cumplidos <= 2) {
    strength = 'debil'
    strengthLabel = 'Débil'
    strengthColor = 'var(--color-danger)'
  } else if (cumplidos <= 4) {
    strength = 'media'
    strengthLabel = 'Media'
    strengthColor = '#F2A623'
  } else {
    strength = 'fuerte'
    strengthLabel = 'Fuerte'
    strengthColor = '#2E7D32'
  }

  return {
    requirements,
    isValid,
    strength,
    strengthLabel,
    strengthColor,
  }
}

// Validación simple para usar antes de submit (sin UI)
export function isPasswordValid(password: string): boolean {
  return validatePassword(password).isValid
}

// Mensaje de error simple para alertas
export function getPasswordError(password: string): string | null {
  const result = validatePassword(password)
  if (result.isValid) return null
  const faltantes = result.requirements.filter(r => !r.cumple).map(r => r.label)
  if (/\s/.test(password)) return 'La contraseña no puede contener espacios'
  return `Falta: ${faltantes.join(', ')}`
}