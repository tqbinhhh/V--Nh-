import { getSupabaseClient } from './supabase-client.js';
import { getFreshSession, showGuestAuthNotice } from './auth-guard.js';

const supabase = getSupabaseClient();

const JARS = [
    {
        key: 'necessities',
        code: 'NEC',
        label: 'Chi phí thiết yếu',
        shortCopy: 'Ăn uống, thuê nhà, hoá đơn',
        defaultRatio: 55,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M7.5 9.5h9l-.9 8.2a1.5 1.5 0 0 1-1.5 1.3H9.9a1.5 1.5 0 0 1-1.5-1.3L7.5 9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                <path d="M9.5 9.5V8a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
        `
    },
    {
        key: 'education',
        code: 'EDU',
        label: 'Giáo dục',
        shortCopy: 'Khoá học, sách, kỹ năng',
        defaultRatio: 10,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="m4 10 8-4 8 4-8 4-8-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                <path d="M8 12.5v3.1c0 .7 1.8 1.9 4 1.9s4-1.2 4-1.9v-3.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
        `
    },
    {
        key: 'savings',
        code: 'SAV',
        label: 'Tiết kiệm dài hạn',
        shortCopy: 'Mua nhà, xe, quỹ phòng hộ',
        defaultRatio: 10,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="7.5" y="10" width="9" height="8" rx="2" stroke="currentColor" stroke-width="1.8" />
                <path d="M9.5 10V8.5a2.5 2.5 0 0 1 5 0V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
        `
    },
    {
        key: 'entertainment',
        code: 'PLAY',
        label: 'Giải trí',
        shortCopy: 'Du lịch, tiệc tùng, sở thích',
        defaultRatio: 10,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="m12 5 1.2 3.2L16.5 9l-2.6 2 1 3.3-2.9-1.8-2.9 1.8 1-3.3-2.6-2 3.3-.8L12 5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
        `
    },
    {
        key: 'freedom',
        code: 'LTSS',
        label: 'Tự do tài chính',
        shortCopy: 'Đầu tư chứng khoán, bất động sản',
        defaultRatio: 10,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 16.5 10 12l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M16 9h2v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `
    },
    {
        key: 'giving',
        code: 'GIVE',
        label: 'Từ thiện',
        shortCopy: 'Giúp đỡ người khác, cộng đồng',
        defaultRatio: 5,
        icon: `
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M8.5 11.5c-1.4 0-2.5-1.1-2.5-2.5S7.1 6.5 8.5 6.5 11 7.6 11 9c0 1.4-1.1 2.5-2.5 2.5Z" stroke="currentColor" stroke-width="1.8" />
                <path d="M13.5 10.5c1.2-2 4.5-1.4 4.5 1 0 2-2 3.4-4.3 5.4-2.3-2-4.3-3.4-4.3-5.4 0-2.2 2.8-3 4.1-1.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
        `
    }
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

const STEP_AMOUNT = 10_000;
const JAR_LIMIT_SUGGESTION_STEP = 10_000;
const JAR_LIMIT_PERSONALITY_COPY = {
    necessities: 'Hũ Thiết yếu nên giữ biên an toàn rộng một chút để bạn không bị siết chặt sinh hoạt.',
    education: 'Hũ Giáo dục hợp với mức linh hoạt hơn, vì các khoản học thường đến theo đợt.',
    savings: 'Hũ Tiết kiệm dài hạn nên đều và bền, tránh tăng giảm quá mạnh theo cảm hứng.',
    entertainment: 'Hũ Giải trí nên có trần vừa đủ để vui mà vẫn không làm lệch nhịp chi tiêu.',
    freedom: 'Hũ Tự do tài chính phù hợp với mức kỷ luật cao hơn để ưu tiên đầu tư dài hạn.',
    giving: 'Hũ Từ thiện nên giữ mức ổn định để việc cho đi luôn nhẹ nhàng và đều đặn.'
};
const ALLOCATION_NOTE_PATTERN = /\s-\s(?:phân bổ|chia sau)\s+/i;
const ALLOCATION_SUFFIX_PATTERN = /\s-\s(?:phân bổ|chia sau)\s+.+$/i;
const MANUAL_FIRST_COPY = 'Nhập tay trước, gợi ý nhanh khi cần';

const state = {
    session: null,
    profile: null,
    transactions: [],
    pendingIncomes: [],
    selectedPendingId: null,
    allocationDraft: {},
    selectedLimitJarKey: 'necessities',
    jarLimitDrafts: {},
    jarLimitInsights: {},
    jarLimitFeedbackTimer: null,
    dailyLimitDraft: null,
    dailyLimitFeedbackTimer: null,
    historyOpen: false,
    isSaving: false,
    isSavingDailyLimit: false,
    isSavingJarLimit: false
};

function requireJarAccess(message = 'Đăng nhập để sử dụng tính năng này.') {
    if (state.session) return true;

    showGuestAuthNotice(message, window.location.pathname);
    setFeedback(message, 'info');
    return false;
}

function formatCurrency(value = 0) {
    const amount = Math.round(Number(value || 0));
    const sign = amount < 0 ? '-' : '';
    const formatted = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}₫`;
}

function formatInputCurrency(value = 0) {
    return Math.max(0, Math.round(Number(value || 0))).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrencyInputField(input) {
    if (!input) return;

    const digitsOnly = String(input.value || '').replace(/[^\d]/g, '');
    if (!digitsOnly) {
        input.value = '';
        return;
    }

    const nextValue = formatInputCurrency(digitsOnly);
    input.value = nextValue;

    const nextCaret = Math.max(0, nextValue.length);
    try {
        input.setSelectionRange(nextCaret, nextCaret);
    } catch {
        // Some browsers may not allow selection updates on certain input states.
    }
}

function getMissingUserProfileColumns(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const candidates = ['email', 'monthly_spending_limit', 'daily_spending_limit', 'spending_limits'];
    return candidates.filter((column) => (
        text.includes(`'${column}'`) ||
        text.includes(`"${column}"`) ||
        text.includes(column)
    ));
}

async function upsertUserProfileWithFallback(payloads) {
    let lastError = null;

    for (const payload of payloads) {
        const { data, error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' }).select('*').maybeSingle();
        if (!error) {
            return data || null;
        }

        lastError = error;
        const missingColumns = getMissingUserProfileColumns(error);
        if (!missingColumns.length) {
            break;
        }
    }

    throw lastError || new Error('Không thể lưu hồ sơ người dùng.');
}

function formatRatio(value = 0) {
    const rounded = Math.round(Number(value || 0) * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date(value));
}

function startOfDay(date) {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
}

function addDays(date, days) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function roundToStep(value, step = JAR_LIMIT_SUGGESTION_STEP) {
    const safeValue = Math.max(0, Number(value || 0));
    return Math.max(step, Math.round(safeValue / step) * step);
}

function getJarTransactionRows(rows, jarKey, startDate, endDate) {
    return rows.filter((tx) => {
        if (tx.type !== 'expense') return false;
        if (normalizeJar(tx.jar) !== jarKey) return false;
        const createdAt = new Date(tx.created_at);
        return createdAt >= startDate && createdAt < endDate;
    });
}

function buildJarLimitInsight(rows, profile, jarKey) {
    const jarMeta = JARS.find((jar) => jar.key === jarKey);
    const currentLimit = Number(profile?.spending_limits?.[jarKey] || 0);
    const monthlyFallback = Number(profile?.monthly_spending_limit || 0);
    const now = new Date();
    const window30Start = addDays(startOfDay(now), -30);
    const window60Start = addDays(startOfDay(now), -60);

    const recentRows = getJarTransactionRows(rows, jarKey, window30Start, addDays(now, 1));
    const priorRows = getJarTransactionRows(rows, jarKey, window60Start, window30Start);
    const allRecentExpenses = rows.filter((tx) => tx.type === 'expense' && new Date(tx.created_at) >= window30Start);
    const recentTotal = recentRows.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const priorTotal = priorRows.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const recentCount = recentRows.length;
    const currentJarShare = jarMeta ? jarMeta.defaultRatio / 100 : 0;
    const baselineFromMonthly = monthlyFallback > 0 ? monthlyFallback * currentJarShare : 0;
    const baselineFromSpending = allRecentExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0) * currentJarShare;
    const utilization = currentLimit > 0 ? (recentTotal / currentLimit) * 100 : null;

    let recommended = 0;
    if (recentTotal > 0) {
        recommended = recentTotal * 1.15;
        if (priorTotal > 0 && recentTotal > priorTotal) {
            recommended = Math.max(recommended, recentTotal + (recentTotal - priorTotal) * 0.35);
        }
    } else if (baselineFromMonthly > 0) {
        recommended = baselineFromMonthly;
    } else if (baselineFromSpending > 0) {
        recommended = baselineFromSpending;
    }

    const trend = priorTotal > 0 ? ((recentTotal - priorTotal) / priorTotal) * 100 : null;
    const suggestedLimit = roundToStep(recommended || currentLimit || 50_000);
    const recentAverage = recentCount > 0 ? recentTotal / recentCount : 0;

    const reasons = [];
    if (recentCount > 0) {
        reasons.push(`30 ngày gần đây bạn đã chi ${formatCurrency(recentTotal)} cho hũ này qua ${recentCount} giao dịch.`);
        reasons.push(`Trung bình mỗi khoản khoảng ${formatCurrency(recentAverage)}.`);
        if (utilization !== null) {
            if (utilization >= 100) {
                reasons.push(`Hũ này đã dùng ${formatRatio(utilization)} của hạn mức hiện tại, nên cần biên rộng hơn một chút.`);
            } else if (utilization <= 60) {
                reasons.push(`Hũ này mới dùng ${formatRatio(utilization)} của hạn mức hiện tại, bạn còn khá nhiều dư địa.`);
            } else {
                reasons.push(`Nhịp chi tiêu đang ở mức ${formatRatio(utilization)} của hạn mức hiện tại, khá ổn định.`);
            }
        }
    } else {
        reasons.push('Hũ này chưa có nhiều lịch sử riêng, nên mình bám theo thói quen chi tiêu chung của bạn.');
    }

    if (trend !== null) {
        const trendAbs = Math.abs(Math.round(trend));
        if (trendAbs > 0) {
            reasons.push(`So với 30 ngày trước, nhịp chi tiêu ${trend > 0 ? 'tăng' : 'giảm'} ${trendAbs}%.`);
        }
    }

    const persona = JAR_LIMIT_PERSONALITY_COPY[jarKey];
    if (persona) reasons.push(persona);
    reasons.push(`Gợi ý cá nhân hoá cho hũ ${getJarCode(jarKey)} là ${formatCurrency(suggestedLimit)}.`);

    return {
        jarKey,
        jarCode: jarMeta?.code || 'N/A',
        label: jarMeta?.label || 'Không xác định',
        currentLimit,
        recentTotal,
        recentCount,
        priorTotal,
        trend,
        recentAverage,
        utilization,
        suggestedLimit,
        note: reasons.join(' ')
    };
}

function buildJarLimitInsights(rows, profile) {
    return JARS.reduce((map, jar) => {
        map[jar.key] = buildJarLimitInsight(rows, profile, jar.key);
        return map;
    }, {});
}

function normalizeToken(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function normalizeJar(value) {
    return JAR_ALIAS_MAP[normalizeToken(value)] || null;
}

function getJarLabel(jarKey) {
    return JARS.find((jar) => jar.key === jarKey)?.label || 'Không xác định';
}

function getJarCode(jarKey) {
    return JARS.find((jar) => jar.key === jarKey)?.code || 'N/A';
}

function parseCurrencyInput(value) {
    if (value === null || value === undefined) return Number.NaN;

    let raw = String(value)
        .trim()
        .toLowerCase()
        .replace(/triệu|trieu/g, 'tr')
        .replace(/nghìn|nghin/g, 'k')
        .replace(/(vnd|vnđ|₫|đ)/g, '')
        .replace(/\s+/g, '');

    if (!raw) return 0;

    let multiplier = 1;
    if (raw.endsWith('tr')) {
        multiplier = 1_000_000;
        raw = raw.slice(0, -2);
    } else if (raw.endsWith('m')) {
        multiplier = 1_000_000;
        raw = raw.slice(0, -1);
    } else if (raw.endsWith('k')) {
        multiplier = 1_000;
        raw = raw.slice(0, -1);
    }

    if (raw.includes('.') && raw.includes(',')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes('.')) {
        const parts = raw.split('.');
        if (parts.length > 1 && parts.slice(1).every((part) => part.length === 3)) {
            raw = parts.join('');
        }
    }

    raw = raw.replace(/,/g, '.');
    let amount = Number(raw);
    if (!Number.isFinite(amount)) {
        const digits = raw.replace(/[^\d]/g, '');
        amount = digits ? Number(digits) : Number.NaN;
    }

    if (!Number.isFinite(amount)) return Number.NaN;
    return Math.max(0, Math.round(amount * multiplier));
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getSelectedPendingIncome() {
    return state.pendingIncomes.find((tx) => String(tx.id) === String(state.selectedPendingId)) || null;
}

function getDraftTotal() {
    return JARS.reduce((sum, jar) => sum + Number(state.allocationDraft[jar.key] || 0), 0);
}

function getDraftDiff() {
    const selected = getSelectedPendingIncome();
    if (!selected) return 0;
    return Math.round(Number(selected.amount || 0) - getDraftTotal());
}

function buildPlanFromRatios(amount, jarsWithRatio) {
    const draft = {};
    let allocated = 0;

    JARS.forEach((jar, index) => {
        const ratio = Number(jarsWithRatio[jar.key] || 0);
        const value = index === JARS.length - 1 ? Math.max(0, Math.round(Number(amount || 0) - allocated)) : Math.round((amount * ratio) / 100);
        draft[jar.key] = Math.max(0, value);
        allocated += draft[jar.key];
    });

    return draft;
}

function buildDefaultAllocation(amount) {
    return buildPlanFromRatios(
        amount,
        JARS.reduce((map, jar) => {
            map[jar.key] = jar.defaultRatio;
            return map;
        }, {})
    );
}

function buildEvenAllocation(amount) {
    return buildPlanFromRatios(
        amount,
        JARS.reduce((map, jar) => {
            map[jar.key] = 100 / JARS.length;
            return map;
        }, {})
    );
}

function buildJarStats(rows) {
    const stats = {};
    JARS.forEach(({ key }) => {
        stats[key] = { income: 0, expense: 0, balance: 0 };
    });

    rows.forEach((tx) => {
        const jarKey = normalizeJar(tx.jar);
        if (!jarKey || !stats[jarKey]) return;

        const amount = Number(tx.amount || 0);
        if (tx.type === 'income') stats[jarKey].income += amount;
        if (tx.type === 'expense') stats[jarKey].expense += amount;
    });

    JARS.forEach(({ key }) => {
        stats[key].balance = stats[key].income - stats[key].expense;
    });

    return stats;
}

function isPendingIncome(tx) {
    return tx?.type === 'income' && !normalizeJar(tx.jar);
}

function isAllocationTransaction(tx) {
    return tx?.type === 'income' && ALLOCATION_NOTE_PATTERN.test(String(tx?.note || ''));
}

function getAllocationBaseNote(note = '') {
    return String(note || '').trim().replace(ALLOCATION_SUFFIX_PATTERN, '').trim();
}

function getAllocationMetaLabel(tx) {
    const jarKey = normalizeJar(tx?.jar);
    if (!jarKey) return 'Đã phân bổ vào hệ thống hũ';

    return `Vào hũ ${getJarCode(jarKey)} - ${getJarLabel(jarKey)}`;
}

function buildSplitHistoryEntries(rows = []) {
    const grouped = new Map();

    rows.forEach((tx) => {
        if (!isAllocationTransaction(tx)) return;

        const createdAtKey = String(tx.created_at || '');
        const baseNote = getAllocationBaseNote(tx.note);
        const key = `${createdAtKey}|${baseNote}`;
        const jarKey = normalizeJar(tx.jar);
        const amount = Number(tx.amount || 0);

        if (!grouped.has(key)) {
            grouped.set(key, {
                key,
                created_at: tx.created_at,
                note: baseNote || 'Khoản đã chia hũ',
                amount: 0,
                allocations: []
            });
        }

        const entry = grouped.get(key);
        entry.amount += amount;

        if (!jarKey) return;

        const existingAllocation = entry.allocations.find((allocation) => allocation.jarKey === jarKey);
        if (existingAllocation) {
            existingAllocation.amount += amount;
        } else {
            entry.allocations.push({
                jarKey,
                amount
            });
        }
    });

    return Array.from(grouped.values())
        .map((entry) => {
            const allocations = entry.allocations
                .sort((a, b) => JARS.findIndex((jar) => jar.key === a.jarKey) - JARS.findIndex((jar) => jar.key === b.jarKey))
                .map((allocation) => ({
                    ...allocation,
                    ratio: entry.amount > 0 ? (allocation.amount / entry.amount) * 100 : 0
                }));

            return {
                ...entry,
                allocations
            };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function setFeedback(message = '', tone = 'info') {
    const feedbackEl = document.getElementById('jar-save-feedback');
    if (!feedbackEl) return;

    if (!message) {
        feedbackEl.textContent = '';
        feedbackEl.className = 'jar-inline-feedback';
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `jar-inline-feedback is-visible is-${tone}`;
}

function setJarLimitFeedback(message = '', tone = 'info') {
    const feedbackEl = document.getElementById('jar-limit-feedback');
    if (!feedbackEl) return;

    if (state.jarLimitFeedbackTimer) {
        clearTimeout(state.jarLimitFeedbackTimer);
        state.jarLimitFeedbackTimer = null;
    }

    if (!message) {
        feedbackEl.textContent = '';
        feedbackEl.className = 'jar-inline-feedback';
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `jar-inline-feedback is-visible is-${tone}`;

    if (tone !== 'info') {
        state.jarLimitFeedbackTimer = window.setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'jar-inline-feedback';
            state.jarLimitFeedbackTimer = null;
        }, 5000);
    }
}

function buildViewModel() {
    const selected = getSelectedPendingIncome();
    const jarStats = buildJarStats(state.transactions);
    const jarLimitInsights = buildJarLimitInsights(state.transactions, state.profile);
    const pendingTotal = state.pendingIncomes.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const allocatedOnly = JARS.reduce((sum, jar) => sum + Number(jarStats[jar.key]?.balance || 0), 0);
    const totalAssets = allocatedOnly + pendingTotal;
    const dailyLimit = Number(state.profile?.daily_spending_limit || 0);
    const todayStart = startOfDay(new Date());
    const todayExpense = state.transactions
        .filter((tx) => tx.type === 'expense' && new Date(tx.created_at) >= todayStart)
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const dailyRemaining = dailyLimit > 0 ? dailyLimit - todayExpense : 0;
    const dailyProgress = dailyLimit > 0 ? clamp((todayExpense / dailyLimit) * 100, 0, 100) : 0;
    const assignedTotal = selected ? getDraftTotal() : 0;
    const diff = selected ? getDraftDiff() : 0;
    const progress = selected && Number(selected.amount || 0) > 0 ? clamp((assignedTotal / Number(selected.amount || 0)) * 100, 0, 100) : 0;

    return {
        selected,
        jarStats,
        jarLimitInsights,
        pendingTotal,
        allocatedOnly,
        totalAssets,
        dailyLimit,
        todayExpense,
        dailyRemaining,
        dailyProgress,
        assignedTotal,
        diff,
        progress
    };
}

function setSelectedPending(id) {
    const next = state.pendingIncomes.find((tx) => String(tx.id) === String(id));
    if (!next) return;

    state.selectedPendingId = next.id;
    // Manual-first: let the user fill the jars themselves before using presets.
    state.allocationDraft = {};
    state.historyOpen = false;
    renderAll();
}

function toggleHistoryPanel() {
    state.historyOpen = !state.historyOpen;
    renderAll();
}

function renderSummaryCards(viewModel) {
    const totalAssetsEl = document.getElementById('jar-total-assets');
    const totalAssetsCopyEl = document.getElementById('jar-total-assets-copy');
    const pendingTotalEl = document.getElementById('jar-pending-total');
    const pendingStatusEl = document.getElementById('jar-pending-status');

    if (totalAssetsEl) totalAssetsEl.textContent = formatCurrency(viewModel.totalAssets);
    if (pendingTotalEl) pendingTotalEl.textContent = formatCurrency(viewModel.pendingTotal);

    if (totalAssetsCopyEl) {
        totalAssetsCopyEl.textContent =
            viewModel.pendingTotal > 0
                ? 'Bạn đang có dòng tiền chờ phân bổ, rất phù hợp để tối ưu lại 6 hũ.'
                : 'Sẵn sàng để tối ưu hoá sự thịnh vượng của bạn.';
    }

    if (pendingStatusEl) {
            pendingStatusEl.textContent =
                viewModel.pendingTotal > 0
                    ? `${state.pendingIncomes.length} khoản đang chờ phân bổ.`
                    : 'Không còn khoản nào đang chờ phân bổ.';
    }
}

function getJarLimitSelectedKey(viewModel) {
    if (state.selectedLimitJarKey && JARS.some((jar) => jar.key === state.selectedLimitJarKey)) {
        return state.selectedLimitJarKey;
    }

    const bestJar = Object.entries(viewModel.jarLimitInsights || {})
        .sort((a, b) => Number(b[1]?.recentTotal || 0) - Number(a[1]?.recentTotal || 0))[0]?.[0];

    return bestJar || JARS[0].key;
}

function renderJarLimitSelectOptions(selectEl, selectedKey) {
    if (!selectEl) return;

    if (selectEl.options.length !== JARS.length) {
        selectEl.innerHTML = JARS.map((jar) => {
            return `<option value="${jar.key}">${jar.code} · ${jar.label}</option>`;
        }).join('');
    }

    if (selectedKey && selectEl.value !== selectedKey) {
        selectEl.value = selectedKey;
    }
}

function renderJarLimitPanel(viewModel) {
    const selectEl = document.getElementById('jar-limit-jar-select');
    const currentEl = document.getElementById('jar-limit-current');
    const recentEl = document.getElementById('jar-limit-recent');
    const usageEl = document.getElementById('jar-limit-usage');
    const suggestedEl = document.getElementById('jar-limit-suggested');
    const personalCopyEl = document.getElementById('jar-limit-personal-copy');
    const inputEl = document.getElementById('jar-limit-input');
    const applyBtn = document.getElementById('jar-limit-apply-suggestion');
    const saveBtn = document.getElementById('jar-limit-save-btn');
    const feedbackEl = document.getElementById('jar-limit-feedback');
    const selectedKey = getJarLimitSelectedKey(viewModel);
    const insight = viewModel.jarLimitInsights?.[selectedKey] || buildJarLimitInsight(state.transactions, state.profile, selectedKey);

    state.jarLimitInsights = viewModel.jarLimitInsights || {};
    state.selectedLimitJarKey = selectedKey;

    renderJarLimitSelectOptions(selectEl, selectedKey);

    if (currentEl) currentEl.textContent = formatCurrency(insight.currentLimit);
    if (recentEl) recentEl.textContent = formatCurrency(insight.recentTotal);
    if (usageEl) {
        usageEl.textContent = insight.utilization !== null ? formatRatio(insight.utilization) : 'Chưa có';
    }
    if (suggestedEl) suggestedEl.textContent = formatCurrency(insight.suggestedLimit);
    if (personalCopyEl) {
        personalCopyEl.textContent =
            insight.note ||
            'Mỗi hũ sẽ có gợi ý riêng dựa trên lịch sử chi tiêu của nó, để bạn đặt hạn mức gần hơn với thực tế.';
    }

    if (inputEl && inputEl !== document.activeElement) {
        const draftValue = state.jarLimitDrafts[selectedKey];
        if (draftValue !== undefined && draftValue !== null && draftValue !== '') {
            inputEl.value = String(draftValue);
        } else if (insight.currentLimit > 0) {
            inputEl.value = formatInputCurrency(insight.currentLimit);
        } else {
            inputEl.value = formatInputCurrency(insight.suggestedLimit);
        }
    }

    if (applyBtn) {
        applyBtn.textContent = `Áp dụng gợi ý cho ${getJarCode(selectedKey)}`;
        applyBtn.disabled = state.isSavingJarLimit;
    }

    if (saveBtn) {
        saveBtn.disabled = state.isSavingJarLimit;
    }

    if (feedbackEl && !feedbackEl.classList.contains('is-visible')) {
        feedbackEl.textContent = '';
    }
}

function setDailyLimitFeedback(message = '', tone = 'info') {
    const feedbackEl = document.getElementById('jar-daily-limit-feedback');
    if (!feedbackEl) return;

    if (state.dailyLimitFeedbackTimer) {
        clearTimeout(state.dailyLimitFeedbackTimer);
        state.dailyLimitFeedbackTimer = null;
    }

    if (!message) {
        feedbackEl.textContent = '';
        feedbackEl.className = 'jar-inline-feedback';
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `jar-inline-feedback is-visible is-${tone}`;

    if (tone !== 'info') {
        state.dailyLimitFeedbackTimer = window.setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'jar-inline-feedback';
            state.dailyLimitFeedbackTimer = null;
        }, 5000);
    }
}

function renderDailyLimitCard(viewModel) {
    const limitValueEl = document.getElementById('jar-daily-limit-value');
    const limitCopyEl = document.getElementById('jar-daily-limit-copy');
    const spentEl = document.getElementById('jar-daily-spent');
    const remainingEl = document.getElementById('jar-daily-remaining');
    const progressEl = document.getElementById('jar-daily-progress');
    const progressNoteEl = document.getElementById('jar-daily-progress-note');
    const progressBadgeEl = document.getElementById('jar-daily-progress-badge');
    const feedbackEl = document.getElementById('jar-daily-limit-feedback');
    const inputEl = document.getElementById('jar-daily-limit-input');

    const limit = Number(viewModel.dailyLimit || 0);
    const spent = Number(viewModel.todayExpense || 0);
    const remaining = Number(viewModel.dailyRemaining || 0);
    const hasLimit = limit > 0;
    const isOver = hasLimit && spent > limit;

    if (limitValueEl) limitValueEl.textContent = formatCurrency(limit);
    if (spentEl) spentEl.textContent = formatCurrency(spent);
    if (remainingEl) {
        remainingEl.textContent = hasLimit ? formatCurrency(remaining) : '0₫';
        remainingEl.classList.toggle('is-negative', isOver);
    }

    if (limitCopyEl) {
        if (!hasLimit) {
            limitCopyEl.textContent = 'Nhập mức chi tiêu ngày bạn muốn kiểm soát, hệ thống sẽ nhắc khi chi vượt.';
        } else if (isOver) {
            limitCopyEl.textContent = `Hôm nay bạn đã vượt hạn mức ${formatCurrency(Math.abs(remaining))}. Giữ nhịp lại một chút nhé.`;
        } else {
            limitCopyEl.textContent = `Hôm nay đã chi ${formatCurrency(spent)} trên mức ${formatCurrency(limit)}.`;
        }
    }

    if (progressEl) {
        progressEl.style.width = `${hasLimit ? viewModel.dailyProgress : 0}%`;
        progressEl.classList.toggle('is-over', isOver);
    }

    if (progressNoteEl) {
        progressNoteEl.textContent = hasLimit
            ? isOver
                ? `Đã vượt ${formatCurrency(Math.abs(remaining))} so với hạn mức.`
                : `Còn ${formatCurrency(remaining)} để chi hôm nay.`
            : 'Chưa đặt hạn mức ngày.';
    }

    if (progressBadgeEl) {
        progressBadgeEl.textContent = hasLimit ? `${formatCurrency(spent)} / ${formatCurrency(limit)}` : 'Chưa đặt hạn mức';
    }

    if (inputEl && inputEl !== document.activeElement) {
        if (state.dailyLimitDraft !== null) {
            inputEl.value = state.dailyLimitDraft;
        } else {
            inputEl.value = limit > 0 ? formatInputCurrency(limit) : '';
        }
    }

    if (feedbackEl && !feedbackEl.classList.contains('is-visible')) {
        feedbackEl.textContent = '';
    }
}

function renderSourceCard(viewModel) {
    const sourceMetaEl = document.getElementById('jar-source-meta');
    const sourceTitleEl = document.getElementById('jar-source-title');
    const sourceNoteEl = document.getElementById('jar-source-note');
    const sourcePercentEl = document.getElementById('jar-source-percent');
    const sourcePercentCopyEl = document.getElementById('jar-source-percent-copy');
    const assignedTotalEl = document.getElementById('jar-assigned-total');
    const remainingTotalEl = document.getElementById('jar-remaining-total');
    const progressEl = document.getElementById('jar-allocation-progress');
    const hintEl = document.getElementById('jar-allocation-hint');
    const progressBadgeEl = document.getElementById('jar-progress-badge');
    const applyBtn = document.getElementById('jar-apply-btn');
    const historyToggle = document.getElementById('jar-history-toggle');

    if (sourcePercentEl) sourcePercentEl.textContent = `${Math.round(viewModel.progress)}%`;
    if (assignedTotalEl) assignedTotalEl.textContent = formatCurrency(viewModel.assignedTotal);

    if (!viewModel.selected) {
        if (sourceMetaEl) sourceMetaEl.textContent = 'Chọn một khoản thu đang chờ rồi nhập tay vào từng hũ.';
        if (sourceTitleEl) sourceTitleEl.textContent = 'Chưa có khoản thu nào đang chờ phân bổ.';
        if (sourceNoteEl) {
            sourceNoteEl.textContent =
                'Khi bạn lưu Thu nhập với lựa chọn "chia hũ sau" từ dashboard, khoản tiền sẽ xuất hiện tại đây. Nếu muốn đi nhanh, bạn vẫn có thể dùng Tỷ lệ chuẩn hoặc Chia đều 6 hũ.';
        }
        if (sourcePercentCopyEl) sourcePercentCopyEl.textContent = MANUAL_FIRST_COPY;
        if (remainingTotalEl) remainingTotalEl.textContent = '0₫';
        if (progressEl) progressEl.style.width = '0%';
        if (hintEl) hintEl.textContent = 'Chọn một khoản thu để bắt đầu nhập tay.';
        if (progressBadgeEl) progressBadgeEl.textContent = '0₫ / 0₫';
        if (applyBtn) {
            applyBtn.textContent = 'Xác nhận phân bổ';
            applyBtn.disabled = true;
        }
    } else {
        const selectedAmount = Number(viewModel.selected.amount || 0);
        if (sourceMetaEl) {
            sourceMetaEl.textContent = `${formatDateTime(viewModel.selected.created_at)} • ${state.pendingIncomes.length} khoản đang chờ xử lý`;
        }
        if (sourceTitleEl) {
            sourceTitleEl.textContent = viewModel.selected.note || 'Thu nhập chờ phân bổ';
        }
        if (sourcePercentCopyEl) sourcePercentCopyEl.textContent = MANUAL_FIRST_COPY;

        if (viewModel.diff > 0) {
            if (sourceNoteEl) {
                sourceNoteEl.textContent = `Còn ${formatCurrency(viewModel.diff)} chưa được phân bổ. Bạn có thể nhập tay tiếp vào các ô bên dưới, hoặc dùng Tỷ lệ chuẩn / Chia đều 6 hũ nếu muốn đi nhanh.`;
            }
            if (remainingTotalEl) remainingTotalEl.textContent = formatCurrency(viewModel.diff);
            if (hintEl) hintEl.textContent = `Còn ${formatCurrency(viewModel.diff)} chưa phân bổ. Hãy nhập tay hoặc dùng gợi ý nhanh.`;
        } else if (viewModel.diff < 0) {
            if (sourceNoteEl) {
                sourceNoteEl.textContent = `Bạn đang phân bổ dư ${formatCurrency(Math.abs(viewModel.diff))}. Hãy giảm bớt ở một vài hũ, hoặc dùng Chia đều 6 hũ để cân lại nhanh hơn.`;
            }
            if (remainingTotalEl) remainingTotalEl.textContent = `Dư ${formatCurrency(Math.abs(viewModel.diff))}`;
            if (hintEl) hintEl.textContent = `Bạn đang phân bổ dư ${formatCurrency(Math.abs(viewModel.diff))}.`;
        } else {
            if (sourceNoteEl) {
                sourceNoteEl.textContent = 'Mức phân bổ hiện tại đã cân bằng 100%. Bạn có thể xác nhận hoặc chỉnh tay lại nếu muốn.';
            }
            if (remainingTotalEl) remainingTotalEl.textContent = '0₫';
            if (hintEl) hintEl.textContent = 'Đã cân bằng 100%. Sẵn sàng lưu phân bổ.';
        }

        if (progressEl) progressEl.style.width = `${viewModel.progress}%`;
        if (progressBadgeEl) progressBadgeEl.textContent = `${formatCurrency(viewModel.assignedTotal)} / ${formatCurrency(selectedAmount)}`;
        if (applyBtn) {
            applyBtn.textContent = 'Xác nhận phân bổ';
            applyBtn.disabled = state.isSaving || viewModel.diff !== 0;
        }
    }

    if (historyToggle) {
        historyToggle.textContent = 'Lịch sử chia';
    }
}

function renderHistoryPanel() {
    const panel = document.getElementById('jar-history-panel');
    const emptyState = document.getElementById('jar-pending-empty');
    const list = document.getElementById('jar-pending-list');
    const splitEmptyState = document.getElementById('jar-split-empty');
    const splitList = document.getElementById('jar-split-list');

    if (!panel || !emptyState || !list || !splitEmptyState || !splitList) return;

    const splitHistoryEntries = buildSplitHistoryEntries(state.transactions);
    panel.classList.toggle('is-open', state.historyOpen);

    if (!state.pendingIncomes.length) {
        emptyState.className = 'jar-history-empty is-visible';
        list.className = 'jar-history-list';
        list.innerHTML = '';
    } else {
        emptyState.className = 'jar-history-empty';
        list.className = 'jar-history-list is-visible';
        list.innerHTML = state.pendingIncomes
            .map((tx) => {
                const isActive = String(tx.id) === String(state.selectedPendingId);
                return `
                    <article class="jar-history-item ${isActive ? 'is-active' : ''}">
                        <div>
                            <div class="jar-history-note">${tx.note || 'Thu nhập chờ phân bổ'}</div>
                            <div class="jar-history-meta">${formatDateTime(tx.created_at)}</div>
                        </div>
                        <div class="jar-history-amount">${formatCurrency(tx.amount)}</div>
                        <button type="button" class="jar-history-btn" data-select-pending="${tx.id}">
                            ${isActive ? 'Đang chọn' : 'Chọn khoản này'}
                        </button>
                    </article>
                `;
            })
            .join('');

        list.querySelectorAll('[data-select-pending]').forEach((button) => {
            button.addEventListener('click', () => {
                setSelectedPending(button.getAttribute('data-select-pending'));
            });
        });
    }

    if (!splitHistoryEntries.length) {
        splitEmptyState.className = 'jar-history-empty is-visible';
        splitList.className = 'jar-history-list';
        splitList.innerHTML = '';
        return;
    }

    splitEmptyState.className = 'jar-history-empty';
    splitList.className = 'jar-history-list is-visible';
    splitList.innerHTML = splitHistoryEntries
        .map((entry) => {
            return `
                <article class="jar-history-item is-completed">
                    <div class="jar-history-completed-copy">
                        <div class="jar-history-badge">Đã chia</div>
                        <div class="jar-history-note">Ngày ${formatDate(entry.created_at)} · ${entry.note || 'Khoản đã chia hũ'}</div>
                        <div class="jar-history-meta">Tổng ${formatCurrency(entry.amount)} · ${entry.allocations.length} hũ được chia</div>
                    </div>
                    <div class="jar-history-amount">+${formatCurrency(entry.amount)}</div>
                    <div class="jar-history-breakdown">
                        <div class="jar-history-breakdown-title">Chi tiết phân bổ</div>
                        ${entry.allocations
                            .map((allocation) => {
                                return `
                                    <div class="jar-history-breakdown-item">
                                        <span class="jar-history-breakdown-label">${getJarCode(allocation.jarKey)} · ${getJarLabel(allocation.jarKey)}</span>
                                        <span class="jar-history-breakdown-value">${formatRatio(allocation.ratio)} · ${formatCurrency(allocation.amount)}</span>
                                    </div>
                                `;
                            })
                            .join('')}
                    </div>
                </article>
            `;
        })
        .join('');
}

function renderBucketGrid(viewModel) {
    const grid = document.getElementById('jar-allocation-grid');
    if (!grid) return;

    const selectedAmount = Number(viewModel.selected?.amount || 0);
    const selectedLimitJarKey = getJarLimitSelectedKey(viewModel);
    grid.innerHTML = JARS.map((jar) => {
        const draftAmount = viewModel.selected ? Number(state.allocationDraft[jar.key] || 0) : 0;
        const ratio = viewModel.selected && selectedAmount > 0 ? (draftAmount / selectedAmount) * 100 : jar.defaultRatio;
        const currentBalance = Number(viewModel.jarStats[jar.key]?.balance || 0);
        const disabledAttr = viewModel.selected ? '' : 'disabled';
        const isLimitSelected = selectedLimitJarKey === jar.key;

        return `
            <article class="jar-bucket-card ${isLimitSelected ? 'is-selected' : ''}" data-jar="${jar.key}">
                <div class="jar-bucket-head">
                    <span class="jar-bucket-icon" aria-hidden="true">${jar.icon}</span>
                    <span class="jar-bucket-badge" data-jar-ratio="${jar.key}">${formatRatio(ratio)}</span>
                </div>

                <h3 class="jar-bucket-title">${jar.label}</h3>
                <p class="jar-bucket-copy">${jar.shortCopy}</p>

                <label class="jar-bucket-input-wrap">
                    <input
                        class="jar-amount-input"
                        type="text"
                        inputmode="numeric"
                        value="${viewModel.selected && draftAmount > 0 ? formatInputCurrency(draftAmount) : ''}"
                        placeholder="0"
                        data-jar-input="${jar.key}"
                        aria-label="So tien cho ${jar.label}"
                        ${disabledAttr}
                    />
                    <span class="jar-currency">đ</span>
                </label>

                <div class="jar-bucket-balance">
                    Số dư hiện tại: <strong>${formatCurrency(currentBalance)}</strong>
                </div>

                <div class="jar-stepper">
                    <button type="button" class="jar-step-btn" data-jar-step="-10000" data-jar-step-jar="${jar.key}" aria-label="Giảm ${jar.label}" ${disabledAttr}>-</button>
                    <button type="button" class="jar-step-btn" data-jar-step="10000" data-jar-step-jar="${jar.key}" aria-label="Tăng ${jar.label}" ${disabledAttr}>+</button>
                </div>
            </article>
        `;
    }).join('');

    attachBucketEvents();
}

function buildInsightContent(viewModel) {
    if (!viewModel.selected) {
        return {
            title: 'Nhập tay trước, gợi ý nhanh khi cần.',
            text: state.pendingIncomes.length
                ? 'Bạn đang có khoản thu chờ chia. Hãy chọn một khoản rồi nhập tay số tiền vào từng hũ. Nếu muốn đi nhanh, vẫn có thể dùng Tỷ lệ chuẩn hoặc Chia đều 6 hũ.'
                : 'Khi bạn chọn "chia hũ sau" từ dashboard, hệ thống sẽ đưa khoản thu sang đây để bạn tự nhập tay. Nếu cần, bạn vẫn có thể dùng Tỷ lệ chuẩn hoặc Chia đều 6 hũ.',
            action: state.pendingIncomes.length ? 'Mở khoản chờ' : 'Quay về dashboard'
        };
    }

    if (viewModel.diff > 0) {
        return {
            title: `Còn ${formatCurrency(viewModel.diff)} chưa được phân bổ.`,
            text: 'Hãy nhập tay tiếp vào các ô bên dưới, hoặc dùng Tỷ lệ chuẩn / Chia đều 6 hũ nếu muốn đi nhanh.',
            action: 'Áp dụng tỷ lệ chuẩn'
        };
    }

    if (viewModel.diff < 0) {
        return {
            title: `Bạn đang phân bổ dư ${formatCurrency(Math.abs(viewModel.diff))}.`,
            text: 'Giảm bớt ở một hoặc vài hũ để tổng phân bổ quay về đúng 100% trước khi xác nhận. Nếu muốn, bạn có thể dùng Chia đều 6 hũ để cân lại nhanh hơn.',
            action: 'Chia đều lại 6 hũ'
        };
    }

    const dominantJar = JARS.map((jar) => ({
        ...jar,
        amount: Number(state.allocationDraft[jar.key] || 0)
    })).sort((a, b) => b.amount - a.amount)[0];

    if (dominantJar?.key === 'education') {
        return {
            title: 'Bạn đang đầu tư mạnh cho hũ Giáo dục.',
            text: 'Đây là cấu hình tốt nếu giai đoạn này bạn đang ưu tiên nâng kỹ năng, học thêm hoặc lấy chứng chỉ mới.',
            action: 'Xác nhận phân bổ'
        };
    }

    if (dominantJar?.key === 'freedom') {
        return {
            title: 'Hũ Tự do tài chính đang là trọng tâm.',
            text: 'Phù hợp khi bạn muốn đẩy mạnh phần đầu tư dài hạn, miễn là các hũ thiết yếu và dự phòng vẫn đủ an toàn.',
            action: 'Xác nhận phân bổ'
        };
    }

    return {
        title: `Phân bổ hiện tại đang nghiêng về ${dominantJar?.label || 'cấu hình cân bằng'}.`,
        text: 'Nếu đây đúng là ưu tiên của tháng này thì bạn có thể xác nhận ngay. Nếu chưa chắc, hãy xem lại tỷ lệ trước khi lưu.',
        action: 'Xác nhận phân bổ'
    };
}

function renderInsightBanner(viewModel) {
    const titleEl = document.getElementById('jar-insight-title');
    const textEl = document.getElementById('jar-insight-text');
    const actionEl = document.getElementById('jar-insight-action');
    if (!titleEl || !textEl || !actionEl) return;

    const insight = buildInsightContent(viewModel);
    titleEl.textContent = insight.title;
    textEl.textContent = insight.text;
    actionEl.textContent = insight.action;
}

function handleInsightAction() {
    if (!state.session) {
        showGuestAuthNotice('Đăng nhập để dùng gợi ý nhanh của Hệ thống hũ.', window.location.pathname);
        return;
    }

    const viewModel = buildViewModel();

    if (!viewModel.selected) {
        if (state.pendingIncomes.length) {
            state.historyOpen = true;
            renderAll();
            document.getElementById('jar-history-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
    }

    if (viewModel.diff > 0) {
        applyPreset('default');
        return;
    }

    if (viewModel.diff < 0) {
        applyPreset('even');
        return;
    }

    try {
        document.getElementById('jar-apply-btn')?.focus({ preventScroll: true });
    } catch {
        document.getElementById('jar-apply-btn')?.focus();
    }
}

function attachBucketEvents() {
    const selected = getSelectedPendingIncome();
    if (!selected) return;

    document.querySelectorAll('[data-jar-input]').forEach((input) => {
        const jarKey = input.getAttribute('data-jar-input');
        input.addEventListener('input', () => {
            const parsed = parseCurrencyInput(input.value);
            state.allocationDraft[jarKey] = Number.isFinite(parsed) ? parsed : 0;

            const badge = document.querySelector(`[data-jar-ratio="${jarKey}"]`);
            if (badge) {
                const selectedAmount = Number(selected.amount || 0);
                const ratio = selectedAmount > 0 ? (Number(state.allocationDraft[jarKey] || 0) / selectedAmount) * 100 : 0;
                badge.textContent = formatRatio(ratio);
            }

            const viewModel = buildViewModel();
            renderSummaryCards(viewModel);
            renderSourceCard(viewModel);
            renderInsightBanner(viewModel);
        });

        input.addEventListener('blur', () => {
            const currentValue = Number(state.allocationDraft[jarKey] || 0);
            input.value = currentValue > 0 ? formatInputCurrency(currentValue) : '';
        });
    });

    document.querySelectorAll('[data-jar-step]').forEach((button) => {
        button.addEventListener('click', () => {
            const jarKey = button.getAttribute('data-jar-step-jar');
            const delta = Number(button.getAttribute('data-jar-step') || 0);
            const current = Number(state.allocationDraft[jarKey] || 0);
            state.allocationDraft[jarKey] = Math.max(0, current + delta);
            renderAll();
        });
    });

    document.querySelectorAll('.jar-bucket-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            if (event.target.closest('input, button, select, textarea, label, a')) return;

            const jarKey = card.getAttribute('data-jar');
            if (jarKey) {
                setSelectedLimitJar(jarKey, { scrollIntoView: true });
            }
        });
    });
}

function buildAllocationRowsFromDraft(selected) {
    const sourceNote = String(selected?.note || 'Thu nhập chờ phân bổ').trim();
    return JARS.map((jar) => {
        const amount = Number(state.allocationDraft[jar.key] || 0);
        if (!amount) return null;

        const ratio = Number(selected.amount || 0) > 0 ? formatRatio((amount / Number(selected.amount || 0)) * 100) : '0%';

        return {
            user_id: state.session.user.id,
            type: 'income',
            amount,
            jar: jar.key,
            note: `${sourceNote} - chia sau ${jar.code} ${ratio}`,
            created_at: selected.created_at
        };
    }).filter(Boolean);
}

async function saveAllocation() {
    if (state.isSaving) return;
    if (!requireJarAccess('Đăng nhập để xác nhận phân bổ và lưu lịch sử chia.')) return;

    const selected = getSelectedPendingIncome();
    if (!selected) {
        setFeedback('Bạn hãy chọn một khoản thu đang chờ trước khi xác nhận phân bổ.', 'error');
        return;
    }

    const diff = getDraftDiff();
    if (diff !== 0) {
        setFeedback(
            diff > 0 ? `Còn ${formatCurrency(diff)} chưa phân bổ.` : `Bạn đang phân bổ dư ${formatCurrency(Math.abs(diff))}.`,
            'error'
        );
        return;
    }

    const rows = buildAllocationRowsFromDraft(selected);
    if (!rows.length) {
        setFeedback('Bạn chưa phân bổ số tiền cho bất kỳ hũ nào.', 'error');
        return;
    }

    state.isSaving = true;
    renderAll();
    setFeedback('Đang lưu phân bổ vào hệ thống hũ...', 'info');

    try {
        if (rows.length === 1) {
            const row = rows[0];
            const { error } = await supabase
                .from('transactions')
                .update({
                    amount: row.amount,
                    jar: row.jar,
                    note: row.note
                })
                .eq('id', selected.id)
                .eq('user_id', state.session.user.id);

            if (error) throw error;
        } else {
            const { data: insertedRows, error: insertError } = await supabase.from('transactions').insert(rows).select('id');
            if (insertError) throw insertError;

            const { error: deleteError } = await supabase
                .from('transactions')
                .delete()
                .eq('id', selected.id)
                .eq('user_id', state.session.user.id);

            if (deleteError) {
                const insertedIds = (insertedRows || []).map((row) => row.id).filter(Boolean);
                if (insertedIds.length) {
                    await supabase.from('transactions').delete().in('id', insertedIds);
                }
                throw deleteError;
            }
        }

        setFeedback('Đã cập nhật phân bổ cho khoản thu thành công.', 'success');
        state.historyOpen = true;
        await loadJarSystem();
    } catch (error) {
        setFeedback(error.message || 'Không thể hoàn tất phân bổ lúc này.', 'error');
    } finally {
        state.isSaving = false;
        renderAll();
    }
}

async function saveDailyLimit() {
    if (state.isSavingDailyLimit) return;
    if (!requireJarAccess('Đăng nhập để lưu hạn mức ngày.')) return;

    const input = document.getElementById('jar-daily-limit-input');
    const saveBtn = document.getElementById('jar-daily-limit-save');
    const limit = parseCurrencyInput(input?.value || '');

    if (!Number.isFinite(limit) || limit < 0) {
        setDailyLimitFeedback('Số tiền không hợp lệ, bạn kiểm tra lại nhé.', 'error');
        return;
    }

    state.isSavingDailyLimit = true;
    if (saveBtn) saveBtn.disabled = true;
    setDailyLimitFeedback(limit > 0 ? 'Đang lưu hạn mức ngày...' : 'Đang tắt hạn mức ngày...', 'info');

    try {
        const basePayload = {
            user_id: state.session.user.id,
            daily_spending_limit: limit
        };

        const payloads = [
            {
                ...basePayload,
                email: state.session.user.email || state.profile?.email || '',
                full_name: state.session.user.user_metadata?.full_name || state.profile?.full_name || state.session.user.email || 'Người dùng'
            },
            {
                ...basePayload,
                full_name: state.session.user.user_metadata?.full_name || state.profile?.full_name || state.session.user.email || 'Người dùng'
            }
        ];

        const data = await upsertUserProfileWithFallback(payloads);

        state.profile = data || {
            ...state.profile,
            daily_spending_limit: limit
        };
        state.dailyLimitDraft = null;
        renderAll();
        setDailyLimitFeedback(limit > 0 ? `Đã lưu hạn mức ngày ${formatCurrency(limit)}.` : 'Đã tắt hạn mức ngày.', 'success');
    } catch (error) {
        const missingColumns = getMissingUserProfileColumns(error);
        if (missingColumns.includes('daily_spending_limit')) {
            setDailyLimitFeedback(
                'Cơ sở dữ liệu hiện chưa có cột hạn mức ngày. Hãy chạy migration để bật tính năng này.',
                'error'
            );
        } else {
            setDailyLimitFeedback(error.message || 'Không thể lưu hạn mức ngày.', 'error');
        }
    } finally {
        state.isSavingDailyLimit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

function setSelectedLimitJar(jarKey, { scrollIntoView = false } = {}) {
    const normalized = normalizeJar(jarKey);
    if (!normalized) return;

    state.selectedLimitJarKey = normalized;
    renderAll();

    if (scrollIntoView) {
        window.requestAnimationFrame(() => {
            document.getElementById('jar-limit-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
}

function applyJarLimitSuggestion() {
    const selectedKey = getJarLimitSelectedKey(buildViewModel());
    const insight = state.jarLimitInsights?.[selectedKey] || buildJarLimitInsight(state.transactions, state.profile, selectedKey);
    state.jarLimitDrafts[selectedKey] = formatInputCurrency(insight.suggestedLimit);
    setJarLimitFeedback(`Đã đưa gợi ý cho ${getJarCode(selectedKey)} vào ô nhập.`, 'info');
    renderAll();
}

async function saveJarLimit() {
    if (state.isSavingJarLimit) return;
    if (!requireJarAccess('Đăng nhập để lưu hạn mức riêng cho từng hũ.')) return;

    const selectedKey = getJarLimitSelectedKey(buildViewModel());
    const input = document.getElementById('jar-limit-input');
    const saveBtn = document.getElementById('jar-limit-save-btn');
    const limit = parseCurrencyInput(input?.value || '');

    if (!Number.isFinite(limit) || limit < 0) {
        setJarLimitFeedback('Số tiền không hợp lệ, bạn kiểm tra lại nhé.', 'error');
        return;
    }

    state.isSavingJarLimit = true;
    if (saveBtn) saveBtn.disabled = true;
    setJarLimitFeedback(`Đang lưu hạn mức cho ${getJarCode(selectedKey)}...`, 'info');

    try {
        const nextLimits = {
            ...(state.profile?.spending_limits || {})
        };
        nextLimits[selectedKey] = limit;

        const basePayload = {
            user_id: state.session.user.id,
            spending_limits: nextLimits
        };

        const payloads = [
            {
                ...basePayload,
                email: state.session.user.email || state.profile?.email || '',
                full_name: state.session.user.user_metadata?.full_name || state.profile?.full_name || state.session.user.email || 'Người dùng'
            },
            {
                ...basePayload,
                full_name: state.session.user.user_metadata?.full_name || state.profile?.full_name || state.session.user.email || 'Người dùng'
            }
        ];

        const data = await upsertUserProfileWithFallback(payloads);

        state.profile = data || {
            ...state.profile,
            spending_limits: nextLimits
        };
        state.jarLimitDrafts[selectedKey] = limit > 0 ? formatInputCurrency(limit) : '';
        renderAll();
        setJarLimitFeedback(
            limit > 0
                ? `Đã lưu hạn mức ${formatCurrency(limit)} cho hũ ${getJarCode(selectedKey)}.`
                : `Đã tắt hạn mức riêng cho hũ ${getJarCode(selectedKey)}.`,
            'success'
        );
    } catch (error) {
        setJarLimitFeedback(error.message || 'Không thể lưu hạn mức hũ.', 'error');
    } finally {
        state.isSavingJarLimit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

function applyPreset(mode = 'default') {
    const selected = getSelectedPendingIncome();
    if (!selected) {
        setFeedback('Bạn hãy chọn một khoản chờ để áp dụng cấu hình phân bổ.', 'info');
        return;
    }

    state.allocationDraft = mode === 'even' ? buildEvenAllocation(Number(selected.amount || 0)) : buildDefaultAllocation(Number(selected.amount || 0));
    renderAll();
}

function renderAll() {
    const viewModel = buildViewModel();
    renderSummaryCards(viewModel);
    renderJarLimitPanel(viewModel);
    renderDailyLimitCard(viewModel);
    renderSourceCard(viewModel);
    renderHistoryPanel();
    renderBucketGrid(viewModel);
    renderInsightBanner(viewModel);
}

async function loadJarSystem() {
    if (!state.session) {
        if (state.jarLimitFeedbackTimer) {
            clearTimeout(state.jarLimitFeedbackTimer);
            state.jarLimitFeedbackTimer = null;
        }
        if (state.dailyLimitFeedbackTimer) {
            clearTimeout(state.dailyLimitFeedbackTimer);
            state.dailyLimitFeedbackTimer = null;
        }
        state.session = null;
        state.profile = null;
        state.transactions = [];
        state.pendingIncomes = [];
        state.selectedPendingId = null;
        state.allocationDraft = {};
        state.selectedLimitJarKey = 'necessities';
        state.jarLimitDrafts = {};
        state.jarLimitInsights = {};
        state.dailyLimitDraft = null;
        state.historyOpen = false;
        state.isSaving = false;
        state.isSavingDailyLimit = false;
        state.isSavingJarLimit = false;
        renderAll();
        showGuestAuthNotice('Bạn đang xem trước Hệ thống hũ. Đăng nhập để lưu phân bổ và hạn mức riêng cho từng hũ.', window.location.pathname);
        return;
    }

    const [profileResult, rowsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', state.session.user.id).maybeSingle(),
        supabase
            .from('transactions')
            .select('*')
            .eq('user_id', state.session.user.id)
            .order('created_at', { ascending: false })
    ]);

    if (profileResult.error) throw profileResult.error;
    if (rowsResult.error) throw rowsResult.error;

    state.profile = profileResult.data || null;
    state.transactions = rowsResult.data || [];
    state.pendingIncomes = state.transactions.filter(isPendingIncome);
    state.dailyLimitDraft = null;

    const selectedStillExists = state.pendingIncomes.some((tx) => String(tx.id) === String(state.selectedPendingId));
    if (!selectedStillExists) {
        state.selectedPendingId = state.pendingIncomes[0]?.id || null;
        state.allocationDraft = {};
    }

    if (!state.pendingIncomes.length && !buildSplitHistoryEntries(state.transactions).length) {
        state.historyOpen = false;
    } else if (!state.pendingIncomes.length) {
        state.historyOpen = true;
    }

    renderAll();
}

function bindStaticEvents() {
    document.getElementById('jar-apply-btn')?.addEventListener('click', saveAllocation);
    document.getElementById('jar-preset-default')?.addEventListener('click', () => applyPreset('default'));
    document.getElementById('jar-preset-even')?.addEventListener('click', () => applyPreset('even'));
    document.getElementById('jar-history-toggle')?.addEventListener('click', toggleHistoryPanel);
    document.getElementById('jar-insight-action')?.addEventListener('click', handleInsightAction);
}

function bindDailyLimitForm() {
    const form = document.getElementById('jar-daily-limit-form');
    const input = document.getElementById('jar-daily-limit-input');

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveDailyLimit();
    });

    input?.addEventListener('input', (event) => {
        formatCurrencyInputField(event.target);
        state.dailyLimitDraft = event.target.value;
        setDailyLimitFeedback('', 'info');
    });

    input?.addEventListener('blur', (event) => {
        const parsed = parseCurrencyInput(event.target.value);
        state.dailyLimitDraft = Number.isFinite(parsed) ? formatInputCurrency(parsed) : '';
    });
}

function bindJarLimitPanelEvents() {
    const form = document.getElementById('jar-limit-form');
    const select = document.getElementById('jar-limit-jar-select');
    const input = document.getElementById('jar-limit-input');
    const applyBtn = document.getElementById('jar-limit-apply-suggestion');

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveJarLimit();
    });

    select?.addEventListener('change', (event) => {
        setSelectedLimitJar(event.target.value);
    });

    input?.addEventListener('input', (event) => {
        formatCurrencyInputField(event.target);
        const selectedKey = getJarLimitSelectedKey(buildViewModel());
        state.jarLimitDrafts[selectedKey] = event.target.value;
        setJarLimitFeedback('', 'info');
    });

    input?.addEventListener('blur', (event) => {
        const selectedKey = getJarLimitSelectedKey(buildViewModel());
        const parsed = parseCurrencyInput(event.target.value);
        state.jarLimitDrafts[selectedKey] = Number.isFinite(parsed) ? formatInputCurrency(parsed) : '';
    });

    applyBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        applyJarLimitSuggestion();
    });
}

async function init() {
    bindStaticEvents();
    bindDailyLimitForm();
    bindJarLimitPanelEvents();

    try {
        state.session = await getFreshSession().catch(() => null);
        await loadJarSystem();
        if (!state.session) {
            showGuestAuthNotice('Bạn đang xem trước Hệ thống hũ. Đăng nhập để lưu phân bổ và hạn mức riêng cho từng hũ.', window.location.pathname);
        }
    } catch (error) {
        setFeedback(error.message || 'Không thể tải hệ thống hũ lúc này.', 'error');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
