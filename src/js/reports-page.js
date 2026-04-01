import { getSupabaseClient } from './supabase-client.js';
import { showGuestAuthNotice } from './auth-guard.js';

const supabase = getSupabaseClient();

const JARS = [
    { key: 'necessities', code: 'NEC', label: 'Thiết yếu', color: '#52c18c' },
    { key: 'education', code: 'EDU', label: 'Giáo dục', color: '#3d68e1' },
    { key: 'savings', code: 'SAV', label: 'Tiết kiệm', color: '#b97a3b' },
    { key: 'entertainment', code: 'PLAY', label: 'Hưởng thụ', color: '#8d6dd7' },
    { key: 'freedom', code: 'LTSS', label: 'Tự do tài chính', color: '#2f7a5d' },
    { key: 'giving', code: 'GIVE', label: 'Cho đi', color: '#cf5648' }
];

const JAR_ALIAS_MAP = {
    necessities: 'necessities',
    nec: 'necessities',
    thietyeu: 'necessities',
    education: 'education',
    edu: 'education',
    giaoduc: 'education',
    savings: 'savings',
    sav: 'savings',
    tietkiem: 'savings',
    entertainment: 'entertainment',
    play: 'entertainment',
    giaitri: 'entertainment',
    huongthu: 'entertainment',
    freedom: 'freedom',
    ltss: 'freedom',
    tudotaichinh: 'freedom',
    giving: 'giving',
    give: 'giving',
    chodi: 'giving',
    tuthien: 'giving'
};

const CATEGORY_RULES = [
    {
        key: 'housing',
        label: 'Nhà cửa & Tiện ích',
        color: '#2f7a5d',
        limitRatio: 0.36,
        jarFallback: 'necessities',
        keywords: ['tien nha', 'thue nha', 'dien nuoc', 'hoa don dien', 'hoa don nuoc', 'wifi', 'internet', 'gas', 'chung cu']
    },
    {
        key: 'food',
        label: 'Ăn uống & Nhà hàng',
        color: '#c34d42',
        limitRatio: 0.24,
        jarFallback: 'necessities',
        keywords: ['an sang', 'an trua', 'an toi', 'do an', 'nha hang', 'quan an', 'cafe', 'tra sua', 'grabfood', 'sieu thi', 'banh mi']
    },
    {
        key: 'transport',
        label: 'Di chuyển',
        color: '#3d68e1',
        limitRatio: 0.14,
        jarFallback: 'necessities',
        keywords: ['xang', 'grab bike', 'grabcar', 'taxi', 'xe bus', 've xe', 'gui xe', 'do xe', 'di chuyen']
    },
    {
        key: 'education',
        label: 'Học tập & Kỹ năng',
        color: '#6b7ee7',
        limitRatio: 0.1,
        jarFallback: 'education',
        keywords: ['khoa hoc', 'hoc phi', 'chung chi', 'sach', 'udemy', 'skillshare', 'coursera', 'luyen thi']
    },
    {
        key: 'entertainment',
        label: 'Giải trí & Trải nghiệm',
        color: '#8d6dd7',
        limitRatio: 0.1,
        jarFallback: 'entertainment',
        keywords: ['du lich', 'xem phim', 'giai tri', 'netflix', 'spotify', 'game', 'karaoke', 'xem ca nhac']
    },
    {
        key: 'investing',
        label: 'Đầu tư & Tích luỹ',
        color: '#b97a3b',
        limitRatio: 0.06,
        jarFallback: 'freedom',
        keywords: ['dau tu', 'co phieu', 'chung khoan', 'crypto', 'quy', 'tiet kiem']
    }
];

const MONTH_SHORT_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const state = {
    session: null,
    profile: null,
    transactions: [],
    realtimeChannel: null,
    refreshTimer: null,
    reportsAi: {
        signature: '',
        loading: false,
        sending: false,
        summary: null,
        alerts: [],
        reminders: [],
        suggestions: [],
        messages: [],
        lastError: '',
        lastUpdatedAt: null,
        requestId: 0
    }
};

