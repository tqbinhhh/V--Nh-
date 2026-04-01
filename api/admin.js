import { getPathname, readJsonBody, sendJson, extractBearerToken } from './shared/http.js';
import { createSupabaseClients, resolveAuthenticatedUser, assertAdmin } from './shared/supabase.js';

/**
 * Core backend plugin:
 * - /api/auth/register
 * - /api/admin/reset-password
 * - /api/admin/update-user-limits
 */
const REGISTER_ATTEMPTS = new Map();

const ROUTES = {
    register: '/api/auth/register',
    adminResetPassword: '/api/admin/reset-password',
    adminUpdateLimits: '/api/admin/update-user-limits'
};

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function parsePositiveNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function buildUserProfilePayload({ userId, email, fullName, includeLimits = true }) {
    const payload = {
        user_id: userId,
        email,
        full_name: fullName
    };

    if (includeLimits) {
        payload.monthly_spending_limit = 0;
        payload.daily_spending_limit = 0;
        payload.spending_limits = {};
    }

    return payload;
}

function getMissingUserProfileColumns(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const candidates = ['monthly_spending_limit', 'daily_spending_limit', 'spending_limits'];
    return candidates.filter((column) => (
        text.includes(`'${column}'`) ||
        text.includes(`"${column}"`) ||
        text.includes(column)
    ));
}

async function upsertUserProfileWithFallback(adminClient, payloads) {
    let lastError = null;

    for (const payload of payloads) {
        const { data, error } = await adminClient
            .from('user_profiles')
            .upsert(payload, { onConflict: 'user_id' })
            .select('*')
            .maybeSingle();

        if (!error) {
            return { data, error: null };
        }

        lastError = error;
        const missingColumns = getMissingUserProfileColumns(error);
        if (!missingColumns.length) {
            break;
        }
    }

    return { data: null, error: lastError };
}

function enforceRegisterRateLimit(ip) {
    const key = String(ip || 'unknown');
    const now = Date.now();
    const history = REGISTER_ATTEMPTS.get(key) || [];
    const validWindow = history.filter((ts) => now - ts < 10 * 60 * 1000);
    if (validWindow.length >= 12) {
        return false;
    }
    validWindow.push(now);
    REGISTER_ATTEMPTS.set(key, validWindow);
    return true;
}

async function handleRegister(req, res, env) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (!enforceRegisterRateLimit(ip)) {
        sendJson(res, 429, { error: 'Tần suất đăng ký quá nhanh. Vui lòng thử lại sau.' });
        return;
    }

    const payload = await readJsonBody(req);
    const fullName = String(payload.fullName || '').trim();
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || '');

    if (fullName.length < 2) {
        sendJson(res, 400, { error: 'Họ và tên phải có ít nhất 2 ký tự' });
        return;
    }
    if (!isValidEmail(email)) {
        sendJson(res, 400, { error: 'Email không hợp lệ' });
        return;
    }
    if (password.length < 6) {
        sendJson(res, 400, { error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        return;
    }

    const { adminClient } = createSupabaseClients(env);

    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            full_name: fullName
        }
    });

    if (error) {
        if (/already registered/i.test(error.message || '')) {
            sendJson(res, 409, { error: 'Email đã tồn tại' });
            return;
        }
        sendJson(res, 400, { error: error.message || 'Không thể tạo tài khoản' });
        return;
    }

    const userId = data.user?.id;
    if (userId) {
        const profilePayloads = [
            buildUserProfilePayload({ userId, email, fullName, includeLimits: true }),
            buildUserProfilePayload({ userId, email, fullName, includeLimits: false })
        ];
        const { error: profileError } = await upsertUserProfileWithFallback(adminClient, profilePayloads);

        if (profileError) {
            sendJson(res, 201, {
                success: true,
                user: {
                    id: userId,
                    email: data.user?.email
                },
                profileWarning: profileError.message || 'Không thể tạo hồ sơ người dùng, nhưng tài khoản đã được tạo.'
            });
            return;
        }
    }

    sendJson(res, 201, {
        success: true,
        user: {
            id: userId,
            email: data.user?.email
        }
    });
}

async function authorizeAdmin(req, env) {
    const token = extractBearerToken(req);
    const { authClient, adminClient } = createSupabaseClients(env);
    const user = await resolveAuthenticatedUser(authClient, token);
    const admin = await assertAdmin(adminClient, user.id);
    return { adminClient, admin, user };
}

