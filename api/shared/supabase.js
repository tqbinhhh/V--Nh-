import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env.js';

/**
 * Supabase client factory and access guards for API handlers.
 */
export function createSupabaseClients(env) {
    const { url, anonKey, serviceRoleKey } = getSupabaseConfig(env);
    if (!url || !anonKey || !serviceRoleKey) {
        throw new Error('Server thiếu cấu hình Supabase (URL/ANON/SERVICE_ROLE_KEY)');
    }

    const authClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const adminClient = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    return { authClient, adminClient };
}

export async function resolveAuthenticatedUser(authClient, token) {
    if (!token) {
        throw new Error('Unauthorized');
    }
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
        throw new Error('Unauthorized');
    }
    return data.user;
}

export async function assertAdmin(adminClient, userId) {
    const { data, error } = await adminClient
        .from('admin_users')
        .select('user_id, email, role')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) {
        throw new Error('Forbidden');
    }
    return data;
}
