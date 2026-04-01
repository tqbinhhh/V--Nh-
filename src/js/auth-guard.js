import { getSupabaseClient } from './supabase-client.js';

const supabase = getSupabaseClient();

export const AUTH_PAGE_PATH = '/src/pages/login-register.html';
export const DEFAULT_POST_LOGIN_PATH = '/src/pages/dashboard.html';

const PROTECTED_PAGE_KEYS = new Set(['dashboard', 'jars', 'reports', 'settings', 'admin']);
const ADMIN_ONLY_PAGE_KEYS = new Set(['settings', 'admin']);
const adminStatusCache = new Map();

const PAGE_LABELS = new Map([
    ['/src/pages/homepage.html', 'Trang chủ'],
    ['/src/pages/dashboard.html', 'Bảng điều khiển'],
    ['/src/pages/multi_jar_budget_system.html', 'Hệ thống hũ'],
    ['/src/pages/reports_and_analytics.html', 'Báo cáo & Phân tích'],
    ['/src/pages/setting.html', 'Cài đặt'],
    ['/src/pages/admin.html', 'Quản trị'],
    [AUTH_PAGE_PATH, 'Đăng nhập']
]);

// Shared guest-banner state so any page can surface a sign-in reminder without duplicating UI logic.
let pendingGuestNotice = null;
let guestNoticeHideTimer = null;

function normalizePathTarget(value) {
    if (!value) return '';

    try {
        const url = new URL(String(value), window.location.origin);
        if (url.origin !== window.location.origin) return '';
        if (!url.pathname.startsWith('/src/pages/') && url.pathname !== '/' && url.pathname !== '/index.html') {
            return '';
        }
        if (url.pathname === AUTH_PAGE_PATH) return '';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '';
    }
}

export function isProtectedPage(pageKey = '') {
    return PROTECTED_PAGE_KEYS.has(String(pageKey || '').trim());
}

export function isAdminOnlyPage(pageKey = '') {
    return ADMIN_ONLY_PAGE_KEYS.has(String(pageKey || '').trim());
}

export function buildAuthUrl(nextTarget = '') {
    const url = new URL(AUTH_PAGE_PATH, window.location.origin);
    const safeTarget = normalizePathTarget(nextTarget);
    if (safeTarget) {
        url.searchParams.set('next', safeTarget);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

export function getSafeNextTarget(fallback = DEFAULT_POST_LOGIN_PATH) {
    const current = new URL(window.location.href);
    const safeTarget = normalizePathTarget(current.searchParams.get('next'));
    return safeTarget || fallback;
}

export function getRouteLabel(target = '') {
    const safeTarget = normalizePathTarget(target);
    if (!safeTarget) return 'trang này';

    const pathname = new URL(safeTarget, window.location.origin).pathname;
    return PAGE_LABELS.get(pathname) || 'trang này';
}

export function getCurrentRelativeTarget() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function applyGuestAuthNotice({ message, nextTarget } = {}) {
    const banner = document.getElementById('guest-access-banner');
    if (!banner) return false;

    const copy = banner.querySelector('[data-guest-access-copy]');
    const action = banner.querySelector('[data-guest-access-action]');
    const defaultMessage = String(banner.dataset.defaultMessage || '').trim() || 'Đăng nhập để sử dụng tính năng này.';
    const resolvedMessage = String(message || defaultMessage).trim() || defaultMessage;
    const safeTarget = normalizePathTarget(nextTarget) || getCurrentRelativeTarget();

    if (copy) {
        copy.textContent = resolvedMessage;
    }
    if (action) {
        action.href = buildAuthUrl(safeTarget);
    }

    if (guestNoticeHideTimer) {
        clearTimeout(guestNoticeHideTimer);
        guestNoticeHideTimer = null;
    }

    banner.hidden = false;
    banner.removeAttribute('aria-hidden');
    banner.classList.add('is-visible');

    guestNoticeHideTimer = window.setTimeout(() => {
        const liveBanner = document.getElementById('guest-access-banner');
        if (!liveBanner) return;

        liveBanner.classList.remove('is-visible');
        liveBanner.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
            if (!liveBanner.classList.contains('is-visible')) {
                liveBanner.hidden = true;
            }
        }, 220);

        guestNoticeHideTimer = null;
        pendingGuestNotice = null;
    }, 3000);

    return true;
}

