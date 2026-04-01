import {
    isAdminOnlyPage,
    isAdminSession,
    getFreshSession,
    redirectIfAuthenticated
} from './auth-guard.js';

async function boot() {
    const pageKey = document.body?.dataset.page || '';

    if (isAdminOnlyPage(pageKey)) {
        const session = await getFreshSession().catch(() => null);
        if (!session) return;

        const isAdmin = await isAdminSession(session).catch(() => false);
        if (!isAdmin) {
            window.location.replace('/src/pages/dashboard.html');
        }
        return;
    }

    if (pageKey === 'login') {
        await redirectIfAuthenticated();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    void boot();
}
