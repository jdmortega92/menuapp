'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { Restaurante } from '@/types'

async function fetchRestauranteByUserId(userId: string): Promise<Restaurante | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('usuario_id', userId)
    .single()
  return (data as Restaurante | null) ?? null
}

export function useRestauranteByUserId(userId: string | null | undefined) {
  return useSWR<Restaurante | null>(
    userId ? ['restaurante', 'user', userId] : null,
    () => fetchRestauranteByUserId(userId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
