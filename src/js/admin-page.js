import { getSupabaseClient } from './supabase-client.js';
import { getFreshSession, isAdminSession, showGuestAuthNotice } from './auth-guard.js';

const supabase = getSupabaseClient();

function formatCurrency(value = 0) {
    const amount = Math.round(Number(value || 0));
    const sign = amount < 0 ? '-' : '';
    const formatted = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted}₫`;
}

async function init() {
    const session = await getFreshSession().catch(() => null);
    if (!session) {
        showGuestAuthNotice('Đăng nhập bằng tài khoản admin để xem số liệu quản trị.', window.location.pathname);
        return;
    }

    const isAdmin = await isAdminSession(session).catch(() => false);
    if (!isAdmin) {
        const deniedEl = document.getElementById('admin-denied');
        if (deniedEl) {
            deniedEl.style.display = 'block';
            deniedEl.textContent = 'Trang quản trị chỉ dành cho tài khoản admin.';
        }
        return;
    }

    const { data: users } = await supabase.from('user_profiles').select('*');
    const { data: transactions } = await supabase.from('transactions').select('*');

    const userCountEl = document.getElementById('admin-total-users');
    const txCountEl = document.getElementById('admin-total-transactions');
    const balanceEl = document.getElementById('admin-total-balance');

    const totalUsers = (users || []).length;
    const rows = transactions || [];
    const income = rows.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const expense = rows.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    if (userCountEl) userCountEl.textContent = String(totalUsers);
    if (txCountEl) txCountEl.textContent = String(rows.length);
    if (balanceEl) balanceEl.textContent = formatCurrency(income - expense);
}

init();
