// Declaraciones de tipos para imports de archivos CSS y módulos CSS.
// Permite a TypeScript reconocer estos imports sin marcarlos como error.

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}