function formatCurrency(value = 0) {
    const amount = Math.round(Number(value || 0));
    const sign = amount < 0 ? '-' : '';
    const formatted = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}đ`;
}

function formatPercent(value = 0, digits = 0) {
    const rounded = Number(value || 0).toFixed(digits);
    return `${rounded}%`;
}

function normalizeToken(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeJar(value) {
    const token = normalizeToken(value).replace(/\s+/g, '');
    return JAR_ALIAS_MAP[token] || null;
}

function normalizeType(value) {
    const token = normalizeToken(value).replace(/\s+/g, '');
    if (token === 'income' || token === 'thu' || token === 'thunhap') return 'income';
    if (token === 'expense' || token === 'chi' || token === 'chitieu') return 'expense';
    return null;
}

function parseObject(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, offset) {
    return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function isWithinRange(value, start, endExclusive) {
    const date = new Date(value);
    return date >= start && date < endExclusive;
}

function getMonthLabel(date) {
    return `Tháng này: Tháng ${date.getMonth() + 1}`;
}

function getMonthShortLabel(date) {
    return MONTH_SHORT_LABELS[date.getMonth()] || '';
}

function getJarLimit(profile, jarKey) {
    const spendingLimits = parseObject(profile?.spending_limits);
    const directLimit = Number(spendingLimits?.[jarKey] || 0);
    if (directLimit > 0) return directLimit;

    const monthlyFallback = Number(profile?.monthly_spending_limit || 0);
    return monthlyFallback > 0 ? monthlyFallback / 6 : 0;
}

function sumRows(rows, predicate) {
    return rows.reduce((sum, row) => (predicate(row) ? sum + Number(row.amount || 0) : sum), 0);
}

function computeDelta(current, previous) {
    if (previous === 0) {
        if (current === 0) return 0;
        return 100;
    }

    return ((current - previous) / Math.abs(previous)) * 100;
}

function buildDeltaModel(metricKey, current, previous) {
    const delta = computeDelta(current, previous);
    const rounded = Math.round(delta);
    const sign = rounded > 0 ? '+' : '';
    const label = `${sign}${rounded}%`;

    let tone = 'is-neutral';
    if (metricKey === 'expense') {
        if (rounded > 0) tone = 'is-negative';
        if (rounded < 0) tone = 'is-positive';
    } else {
        if (rounded > 0) tone = 'is-positive';
        if (rounded < 0) tone = 'is-negative';
    }

    return { label, tone };
}

function groupExpenseByJar(rows) {
    const totals = JARS.reduce((map, jar) => {
        map[jar.key] = 0;
        return map;
    }, {});

    let unassigned = 0;

    rows.forEach((row) => {
        if (row.type !== 'expense') return;
        const jarKey = normalizeJar(row.jar);
        const amount = Number(row.amount || 0);
        if (jarKey && totals[jarKey] !== undefined) {
            totals[jarKey] += amount;
        } else {
            unassigned += amount;
        }
    });

    return { totals, unassigned };
}

function mapExpenseCategory(row) {
    const note = normalizeToken(row.note || '');
    const jarKey = normalizeJar(row.jar);

    const keywordMatch = CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => note.includes(keyword)));
    if (keywordMatch) return keywordMatch;

    const jarFallback = CATEGORY_RULES.find((rule) => rule.jarFallback === jarKey);
    return jarFallback || CATEGORY_RULES[0];
}

function getCategoryLimit(rule, profile, currentAmount, recentAverage) {
    const monthlyLimit = Number(profile?.monthly_spending_limit || 0);
    const profileBased = monthlyLimit > 0 ? monthlyLimit * Number(rule.limitRatio || 0) : 0;
    const jarBased = getJarLimit(profile, rule.jarFallback);
    const dynamic = Math.max(recentAverage * 1.12, currentAmount * 1.08, 1_000_000);
    return Math.max(profileBased, jarBased * 0.6, dynamic);
}

function buildTrendMonths(rows, count = 6) {
    const now = new Date();
    const months = [];

    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const start = addMonths(startOfMonth(now), -offset);
        const end = addMonths(start, 1);
        const monthRows = rows.filter((row) => isWithinRange(row.created_at, start, end));
        months.push({
            key: `${start.getFullYear()}-${start.getMonth() + 1}`,
            label: getMonthShortLabel(start),
            income: sumRows(monthRows, (row) => row.type === 'income'),
            expense: sumRows(monthRows, (row) => row.type === 'expense')
        });
    }

    return months;
}

function buildInsight(viewModel) {
    const { metrics, topCategory, jarStatuses, jarDistribution } = viewModel;
    const riskyJar = jarStatuses
        .filter((item) => item.progress >= 100)
        .sort((a, b) => b.progress - a.progress)[0];

    if (!metrics.income && !metrics.expense) {
        return {
            title: 'Tháng này vẫn chưa có nhiều dữ liệu để phân tích sâu.',
            copy: 'Hãy thêm giao dịch ở Dashboard. Ngay khi có dữ liệu thu chi, báo cáo sẽ tự cập nhật và đồng bộ sang trang này.',
            action: 'Mở Dashboard',
            href: '/src/pages/dashboard.html'
        };
    }

    if (riskyJar) {
        return {
            title: `Hũ ${riskyJar.label} đang vượt ngưỡng ${Math.round(riskyJar.progress)}%.`,
            copy: 'Bạn nên kiểm tra lại khoản chi trong hũ này hoặc cân đối tiếp từ Hệ thống Hũ để tránh bào mòn phần tiết kiệm của tháng.',
            action: 'Mở Hệ thống Hũ',
            href: '/src/pages/multi_jar_budget_system.html'
        };
    }

    if (metrics.income > 0 && metrics.savings <= metrics.income * 0.2) {
        return {
            title: 'Biên tiết kiệm ròng tháng này đang khá mỏng.',
            copy: `Phần chi tiêu hiện đang ăn vào thu nhập tương đối mạnh. Ưu tiên giảm nhóm ${topCategory?.label || 'chi tiêu lớn nhất'} để kéo tỷ lệ tiết kiệm về vùng an toàn hơn.`,
            action: 'Xem Dashboard',
            href: '/src/pages/dashboard.html'
        };
    }

    const dominantJar = jarDistribution.items
        .slice()
        .sort((a, b) => b.amount - a.amount)[0];

    return {
        title: `Nhịp chi tiêu tháng này đang nghiêng về ${dominantJar?.label || 'cấu hình cân bằng'}.`,
        copy: 'Nếu đây là chủ đích của bạn thì cấu trúc hiện tại khá ổn. Nếu không, bạn có thể quay lại Dashboard hoặc Hệ thống Hũ để điều chỉnh lại ưu tiên trong tháng.',
        action: 'Kiểm tra Hệ thống Hũ',
        href: '/src/pages/multi_jar_budget_system.html'
    };
}

function buildViewModel(profile, rows) {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const previousMonthStart = addMonths(currentMonthStart, -1);

    const currentRows = rows.filter((row) => isWithinRange(row.created_at, currentMonthStart, nextMonthStart));
    const previousRows = rows.filter((row) => isWithinRange(row.created_at, previousMonthStart, currentMonthStart));
    const currentExpenseRows = currentRows.filter((row) => row.type === 'expense');

    const metrics = {
        income: sumRows(currentRows, (row) => row.type === 'income'),
        expense: sumRows(currentRows, (row) => row.type === 'expense')
    };
    metrics.savings = metrics.income - metrics.expense;

    const previousMetrics = {
        income: sumRows(previousRows, (row) => row.type === 'income'),
        expense: sumRows(previousRows, (row) => row.type === 'expense')
    };
    previousMetrics.savings = previousMetrics.income - previousMetrics.expense;

    const jarTotals = groupExpenseByJar(currentRows);
    const assignedExpense = Object.values(jarTotals.totals).reduce((sum, amount) => sum + amount, 0);
    const coverage = metrics.expense > 0 ? (assignedExpense / metrics.expense) * 100 : 0;

    const jarDistribution = {
        coverage,
        items: JARS.map((jar) => ({
            ...jar,
            amount: Number(jarTotals.totals[jar.key] || 0),
            share: metrics.expense > 0 ? (Number(jarTotals.totals[jar.key] || 0) / metrics.expense) * 100 : 0
        })),
        unassigned: jarTotals.unassigned
    };

    const recentCategoryRows = rows.filter((row) => {
        if (row.type !== 'expense') return false;
        const date = new Date(row.created_at);
        return date >= addMonths(currentMonthStart, -2) && date < nextMonthStart;
    });

    const categoryMap = new Map();
    CATEGORY_RULES.forEach((rule) => {
        categoryMap.set(rule.key, { ...rule, amount: 0, recentTotal: 0 });
    });

    currentExpenseRows.forEach((row) => {
        const rule = mapExpenseCategory(row);
        const entry = categoryMap.get(rule.key);
        entry.amount += Number(row.amount || 0);
    });

    recentCategoryRows.forEach((row) => {
        const rule = mapExpenseCategory(row);
        const entry = categoryMap.get(rule.key);
        entry.recentTotal += Number(row.amount || 0);
    });

    const categories = Array.from(categoryMap.values())
        .map((item) => {
            const recentAverage = item.recentTotal / 3;
            const limit = getCategoryLimit(item, profile, item.amount, recentAverage);
            const progress = limit > 0 ? (item.amount / limit) * 100 : 0;
            return {
                ...item,
                limit,
                progress
            };
        })
        .sort((a, b) => b.amount - a.amount);

    const topCategory = categories.find((item) => item.amount > 0) || categories[0];

    const jarStatuses = JARS.map((jar) => {
        const expense = Number(jarTotals.totals[jar.key] || 0);
        const limit = getJarLimit(profile, jar.key);
        const progress = limit > 0 ? (expense / limit) * 100 : 0;
        return {
            ...jar,
            expense,
            limit,
            progress
        };
    });

    return {
        metrics,
        previousMetrics,
        monthLabel: getMonthLabel(now),
        jarDistribution,
        trendMonths: buildTrendMonths(rows),
        categories,
        topCategory,
        jarStatuses,
        insight: buildInsight({
            metrics,
            topCategory,
            jarStatuses,
            jarDistribution
        })
    };
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createMessageId(prefix = 'msg') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getFreshSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const currentSession = data?.session || null;
    const expiresAt = Number(currentSession?.expires_at || 0) * 1000;
    const needsRefresh = !currentSession || !Number.isFinite(expiresAt) || expiresAt - Date.now() < 60_000;

    if (!needsRefresh) {
        state.session = currentSession;
        return currentSession;
    }

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;

    const refreshedSession = refreshData?.session || null;
    if (refreshedSession) {
        state.session = refreshedSession;
        return refreshedSession;
    }

    if (currentSession) {
        state.session = currentSession;
        return currentSession;
    }

    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
}

async function callGemini(action, payload) {
    const session = await getFreshSession().catch(() => null);
    const accessToken = session?.access_token;
    if (!accessToken) {
        showGuestAuthNotice('Đăng nhập để chat với AI báo cáo.', window.location.pathname);
        throw new Error('Đăng nhập để chat với AI báo cáo.');
    }

    const makeRequest = (token) =>
        fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                action,
                payload
            })
        });

    let response = await makeRequest(accessToken);
    let responseData = {};

    try {
        responseData = await response.json();
    } catch {
        responseData = {};
    }

    const unauthorizedError =
        response.status === 401 && /unauthorized|token validation failed/i.test(String(responseData.error || ''));
    if (unauthorizedError) {
        const refreshedSession = await getFreshSession();
        const refreshedToken = refreshedSession?.access_token;
        if (refreshedToken && refreshedToken !== accessToken) {
            response = await makeRequest(refreshedToken);
            try {
                responseData = await response.json();
            } catch {
                responseData = {};
            }
        }
    }

    if (!response.ok) {
        throw new Error(responseData.error || 'Không gọi được AI service.');
    }

    return responseData;
}

function buildReportsAiSignature(viewModel) {
    return JSON.stringify({
        monthLabel: viewModel.monthLabel,
        metrics: viewModel.metrics,
        previousMetrics: viewModel.previousMetrics,
        topCategory: viewModel.topCategory
            ? {
                  key: viewModel.topCategory.key,
                  amount: Number(viewModel.topCategory.amount || 0),
                  progress: Math.round(Number(viewModel.topCategory.progress || 0))
              }
            : null,
        jarDistribution: {
            coverage: Math.round(Number(viewModel.jarDistribution?.coverage || 0)),
            unassigned: Number(viewModel.jarDistribution?.unassigned || 0)
        },
        jarStatuses: viewModel.jarStatuses.map((item) => ({
            key: item.key,
            expense: Number(item.expense || 0),
            limit: Number(item.limit || 0),
            progress: Math.round(Number(item.progress || 0))
        }))
    });
}

function buildReportsAssistantContext(viewModel) {
    return {
        monthLabel: viewModel.monthLabel,
        metrics: viewModel.metrics,
        previousMetrics: viewModel.previousMetrics,
        topCategory: viewModel.topCategory
            ? {
                  key: viewModel.topCategory.key,
                  label: viewModel.topCategory.label,
                  amount: Number(viewModel.topCategory.amount || 0),
                  limit: Number(viewModel.topCategory.limit || 0),
                  progress: Number(viewModel.topCategory.progress || 0),
                  recentTotal: Number(viewModel.topCategory.recentTotal || 0)
              }
            : null,
        jarDistribution: {
            coverage: Number(viewModel.jarDistribution?.coverage || 0),
            unassigned: Number(viewModel.jarDistribution?.unassigned || 0),
            items: viewModel.jarDistribution.items
                .filter((item) => Number(item.amount || 0) > 0)
                .map((item) => ({
                    key: item.key,
                    label: item.label,
                    amount: Number(item.amount || 0),
                    share: Number(item.share || 0)
                }))
        },
        categories: viewModel.categories.slice(0, 5).map((item) => ({
            key: item.key,
            label: item.label,
            amount: Number(item.amount || 0),
            limit: Number(item.limit || 0),
            progress: Number(item.progress || 0)
        })),
        jarStatuses: viewModel.jarStatuses.map((item) => ({
            key: item.key,
            code: item.code,
            label: item.label,
            expense: Number(item.expense || 0),
            limit: Number(item.limit || 0),
            progress: Number(item.progress || 0)
        })),
        recentTransactions: state.transactions.slice(0, 8).map((row) => ({
            type: row.type,
            amount: Number(row.amount || 0),
            jar: row.jar || null,
            note: String(row.note || ''),
            created_at: row.created_at || null
        })),
        profile: {
            monthly_spending_limit: Number(state.profile?.monthly_spending_limit || 0),
            daily_spending_limit: Number(state.profile?.daily_spending_limit || 0),
            spending_limits: state.profile?.spending_limits || {}
        }
    };
}

function normalizeReportsAiItem(item, fallbackTone = 'info') {
    if (!item) return null;

    if (typeof item === 'string') {
        const text = String(item).trim();
        if (!text) return null;
        return {
            tone: fallbackTone,
            title: text,
            detail: ''
        };
    }

    const tone = ['danger', 'warning', 'info', 'success'].includes(String(item.tone || '').trim())
        ? String(item.tone).trim()
        : fallbackTone;
    const title = String(item.title || item.label || item.name || '').trim();
    const detail = String(item.detail || item.copy || item.message || '').trim();

    if (!title && !detail) return null;

    return {
        tone,
        title: title || detail,
        detail: detail || title
    };
}

function getReportsToneLabel(tone) {
    switch (String(tone || '').trim()) {
        case 'danger':
            return 'rủi ro';
        case 'warning':
            return 'lưu ý';
        case 'success':
            return 'tích cực';
        default:
            return 'thông tin';
    }
}

function normalizeReportsAiQuestions(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 4);
}

function normalizeReportsActionHref(value, fallbackHref) {
    const allowed = new Set(['/src/pages/dashboard.html', '/src/pages/multi_jar_budget_system.html']);
    const href = String(value || '').trim();
    return allowed.has(href) ? href : fallbackHref;
}

function buildReportsAiFallback(viewModel) {
    const baseInsight = viewModel.insight || buildInsight(viewModel);
    const alerts = [];
    const reminders = [];
    const riskyJar = viewModel.jarStatuses
        .filter((item) => Number(item.progress || 0) >= 100)
        .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))[0];
    const warningJar = viewModel.jarStatuses
        .filter((item) => Number(item.progress || 0) >= 80 && Number(item.progress || 0) < 100)
        .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))[0];
    const dominantCategory = viewModel.categories.find((item) => Number(item.amount || 0) > 0) || viewModel.topCategory || null;
    const monthlyLimit = Number(state.profile?.monthly_spending_limit || 0);
    const income = Number(viewModel.metrics?.income || 0);
    const expense = Number(viewModel.metrics?.expense || 0);
    const savings = Number(viewModel.metrics?.savings || 0);
    const savingsRatio = income > 0 ? savings / income : 0;

    if (!income && !expense) {
        alerts.push({
            tone: 'info',
            title: 'Chưa có dữ liệu giao dịch đủ nhiều',
            detail: 'Hãy thêm giao dịch ở Dashboard để AI có thể đọc xu hướng, cảnh báo và nhắc nhở cụ thể hơn.'
        });
        reminders.push({
            title: 'Bắt đầu từ giao dịch đầu tiên',
            detail: 'Khi bạn có thêm thu nhập hoặc chi tiêu, báo cáo sẽ tự động cập nhật theo dữ liệu thật.'
        });
    } else {
        if (riskyJar) {
            alerts.push({
                tone: 'danger',
                title: `${riskyJar.label} đang vượt ngưỡng ${Math.round(Number(riskyJar.progress || 0))}%`,
                detail: `Đã chi ${formatCurrency(riskyJar.expense)} trên hạn mức ${formatCurrency(riskyJar.limit)}. Hũ này nên được xem lại sớm.`
            });
        } else if (warningJar) {
            alerts.push({
                tone: 'warning',
                title: `${warningJar.label} đang đi khá sát hạn mức`,
                detail: `Mức dùng hiện tại đã chạm ${Math.round(Number(warningJar.progress || 0))}% hạn mức. Bạn nên theo dõi thêm vài ngày tới.`
            });
        }

        if (income > 0 && savingsRatio <= 0.2) {
            alerts.push({
                tone: 'warning',
                title: 'Biên tiết kiệm tháng này đang mỏng',
                detail: `Tiết kiệm ròng hiện là ${formatCurrency(savings)} trên thu nhập ${formatCurrency(income)}. Bạn có thể giảm nhịp chi ở hạng mục lớn nhất.`
            });
        }

        if (viewModel.jarDistribution.unassigned > 0) {
            reminders.push({
                title: 'Có chi tiêu chưa gán vào hũ',
                detail: `Khoảng ${formatCurrency(viewModel.jarDistribution.unassigned)} vẫn chưa được phân loại. Gán sớm để báo cáo phản ánh đúng hơn.`
            });
        }

        if (monthlyLimit > 0 && expense > monthlyLimit * 0.85) {
            reminders.push({
                title: 'Chi tiêu tháng đang gần trần tham chiếu',
                detail: `Tổng chi hiện tại đã đạt ${Math.round((expense / monthlyLimit) * 100)}% so với mức tham chiếu bạn đặt.`
            });
        }

        if (dominantCategory) {
            reminders.push({
                title: `Theo dõi hạng mục ${dominantCategory.label}`,
                detail: `Đây là hạng mục chi nổi bật nhất tháng này với ${formatCurrency(dominantCategory.amount)}.`
            });
        }
    }

    const suggestedQuestions = normalizeReportsAiQuestions([
        'Tháng này tôi nên ưu tiên điều chỉnh khoản nào trước?',
        riskyJar ? `Hũ ${riskyJar.label} đang có vấn đề gì?` : 'Có hũ nào đang dùng quá nhanh không?',
        'Cho tôi 1 việc nên làm ngay trong tuần này.'
    ]);

    return {
        headline: baseInsight.title,
        summary: baseInsight.copy,
        alerts,
        reminders,
        suggestedQuestions,
        actionLabel: baseInsight.action,
        actionHref: baseInsight.href
    };
}

function normalizeReportsAiResponse(raw, viewModel, mode = 'summary') {
    const fallback = buildReportsAiFallback(viewModel);
    const summaryText = String(raw?.summary || raw?.copy || raw?.message || '').trim();
    const headlineText = String(raw?.headline || raw?.title || '').trim();
    const replyText = String(raw?.reply || raw?.message || summaryText).trim();
    const suggestedQuestions = normalizeReportsAiQuestions(raw?.suggestedQuestions || raw?.questions);

    return {
        headline: headlineText || fallback.headline,
        summary: summaryText || fallback.summary,
        reply: replyText || fallback.summary,
        alerts: Array.isArray(raw?.alerts) && raw.alerts.length
            ? raw.alerts.map((item) => normalizeReportsAiItem(item, 'info')).filter(Boolean)
            : fallback.alerts,
        reminders: Array.isArray(raw?.reminders) && raw.reminders.length
            ? raw.reminders.map((item) => normalizeReportsAiItem(item, 'info')).filter(Boolean)
            : fallback.reminders,
        suggestedQuestions: suggestedQuestions.length ? suggestedQuestions : fallback.suggestedQuestions,
        actionLabel: String(raw?.actionLabel || raw?.action || '').trim() || fallback.actionLabel,
        actionHref: normalizeReportsActionHref(raw?.actionHref || raw?.href, fallback.actionHref),
        mode
    };
}

function createReportsAiSeedMessage(snapshot) {
    return {
        id: createMessageId('reports-ai-seed'),
        role: 'assistant',
        kind: 'seed',
        content: `${snapshot.headline}\n\n${snapshot.summary}`
    };
}

function getReportsAiSnapshot(viewModel) {
    const fallback = buildReportsAiFallback(viewModel);
    const summary = state.reportsAi.summary || fallback;

    return {
        ...summary,
        loading: state.reportsAi.loading,
        sending: state.reportsAi.sending,
        lastError: state.reportsAi.lastError,
        lastUpdatedAt: state.reportsAi.lastUpdatedAt,
        alerts: Array.isArray(summary.alerts) && summary.alerts.length ? summary.alerts : fallback.alerts,
        reminders: Array.isArray(summary.reminders) && summary.reminders.length ? summary.reminders : fallback.reminders,
        suggestedQuestions:
            Array.isArray(summary.suggestedQuestions) && summary.suggestedQuestions.length
                ? summary.suggestedQuestions
                : fallback.suggestedQuestions,
        actionLabel: summary.actionLabel || fallback.actionLabel,
        actionHref: summary.actionHref || fallback.actionHref,
        threadMessages: state.reportsAi.messages.length
            ? state.reportsAi.messages
            : [createReportsAiSeedMessage(summary)]
    };
}

function renderReportsAiAlerts(snapshot) {
    const alertsEl = document.getElementById('report-insight-alerts');
    const alertCountEl = document.getElementById('reports-ai-alert-count');
    const alertPanelCountEl = document.getElementById('reports-ai-alert-panel-count');
    if (!alertsEl) return;

    const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts.filter(Boolean) : [];
    if (alertCountEl) alertCountEl.textContent = String(alerts.length);
    if (alertPanelCountEl) alertPanelCountEl.textContent = String(alerts.length);

    if (!alerts.length) {
        alertsEl.innerHTML = '<p class="reports-empty-copy is-inline">Hiện chưa có cảnh báo nổi bật.</p>';
        return;
    }

    alertsEl.innerHTML = alerts
        .map((alert, index) => {
            const tone = ['danger', 'warning', 'info', 'success'].includes(String(alert.tone || '').trim())
                ? String(alert.tone).trim()
                : 'info';
            const title = alert.title || alert.detail || 'Cảnh báo';
            const detail = alert.detail || alert.title || '';

            return `
                <details class="reports-insight-item reports-insight-alert is-${escapeHtml(tone)}"${index === 0 ? ' open' : ''}>
                    <summary>
                        <span class="reports-insight-item-title">${escapeHtml(title)}</span>
                        <span class="reports-insight-item-tone">${escapeHtml(getReportsToneLabel(tone))}</span>
                    </summary>
                    <div class="reports-insight-item-body">
                        <p>${escapeHtml(detail)}</p>
                    </div>
                </details>
            `;
        })
        .join('');
}

function renderReportsAiReminders(snapshot) {
    const remindersEl = document.getElementById('report-insight-reminders');
    const reminderCountEl = document.getElementById('reports-ai-reminder-count');
    const reminderPanelCountEl = document.getElementById('reports-ai-reminder-panel-count');
    if (!remindersEl) return;

    const reminders = Array.isArray(snapshot.reminders) ? snapshot.reminders.filter(Boolean) : [];
    if (reminderCountEl) reminderCountEl.textContent = String(reminders.length);
    if (reminderPanelCountEl) reminderPanelCountEl.textContent = String(reminders.length);

    if (!reminders.length) {
        remindersEl.innerHTML = '';
        return;
    }

    remindersEl.innerHTML = reminders
        .map((reminder, index) => {
            const title = reminder.title || 'Nhắc nhở';
            const detail = reminder.detail || reminder.title || '';

            return `
                <details class="reports-insight-item reports-insight-reminder is-info"${index === 0 ? ' open' : ''}>
                    <summary>
                        <span class="reports-insight-item-title">${escapeHtml(title)}</span>
                        <span class="reports-insight-item-tone">nhắc</span>
                    </summary>
                    <div class="reports-insight-item-body">
                        <p>${escapeHtml(detail)}</p>
                    </div>
                </details>
            `;
        })
        .join('');
}

function renderReportsAiThread(snapshot) {
    const threadEl = document.getElementById('reports-ai-thread');
    if (!threadEl) return;

    const messages = Array.isArray(snapshot.threadMessages) && snapshot.threadMessages.length
        ? snapshot.threadMessages
        : [
              {
                  id: createMessageId('reports-ai-welcome'),
                  role: 'assistant',
                  content: snapshot.loading
                      ? 'AI đang đọc dữ liệu báo cáo của bạn...'
                      : `${snapshot.headline}\n\n${snapshot.summary}`
              }
          ];

    threadEl.innerHTML = messages
        .map((message) => {
            const role = String(message.role || 'assistant').toLowerCase() === 'user' ? 'user' : 'assistant';
            const label = role === 'user' ? 'Bạn' : 'AI';
            return `
                <article class="reports-ai-message is-${role}">
                    <div class="reports-ai-message-head">${label}</div>
                    <div class="reports-ai-message-body">${escapeHtml(message.content || '').replace(/\n/g, '<br />')}</div>
                </article>
            `;
        })
        .join('');

    window.requestAnimationFrame(() => {
        threadEl.scrollTop = threadEl.scrollHeight;
    });
}

function renderReportsAiSuggestions(snapshot) {
    const suggestionsEl = document.getElementById('reports-ai-suggestions');
    if (!suggestionsEl) return;

    const suggestions = Array.isArray(snapshot.suggestedQuestions) ? snapshot.suggestedQuestions.filter(Boolean) : [];
    if (!suggestions.length) {
        suggestionsEl.innerHTML = '';
        return;
    }

    suggestionsEl.innerHTML = suggestions
        .map((question) => {
            return `
                <button type="button" class="reports-ai-suggestion" data-reports-ai-question="${escapeHtml(question)}">
                    ${escapeHtml(question)}
                </button>
            `;
        })
        .join('');

    suggestionsEl.querySelectorAll('[data-reports-ai-question]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById('reports-ai-input');
            if (!input) return;

            const question = button.getAttribute('data-reports-ai-question') || '';
            input.value = question;
            input.focus();
            try {
                input.setSelectionRange(question.length, question.length);
            } catch {
                // ignore selection issues
            }
        });
    });
}

function updateReportsAiStatus(snapshot) {
    const statusEl = document.getElementById('reports-ai-chat-status');
    const syncNoteEl = document.getElementById('reports-ai-sync-note');

    if (!state.session) {
        if (statusEl) {
            statusEl.textContent = 'Xem trước';
        }
        if (syncNoteEl) {
            syncNoteEl.textContent = 'Đăng nhập để chat với AI và nhận cảnh báo thật.';
        }
        return;
    }

    if (statusEl) {
        if (snapshot.sending) {
            statusEl.textContent = 'AI đang trả lời...';
        } else if (snapshot.loading) {
            statusEl.textContent = 'AI đang phân tích...';
        } else if (snapshot.lastError) {
            statusEl.textContent = 'Có lỗi khi tải AI';
        } else {
            statusEl.textContent = 'Sẵn sàng trò chuyện';
        }
    }

    if (syncNoteEl) {
        if (snapshot.sending) {
            syncNoteEl.textContent = 'Đang gửi câu hỏi để AI đọc ngữ cảnh báo cáo.';
        } else if (snapshot.loading) {
            syncNoteEl.textContent = 'AI đang tổng hợp cảnh báo và nhắc nhở từ dữ liệu hiện tại.';
        } else if (snapshot.lastUpdatedAt) {
            syncNoteEl.textContent = `Cập nhật lúc ${new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
            }).format(new Date(snapshot.lastUpdatedAt))}.`;
        } else if (snapshot.lastError) {
            syncNoteEl.textContent = snapshot.lastError;
        } else {
            syncNoteEl.textContent = 'AI sẽ cập nhật theo dữ liệu mới nhất.';
        }
    }
}

function seedReportsAiThread(snapshot) {
    if (state.reportsAi.messages.length && state.reportsAi.messages[0]?.kind !== 'seed') return;
    state.reportsAi.messages = [createReportsAiSeedMessage(snapshot)];
}

function renderInsight(viewModel) {
    const snapshot = getReportsAiSnapshot(viewModel);
    seedReportsAiThread(snapshot);
    const threadMessages = state.reportsAi.messages.length ? state.reportsAi.messages : snapshot.threadMessages;

    setText('report-insight-title', snapshot.headline);
    setText('report-insight-copy', snapshot.summary);
    setText('reports-ai-context-month', viewModel.monthLabel);

    const actionEl = document.getElementById('report-insight-action');
    if (actionEl) {
        actionEl.textContent = snapshot.actionLabel || 'Xem chi tiết lời khuyên';
        actionEl.setAttribute('href', snapshot.actionHref || '/src/pages/multi_jar_budget_system.html');
    }

    renderReportsAiAlerts(snapshot);
    renderReportsAiReminders(snapshot);
    renderReportsAiThread({ ...snapshot, threadMessages });
    renderReportsAiSuggestions(snapshot);
    updateReportsAiStatus(snapshot);
    setText('reports-ai-toggle-meta', `${(snapshot.alerts || []).length} cảnh báo · ${(snapshot.reminders || []).length} nhắc nhở`);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setStatus(message, tone = '') {
    const statusEl = document.getElementById('reports-sync-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `reports-sync-status${tone ? ` ${tone}` : ''}`;
}

function renderMetrics(viewModel) {
    const incomeDelta = buildDeltaModel('income', viewModel.metrics.income, viewModel.previousMetrics.income);
    const expenseDelta = buildDeltaModel('expense', viewModel.metrics.expense, viewModel.previousMetrics.expense);
    const savingsDelta = buildDeltaModel('savings', viewModel.metrics.savings, viewModel.previousMetrics.savings);

    setText('report-income-value', formatCurrency(viewModel.metrics.income));
    setText('report-expense-value', formatCurrency(viewModel.metrics.expense));
    setText('report-savings-value', formatCurrency(viewModel.metrics.savings));
    setText('report-income-copy', `Tháng trước: ${formatCurrency(viewModel.previousMetrics.income)}`);
    setText('report-expense-copy', `Tháng trước: ${formatCurrency(viewModel.previousMetrics.expense)}`);
    setText('report-savings-copy', `Tháng trước: ${formatCurrency(viewModel.previousMetrics.savings)}`);

    const incomeDeltaEl = document.getElementById('report-income-delta');
    const expenseDeltaEl = document.getElementById('report-expense-delta');
    const savingsDeltaEl = document.getElementById('report-savings-delta');

    if (incomeDeltaEl) {
        incomeDeltaEl.textContent = incomeDelta.label;
        incomeDeltaEl.className = `reports-metric-delta ${incomeDelta.tone}`;
    }

    if (expenseDeltaEl) {
        expenseDeltaEl.textContent = expenseDelta.label;
        expenseDeltaEl.className = `reports-metric-delta ${expenseDelta.tone}`;
    }

    if (savingsDeltaEl) {
        savingsDeltaEl.textContent = savingsDelta.label;
        savingsDeltaEl.className = `reports-metric-delta ${savingsDelta.tone} on-dark`;
    }
}

function renderJarDistribution(viewModel) {
    const donutEl = document.getElementById('report-jar-donut');
    const legendEl = document.getElementById('report-jar-legend');
    const coverageValueEl = document.getElementById('report-jar-distribution-value');
    const coverageCopyEl = document.getElementById('report-jar-distribution-copy');

    if (!donutEl || !legendEl || !coverageValueEl || !coverageCopyEl) return;

    const items = viewModel.jarDistribution.items;
    const activeItems = items.filter((item) => item.amount > 0);
    if (viewModel.jarDistribution.unassigned > 0) {
        activeItems.push({
            key: 'unassigned',
            label: 'Chưa gán hũ',
            amount: viewModel.jarDistribution.unassigned,
            share: viewModel.metrics.expense > 0 ? (viewModel.jarDistribution.unassigned / viewModel.metrics.expense) * 100 : 0,
            color: '#c5cdc8'
        });
    }

    if (!activeItems.length) {
        donutEl.style.setProperty('--segments', '#dfe8e0 0 100%');
        coverageValueEl.textContent = '0%';
        coverageCopyEl.textContent = 'Chưa có chi tiêu tháng này';
        legendEl.innerHTML = '<p class="reports-empty-copy">Khi bạn phát sinh chi tiêu và gán vào hũ, biểu đồ này sẽ tự cập nhật theo dữ liệu thật.</p>';
        return;
    }

    let cursor = 0;
    const segments = activeItems.map((item) => {
        const start = cursor;
        const end = cursor + item.share;
        cursor = end;
        return `${item.color} ${start}% ${end}%`;
    });

    donutEl.style.setProperty('--segments', segments.join(', '));
    coverageValueEl.textContent = formatPercent(viewModel.jarDistribution.coverage);
    coverageCopyEl.textContent = 'Chi tiêu đã gán vào hũ';

    legendEl.innerHTML = activeItems
        .filter((item) => item.amount > 0)
        .map((item) => {
            return `
                <div class="reports-legend-item">
                    <div class="reports-legend-label">
                        <i style="--legend-color: ${item.color};"></i>
                        <span>${item.label}</span>
                    </div>
                    <div class="reports-legend-meta">
                        <span class="reports-legend-percent">${formatPercent(item.share)}</span>
                        <span class="reports-legend-value">${formatCurrency(item.amount)}</span>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderTrend(viewModel) {
    const chartEl = document.getElementById('report-trend-chart');
    if (!chartEl) return;

    const maxValue = Math.max(
        1,
        ...viewModel.trendMonths.flatMap((month) => [month.income, month.expense])
    );

    chartEl.innerHTML = viewModel.trendMonths
        .map((month) => {
            const incomeHeight = Math.max((month.income / maxValue) * 100, month.income > 0 ? 8 : 0);
            const expenseHeight = Math.max((month.expense / maxValue) * 100, month.expense > 0 ? 8 : 0);

            return `
                <div class="reports-trend-month">
                    <div class="reports-trend-bars">
                        <div
                            class="reports-trend-bar is-income"
                            style="height: ${incomeHeight}%"
                            title="Thu nhập ${month.label}: ${formatCurrency(month.income)}"
                        ></div>
                        <div
                            class="reports-trend-bar is-expense"
                            style="height: ${expenseHeight}%"
                            title="Chi tiêu ${month.label}: ${formatCurrency(month.expense)}"
                        ></div>
                    </div>
                    <div class="reports-trend-label">${month.label}</div>
                </div>
            `;
        })
        .join('');
}

