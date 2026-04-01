import {
    buildAuthUrl,
    DEFAULT_POST_LOGIN_PATH,
    getCurrentRelativeTarget,
    getFreshSession,
    getSafeNextTarget,
    isAdminOnlyPage,
    isAdminSession,
    signOutAndRedirect,
    syncGuestAuthNotice
} from './auth-guard.js';

const PAGE_BANNER_LABELS = new Map([
    ['dashboard', 'Bảng điều khiển'],
    ['jars', 'Hệ thống hũ'],
    ['reports', 'Báo cáo'],
    ['settings', 'Cài đặt'],
    ['admin', 'Quản trị']
]);

const HOME_HREF = '/src/pages/homepage.html';
const DASHBOARD_HREF = '/src/pages/dashboard.html';

const NAV_ITEMS = [
    { key: 'home', href: HOME_HREF, label: 'Trang chủ' },
    { key: 'dashboard', href: DASHBOARD_HREF, label: 'Bảng điều khiển' },
    { key: 'jars', href: '/src/pages/multi_jar_budget_system.html', label: 'Hệ thống hũ' },
    { key: 'reports', href: '/src/pages/reports_and_analytics.html', label: 'Báo cáo' },
    { key: 'settings', href: '/src/pages/setting.html', label: 'Cài đặt', adminOnly: true },
    { key: 'admin', href: '/src/pages/admin.html', label: 'Quản trị', adminOnly: true }
];

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getUserLabel(session) {
    const metaName = String(session?.user?.user_metadata?.full_name || '').trim();
    if (metaName) return metaName;

    const email = String(session?.user?.email || '').trim();
    if (!email) return 'Tài khoản của bạn';

    return email.split('@')[0];
}

function getVisibleNavItems(isAdmin) {
    return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}

function getGuestBannerCopy(activePage) {
    const label = PAGE_BANNER_LABELS.get(activePage) || 'trang này';
    return {
        headline: 'Xem trước',
        title: `Cần đăng nhập để sử dụng ${label}`,
        copy: `Bạn đang xem trước ${label}. Đăng nhập để lưu dữ liệu, đồng bộ realtime và dùng đầy đủ tính năng.`,
        action: 'Đăng nhập ngay'
    };
}

// Keep the shared brand block in one place so auth and app headers stay visually aligned.
function renderBrand(subtitle) {
    return `
        <a href="${HOME_HREF}" class="app-brand">
            <div class="app-brand-mark">
                <img
                    src="/src/images/brand-logo.png"
                    alt="Vi Nho Finance"
                    class="app-brand-logo"
                    loading="eager"
                    decoding="async"
                />
            </div>
            <div>
                <div class="app-brand-title">Ví Nhỏ Tài Chính</div>
                <div class="app-brand-copy">${escapeHtml(subtitle)}</div>
            </div>
        </a>
    `;
}

// Signed-in users only need a compact action row: identity chip + logout button.
function renderSignedInActions(session) {
    return `
        <div class="app-user-actions">
            <span class="app-user-chip">${escapeHtml(getUserLabel(session))}</span>
            <button type="button" class="app-login-link app-logout-btn" id="app-logout-btn">Đăng xuất</button>
        </div>
    `;
}

// Guests get a single login action because the preview banner already handles discovery.
function renderGuestActions() {
    return `
        <a href="${buildAuthUrl(DASHBOARD_HREF)}" class="app-login-link">Đăng nhập</a>
    `;
}

function renderAuthHeader() {
    return `
        <header class="app-auth-nav">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="app-auth-nav-shell">
                    ${renderBrand('Khu vực truy cập an toàn')}
                    <div class="app-auth-nav-actions">
                        <a href="${HOME_HREF}" class="app-auth-home-link">Trang chủ</a>
                    </div>
                </div>
            </div>
        </header>
    `;
}

function renderAppHeader(activePage, session, isAdmin) {
    const visibleNavItems = getVisibleNavItems(isAdmin);
    const navLinks = visibleNavItems
        .map((item) => {
            return `<a href="${item.href}" class="app-nav-link ${item.key === activePage ? 'is-active' : ''}">${item.label}</a>`;
        })
        .join('');

    const actions = session
        ? renderSignedInActions(session)
        : renderGuestActions();

    return `
        <header class="app-nav">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="app-nav-shell">
                    ${renderBrand('Từng bước nhỏ, giấc mơ lớn')}
                    <div class="hidden md:block">
                        <div class="app-nav-links">
                            ${navLinks}
                        </div>
                    </div>
                    <div class="app-nav-actions">
                        ${actions}
                    </div>
                </div>
            </div>
        </header>
    `;
}

