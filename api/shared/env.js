/**
 * Environment readers for API handlers.
 */
export function getEnvValue(env, key) {
    return env?.[key] || process.env[key] || '';
}

export function getSupabaseConfig(env) {
    const url = getEnvValue(env, 'VITE_SUPABASE_URL');
    const anonKey = getEnvValue(env, 'VITE_SUPABASE_ANON_KEY') || getEnvValue(env, 'VITE_SUPABASE_PUBLISHABLE_KEY');
    const serviceRoleKey = getEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
    return { url, anonKey, serviceRoleKey };
}

export function getGeminiConfig(env) {
    return {
        apiKey: getEnvValue(env, 'VITE_GEMINI_API_KEY')
    };
}