function renderCategories(viewModel) {
    const listEl = document.getElementById('report-category-list');
    if (!listEl) return;

    const visibleItems = viewModel.categories.slice(0, 4);
    if (!visibleItems.some((item) => item.amount > 0)) {
        listEl.innerHTML = '<p class="reports-empty-copy">Chưa có chi tiêu tháng này để xác định hạng mục nổi bật.</p>';
        return;
    }

    listEl.innerHTML = visibleItems
        .map((item) => {
            const width = Math.min(item.progress, 100);
            const isDanger = item.progress > 100;
            const note = isDanger ? `Vượt hạn mức ${Math.round(item.progress - 100)}%` : `Đang dùng ${Math.round(item.progress)}% hạn mức tham chiếu`;

            return `
                <div class="reports-category-item">
                    <div class="reports-category-head">
                        <div class="reports-category-name">${item.label}</div>
                        <div class="reports-category-amount">${formatCurrency(item.amount)} / ${formatCurrency(item.limit)}</div>
                    </div>
                    <div class="reports-category-track">
                        <span class="reports-category-bar" style="--bar-color: ${item.color}; width: ${width}%"></span>
                    </div>
                    <div class="reports-category-note ${isDanger ? 'is-danger' : ''}">${note}</div>
                </div>
            `;
        })
        .join('');
}

