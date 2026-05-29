import { getSupabaseClient } from './supabase-client.js';
import { getFreshSession, showGuestAuthNotice } from './auth-guard.js';

const supabase = getSupabaseClient();

const STORAGE_KEY = 'vinho_global_chatbot_state';

let state = {
    isOpen: false,
    loading: false,
    sending: false,
    messages: [],
    profile: null,
    transactions: [],
    lastError: ''
};

function saveState() {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

function loadState() {
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed, loading: false, sending: false, isOpen: false }; // Keep closed on page load initially
        }
    } catch {
        // ignore
    }
}

function renderChatbotHtml() {
    return `
        <div id="global-chatbot-container">
            <div id="global-chatbot-window" class="global-chatbot-window">
                <div class="chatbot-header">
                    <div class="chatbot-avatar">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                    <div class="chatbot-header-info">
                        <h3 class="chatbot-title">AI Trợ Lý Tài Chính</h3>
                        <span id="global-chatbot-status" class="chatbot-status">Sẵn sàng</span>
                    </div>
                </div>
                
                <div id="global-chatbot-thread" class="chatbot-thread">
                    <!-- Messages will appear here -->
                </div>

                <div class="chatbot-suggestions" id="global-chatbot-suggestions">
                    <button type="button" class="chatbot-suggestion-btn">Tình hình tài chính của tôi?</button>
                    <button type="button" class="chatbot-suggestion-btn">Gợi ý cách tiết kiệm</button>
                    <button type="button" class="chatbot-suggestion-btn">Tôi có đang tiêu lố không?</button>
                </div>
                
                <form id="global-chatbot-form" class="chatbot-input-area">
                    <textarea id="global-chatbot-input" class="chatbot-input" placeholder="Hỏi AI về tài chính của bạn..." rows="1"></textarea>
                    <button type="submit" id="global-chatbot-send" class="chatbot-send-btn" disabled>
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </form>
            </div>
            
            <button type="button" id="global-chatbot-fab" class="global-chatbot-fab" aria-label="Mở chat với AI">
                <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            </button>
        </div>
    `;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function createMessageId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

async function callGlobalGemini(action, payload) {
    const session = await getFreshSession().catch(() => null);
    const accessToken = session?.access_token;
    if (!accessToken) {
        showGuestAuthNotice('Đăng nhập để chat với AI.', window.location.pathname);
        throw new Error('Đăng nhập để chat với AI.');
    }

    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ action, payload })
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // ignore
    }

    if (!response.ok) {
        throw new Error(data.error || 'Lỗi kết nối tới AI. Vui lòng thử lại.');
    }

    if (data.error) throw new Error(data.error);
    return data;
}

function renderThread() {
    const threadEl = document.getElementById('global-chatbot-thread');
    if (!threadEl) return;

    if (!state.messages.length) {
        threadEl.innerHTML = `
            <div class="chatbot-message is-assistant">
                <div class="chatbot-message-bubble">Xin chào! Mình là AI Trợ lý của Ví Nhỏ. Mình có thể giúp gì cho bạn hôm nay?</div>
            </div>
        `;
        return;
    }

    threadEl.innerHTML = state.messages.map(msg => {
        const isUser = msg.role === 'user';
        return `
            <div class="chatbot-message ${isUser ? 'is-user' : 'is-assistant'}">
                <div class="chatbot-message-bubble">${escapeHtml(msg.content).replace(/\\n/g, '<br/>')}</div>
            </div>
        `;
    }).join('');

    if (state.sending) {
        threadEl.innerHTML += `
            <div class="chatbot-message is-assistant">
                <div class="chatbot-message-bubble chatbot-typing">
                    <div class="chatbot-typing-dot"></div>
                    <div class="chatbot-typing-dot"></div>
                    <div class="chatbot-typing-dot"></div>
                </div>
            </div>
        `;
    }

    threadEl.scrollTop = threadEl.scrollHeight;
}

