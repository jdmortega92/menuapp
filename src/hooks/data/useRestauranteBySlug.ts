'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

async function fetchRestauranteBySlug(slug: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
}

export function useRestauranteBySlug(slug: string | null | undefined) {
  return useSWR(
    slug ? ['restaurante', 'slug', slug] : null,
    () => fetchRestauranteBySlug(slug!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