function renderJarStatuses(viewModel) {
    const gridEl = document.getElementById('report-jar-status-grid');
    if (!gridEl) return;

    gridEl.innerHTML = viewModel.jarStatuses
        .map((item) => {
            const width = Math.min(item.progress, 100);
            const toneClass = item.progress >= 100 ? 'is-danger' : item.progress >= 80 ? 'is-warning' : '';
            const limitCopy = item.limit > 0 ? `${formatCurrency(item.expense)} / ${formatCurrency(item.limit)}` : `${formatCurrency(item.expense)} đã ghi nhận`;

            return `
                <article class="reports-status-card ${toneClass}">
                    <div class="reports-status-label">${item.code}</div>
                    <div class="reports-status-value-row">
                        <strong class="reports-status-value">${formatPercent(item.progress)}</strong>
                        <span class="reports-status-copy">${item.label}</span>
                    </div>
                    <div class="reports-status-track">
                        <span style="width: ${width}%; background: ${item.color};"></span>
                    </div>
                    <div class="reports-status-copy">${limitCopy}</div>
                </article>
            `;
        })
        .join('');
}

function renderMonthPill(viewModel) {
    setText('reports-month-pill', viewModel.monthLabel);
}

function renderAll() {
    const viewModel = buildViewModel(state.profile, state.transactions);
    renderMonthPill(viewModel);
    renderMetrics(viewModel);
    renderJarDistribution(viewModel);
    renderTrend(viewModel);
    renderCategories(viewModel);
    renderJarStatuses(viewModel);
    renderInsight(viewModel);
}

