import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan las variables de entorno de Supabase')
}

export const supabase = createClient(
    supabaseUrl,
    supabaseKey
)