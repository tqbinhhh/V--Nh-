import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

function clean(value) {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function getConfig() {
    return {
        url: clean(import.meta.env.VITE_SUPABASE_URL),
        key: clean(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    };
}

export function getSupabaseClient() {
    if (cachedClient) return cachedClient;
    const { url, key } = getConfig();
    if (!url || !key) {
        throw new Error('Thiếu cấu hình Supabase trong .env');
    }
    cachedClient = createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    return cachedClient;
}