async function refreshReportsAssistant(viewModel, { force = false } = {}) {
    const signature = buildReportsAiSignature(viewModel);
    if (!force && state.reportsAi.signature === signature && state.reportsAi.summary) {
        return state.reportsAi.summary;
    }

    const requestId = ++state.reportsAi.requestId;
    state.reportsAi.loading = true;
    state.reportsAi.lastError = '';
    renderInsight(viewModel);

    try {
        const aiResult = await callGemini('reports-assistant', {
            mode: 'summary',
            context: buildReportsAssistantContext(viewModel)
        });

        if (requestId !== state.reportsAi.requestId) return null;

        const normalized = normalizeReportsAiResponse(aiResult, viewModel, 'summary');
        state.reportsAi.signature = signature;
        state.reportsAi.summary = normalized;
        state.reportsAi.loading = false;
        state.reportsAi.lastUpdatedAt = new Date().toISOString();
        if (!state.reportsAi.messages.length || state.reportsAi.messages[0]?.kind === 'seed') {
            state.reportsAi.messages = [createReportsAiSeedMessage(normalized)];
        }

        renderInsight(viewModel);
        return normalized;
    } catch (error) {
        if (requestId !== state.reportsAi.requestId) return null;

        state.reportsAi.loading = false;
        state.reportsAi.lastError = error.message || 'Không thể tải phân tích AI.';
        state.reportsAi.summary = buildReportsAiFallback(viewModel);
        state.reportsAi.lastUpdatedAt = new Date().toISOString();
        if (!state.reportsAi.messages.length || state.reportsAi.messages[0]?.kind === 'seed') {
            state.reportsAi.messages = [createReportsAiSeedMessage(state.reportsAi.summary)];
        }

        renderInsight(viewModel);
        return state.reportsAi.summary;
    }
}

