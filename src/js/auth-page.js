import { getSupabaseClient } from './supabase-client.js';
import {
    DEFAULT_POST_LOGIN_PATH,
    getRouteLabel,
    getSafeNextTarget,
    redirectIfAuthenticated
} from './auth-guard.js';

const supabase = getSupabaseClient();

const state = {
    tab: 'login',
    nextTarget: DEFAULT_POST_LOGIN_PATH
};

function normalizeEmail(value = '') {
    return String(value).trim().toLowerCase();
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildUserProfilePayload(user, fullName, { includeEmail = true, includeLimits = true } = {}) {
    const payload = {
        user_id: user.id,
        full_name: String(fullName || user.user_metadata?.full_name || user.email || 'Người dùng').trim() || 'Người dùng'
    };

    if (includeEmail) {
        // Keep email optional so older profiles without an email column can still be saved.
        payload.email = normalizeEmail(user.email || '');
    }

    if (includeLimits) {
        payload.monthly_spending_limit = 0;
        payload.daily_spending_limit = 0;
        payload.spending_limits = {};
    }

    return payload;
}

function getMissingUserProfileColumns(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const candidates = ['email', 'full_name', 'monthly_spending_limit', 'daily_spending_limit', 'spending_limits'];
    return candidates.filter((column) => (
        text.includes(`'${column}'`) ||
        text.includes(`"${column}"`) ||
        text.includes(column)
    ));
}

async function upsertUserProfileWithFallback(initialPayload) {
    let payload = Array.isArray(initialPayload) ? { ...initialPayload[0] } : { ...initialPayload };
    let lastError = null;

    for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' }).select('*').maybeSingle();
        
        if (!error) {
            return;
        }

        lastError = error;
        const missingColumns = getMissingUserProfileColumns(error);
        if (!missingColumns.length) {
            break;
        }

        missingColumns.forEach(col => {
            delete payload[col];
        });
    }

    throw lastError || new Error('Không thể lưu hồ sơ người dùng.');
}

async function registerAccount(fullName, email, password) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName }
        }
    });

    if (!signUpError && signUpData?.user) {
        return {
            source: 'client',
            session: signUpData?.session || null,
            user: signUpData?.user || null
        };
    }

    const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fullName,
            email,
            password
        })
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.ok) {
        return {
            source: 'backend',
            session: null,
            user: data.user || null
        };
    }

    const clientErrorMessage = String(signUpError?.message || 'Không thể tạo tài khoản.');
    const backendErrorMessage = String(data.error || 'Không thể tạo tài khoản.');
    const shouldPreferBackendError = /SUPABASE_SERVICE_ROLE_KEY|Server thiếu cấu hình Supabase/i.test(backendErrorMessage);

    throw new Error(shouldPreferBackendError ? backendErrorMessage : clientErrorMessage);
}

async function ensureUserProfile(user, fullName) {
    if (!user?.id) return;

    const payloads = [
        buildUserProfilePayload(user, fullName, { includeEmail: true, includeLimits: true }),
        buildUserProfilePayload(user, fullName, { includeEmail: false, includeLimits: true }),
        buildUserProfilePayload(user, fullName, { includeEmail: true, includeLimits: false }),
        buildUserProfilePayload(user, fullName, { includeEmail: false, includeLimits: false })
    ];

    await upsertUserProfileWithFallback(payloads);
}

function setMessage(message = '', tone = 'error') {
    const messageEl = document.getElementById('auth-message');
    if (!messageEl) return;

    messageEl.textContent = message;
    messageEl.className = 'auth-message';
    if (message) {
        if (tone === 'success') {
            messageEl.classList.add('is-success');
        } else if (tone === 'warning') {
            messageEl.classList.add('is-warning');
        } else {
            messageEl.classList.add('is-error');
        }
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function syncPasswordToggle(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;

    const hiddenLabel = 'Hiện';
    const visibleLabel = 'Ẩn';

    const syncLabel = () => {
        button.textContent = input.type === 'password' ? hiddenLabel : visibleLabel;
    };

    button.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        syncLabel();
        input.focus();
    });

    syncLabel();
}

function syncTabUI() {
    const isRegister = state.tab === 'register';
    const fullNameGroup = document.getElementById('full-name-group');
    const confirmGroup = document.getElementById('confirm-password-group');
    const loginBtn = document.getElementById('tab-login');
    const registerBtn = document.getElementById('tab-register');
    const submitBtn = document.getElementById('auth-submit');
    const passwordInput = document.getElementById('password');
    const nextNoteEl = document.getElementById('auth-next-note');
    const footerCopyEl = document.getElementById('auth-footer-copy');

    if (fullNameGroup) fullNameGroup.style.display = isRegister ? 'grid' : 'none';
    if (confirmGroup) confirmGroup.style.display = isRegister ? 'grid' : 'none';

    if (loginBtn) {
        loginBtn.classList.toggle('is-active', !isRegister);
        loginBtn.setAttribute('aria-selected', String(!isRegister));
    }
    if (registerBtn) {
        registerBtn.classList.toggle('is-active', isRegister);
        registerBtn.setAttribute('aria-selected', String(isRegister));
    }

    if (submitBtn) submitBtn.textContent = isRegister ? 'Tạo tài khoản' : 'Đăng nhập';
    if (passwordInput) passwordInput.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');

    setText('auth-eyebrow', isRegister ? 'Đăng ký an toàn' : 'Đăng nhập an toàn');
    setText('auth-heading', isRegister ? 'Tạo tài khoản mới' : 'Chào mừng bạn quay lại');
    setText(
        'auth-subtitle',
        isRegister
            ? 'Đăng ký để bắt đầu sử dụng toàn bộ tính năng của Vi Nho Finance. Tài khoản sẽ được tạo ngay và đăng nhập tự động, không cần chờ email xác nhận.'
            : 'Đăng nhập để tiếp tục sử dụng các tính năng đã mở khoá.'
    );

    if (nextNoteEl) {
        const routeLabel = getRouteLabel(state.nextTarget);
        nextNoteEl.textContent = isRegister
            ? `Sau khi tạo tài khoản, bạn sẽ được đăng nhập ngay và chuyển về ${routeLabel}.`
            : `Sau khi đăng nhập, bạn sẽ quay lại ${routeLabel}.`;
    }

    if (footerCopyEl) {
        footerCopyEl.textContent = isRegister
            ? 'Đã có tài khoản? Chọn Đăng nhập để tiếp tục.'
            : 'Chưa có tài khoản? Chọn Đăng ký để bắt đầu ngay.';
    }

    document.title = isRegister ? 'Đăng ký - Vi Nho Finance' : 'Đăng nhập - Vi Nho Finance';
}

