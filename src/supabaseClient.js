// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('[모먼핀] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 .env에 없습니다.')
}

export const supabase = createClient(url, anon)