function clearReportsAiConversation() {
    const viewModel = buildViewModel(state.profile, state.transactions);
    const snapshot = getReportsAiSnapshot(viewModel);
    state.reportsAi.messages = [createReportsAiSeedMessage(snapshot)];
    state.reportsAi.lastError = '';

    const input = document.getElementById('reports-ai-input');
    if (input) input.value = '';

    renderInsight(viewModel);
}

async function submitReportsAiChat(event) {
    event.preventDefault();
    if (state.reportsAi.sending) return;
    if (!state.session) {
        showGuestAuthNotice('Đăng nhập để chat với AI báo cáo.', window.location.pathname);
        return;
    }

    const input = document.getElementById('reports-ai-input');
    const userText = String(input?.value || '').trim();
    if (!userText) {
        state.reportsAi.lastError = 'Bạn hãy nhập câu hỏi trước nhé.';
        renderInsight(buildViewModel(state.profile, state.transactions));
        return;
    }

    const viewModel = buildViewModel(state.profile, state.transactions);
    const snapshot = getReportsAiSnapshot(viewModel);

    if (state.reportsAi.messages.length === 1 && state.reportsAi.messages[0]?.kind === 'seed') {
        state.reportsAi.messages = [];
    }

    state.reportsAi.messages.push({
        id: createMessageId('reports-ai-user'),
        role: 'user',
        content: userText
    });

    if (input) input.value = '';

    state.reportsAi.sending = true;
    state.reportsAi.lastError = '';
    renderInsight(viewModel);

    try {
        const aiResult = await callGemini('reports-assistant', {
            mode: 'chat',
            context: buildReportsAssistantContext(viewModel),
            messages: state.reportsAi.messages.slice(-8).map((message) => ({
                role: message.role,
                content: message.content
            }))
        });

        const normalized = normalizeReportsAiResponse(aiResult, viewModel, 'chat');
        state.reportsAi.messages.push({
            id: createMessageId('reports-ai-assistant'),
            role: 'assistant',
            content: normalized.reply
        });
        state.reportsAi.summary = {
            ...snapshot,
            headline: normalized.headline || snapshot.headline,
            summary: normalized.summary || snapshot.summary,
            alerts: normalized.alerts.length ? normalized.alerts : snapshot.alerts,
            reminders: normalized.reminders.length ? normalized.reminders : snapshot.reminders,
            suggestedQuestions: normalized.suggestedQuestions.length ? normalized.suggestedQuestions : snapshot.suggestedQuestions,
            actionLabel: normalized.actionLabel || snapshot.actionLabel,
            actionHref: normalized.actionHref || snapshot.actionHref
        };
        state.reportsAi.lastUpdatedAt = new Date().toISOString();
    } catch (error) {
        state.reportsAi.messages.push({
            id: createMessageId('reports-ai-error'),
            role: 'assistant',
            content: error.message || 'Mình chưa trả lời được lúc này.'
        });
        state.reportsAi.lastError = error.message || 'Mình chưa trả lời được lúc này.';
    } finally {
        state.reportsAi.sending = false;
        renderInsight(viewModel);
    }
}