async function handleLogin(email, password) {
    const normalizedEmail = normalizeEmail(email);
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
        });

        if (!error) {
            window.location.replace(state.nextTarget || DEFAULT_POST_LOGIN_PATH);
            return;
        }

        lastError = error;
        const errorText = String(error?.message || '').toLowerCase();
        const retryable = errorText.includes('invalid login credentials') || errorText.includes('authentication failed');
        if (!retryable || attempt === 2) {
            break;
        }

        await sleep(350 * (attempt + 1));
    }

    const errorText = String(lastError?.message || '').toLowerCase();
    if (errorText.includes('invalid login credentials') || errorText.includes('authentication failed')) {
        throw new Error('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.');
    }

    throw lastError || new Error('Không thể đăng nhập.');
}

async function handleRegister(fullName, email, password, confirmPassword) {
    if (!fullName.trim()) throw new Error('Vui lòng nhập họ và tên.');
    if (password !== confirmPassword) throw new Error('Mật khẩu xác nhận không khớp.');

    const normalizedEmail = normalizeEmail(email);
    let account;
    try {
        account = await registerAccount(fullName.trim(), normalizedEmail, password);
    } catch (error) {
        const errorText = String(error?.message || '').toLowerCase();
        const alreadyExists = errorText.includes('already registered') || errorText.includes('đã tồn tại') || errorText.includes('already exists');
        if (!alreadyExists) {
            throw error;
        }

        state.tab = 'login';
        syncTabUI();
        setMessage('Email đã tồn tại. Mình sẽ thử đăng nhập bằng mật khẩu bạn vừa nhập.', 'warning');
        await handleLogin(normalizedEmail, password);
        return;
    }

    if (account.session?.user) {
        await ensureUserProfile(account.session.user, fullName.trim()).catch(() => null);
    } else if (account.user) {
        await ensureUserProfile(account.user, fullName.trim()).catch(() => null);
    }

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm-password');

    state.tab = 'login';
    syncTabUI();

    if (emailInput) emailInput.value = normalizedEmail;
    if (passwordInput) passwordInput.value = password;
    if (confirmInput) confirmInput.value = '';

    if (account.session) {
        setMessage('Đăng ký thành công. Đang chuyển bạn vào hệ thống...', 'success');
        window.location.replace(state.nextTarget || DEFAULT_POST_LOGIN_PATH);
        return;
    }

    setMessage('Đăng ký thành công. Đang đăng nhập tự động...', 'success');
    try {
        await handleLogin(normalizedEmail, password);
    } catch (error) {
        setMessage(
            error?.message || 'Đăng ký xong nhưng chưa đăng nhập được ngay. Bạn thử bấm Đăng nhập lại một lần nhé.',
            'warning'
        );
        state.tab = 'login';
        syncTabUI();
    }
}

async function onSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('auth-submit');
    const fullName = document.getElementById('full-name')?.value || '';
    const email = document.getElementById('email')?.value || '';
    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirm-password')?.value || '';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = state.tab === 'register' ? 'Đang tạo...' : 'Đang đăng nhập...';
    }

    setMessage('');

    try {
        if (state.tab === 'register') {
            await handleRegister(fullName, email, password, confirmPassword);
            return;
        }

        await handleLogin(email, password);
    } catch (error) {
        setMessage(error.message || 'Có lỗi xảy ra.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            syncTabUI();
        }
    }
}

function bindEvents() {
    document.getElementById('tab-login')?.addEventListener('click', () => {
        state.tab = 'login';
        setMessage('');
        syncTabUI();
    });

    document.getElementById('tab-register')?.addEventListener('click', () => {
        state.tab = 'register';
        setMessage('');
        syncTabUI();
    });

    document.getElementById('auth-form')?.addEventListener('submit', onSubmit);

    syncPasswordToggle('password', 'password-toggle');
    syncPasswordToggle('confirm-password', 'confirm-password-toggle');
}

async function init() {
    state.nextTarget = getSafeNextTarget(DEFAULT_POST_LOGIN_PATH);
    bindEvents();
    syncTabUI();
    setMessage('');

    try {
        await redirectIfAuthenticated({ fallback: state.nextTarget || DEFAULT_POST_LOGIN_PATH });
    } catch {
        // If auth refresh fails, keep the page usable so the user can log in manually.
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
