'use client'

import { useState, useEffect } from 'react'

/**
 * Cierra BL.1: evita leer new Date() en el cuerpo del render sin trigger de refresh.
 */
export function useTick(intervalMs: number = 60_000): number {
  const [tick, setTick] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}