function bindReportsAiChat() {
    const form = document.getElementById('reports-ai-form');
    const textarea = document.getElementById('reports-ai-input');
    const clearBtn = document.getElementById('reports-ai-clear');

    form?.addEventListener('submit', submitReportsAiChat);

    textarea?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            form?.requestSubmit?.();
        }
    });

    clearBtn?.addEventListener('click', clearReportsAiConversation);
}

async function loadReports(session) {
    if (!session) {
        await cleanupRealtime();
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
        state.session = null;
        state.profile = null;
        state.transactions = [];
        state.reportsAi.signature = '';
        state.reportsAi.loading = false;
        state.reportsAi.sending = false;
        state.reportsAi.summary = null;
        state.reportsAi.alerts = [];
        state.reportsAi.reminders = [];
        state.reportsAi.suggestions = [];
        state.reportsAi.messages = [];
        state.reportsAi.lastError = '';
        state.reportsAi.lastUpdatedAt = null;
        renderAll();
        setStatus('Bạn đang xem trước Báo cáo. Đăng nhập để tải dữ liệu thật và chat với AI.', 'is-info');
        return;
    }

    const userId = session.user.id;

    const [profileResult, transactionsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    ]);

    if (profileResult.error) throw profileResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    state.profile = profileResult.data || null;
    state.transactions = (transactionsResult.data || []).map((row) => ({
        ...row,
        type: normalizeType(row.type),
        amount: Number(row.amount || 0)
    })).filter((row) => row.type);

    renderAll();
    void refreshReportsAssistant(buildViewModel(state.profile, state.transactions));
    setStatus(`Đồng bộ thành công lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`, 'is-success');
}

