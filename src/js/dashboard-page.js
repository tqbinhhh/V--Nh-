import { getSupabaseClient } from './supabase-client.js';
import { showGuestAuthNotice } from './auth-guard.js';

const supabase = getSupabaseClient();

const JARS = [
    { key: 'necessities', code: 'NEC', label: 'Thiết yếu' },
    { key: 'education', code: 'EDU', label: 'Giáo dục' },
    { key: 'savings', code: 'SAV', label: 'Tiết kiệm' },
    { key: 'entertainment', code: 'PLAY', label: 'Hưởng thụ' },
    { key: 'freedom', code: 'LTSS', label: 'Tự do tài chính' },
    { key: 'giving', code: 'GIVE', label: 'Cho đi' }
];

const JAR_META_MAP = JARS.reduce((map, jar) => {
    map[jar.key] = jar;
    return map;
}, {});

const DEFAULT_INCOME_RATIO = {
    necessities: 55,
    education: 10,
    savings: 10,
    entertainment: 10,
    freedom: 10,
    giving: 5
};

const NOTE_KEYWORD_TO_JAR = [
    { jar: 'education', terms: ['sach', 'python', 'khoa hoc', 'hoc phi', 'chung chi', 'udemy', 'khoa'] },
    { jar: 'necessities', terms: ['an sang', 'an trua', 'com', 'xang', 'dien', 'nuoc', 'tien nha', 'sieu thi'] },
    { jar: 'savings', terms: ['tiet kiem', 'gui ngan hang', 'tich luy'] },
    { jar: 'entertainment', terms: ['cafe', 'tra sua', 'xem phim', 'du lich', 'giai tri', 'netflix', 'spotify'] },
    { jar: 'freedom', terms: ['dau tu', 'co phieu', 'crypto', 'chung khoan', 'quy mo rong'] },
    { jar: 'giving', terms: ['tu thien', 'cho di', 'ung ho', 'quyen gop', 'giup do'] }
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

const QUICK_BUTTON_IDS = [
    'quick-income-btn',
    'quick-expense-btn',
    'quick-asset-btn',
    'quick-reset-btn',
    'quick-receipt-btn',
    'quick-smart-btn',
    'quick-insight-btn'
];

const MANUAL_INCOME_HANDLING_VALUES = ['split_now', 'single_jar', 'split_later'];
const SMART_ADD_DEFAULT_SUBTITLE =
    'Nhập câu tự nhiên như "ăn trưa 65k", "nhận lương 12 triệu" hoặc "mua vé xem phim 90k". AI sẽ tự xác định loại giao dịch, số tiền và hũ phù hợp. Với chi tiêu, bạn sẽ xem trước khoản trừ trước khi xác nhận; với thu nhập, hệ thống sẽ lưu ngay sau khi phân tích.';
const SMART_ADD_PREVIEW_SUBTITLE = 'AI đã bóc xong khoản chi. Kiểm tra số tiền, hũ bị trừ và số dư còn lại trước khi xác nhận.';

const state = {
    session: null,
    profile: null,
    transactions: [],
    jarStats: {},
    quickType: 'income',
    quickBusy: false,
    manualMode: 'expense',
    manualIncomeHandling: 'split_now',
    manualSuggestedJar: null,
    manualWarnings: [],
    smartAddDraft: '',
    smartAddPreview: null,
    recurringDrafts: [],
    lastFocusedElement: null,
    feedbackTimer: null,
    realtimeChannel: null,
    authSubscription: null,
    refreshTimer: null
};

function formatCurrency(value = 0) {
    const amount = Math.round(Number(value || 0));
    const sign = amount < 0 ? '-' : '';
    const formatted = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}₫`;
}

function formatInputCurrency(value = 0) {
    return Math.max(0, Math.round(Number(value || 0)))
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrencyInputField(input) {
    if (!input) return;

    const beforeValue = input.value;
    const digitsOnly = beforeValue.replace(/[^\d]/g, '');

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

function getGreetingLabel() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Chào buổi sáng';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
}

function normalizeToken(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function normalizeTextWords(value = '') {
    return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
}

function normalizeJar(value) {
    const raw = normalizeToken(value);
    return JAR_ALIAS_MAP[raw] || null;
}

function normalizeType(value) {
    const raw = normalizeToken(value);
    if (raw === 'income' || raw === 'thu' || raw === 'thunhap') return 'income';
    if (raw === 'expense' || raw === 'chi' || raw === 'chitieu') return 'expense';
    return null;
}

function parseCurrencyInput(value) {
    if (value === null || value === undefined) return null;

    let raw = String(value)
        .trim()
        .toLowerCase()
        .replace(/triệu|trieu/g, 'tr')
        .replace(/nghìn|nghin/g, 'k')
        .replace(/(vnd|vnđ|₫|đ)/g, '')
        .replace(/\s+/g, '');

    if (!raw) return Number.NaN;

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
    return Math.round(amount * multiplier);
}

function getJarLabel(jarKey) {
    return JAR_META_MAP[jarKey]?.label || 'Không xác định';
}

function getJarCode(jarKey) {
    return JAR_META_MAP[jarKey]?.code || 'N/A';
}

function getJarDisplayLabel(jarKey) {
    if (!jarKey) return 'Không xác định';
    return `${getJarCode(jarKey)} - ${getJarLabel(jarKey)}`;
}

function formatDate(date) {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function diffDays(dateA, dateB) {
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(dateA).getTime() - startOfDay(dateB).getTime()) / dayMs);
}

function collectNoteTokens(note) {
    return normalizeTextWords(note).split(/\s+/).filter(Boolean);
}

function extractKeywordFromNote(note) {
    const tokens = collectNoteTokens(note);
    return tokens.find((token) => token.length >= 4) || tokens[0] || '';
}

function isWithinLastMonths(dateValue, months = 3) {
    const date = new Date(dateValue);
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - months);
    return date >= threshold;
}

function sumByType(rows, type) {
    return rows
        .filter((tx) => tx.type === type)
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

function getJarLimit(profile, jarKey) {
    const fromJarLimits = Number(profile?.spending_limits?.[jarKey] || 0);
    if (fromJarLimits > 0) return fromJarLimits;
    const monthlyFallback = Number(profile?.monthly_spending_limit || 0);
    return monthlyFallback > 0 ? monthlyFallback / 6 : 0;
}

function getJarBaseBalance(profile, jarKey) {
    const fromProfile = Number(profile?.jar_balances?.[jarKey]);
    if (Number.isFinite(fromProfile)) return fromProfile;
    return 0;
}

function buildJarStats(profile, rows) {
    const stats = {};
    JARS.forEach(({ key }) => {
        stats[key] = { expense: 0, income: 0, balance: 0, limit: 0, progress: 0 };
    });

    rows.forEach((tx) => {
        const jarKey = normalizeJar(tx.jar);
        if (!jarKey || !stats[jarKey]) return;
        const amount = Number(tx.amount || 0);
        if (tx.type === 'expense') stats[jarKey].expense += amount;
        if (tx.type === 'income') stats[jarKey].income += amount;
    });

    JARS.forEach(({ key }) => {
        const expense = stats[key].expense;
        const income = stats[key].income;
        const profileBalance = getJarBaseBalance(profile, key);
        const derivedBalance = income - expense;
        const balance = profileBalance !== 0 ? profileBalance : derivedBalance;
        const limit = getJarLimit(profile, key);
        const progress = limit > 0 ? Math.min(100, Math.round((expense / limit) * 100)) : 0;

        stats[key].balance = balance;
        stats[key].limit = limit;
        stats[key].progress = progress;
    });

    return stats;
}

function renderJarCards(profile, rows) {
    const jarStats = buildJarStats(profile, rows);
    JARS.forEach(({ key }) => {
        const { balance, expense, limit, progress } = jarStats[key];

        const balanceEl = document.getElementById(`jar-${key}-balance`);
        const expenseEl = document.getElementById(`jar-${key}-expense`);
        const limitEl = document.getElementById(`jar-${key}-limit`);
        const progressEl = document.getElementById(`jar-${key}-progress`);

        if (balanceEl) balanceEl.textContent = formatCurrency(balance);
        if (expenseEl) expenseEl.textContent = formatCurrency(expense);
        if (limitEl) limitEl.textContent = formatCurrency(limit);
        if (progressEl) progressEl.style.width = `${progress}%`;
    });

    return jarStats;
}

const INCOME_SPLIT_NOTE_PATTERN = /\s-\s(?:phân bổ|chia sau)\s+/i;
const INCOME_SPLIT_SUFFIX_PATTERN = /\s-\s(?:phân bổ|chia sau)\s+.+$/i;
const INCOME_SPLIT_CLUSTER_WINDOW_MS = 5_000;

function isSplitIncomeTransaction(tx) {
    return tx?.type === 'income' && INCOME_SPLIT_NOTE_PATTERN.test(String(tx?.note || ''));
}

function stripSplitIncomeNote(note = '') {
    return String(note || '').trim().replace(INCOME_SPLIT_SUFFIX_PATTERN, '').trim();
}

function getRecentTransactionNote(tx) {
    return String(tx?.note || '').trim() || 'Không có ghi chú';
}

function buildRecentTransactionItems(rows = []) {
    const regularItems = [];
    const groupedSplitItems = [];
    const splitClustersByNote = new Map();

    const splitRows = rows.filter(isSplitIncomeTransaction).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    splitRows.forEach((tx) => {
        const baseNote = stripSplitIncomeNote(tx.note);
        const createdAtMs = new Date(tx.created_at).getTime();
        const clusters = splitClustersByNote.get(baseNote) || [];
        let cluster = clusters[clusters.length - 1];

        if (!cluster || createdAtMs - cluster.lastCreatedAtMs > INCOME_SPLIT_CLUSTER_WINDOW_MS) {
            cluster = {
                type: 'income',
                amount: 0,
                created_at: tx.created_at,
                lastCreatedAtMs: createdAtMs,
                isSplitSummary: true,
                note: stripSplitIncomeNote(tx.note)
            };
            clusters.push(cluster);
            splitClustersByNote.set(baseNote, clusters);
        }

        cluster.amount += Number(tx.amount || 0);
        cluster.created_at = tx.created_at;
        cluster.lastCreatedAtMs = createdAtMs;
    });

    splitClustersByNote.forEach((clusters) => {
        clusters.forEach(({ lastCreatedAtMs, ...cluster }) => {
            groupedSplitItems.push(cluster);
        });
    });

    rows.forEach((tx) => {
        if (isSplitIncomeTransaction(tx)) return;

        regularItems.push({
            type: tx.type,
            amount: Number(tx.amount || 0),
            created_at: tx.created_at,
            isSplitSummary: false,
            note: String(tx.note || '').trim()
        });
    });

    return [...regularItems, ...groupedSplitItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderRecentTransactions(rows) {
    const recentList = document.getElementById('dashboard-recent-list');
    const emptyState = document.getElementById('dashboard-recent-empty');
    if (!recentList || !emptyState) return;

    const recentItems = buildRecentTransactionItems(rows);
    recentList.innerHTML = '';
    if (!recentItems.length) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    recentItems.slice(0, 6).forEach((tx) => {
        const item = document.createElement('article');
        item.className = 'dashboard-recent-item';

        const left = document.createElement('div');
        const note = document.createElement('div');
        note.className = 'dashboard-recent-note';
        note.textContent = getRecentTransactionNote(tx);

        const date = document.createElement('div');
        date.className = 'dashboard-recent-date';
        date.textContent = new Date(tx.created_at).toLocaleString('vi-VN');

        left.append(note, date);

        const amount = document.createElement('div');
        amount.className = `dashboard-recent-amount ${tx.type === 'income' ? 'income' : 'expense'}`;
        amount.textContent = `${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}`;

        item.append(left, amount);
        recentList.appendChild(item);
    });
}

function inferJarSuggestionFromNote(note = '') {
    const normalized = normalizeTextWords(note);
    if (!normalized) return null;

    for (const { jar, terms } of NOTE_KEYWORD_TO_JAR) {
        const matched = terms.some((term) => normalized.includes(term));
        if (matched) return jar;
    }
    return null;
}

function getJarAvailableBalance(jarKey) {
    return Number(state.jarStats?.[jarKey]?.balance || 0);
}

function getComparableExpenseRows(jarKey, note) {
    const history = state.transactions.filter((tx) => {
        return tx.type === 'expense' && normalizeJar(tx.jar) === jarKey && isWithinLastMonths(tx.created_at, 3);
    });

    const keyword = extractKeywordFromNote(note);
    if (!keyword) return history;

    const keywordRows = history.filter((tx) => normalizeTextWords(tx.note || '').includes(keyword));
    return keywordRows.length >= 2 ? keywordRows : history;
}

function getExpenseWarnings(amount, jarKey, note) {
    const warnings = [];
    if (!jarKey || !Number.isFinite(amount) || amount <= 0) return warnings;

    const balance = getJarAvailableBalance(jarKey);
    if (amount > balance) {
        const deficit = amount - balance;
        warnings.push({
            tone: 'hard',
            message: `Cẩn thận nha, hũ ${getJarLabel(jarKey)} đang "kêu cứu", bạn sẽ bị âm ${formatCurrency(deficit)} nếu thực hiện giao dịch này!`
        });
    }

    const comparableRows = getComparableExpenseRows(jarKey, note);
    if (comparableRows.length >= 3) {
        const average = comparableRows.reduce((sum, tx) => sum + Number(tx.amount || 0), 0) / comparableRows.length;
        if (average > 0 && amount >= average * 2.5 && amount - average >= 50_000) {
            warnings.push({
                tone: 'soft',
                message: `Khoản này cao hơn mức thường dùng ${formatCurrency(Math.round(average))}. Hôm nay "sang chảnh" quá hay bạn nhập nhầm thêm số 0?`
            });
        }
    }

    return warnings;
}

function getTodayExpenseSummary(rows = state.transactions) {
    const todayStart = startOfDay(new Date());
    const todayRows = rows.filter((tx) => {
        return tx.type === 'expense' && new Date(tx.created_at) >= todayStart;
    });

    if (!todayRows.length) {
        return 'Hôm nay bạn chưa chi khoản nào. Vẫn đang giữ phong độ ổn áp.';
    }

    const total = todayRows.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const byJar = {};
    todayRows.forEach((tx) => {
        const jar = normalizeJar(tx.jar);
        if (!jar) return;
        byJar[jar] = (byJar[jar] || 0) + Number(tx.amount || 0);
    });

    const topJar = Object.entries(byJar).sort((a, b) => b[1] - a[1])[0]?.[0] || 'necessities';
    const topJarLimit = Number(state.jarStats?.[topJar]?.limit || 0);
    const topJarSpent = Number(byJar[topJar] || 0);
    const safetyLabel = topJarLimit > 0 && topJarSpent <= topJarLimit ? 'vẫn nằm trong vùng an toàn' : 'đang áp sát hạn mức';

    return `Hôm nay bạn chi ${todayRows.length} khoản, tổng ${formatCurrency(total)}. Hũ ${getJarCode(topJar)} (${getJarLabel(topJar)}) đang chiếm tỷ trọng lớn nhất và ${safetyLabel}.`;
}

function shiftRatio(ratios, fromJar, toJar, delta) {
    const movable = Math.max(0, Math.min(delta, Number(ratios[fromJar] || 0)));
    ratios[fromJar] = Number(ratios[fromJar] || 0) - movable;
    ratios[toJar] = Number(ratios[toJar] || 0) + movable;
}

function getIncomePlan(amount) {
    const ratios = { ...DEFAULT_INCOME_RATIO };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthExpenses = state.transactions.filter((tx) => {
        if (tx.type !== 'expense') return false;
        const created = new Date(tx.created_at);
        return created >= monthStart && created < monthEnd;
    });

    const expenseByJar = {};
    previousMonthExpenses.forEach((tx) => {
        const jar = normalizeJar(tx.jar);
        if (!jar) return;
        expenseByJar[jar] = (expenseByJar[jar] || 0) + Number(tx.amount || 0);
    });

    let advice = 'Theo tỷ lệ mặc định 55-10-10-10-10-5 để cân bằng nhu cầu và mục tiêu dài hạn.';
    const eduSpent = Number(expenseByJar.education || 0);
    const eduLimit = getJarLimit(state.profile, 'education');
    if (eduLimit > 0 && eduSpent > eduLimit * 1.05) {
        shiftRatio(ratios, 'entertainment', 'education', 5);
        advice = 'Tháng trước hũ Giáo dục thiếu hụt, mình tăng EDU lên 15% và giảm PLAY còn 5% để đỡ bị hụt.';
    } else {
        const necSpent = Number(expenseByJar.necessities || 0);
        const necLimit = getJarLimit(state.profile, 'necessities');
        if (necLimit > 0 && necSpent > necLimit * 1.05) {
            shiftRatio(ratios, 'entertainment', 'necessities', 5);
            advice = 'Tháng trước hũ Thiết yếu căng quá, tạm chuyển 5% từ PLAY sang NEC để an toàn hơn.';
        }
    }

    const rows = JARS.map((jar) => {
        const ratio = Number(ratios[jar.key] || 0);
        const value = Math.round((amount * ratio) / 100);
        return {
            jar: jar.key,
            code: jar.code,
            label: jar.label,
            ratio,
            amount: value
        };
    });

    const allocated = rows.reduce((sum, row) => sum + row.amount, 0);
    const diff = amount - allocated;
    if (rows.length && diff !== 0) {
        rows[0].amount += diff;
    }

    return { rows, advice };
}

function detectRecurringIncomeDrafts(rows = state.transactions) {
    const incomeRows = rows
        .filter((tx) => tx.type === 'income' && isWithinLastMonths(tx.created_at, 3))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const grouped = {};
    incomeRows.forEach((tx) => {
        const noteKey = extractKeywordFromNote(tx.note || 'thu nhap');
        const roundedAmount = Math.round(Number(tx.amount || 0) / 10_000) * 10_000;
        const signature = `${noteKey}|${roundedAmount}`;
        if (!grouped[signature]) grouped[signature] = [];
        grouped[signature].push(tx);
    });

    const drafts = [];
    const today = new Date();
    Object.entries(grouped).forEach(([signature, group]) => {
        if (group.length < 2) return;
        const intervals = [];
        for (let index = 1; index < group.length; index += 1) {
            intervals.push(diffDays(new Date(group[index].created_at), new Date(group[index - 1].created_at)));
        }
        if (!intervals.length) return;

        const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
        if (!(avgInterval >= 6 && avgInterval <= 8) && !(avgInterval >= 25 && avgInterval <= 35)) return;

        const lastTx = group[group.length - 1];
        const expectedDate = addDays(new Date(lastTx.created_at), Math.round(avgInterval));
        const dayOffset = diffDays(expectedDate, today);
        if (dayOffset < -2 || dayOffset > 2) return;

        const newCycleRows = group.filter((tx) => diffDays(new Date(tx.created_at), addDays(expectedDate, -3)) >= 0);
        if (newCycleRows.length > 0) return;

        drafts.push({
            signature,
            note: lastTx.note || 'Thu nhập định kỳ',
            amount: Number(lastTx.amount || 0),
            expectedDate,
            frequency: avgInterval >= 25 ? 'hàng tháng' : 'hàng tuần'
        });
    });

    return drafts.sort((a, b) => Math.abs(diffDays(a.expectedDate, today)) - Math.abs(diffDays(b.expectedDate, today)));
}

function buildWeeklySummaryContext() {
    const startDate = addDays(new Date(), -6);
    const weekRows = state.transactions.filter((tx) => new Date(tx.created_at) >= startOfDay(startDate));

    const expenseRows = weekRows.filter((tx) => tx.type === 'expense');
    const byJar = {};
    expenseRows.forEach((tx) => {
        const jar = normalizeJar(tx.jar);
        if (!jar) return;
        byJar[jar] = (byJar[jar] || 0) + Number(tx.amount || 0);
    });

    const items = Object.entries(byJar)
        .sort((a, b) => b[1] - a[1])
        .map(([jar, value]) => `${getJarCode(jar)} (${getJarLabel(jar)}): ${formatCurrency(value)}`);

    return {
        from: formatDate(startOfDay(startDate)),
        to: formatDate(new Date()),
        total_income: sumByType(weekRows, 'income'),
        total_expense: sumByType(weekRows, 'expense'),
        top_expense_groups: items,
        balance_snapshot: JARS.reduce((acc, jar) => {
            acc[jar.code] = Number(state.jarStats?.[jar.key]?.balance || 0);
            return acc;
        }, {})
    };
}

function renderRecurringDraftCard() {
    const card = document.getElementById('quick-recurring-card');
    if (!card) return;

    const draft = state.recurringDrafts[0];
    if (!draft) {
        card.className = 'quick-recurring-card';
        card.innerHTML = '';
        return;
    }

    card.className = 'quick-recurring-card is-visible';
    card.innerHTML = `
        <h4>Nhắc định kỳ</h4>
        <p>${draft.note}: ${formatCurrency(draft.amount)} (${draft.frequency}), dự kiến ${formatDate(draft.expectedDate)}.</p>
        <button type="button" id="quick-use-draft-btn">Mở giao dịch nháp</button>
    `;

    card.querySelector('#quick-use-draft-btn')?.addEventListener('click', () => {
        openManualModal('income', draft);
    });
}

function runDailyBackgroundScan() {
    if (!state.session?.user?.id) return;
    const now = new Date();
    if (now.getHours() < 8) return;

    const todayKey = `${state.session.user.id}:${now.toISOString().slice(0, 10)}`;
    const storageKey = 'vi_nho_daily_scan_marker';
    if (localStorage.getItem(storageKey) === todayKey) return;
    localStorage.setItem(storageKey, todayKey);

    const draft = state.recurringDrafts[0];
    if (draft) {
        setQuickFeedback(
            `Nhắc nhở: Có khoản thu định kỳ "${draft.note}" (${formatCurrency(draft.amount)}) dự kiến hôm nay.`,
            'info'
        );
    }
}

function setQuickFeedback(message, tone = 'info') {
    const feedbackEl = document.getElementById('quick-action-feedback');
    if (!feedbackEl) return;

    if (state.feedbackTimer) {
        clearTimeout(state.feedbackTimer);
        state.feedbackTimer = null;
    }

    if (!message) {
        feedbackEl.textContent = '';
        feedbackEl.className = 'quick-action-feedback';
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `quick-action-feedback is-${tone}`;

    if (tone !== 'info') {
        state.feedbackTimer = window.setTimeout(() => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'quick-action-feedback';
            state.feedbackTimer = null;
        }, 5000);
    }
}

function setQuickButtonsDisabled(disabled) {
    QUICK_BUTTON_IDS.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.disabled = disabled;
    });
}

function requireDashboardLogin(message = 'Đăng nhập để sử dụng tính năng này.') {
    if (state.session) return true;
    showGuestAuthNotice(message, window.location.pathname);
    setQuickFeedback(message, 'info');
    return false;
}

function setQuickType(type) {
    state.quickType = type;
    const incomeBtn = document.getElementById('quick-income-btn');
    const expenseBtn = document.getElementById('quick-expense-btn');
    if (incomeBtn) incomeBtn.classList.toggle('is-active', type === 'income');
    if (expenseBtn) expenseBtn.classList.toggle('is-active', type === 'expense');
}

function buildSmartAddPreview(aiResult, userInput) {
    const type = normalizeType(aiResult?.type);
    const amount = Number(aiResult?.amount || 0);
    if (!type) throw new Error('AI chưa xác định được loại giao dịch.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('AI trả về số tiền chưa hợp lệ.');

    let jar = null;
    const jarInput = String(aiResult?.jar || '').trim();
    if (jarInput && normalizeToken(jarInput) !== 'all') {
        jar = normalizeJar(jarInput);
    }
    if (type === 'expense' && !jar) jar = 'necessities';

    const note = String(aiResult?.note || userInput).trim().slice(0, 250);
    const preview = {
        type,
        amount,
        jar,
        note,
        rawInput: userInput
    };

    if (type === 'expense' && jar) {
        const balanceBefore = getJarAvailableBalance(jar);
        preview.balanceBefore = balanceBefore;
        preview.balanceAfter = balanceBefore - amount;
        preview.warnings = getExpenseWarnings(amount, jar, note);
    } else {
        preview.warnings = [];
    }

    return preview;
}

function renderSmartAddPreview(preview = null) {
    const { subtitle, previewCard, previewType, previewAmount, previewJar, previewBalance, previewNote, previewWarnings, submitBtn } =
        getSmartAddElements();

    const isExpensePreview = Boolean(preview && preview.type === 'expense');
    state.smartAddPreview = isExpensePreview ? preview : null;

    if (subtitle) {
        subtitle.textContent = isExpensePreview ? SMART_ADD_PREVIEW_SUBTITLE : SMART_ADD_DEFAULT_SUBTITLE;
    }

    if (submitBtn) {
        submitBtn.textContent = isExpensePreview ? 'Xác nhận & trừ' : 'Phân tích & xem trước';
        submitBtn.dataset.smartAddStage = isExpensePreview ? 'confirm' : 'analyze';
    }

    if (!previewCard) return;

    if (!isExpensePreview) {
        previewCard.classList.remove('is-visible');
        previewCard.setAttribute('aria-hidden', 'true');
        if (previewType) previewType.textContent = '';
        if (previewAmount) previewAmount.textContent = '';
        if (previewJar) previewJar.textContent = '';
        if (previewBalance) {
            previewBalance.textContent = '';
            previewBalance.classList.remove('is-negative');
        }
        if (previewNote) previewNote.textContent = '';
        if (previewWarnings) previewWarnings.innerHTML = '';
        return;
    }

    previewCard.classList.add('is-visible');
    previewCard.setAttribute('aria-hidden', 'false');
    if (previewType) previewType.textContent = 'Chi tiêu';
    if (previewAmount) previewAmount.textContent = formatCurrency(preview.amount);
    if (previewJar) previewJar.textContent = getJarDisplayLabel(preview.jar);
    if (previewBalance) {
        const balanceAfter = Number(preview.balanceAfter);
        previewBalance.textContent = formatCurrency(Number.isFinite(balanceAfter) ? balanceAfter : 0);
        previewBalance.classList.toggle('is-negative', Number.isFinite(balanceAfter) && balanceAfter < 0);
    }
    if (previewNote) {
        previewNote.textContent = preview.note ? `Ghi chú AI nhận diện: ${preview.note}` : '';
    }
    if (previewWarnings) {
        previewWarnings.innerHTML = '';
        (preview.warnings || []).forEach((warning) => {
            const item = document.createElement('div');
            item.className = `smart-add-preview-warning-item ${warning.tone === 'soft' ? 'is-soft' : 'is-hard'}`.trim();
            item.textContent = warning.message;
            previewWarnings.appendChild(item);
        });
    }
}

async function insertTransactions(userId, transactions) {
    const payload = transactions.map((tx) => ({
        user_id: userId,
        type: tx.type,
        amount: Number(tx.amount || 0),
        jar: tx.jar || null,
        note: tx.note ? String(tx.note).trim().slice(0, 250) : null
    }));

    const { error } = await supabase.from('transactions').insert(payload);
    if (error) throw error;
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
        showGuestAuthNotice('Đăng nhập để dùng AI trên Dashboard.', window.location.pathname);
        throw new Error('Đăng nhập để dùng AI.');
    }

    const makeRequest = (token) => fetch('/api/gemini', {
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

    const unauthorizedError = response.status === 401 && /unauthorized|token validation failed/i.test(String(responseData.error || ''));
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

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Không đọc được ảnh hóa đơn.'));
        reader.readAsDataURL(file);
    });
}

async function logAiOverride(userId, meta) {
    try {
        await supabase.from('ai_logs').insert({
            user_id: userId,
            input_data: { event: 'jar_override', ...meta },
            result_data: { acknowledged: true },
            status: 'user_override'
        });
    } catch {
        // ignore logging failure
    }
}

function getManualElements() {
    const modal = document.getElementById('manual-transaction-modal');
    return {
        modal,
        card: modal?.querySelector('.manual-modal-card'),
        form: document.getElementById('manual-transaction-form'),
        primaryGrid: document.getElementById('manual-primary-grid'),
        jarField: document.getElementById('manual-jar-field'),
        title: document.getElementById('manual-modal-title'),
        badge: document.getElementById('manual-modal-badge'),
        subtitle: document.getElementById('manual-modal-subtitle'),
        amountInput: document.getElementById('manual-amount-input'),
        jarSelect: document.getElementById('manual-jar-select'),
        noteInput: document.getElementById('manual-note-input'),
        incomeModePanel: document.getElementById('manual-income-mode-panel'),
        incomeModeNote: document.getElementById('manual-income-mode-note'),
        incomeModeInputs: Array.from(document.querySelectorAll('input[name="manual-income-mode"]')),
        suggestion: document.getElementById('manual-ai-suggestion'),
        warnings: document.getElementById('manual-ai-warnings'),
        incomeAllocationPanel: document.getElementById('manual-income-allocation'),
        allocationAdvice: document.getElementById('manual-allocation-advice'),
        allocationTable: document.getElementById('manual-allocation-table'),
        periodicHint: document.getElementById('manual-periodic-hint'),
        submitBtn: document.getElementById('manual-submit-btn')
    };
}

function getManualIncomeHandling() {
    const checked = document.querySelector('input[name="manual-income-mode"]:checked');
    return MANUAL_INCOME_HANDLING_VALUES.includes(checked?.value) ? checked.value : state.manualIncomeHandling;
}

function setManualIncomeHandling(value = 'split_now') {
    const nextValue = MANUAL_INCOME_HANDLING_VALUES.includes(value) ? value : 'split_now';
    state.manualIncomeHandling = nextValue;
    const { incomeModeInputs } = getManualElements();
    incomeModeInputs.forEach((input) => {
        input.checked = input.value === nextValue;
    });
}

function syncManualFormLayout() {
    const { primaryGrid, jarField, incomeModePanel, incomeModeNote, incomeAllocationPanel } = getManualElements();
    const handling = state.manualMode === 'income' ? getManualIncomeHandling() : 'single_jar';
    const showIncomeMode = state.manualMode === 'income';
    const showJarField = state.manualMode === 'expense' || handling === 'single_jar';

    state.manualIncomeHandling = handling;

    if (primaryGrid) {
        primaryGrid.classList.toggle('is-single-column', !showJarField);
    }
    if (jarField) {
        jarField.classList.toggle('is-hidden', !showJarField);
    }
    if (incomeModePanel) {
        incomeModePanel.classList.toggle('is-visible', showIncomeMode);
    }
    if (incomeAllocationPanel && (!showIncomeMode || handling !== 'split_now')) {
        incomeAllocationPanel.classList.remove('is-visible');
    }
    if (incomeModeNote) {
        if (handling === 'single_jar') {
            incomeModeNote.textContent = 'Bạn đang lưu toàn bộ khoản thu vào một hũ cụ thể ngay trong dashboard.';
        } else if (handling === 'split_later') {
            incomeModeNote.textContent = 'Khoản thu sẽ được giữ ở trạng thái chờ chia để bạn phân bổ sau trong Hệ thống hũ.';
        } else {
            incomeModeNote.textContent = 'AI sẽ gợi ý bảng chia 6 hũ để bạn lưu ngay trong lần nhập này.';
        }
    }
}

function closeManualModal() {
    const { modal, card, form, warnings, suggestion, incomeAllocationPanel, periodicHint } = getManualElements();
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = '';
    document.body.classList.remove('manual-modal-open');
    if (form) form.reset();
    if (warnings) warnings.innerHTML = '';
    if (suggestion) {
        suggestion.className = 'manual-ai-suggestion';
        suggestion.textContent = '';
    }
    if (incomeAllocationPanel) incomeAllocationPanel.classList.remove('is-visible');
    if (periodicHint) {
        periodicHint.className = 'manual-periodic-hint';
        periodicHint.textContent = '';
    }
    if (card) card.scrollTop = 0;
    state.manualIncomeHandling = 'split_now';
    state.manualSuggestedJar = null;
    state.manualWarnings = [];
    if (typeof state.lastFocusedElement?.focus === 'function') {
        try {
            state.lastFocusedElement.focus({ preventScroll: true });
        } catch {
            state.lastFocusedElement.focus();
        }
    }
    state.lastFocusedElement = null;
}

function renderManualWarnings(warnings) {
    const { warnings: warningBox } = getManualElements();
    if (!warningBox) return;
    warningBox.innerHTML = '';
    warnings.forEach((warning) => {
        const item = document.createElement('div');
        item.className = `manual-ai-warning ${warning.tone === 'soft' ? 'is-soft' : ''}`.trim();
        item.textContent = warning.message;
        warningBox.appendChild(item);
    });
}

function renderIncomeAllocation(amount) {
    const { incomeAllocationPanel, allocationAdvice, allocationTable } = getManualElements();
    if (!incomeAllocationPanel || !allocationAdvice || !allocationTable) return null;

    if (!Number.isFinite(amount) || amount <= 0) {
        incomeAllocationPanel.classList.remove('is-visible');
        allocationAdvice.textContent = '';
        allocationTable.innerHTML = '';
        return null;
    }

    const plan = getIncomePlan(amount);
    allocationAdvice.textContent = plan.advice;
    allocationTable.innerHTML = plan.rows
        .map((row) => {
            return `
                <div class="manual-allocation-row">
                    <strong>${row.code} - ${row.label}</strong>
                    <span>${row.ratio}% • ${formatCurrency(row.amount)}</span>
                </div>
            `;
        })
        .join('');
    incomeAllocationPanel.classList.add('is-visible');
    return plan;
}

function updateManualAdvisorUI() {
    const { amountInput, noteInput, jarSelect, suggestion, periodicHint } = getManualElements();
    if (!amountInput || !noteInput || !jarSelect) return;

    syncManualFormLayout();

    const amount = parseCurrencyInput(amountInput.value);
    const note = noteInput.value || '';
    const selectedJar = normalizeJar(jarSelect.value) || 'necessities';

    if (state.manualMode === 'expense') {
        const suggestedJar = inferJarSuggestionFromNote(note);
        state.manualSuggestedJar = suggestedJar;

        if (suggestion) {
            if (suggestedJar) {
                suggestion.className = 'manual-ai-suggestion is-visible';
                suggestion.textContent = `💡 Gợi ý: Hũ ${getJarCode(suggestedJar)} - ${getJarLabel(suggestedJar)}`;
            } else {
                suggestion.className = 'manual-ai-suggestion';
                suggestion.textContent = '';
            }
        }

        const warnings = getExpenseWarnings(amount, selectedJar, note);
        state.manualWarnings = warnings;
        renderManualWarnings(warnings);
        renderIncomeAllocation(Number.NaN);
        if (periodicHint) {
            periodicHint.className = 'manual-periodic-hint';
            periodicHint.textContent = '';
        }
        return;
    }

    if (suggestion) {
        suggestion.className = 'manual-ai-suggestion';
        suggestion.textContent = '';
    }
    renderManualWarnings([]);
    const incomeHandling = getManualIncomeHandling();
    if (incomeHandling === 'split_now') {
        renderIncomeAllocation(amount);
    } else {
        renderIncomeAllocation(Number.NaN);
    }

    const draft = state.recurringDrafts[0];
    if (periodicHint) {
        const messages = [];
        if (incomeHandling === 'split_later') {
            messages.push('Khoản thu này sẽ xuất hiện ở trang Hệ thống hũ để bạn phân bổ khi sẵn sàng.');
        }
        if (draft) {
            messages.push(
                `Nhận diện định kỳ: Khoản "${draft.note}" thường về ${draft.frequency} quanh ngày ${formatDate(draft.expectedDate)}.`
            );
        }

        if (messages.length) {
            periodicHint.className = 'manual-periodic-hint is-visible';
            periodicHint.textContent = messages.join(' ');
        } else {
            periodicHint.className = 'manual-periodic-hint';
            periodicHint.textContent = '';
        }
    }
}

function openManualModal(mode = 'expense', presetDraft = null) {
    console.log('[DEBUG] openManualModal() called with mode:', mode);
    if (!requireDashboardLogin(mode === 'expense' ? 'Đăng nhập để thêm chi tiêu thủ công.' : 'Đăng nhập để thêm thu nhập thủ công.')) {
        return;
    }
    
    const { modal, card, title, badge, subtitle, amountInput, jarSelect, noteInput } = getManualElements();
    if (!modal || !amountInput || !jarSelect || !noteInput) {
        console.error('[DEBUG] Modal elements missing:', { modal: !!modal, amountInput: !!amountInput });
        return;
    }
    
    console.log('[DEBUG] Modal found, adding is-open class');
    const draft = presetDraft || (mode === 'income' ? state.recurringDrafts[0] || null : null);

    state.manualMode = mode;
    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setManualIncomeHandling(mode === 'income' ? 'split_now' : 'single_jar');
    setQuickType(mode);
    modal.dataset.mode = mode;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = '';
    document.body.classList.add('manual-modal-open');
    if (card) card.scrollTop = 0;

    console.log('[DEBUG] Modal after class add:', {
        classes: modal.className,
        displayStyle: modal.style.display,
        computedDisplay: window.getComputedStyle(modal).display
    });

    if (title) {
        title.textContent = mode === 'expense' ? 'Nhập chi tiêu thủ công' : 'Nhập thu nhập thủ công';
    }
    if (badge) {
        badge.textContent = mode === 'expense' ? 'Chi tiêu' : 'Thu nhập';
    }
    if (subtitle) {
        subtitle.textContent =
            mode === 'expense'
                ? 'AI sẽ gợi ý hũ phù hợp, nhắc cảnh báo chi tiêu và giúp bạn lưu giao dịch rõ ràng hơn.'
                : 'AI sẽ gợi ý bảng phân bổ 6 hũ và nhận diện khoản thu định kỳ trước khi bạn xác nhận.';
    }

    amountInput.value = draft?.amount ? formatInputCurrency(draft.amount) : '';
    jarSelect.value = mode === 'expense' ? 'necessities' : 'savings';
    noteInput.value = draft?.note || '';
    updateManualAdvisorUI();
    window.requestAnimationFrame(() => {
        try {
            amountInput.focus({ preventScroll: true });
        } catch {
            amountInput.focus();
        }
    });
    
    console.log('[DEBUG] openManualModal() complete');
}

async function getAdvisorTransactionMessage(context) {
    try {
        const response = await callGemini('advisor', {
            mode: 'transaction',
            context
        });
        return String(response?.message || '').trim();
    } catch {
        return '';
    }
}

async function submitManualTransaction(event) {
    event.preventDefault();
    if (state.quickBusy) return;
    if (!requireDashboardLogin('Đăng nhập để lưu giao dịch thủ công.')) return;

    const { amountInput, noteInput, jarSelect, submitBtn } = getManualElements();
    if (!amountInput || !noteInput) return;

    const amount = parseCurrencyInput(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
        renderManualWarnings([{ tone: 'hard', message: 'Số tiền không hợp lệ, bạn kiểm tra lại nhé.' }]);
        return;
    }

    const note = String(noteInput.value || '').trim() || (state.manualMode === 'income' ? 'Thu nhập thủ công' : 'Chi tiêu thủ công');

    if (submitBtn) submitBtn.disabled = true;
    try {
        state.quickBusy = true;
        setQuickButtonsDisabled(true);
        setQuickFeedback('Đang lưu giao dịch...', 'info');

        if (state.manualMode === 'expense') {
            const jar = normalizeJar(jarSelect?.value) || 'necessities';
            const warnings = getExpenseWarnings(amount, jar, note);
            renderManualWarnings(warnings);
            await insertTransactions(state.session.user.id, [{ type: 'expense', amount, jar, note }]);

            if (state.manualSuggestedJar && state.manualSuggestedJar !== jar) {
                await logAiOverride(state.session.user.id, {
                    suggested_jar: state.manualSuggestedJar,
                    chosen_jar: jar,
                    note
                });
            }

            const advisorMessage = await getAdvisorTransactionMessage({
                type: 'expense',
                amount,
                jar,
                note,
                warnings
            });
            const localSummary = getTodayExpenseSummary([...state.transactions, { type: 'expense', amount, jar, created_at: new Date() }]);
            setQuickFeedback(advisorMessage || localSummary, 'success');
        } else {
            const incomeHandling = getManualIncomeHandling();
            let insertedCount = 1;
            let advisorContext = {
                type: 'income',
                amount,
                note,
                allocation_mode: incomeHandling
            };

            if (incomeHandling === 'split_now') {
                const plan = getIncomePlan(amount);
                const txRows = plan.rows
                    .filter((row) => row.amount > 0)
                    .map((row) => ({
                        type: 'income',
                        amount: row.amount,
                        jar: row.jar,
                        note: `${note} - phân bổ ${row.ratio}%`
                    }));
                insertedCount = txRows.length;
                await insertTransactions(state.session.user.id, txRows);
                advisorContext = {
                    ...advisorContext,
                    allocation: plan.rows
                };
            } else if (incomeHandling === 'single_jar') {
                const jar = normalizeJar(jarSelect?.value) || 'savings';
                await insertTransactions(state.session.user.id, [{ type: 'income', amount, jar, note }]);
                advisorContext = {
                    ...advisorContext,
                    jar
                };
            } else {
                await insertTransactions(state.session.user.id, [{ type: 'income', amount, jar: null, note }]);
                setQuickFeedback(
                    'Khoản thu đã được lưu ở trạng thái chờ chia. Bạn có thể vào Hệ thống hũ để phân bổ sau.',
                    'success'
                );
            }

            if (incomeHandling !== 'split_later') {
                const advisorMessage = await getAdvisorTransactionMessage(advisorContext);
                setQuickFeedback(
                    advisorMessage || `Đã lưu ${insertedCount} giao dịch thu nhập. Nhớ kiểm tra bảng phân bổ để tối ưu từng hũ nhé.`,
                    'success'
                );
            }
        }

        closeManualModal();
        await loadDashboard(state.session);
    } catch (error) {
        setQuickFeedback(error.message || 'Không thể lưu giao dịch.', 'error');
    } finally {
        state.quickBusy = false;
        setQuickButtonsDisabled(false);
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function analyzeSmartAddAI(userInput) {
    const normalizedInput = String(userInput || '').trim();
    if (!normalizedInput) throw new Error('Bạn chưa nhập nội dung giao dịch.');

    const aiResult = await callGemini('smart-input', { text: normalizedInput });
    return buildSmartAddPreview(aiResult, normalizedInput);
}

async function saveSmartAddTransaction(preview) {
    const type = preview?.type;
    const amount = Number(preview?.amount || 0);
    const jar = type === 'expense' ? preview?.jar || 'necessities' : null;
    const note = String(preview?.note || '').trim();

    await insertTransactions(state.session.user.id, [{ type, amount, jar, note }]);

    if (type === 'expense') {
        return `Đã trừ ${formatCurrency(amount)} từ hũ ${getJarDisplayLabel(jar)}.`;
    }

    return `Đã thêm thu nhập ${formatCurrency(amount)}.`;
}

async function processSmartAddQuickAction(userInput) {
    if (!requireDashboardLogin('Đăng nhập để dùng Smart Add AI.')) return null;
    const preview = await analyzeSmartAddAI(userInput);
    if (preview.type === 'expense') {
        const confirmed = window.confirm(
            `AI đề xuất trừ ${formatCurrency(preview.amount)} từ hũ ${getJarDisplayLabel(preview.jar)}. Bạn muốn lưu ngay?`
        );
        if (!confirmed) return null;
    }

    return saveSmartAddTransaction(preview);
}

async function handleSmartAddAI(userInput) {
    return processSmartAddQuickAction(userInput);
}

async function submitSmartAddModal(event) {
    event.preventDefault();
    if (state.quickBusy) return;
    if (!requireDashboardLogin('Đăng nhập để dùng Smart Add AI.')) return;

    const { textarea, submitBtn } = getSmartAddElements();
    if (!textarea) return;

    const userInput = String(textarea.value || '').trim();
    if (!userInput) {
        setSmartAddFeedback('Bạn hãy nhập mô tả giao dịch trước nhé.', 'error');
        return;
    }

    if (state.smartAddPreview?.type === 'expense') {
        const preview = state.smartAddPreview;
        if (submitBtn) submitBtn.disabled = true;

        try {
            state.quickBusy = true;
            setQuickButtonsDisabled(true);
            setSmartAddFeedback(`Đang xác nhận khoản chi ${formatCurrency(preview.amount)}...`, 'info');

            const resultMessage = await saveSmartAddTransaction(preview);
            state.smartAddDraft = '';
            renderSmartAddPreview(null);
            closeSmartAddModal({ preserveDraft: false });

            await loadDashboard(state.session);
            setQuickFeedback(resultMessage || 'Smart Add AI đã thêm giao dịch thành công.', 'success');
        } catch (error) {
            setSmartAddFeedback(error.message || 'Không thể xử lý mô tả giao dịch.', 'error');
            setQuickFeedback(error.message || 'Không thể xử lý mô tả giao dịch.', 'error');
        } finally {
            state.quickBusy = false;
            setQuickButtonsDisabled(false);
            if (submitBtn) submitBtn.disabled = false;
        }
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        state.quickBusy = true;
        setQuickButtonsDisabled(true);
        setSmartAddFeedback('Đang phân tích mô tả bằng AI...', 'info');

        const preview = await analyzeSmartAddAI(userInput);

        if (preview.type === 'expense') {
            renderSmartAddPreview(preview);
            setSmartAddFeedback('AI đã bóc tách xong khoản chi. Kiểm tra preview rồi nhấn xác nhận để trừ vào hũ.', 'success');
            return;
        }

        setSmartAddFeedback('AI xác định đây là khoản thu, đang lưu ngay...', 'info');
        const resultMessage = await saveSmartAddTransaction(preview);
        state.smartAddDraft = '';
        renderSmartAddPreview(null);
        closeSmartAddModal({ preserveDraft: false });

        await loadDashboard(state.session);
        setQuickFeedback(resultMessage || 'Smart Add AI đã thêm giao dịch thành công.', 'success');
    } catch (error) {
        setSmartAddFeedback(error.message || 'Không thể xử lý mô tả giao dịch.', 'error');
        setQuickFeedback(error.message || 'Không thể xử lý mô tả giao dịch.', 'error');
    } finally {
        state.quickBusy = false;
        setQuickButtonsDisabled(false);
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function handleAssetOverview() {
    if (!requireDashboardLogin('Đăng nhập để xem tổng quan tài sản.')) return null;
    const lines = JARS.map(({ key, label }) => `${label}: ${formatCurrency(state.jarStats?.[key]?.balance || 0)}`);
    const total = JARS.reduce((sum, { key }) => sum + Number(state.jarStats?.[key]?.balance || 0), 0);

    window.alert(`Tổng tài sản hiện tại: ${formatCurrency(total)}\n\n${lines.join('\n')}`);
    return 'Đã mở tổng quan tài sản theo 6 hũ.';
}

async function handleResetTransactions() {
    if (!requireDashboardLogin('Đăng nhập để reset giao dịch.')) return null;
    const confirmed = window.confirm(
        'Bạn có chắc muốn RESET toàn bộ giao dịch của tài khoản này? Hành động này không thể hoàn tác.'
    );
    if (!confirmed) return null;

    const verify = window.prompt('Nhập RESET để xác nhận xoá toàn bộ giao dịch');
    if (verify === null) return null;
    if (String(verify).trim().toUpperCase() !== 'RESET') {
        throw new Error('Xác nhận không đúng. Dữ liệu chưa bị xoá.');
    }

    const { error } = await supabase.from('transactions').delete().eq('user_id', state.session.user.id);
    if (error) throw error;

    return 'Đã reset toàn bộ giao dịch thành công.';
}

async function handleReceiptScan(file) {
    if (!requireDashboardLogin('Đăng nhập để quét hoá đơn.')) return null;
    const dataUrl = await fileToDataUrl(file);
    const aiResult = await callGemini('scan-receipt', {
        image: dataUrl,
        mimeType: file.type || 'image/jpeg'
    });

    const items = Array.isArray(aiResult.items) ? aiResult.items : [];
    const createdTransactions = items
        .map((item) => {
            const amount = Number(item?.amount || 0);
            const jar = normalizeJar(item?.category || item?.jar);
            const note = String(item?.note || aiResult.storeName || 'Quét hóa đơn').trim();
            if (!Number.isFinite(amount) || amount <= 0) return null;
            return {
                type: 'expense',
                amount,
                jar: jar || 'necessities',
                note
            };
        })
        .filter(Boolean);

    if (!createdTransactions.length) {
        const totalAmount = Number(aiResult.totalAmount || 0);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new Error('AI chưa nhận diện được số tiền trên hóa đơn, vui lòng thử ảnh rõ hơn.');
        }
        createdTransactions.push({
            type: 'expense',
            amount: totalAmount,
            jar: 'necessities',
            note: `Hóa đơn ${String(aiResult.storeName || '').trim() || 'không rõ cửa hàng'}`
        });
    }

    await insertTransactions(state.session.user.id, createdTransactions);

    const total = createdTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    return `Đã thêm ${createdTransactions.length} khoản chi từ hóa đơn (${formatCurrency(total)}).`;
}

async function handleInsightAnalysis() {
    if (!requireDashboardLogin('Đăng nhập để phân tích AI trên Dashboard.')) return null;
    const context = buildWeeklySummaryContext();
    const aiResult = await callGemini('advisor', {
        mode: 'summary',
        context
    });

    const summary = String(aiResult.summary || 'Chưa có tổng kết từ AI.');
    const action = String(aiResult.action || '');
    window.alert(`Phân tích tuần:\n${summary}${action ? `\n\nGợi ý hành động:\n${action}` : ''}`);
    return 'Đã hoàn thành phân tích tuần/tháng bằng AI cố vấn.';
}

async function runQuickAction(executor, pendingMessage) {
    if (state.quickBusy) return;
    if (!requireDashboardLogin(pendingMessage || 'Đăng nhập để sử dụng tính năng này.')) return;

    try {
        state.quickBusy = true;
        setQuickButtonsDisabled(true);
        setQuickFeedback(pendingMessage || 'Đang xử lý...', 'info');

        const resultMessage = await executor();
        if (resultMessage === null) {
            setQuickFeedback('', 'info');
            return;
        }

        await loadDashboard(state.session);
        setQuickFeedback(resultMessage || 'Đã cập nhật dữ liệu thành công.', 'success');
    } catch (error) {
        setQuickFeedback(error.message || 'Không thể thực hiện thao tác.', 'error');
    } finally {
        state.quickBusy = false;
        setQuickButtonsDisabled(false);
    }
}

function bindManualModal() {
    const modal = document.getElementById('manual-transaction-modal');
    const form = document.getElementById('manual-transaction-form');
    const closeBtn = document.getElementById('manual-modal-close');
    const cancelBtn = document.getElementById('manual-cancel-btn');
    const amountInput = document.getElementById('manual-amount-input');
    const noteInput = document.getElementById('manual-note-input');
    const jarSelect = document.getElementById('manual-jar-select');
    const incomeModeInputs = Array.from(document.querySelectorAll('input[name="manual-income-mode"]'));

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DEBUG] Close button clicked');
            closeManualModal();
        });
    } else {
        console.error('[DEBUG] Close button not found');
    }
    cancelBtn?.addEventListener('click', closeManualModal);
    const backdrop = modal?.querySelector('[data-close-manual-modal]');
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[DEBUG] Backdrop clicked');
            closeManualModal();
        });
    } else {
        console.error('[DEBUG] Backdrop not found');
    }
    form?.addEventListener('submit', submitManualTransaction);

    amountInput?.addEventListener('input', (event) => {
        formatCurrencyInputField(event.target);
        updateManualAdvisorUI();
    });
    noteInput?.addEventListener('input', updateManualAdvisorUI);
    jarSelect?.addEventListener('change', updateManualAdvisorUI);
    incomeModeInputs.forEach((input) => input.addEventListener('change', updateManualAdvisorUI));

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (modal?.classList.contains('is-open')) {
            closeManualModal();
        }
    });
}

function getSmartAddElements() {
    const modal = document.getElementById('smart-add-modal');
    return {
        modal,
        card: modal?.querySelector('.manual-modal-card'),
        form: document.getElementById('smart-add-form'),
        title: document.getElementById('smart-add-modal-title'),
        subtitle: document.getElementById('smart-add-modal-subtitle'),
        textarea: document.getElementById('smart-add-input'),
        previewCard: document.getElementById('smart-add-preview'),
        previewType: document.getElementById('smart-add-preview-type'),
        previewAmount: document.getElementById('smart-add-preview-amount'),
        previewJar: document.getElementById('smart-add-preview-jar'),
        previewBalance: document.getElementById('smart-add-preview-balance'),
        previewNote: document.getElementById('smart-add-preview-note'),
        previewWarnings: document.getElementById('smart-add-preview-warnings'),
        feedback: document.getElementById('smart-add-feedback'),
        submitBtn: document.getElementById('smart-add-submit-btn')
    };
}

function setSmartAddFeedback(message = '', tone = 'info') {
    const { feedback } = getSmartAddElements();
    if (!feedback) return;

    if (!message) {
        feedback.textContent = '';
        feedback.className = 'smart-add-feedback';
        return;
    }

    feedback.textContent = message;
    feedback.className = `smart-add-feedback is-visible is-${tone}`;
}

function openSmartAddModal() {
    if (state.quickBusy) return;
    if (!requireDashboardLogin('Đăng nhập để dùng Smart Add AI.')) return;

    const { modal, card, form, title, subtitle, textarea } = getSmartAddElements();
    if (!modal || !textarea) return;

    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.dataset.mode = 'smart';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = '';
    document.body.classList.add('manual-modal-open');
    if (card) card.scrollTop = 0;

    if (title) {
        title.textContent = 'Nhập mô tả giao dịch bằng AI';
    }
    if (subtitle) {
        subtitle.textContent = SMART_ADD_DEFAULT_SUBTITLE;
    }

    textarea.value = state.smartAddDraft || '';
    renderSmartAddPreview(null);
    setSmartAddFeedback('', 'info');

    if (form) {
        form.dataset.busy = 'false';
    }

    window.requestAnimationFrame(() => {
        try {
            textarea.focus({ preventScroll: true });
            const length = textarea.value.length;
            textarea.setSelectionRange(length, length);
        } catch {
            textarea.focus();
        }
    });
}

function closeSmartAddModal({ preserveDraft = true } = {}) {
    const { modal, card, form, feedback, textarea } = getSmartAddElements();
    if (!modal) return;
    if (state.quickBusy && preserveDraft) return;

    if (preserveDraft && textarea) {
        state.smartAddDraft = textarea.value;
    } else {
        state.smartAddDraft = '';
    }
    renderSmartAddPreview(null);

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = '';
    document.body.classList.remove('manual-modal-open');

    if (form) {
        form.dataset.busy = 'false';
        if (!preserveDraft) form.reset();
    }

    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'smart-add-feedback';
    }

    if (card) card.scrollTop = 0;

    if (typeof state.lastFocusedElement?.focus === 'function') {
        try {
            state.lastFocusedElement.focus({ preventScroll: true });
        } catch {
            state.lastFocusedElement.focus();
        }
    }
    state.lastFocusedElement = null;
}

function bindSmartAddModal() {
    const modal = document.getElementById('smart-add-modal');
    const form = document.getElementById('smart-add-form');
    const closeBtn = document.getElementById('smart-add-modal-close');
    const cancelBtn = document.getElementById('smart-add-cancel-btn');
    const textarea = document.getElementById('smart-add-input');

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeSmartAddModal();
        });
    }

    cancelBtn?.addEventListener('click', () => closeSmartAddModal());

    const backdrop = modal?.querySelector('[data-close-smart-add-modal]');
    backdrop?.addEventListener('click', (e) => {
        e.preventDefault();
        closeSmartAddModal();
    });

    form?.addEventListener('submit', submitSmartAddModal);

    textarea?.addEventListener('input', (event) => {
        state.smartAddDraft = event.target.value;
        if (state.smartAddPreview) {
            renderSmartAddPreview(null);
        }
        setSmartAddFeedback('', 'info');
    });

    textarea?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            form?.requestSubmit?.();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (modal?.classList.contains('is-open')) {
            closeSmartAddModal();
        }
    });
}

function bindAuthStateSync() {
    if (state.authSubscription) return;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            state.session = session;
        }

        if (event === 'SIGNED_OUT') {
            state.session = null;
            showGuestAuthNotice('Bạn đã đăng xuất. Đăng nhập để lưu giao dịch và dùng AI.', window.location.pathname);
            void loadDashboard(null);
        }
    });

    state.authSubscription = data?.subscription || null;
}

function bindQuickActions() {
    console.log('[DEBUG] bindQuickActions() called - binding quick action buttons');
    
    const incomeBtn = document.getElementById('quick-income-btn');
    const expenseBtn = document.getElementById('quick-expense-btn');
    const assetBtn = document.getElementById('quick-asset-btn');
    const resetBtn = document.getElementById('quick-reset-btn');
    const receiptBtn = document.getElementById('quick-receipt-btn');
    const smartBtn = document.getElementById('quick-smart-btn');
    const insightBtn = document.getElementById('quick-insight-btn');
    const receiptInput = document.getElementById('quick-receipt-input');

    console.log('[DEBUG] Found buttons:', { incomeBtn: !!incomeBtn, expenseBtn: !!expenseBtn, assetBtn: !!assetBtn, resetBtn: !!resetBtn });

    setQuickType(state.quickType);

    if (incomeBtn) {
        incomeBtn.addEventListener('click', (e) => {
            console.log('[DEBUG] Income button clicked');
            e.preventDefault();
            openManualModal('income');
        });
    } else {
        console.error('[DEBUG] quick-income-btn not found');
    }

    if (expenseBtn) {
        expenseBtn.addEventListener('click', (e) => {
            console.log('[DEBUG] Expense button clicked');
            e.preventDefault();
            openManualModal('expense');
        });
    } else {
        console.error('[DEBUG] quick-expense-btn not found');
    }

    if (assetBtn) {
        assetBtn.addEventListener('click', () => {
            console.log('[DEBUG] Asset button clicked');
            runQuickAction(handleAssetOverview, 'Đang tải tổng quan tài sản...');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            console.log('[DEBUG] Reset button clicked');
            runQuickAction(handleResetTransactions, 'Đang reset dữ liệu giao dịch...');
        });
    }

    if (smartBtn) {
        smartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[DEBUG] Smart button clicked');
            const smartModal = document.getElementById('smart-add-modal');
            if (smartModal) {
                openSmartAddModal();
                return;
            }

            const fallbackInput = window.prompt(
                'Nhập mô tả giao dịch (ví dụ: "ăn trưa 65k", "nhận lương tháng 12 triệu").'
            );
            if (fallbackInput === null) return;
            if (!fallbackInput.trim()) {
                setQuickFeedback('Bạn chưa nhập nội dung giao dịch.', 'error');
                return;
            }

            runQuickAction(() => processSmartAddQuickAction(fallbackInput.trim()), 'Đang phân tích giao dịch bằng AI...');
        });
    }

    if (receiptBtn) {
        receiptBtn.addEventListener('click', () => {
            console.log('[DEBUG] Receipt button clicked');
            if (!state.session) {
                showGuestAuthNotice('Đăng nhập để quét hoá đơn và tự ghi chi tiêu.', window.location.pathname);
                return;
            }
            receiptInput?.click();
        });
    }

    receiptInput?.addEventListener('change', (event) => {
        const input = event.target;
        const file = input?.files?.[0];
        if (!file) return;
        console.log('[DEBUG] Receipt file selected');
        runQuickAction(() => handleReceiptScan(file), 'Đang quét hóa đơn...');
        input.value = '';
    });

    if (insightBtn) {
        insightBtn.addEventListener('click', () => {
            console.log('[DEBUG] Insight button clicked');
            runQuickAction(handleInsightAnalysis, 'Đang phân tích dữ liệu dashboard...');
        });
    }
    
    console.log('[DEBUG] bindQuickActions() complete');
}

async function loadDashboard(session) {
    const greeting = document.getElementById('dashboard-greeting');
    const heroSub = document.querySelector('.dashboard-hero-sub');

    if (!session) {
        state.profile = null;
        state.transactions = [];
        state.recurringDrafts = [];

        if (greeting) {
            greeting.textContent = 'Xem trước Bảng điều khiển';
        }
        if (heroSub) {
            heroSub.textContent = 'Đăng nhập để lưu giao dịch, đồng bộ realtime và dùng AI. Bạn vẫn có thể xem toàn bộ bố cục và các tính năng trước khi đăng nhập.';
        }

        const balanceEl = document.getElementById('dashboard-balance');
        const incomeEl = document.getElementById('dashboard-income');
        const expenseEl = document.getElementById('dashboard-expense');
        const monthlyEl = document.getElementById('dashboard-monthly-limit');
        const dailyEl = document.getElementById('dashboard-daily-limit');

        if (balanceEl) balanceEl.textContent = formatCurrency(0);
        if (incomeEl) incomeEl.textContent = formatCurrency(0);
        if (expenseEl) expenseEl.textContent = formatCurrency(0);
        if (monthlyEl) monthlyEl.textContent = formatCurrency(0);
        if (dailyEl) dailyEl.textContent = formatCurrency(0);

        state.jarStats = renderJarCards(null, []);
        renderRecentTransactions([]);
        renderRecurringDraftCard();
        return;
    }

    const user = session.user;
    if (greeting) {
        const name = user.user_metadata?.full_name || user.email;
        greeting.textContent = `${getGreetingLabel()}, ${name}`;
    }

    const [profileResult, transactionsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
    ]);

    if (profileResult.error) throw profileResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    const profile = profileResult.data || null;
    const rows = transactionsResult.data || [];
    state.profile = profile;
    state.transactions = rows;
    state.recurringDrafts = detectRecurringIncomeDrafts(rows);
    runDailyBackgroundScan();

    const income = sumByType(rows, 'income');
    const expense = sumByType(rows, 'expense');
    const balance = income - expense;

    const balanceEl = document.getElementById('dashboard-balance');
    const incomeEl = document.getElementById('dashboard-income');
    const expenseEl = document.getElementById('dashboard-expense');
    const monthlyEl = document.getElementById('dashboard-monthly-limit');
    const dailyEl = document.getElementById('dashboard-daily-limit');

    if (balanceEl) balanceEl.textContent = formatCurrency(balance);
    if (incomeEl) incomeEl.textContent = formatCurrency(income);
    if (expenseEl) expenseEl.textContent = formatCurrency(expense);
    if (monthlyEl) monthlyEl.textContent = formatCurrency(profile?.monthly_spending_limit || 0);
    if (dailyEl) dailyEl.textContent = formatCurrency(profile?.daily_spending_limit || 0);

    state.jarStats = renderJarCards(profile, rows);
    renderRecentTransactions(rows);
    renderRecurringDraftCard();
}

function scheduleDashboardReload() {
    if (state.refreshTimer) {
        clearTimeout(state.refreshTimer);
    }
    state.refreshTimer = window.setTimeout(() => {
        if (!state.session) return;
        loadDashboard(state.session).catch((error) => {
            setQuickFeedback(error.message || 'Không thể đồng bộ dashboard realtime.', 'error');
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
        .channel(`dashboard-realtime-${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'transactions',
                filter: `user_id=eq.${userId}`
            },
            scheduleDashboardReload
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'user_profiles',
                filter: `user_id=eq.${userId}`
            },
            scheduleDashboardReload
        )
        .subscribe();

    state.realtimeChannel = channel;
}

async function init() {
    console.log('[DEBUG] dashboard-page.js init() started');
    
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        state.session = data.session || null;
        console.log('[DEBUG] Session OK, binding modals & buttons');
        
        bindAuthStateSync();
        bindManualModal();
        bindSmartAddModal();
        bindQuickActions();
        
        console.log('[DEBUG] Loading dashboard data...');
        if (state.session) {
            await loadDashboard(state.session);
            initRealtime(state.session);
        } else {
            showGuestAuthNotice('Bạn đang xem trước Dashboard. Đăng nhập để lưu giao dịch, đồng bộ realtime và dùng AI.', window.location.pathname);
            await loadDashboard(null);
        }
        console.log('[DEBUG] init() complete - UI ready');
    } catch (error) {
        console.error('[DEBUG] init() error:', error);
        // Still bind UI even if data fails
        console.log('[DEBUG] Binding UI despite data error');
        bindAuthStateSync();
        bindManualModal();
        bindSmartAddModal();
        bindQuickActions();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
console.log('[DEBUG] dashboard-page.js loaded');