export function syncGuestAuthNotice(defaultMessage = '', nextTarget = getCurrentRelativeTarget()) {
    if (pendingGuestNotice) {
        const notice = pendingGuestNotice;
        pendingGuestNotice = null;
        return applyGuestAuthNotice(notice);
    }

    if (defaultMessage) {
        return applyGuestAuthNotice({ message: defaultMessage, nextTarget });
    }

    return false;
}

// Queue the guest notice and show it immediately when the banner container is ready.
export function showGuestAuthNotice(message = 'Đăng nhập để sử dụng tính năng này.', nextTarget = getCurrentRelativeTarget()) {
    pendingGuestNotice = { message, nextTarget };
    return applyGuestAuthNotice({ message, nextTarget });
}

// Refresh a near-expiry session so guards and pages read the same auth state.
export async function getFreshSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const currentSession = data?.session || null;
    const expiresAt = Number(currentSession?.expires_at || 0) * 1000;
    const needsRefresh = !currentSession || !Number.isFinite(expiresAt) || expiresAt - Date.now() < 60_000;

    if (!needsRefresh) {
        return currentSession;
    }

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;

    return refreshData?.session || currentSession || null;
}

function hasAdminRoleHint(session) {
    const roleCandidates = [
        session?.user?.app_metadata?.role,
        session?.user?.user_metadata?.role,
        session?.user?.role
    ];

    return roleCandidates.some((role) => String(role || '').trim().toLowerCase() === 'admin');
}

export async function isAdminSession(session) {
    const userId = String(session?.user?.id || '').trim();
    if (!userId) return false;

    if (adminStatusCache.has(userId)) {
        return adminStatusCache.get(userId);
    }

    if (hasAdminRoleHint(session)) {
        adminStatusCache.set(userId, true);
        return true;
    }

    try {
        const { data, error } = await supabase.rpc('is_admin');
        if (error) {
            console.warn('Unable to resolve admin status:', error);
            adminStatusCache.set(userId, false);
            return false;
        }

        const resolved = Boolean(data);
        adminStatusCache.set(userId, resolved);
        return resolved;
    } catch (error) {
        console.warn('Unable to resolve admin status:', error);
        adminStatusCache.set(userId, false);
        return false;
    }
}

export async function requireAuth({ next = getCurrentRelativeTarget(), fallback = DEFAULT_POST_LOGIN_PATH } = {}) {
    const session = await getFreshSession();
    if (session) return session;

    window.location.replace(buildAuthUrl(next || fallback));
    return null;
}

export async function requireAdmin({
    next = getCurrentRelativeTarget(),
    fallback = DEFAULT_POST_LOGIN_PATH
} = {}) {
    const session = await getFreshSession();
    if (!session) {
        window.location.replace(buildAuthUrl(next || fallback));
        return null;
    }

    const admin = await isAdminSession(session);
    if (admin) return session;

    window.location.replace(fallback || DEFAULT_POST_LOGIN_PATH);
    return null;
}

export async function redirectIfAuthenticated({ fallback = DEFAULT_POST_LOGIN_PATH } = {}) {
    const session = await getFreshSession();
    if (!session) return null;

    window.location.replace(getSafeNextTarget(fallback));
    return session;
}

export async function signOutAndRedirect(nextTarget = getCurrentRelativeTarget()) {
    try {
        await supabase.auth.signOut();
    } finally {
        adminStatusCache.clear();
        window.location.replace(nextTarget || getCurrentRelativeTarget());
    }
}