function renderGuestBanner(activePage, nextTarget) {
    const copy = getGuestBannerCopy(activePage);
    return `
        <aside
            id="guest-access-banner"
            class="app-guest-banner is-visible"
            role="status"
            aria-live="polite"
            data-default-message="${escapeHtml(copy.copy)}"
        >
            <div class="app-guest-banner-copy">
                <span class="app-guest-banner-eyebrow">${escapeHtml(copy.headline)}</span>
                <strong class="app-guest-banner-title">${escapeHtml(copy.title)}</strong>
                <p data-guest-access-copy class="app-guest-banner-text">${escapeHtml(copy.copy)}</p>
            </div>
            <a
                data-guest-access-action
                class="app-guest-banner-btn"
                href="${buildAuthUrl(nextTarget || DEFAULT_POST_LOGIN_PATH)}"
            >
                ${escapeHtml(copy.action)}
            </a>
        </aside>
    `;
}

function renderAuthFooter() {
    return `
        <footer class="app-auth-footer">
            <div class="app-auth-footer-shell max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <p class="app-auth-footer-copy">© 2026 Ví Nhỏ Tài Chính. Đăng nhập để mở khoá Dashboard, Hệ thống hũ và Báo cáo AI.</p>
                <a href="${HOME_HREF}" class="app-auth-footer-link">Quay lại trang chủ</a>
            </div>
        </footer>
    `;
}

function renderAppFooter(isAdmin) {
    const visibleNavItems = getVisibleNavItems(isAdmin);
    const getItemByKey = (key) => visibleNavItems.find((item) => item.key === key);

    const footerLink = (item) => {
        if (!item) return '';
        return `<a href="${item.href}" class="app-footer-link">${item.label}</a>`;
    };

    return `
        <footer class="app-footer">
            <div class="app-footer-shell max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="app-footer-grid">
                    <div class="app-footer-brand">
                        <h3 class="app-footer-title">Ví Nhỏ Tài Chính</h3>
                        <p class="app-footer-text">Nền tảng quản lý tài chính cá nhân dành cho người Việt, đồng bộ dữ liệu theo thời gian thực.</p>
                        <div class="app-footer-badges">
                            <span class="app-footer-badge">Dữ liệu thật</span>
                            <span class="app-footer-badge">Đồng bộ thời gian thực</span>
                        </div>
                    </div>
                    <div>
                        <h4 class="app-footer-title">Khám phá</h4>
                        ${footerLink(getItemByKey('home'))}
                        ${footerLink(getItemByKey('dashboard'))}
                        ${footerLink(getItemByKey('reports'))}
                    </div>
                    <div>
                        <h4 class="app-footer-title">Hệ thống</h4>
                        ${footerLink(getItemByKey('jars'))}
                        ${footerLink(getItemByKey('settings'))}
                        ${footerLink(getItemByKey('admin'))}
                    </div>
                    <div>
                        <h4 class="app-footer-title">Liên hệ</h4>
                        <p class="app-footer-text">Email: hello@vinho.finance</p>
                        <p class="app-footer-text">Hỗ trợ: 08xx xxx xxx</p>
                    </div>
                </div>
                <div class="app-footer-bottom">
                    <p>© 2026 Ví Nhỏ Tài Chính. Tất cả quyền được bảo lưu.</p>
                    <p>Thiết kế cho người dùng Việt Nam, tối ưu cho trải nghiệm tài chính bền vững.</p>
                </div>
            </div>
        </footer>
    `;
}

async function mountSiteLayout() {
    const activePage = document.body.dataset.page || 'home';
    const headerContainer = document.getElementById('site-header');
    const footerContainer = document.getElementById('site-footer');

    let session = null;
    try {
        session = await getFreshSession();
    } catch {
        session = null;
    }

    if (activePage === 'login') {
        if (session) {
            window.location.replace(getSafeNextTarget());
            return;
        }

        if (headerContainer) headerContainer.innerHTML = renderAuthHeader();
        if (footerContainer) footerContainer.innerHTML = renderAuthFooter();
        return;
    }

    let isAdmin = false;
    if (session) {
        try {
            isAdmin = await isAdminSession(session);
        } catch {
            isAdmin = false;
        }
    }

    if (isAdminOnlyPage(activePage) && session && !isAdmin) {
        window.location.replace(DEFAULT_POST_LOGIN_PATH);
        return;
    }

    const guestBannerHtml = !session && activePage !== 'home' ? renderGuestBanner(activePage, getCurrentRelativeTarget()) : '';

    if (headerContainer) headerContainer.innerHTML = `${renderAppHeader(activePage, session, isAdmin)}${guestBannerHtml}`;
    if (footerContainer) footerContainer.innerHTML = renderAppFooter(isAdmin);

    if (!session && activePage !== 'home') {
        syncGuestAuthNotice(getGuestBannerCopy(activePage).copy, getCurrentRelativeTarget());
    }

    document.getElementById('app-logout-btn')?.addEventListener('click', () => {
        void signOutAndRedirect(getCurrentRelativeTarget());
    });
}

void mountSiteLayout();