function scheduleReload() {
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
        if (!state.session) return;
        loadReports(state.session).catch((error) => {
            setStatus(error.message || 'Không thể đồng bộ dữ liệu báo cáo.', 'is-error');
        });
    }, 180);
}

async function cleanupRealtime() {
    if (!state.realtimeChannel) return;
    await supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
}

function initRealtime(session) {
    const userId = session.user.id;
    cleanupRealtime();

    const channel = supabase
        .channel(`reports-realtime-${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'transactions',
                filter: `user_id=eq.${userId}`
            },
            scheduleReload
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'user_profiles',
                filter: `user_id=eq.${userId}`
            },
            scheduleReload
        )
        .subscribe();

    state.realtimeChannel = channel;
}

function bindEvents() {
    document.getElementById('reports-export-btn')?.addEventListener('click', () => {
        window.print();
    });
}

async function init() {
    bindEvents();
    bindReportsAiChat();

    try {
        state.session = await getFreshSession().catch(() => null);
        await loadReports(state.session);
        if (state.session) {
            initRealtime(state.session);
            window.addEventListener('beforeunload', cleanupRealtime);
        } else {
            showGuestAuthNotice('Bạn đang xem trước Báo cáo. Đăng nhập để tải dữ liệu thật và chat với AI.', window.location.pathname);
        }
    } catch (error) {
        setStatus(error.message || 'Không thể tải báo cáo lúc này.', 'is-error');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