function updateStatus() {
    const statusEl = document.getElementById('global-chatbot-status');
    const sendBtn = document.getElementById('global-chatbot-send');
    const input = document.getElementById('global-chatbot-input');
    
    if (!statusEl) return;

    if (state.sending) {
        statusEl.textContent = 'Đang trả lời...';
        if (sendBtn) sendBtn.disabled = true;
        if (input) input.disabled = true;
    } else {
        statusEl.textContent = state.lastError ? 'Có lỗi xảy ra' : 'Sẵn sàng';
        if (sendBtn) sendBtn.disabled = !input?.value.trim();
        if (input) input.disabled = false;
    }
}

async function loadContext() {
    const session = await getFreshSession().catch(() => null);
    if (!session) return;
    
    const userId = session.user.id;
    const [profileResult, transactionsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
    ]);
    
    state.profile = profileResult.data || null;
    state.transactions = transactionsResult.data || [];
}

function buildContext() {
    const income = state.profile?.monthly_income || 0;
    const limits = state.profile?.spending_limits || {};
    return {
        income,
        limits,
        transactions: state.transactions.map(t => ({ amount: t.amount, type: t.type, category: t.category, date: t.created_at }))
    };
}

async function submitChat(event) {
    event?.preventDefault();
    if (state.sending) return;
    
    const session = await getFreshSession().catch(() => null);
    if (!session) {
        showGuestAuthNotice('Đăng nhập để chat với AI.', window.location.pathname);
        return;
    }

    const input = document.getElementById('global-chatbot-input');
    const text = input?.value.trim();
    if (!text) return;

    state.messages.push({ role: 'user', content: text });
    if (input) {
        input.value = '';
        input.style.height = 'auto'; // reset height
    }
    
    state.sending = true;
    state.lastError = '';
    renderThread();
    updateStatus();
    saveState();

    try {
        if (!state.profile) await loadContext();
        
        const aiResult = await callGlobalGemini('reports-assistant', {
            mode: 'chat',
            context: buildContext(),
            messages: state.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
        });

        const reply = aiResult?.reply || aiResult?.message || aiResult?.summary || 'Mình đã ghi nhận.';
        state.messages.push({ role: 'assistant', content: reply });
    } catch (err) {
        state.lastError = err.message;
        state.messages.push({ role: 'assistant', content: 'Xin lỗi, đã có lỗi xảy ra: ' + err.message });
    } finally {
        state.sending = false;
        renderThread();
        updateStatus();
        saveState();
        setTimeout(() => document.getElementById('global-chatbot-input')?.focus(), 100);
    }
}

function bindEvents() {
    const fab = document.getElementById('global-chatbot-fab');
    const windowEl = document.getElementById('global-chatbot-window');
    const form = document.getElementById('global-chatbot-form');
    const input = document.getElementById('global-chatbot-input');
    const sendBtn = document.getElementById('global-chatbot-send');
    const suggestions = document.querySelectorAll('.chatbot-suggestion-btn');

    fab?.addEventListener('click', () => {
        state.isOpen = !state.isOpen;
        if (state.isOpen) {
            fab.classList.add('is-open');
            windowEl?.classList.add('is-open');
            setTimeout(() => input?.focus(), 300);
        } else {
            fab.classList.remove('is-open');
            windowEl?.classList.remove('is-open');
        }
    });

    input?.addEventListener('input', () => {
        if (sendBtn) sendBtn.disabled = !input.value.trim();
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    });

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form?.requestSubmit();
        }
    });

    form?.addEventListener('submit', submitChat);

    suggestions.forEach(btn => {
        btn.addEventListener('click', () => {
            if (input) {
                input.value = btn.textContent;
                if (sendBtn) sendBtn.disabled = false;
                form?.requestSubmit();
            }
        });
    });
}

export function initGlobalChatbot() {
    if (document.getElementById('global-chatbot-container')) return; // already init

    const container = document.createElement('div');
    container.innerHTML = renderChatbotHtml();
    document.body.appendChild(container);

    loadState();
    renderThread();
    updateStatus();
    bindEvents();
}