async function handleAdminResetPassword(req, res, env) {
    const { adminClient, admin } = await authorizeAdmin(req, env);
    const payload = await readJsonBody(req);
    const userId = String(payload.userId || '').trim();
    const password = String(payload.password || '');

    if (!userId || password.length < 6) {
        sendJson(res, 400, { error: 'Payload không hợp lệ' });
        return;
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateError) {
        sendJson(res, 400, { error: updateError.message || 'Không thể đổi mật khẩu' });
        return;
    }

    await adminClient.from('admin_logs').insert({
        admin_id: admin.user_id,
        action: 'reset_password',
        target_table: 'auth.users',
        target_id: userId,
        meta: { changed_by: admin.email }
    });

    sendJson(res, 200, { success: true });
}

async function handleAdminUpdateLimits(req, res, env) {
    const { adminClient, admin } = await authorizeAdmin(req, env);
    const payload = await readJsonBody(req);
    const userId = String(payload.userId || '').trim();
    const monthly = parsePositiveNumber(payload.monthlySpendingLimit);
    const daily = parsePositiveNumber(payload.dailySpendingLimit);

    if (!userId || monthly === null || daily === null) {
        sendJson(res, 400, { error: 'Payload không hợp lệ' });
        return;
    }

    const updatePayloads = [
        {
            monthly_spending_limit: monthly,
            daily_spending_limit: daily
        },
        {
            monthly_spending_limit: monthly
        },
        {
            daily_spending_limit: daily
        }
    ];

    let updatedProfile = null;
    let lastError = null;
    for (const updatePayload of updatePayloads) {
        const { data, error } = await adminClient
            .from('user_profiles')
            .update(updatePayload)
            .eq('user_id', userId)
            .select('*')
            .maybeSingle();

        if (!error && data) {
            updatedProfile = data;
            break;
        }

        if (error) {
            lastError = error;
            const missingColumns = getMissingUserProfileColumns(error);
            if (!missingColumns.length) {
                break;
            }
        }
    }

    if (lastError && !updatedProfile) {
        sendJson(res, 400, { error: lastError.message || 'Không thể cập nhật hạn mức' });
        return;
    }
    if (!updatedProfile) {
        sendJson(res, 404, { error: 'Không tìm thấy người dùng' });
        return;
    }

    await adminClient.from('admin_logs').insert({
        admin_id: admin.user_id,
        action: 'update_limits',
        target_table: 'user_profiles',
        target_id: userId,
        meta: { monthly_spending_limit: monthly, daily_spending_limit: daily }
    });

    sendJson(res, 200, { success: true, profile: updatedProfile });
}

export function backendApiPlugin(env) {
    const installMiddleware = (server) => {
        server.middlewares.use(async (req, res, next) => {
            const path = getPathname(req.url);
            const method = req.method || 'GET';

            if (path === ROUTES.register && method === 'POST') {
                try {
                    await handleRegister(req, res, env);
                } catch (error) {
                    sendJson(res, 500, { error: error.message || 'Internal server error' });
                }
                return;
            }

            if (path === ROUTES.adminResetPassword && method === 'POST') {
                try {
                    await handleAdminResetPassword(req, res, env);
                } catch (error) {
                    if (error.message === 'Unauthorized') {
                        sendJson(res, 401, { error: 'Unauthorized' });
                        return;
                    }
                    if (error.message === 'Forbidden') {
                        sendJson(res, 403, { error: 'Forbidden' });
                        return;
                    }
                    sendJson(res, 500, { error: error.message || 'Internal server error' });
                }
                return;
            }

            if (path === ROUTES.adminUpdateLimits && method === 'POST') {
                try {
                    await handleAdminUpdateLimits(req, res, env);
                } catch (error) {
                    if (error.message === 'Unauthorized') {
                        sendJson(res, 401, { error: 'Unauthorized' });
                        return;
                    }
                    if (error.message === 'Forbidden') {
                        sendJson(res, 403, { error: 'Forbidden' });
                        return;
                    }
                    sendJson(res, 500, { error: error.message || 'Internal server error' });
                }
                return;
            }

            next();
        });
    };

    return {
        name: 'backend-api',
        configureServer(server) {
            installMiddleware(server);
        },
        configurePreviewServer(server) {
            installMiddleware(server);
        }
    };
}
