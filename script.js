// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    htmlElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    setTheme(savedTheme || getSystemTheme());
}

themeToggle.addEventListener('click', () => {
    const newTheme = htmlElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
    }
});

initTheme();

// Quotes API
const container = document.getElementById('quotes-container');
const pagination = document.getElementById('pagination');
const resultsInfo = document.getElementById('results-info');
const searchInput = document.getElementById('search');

let currentPage = 1;
let currentQuery = '';
let currentNick = '';
const PER_PAGE = 20;

function formatDate(unixTs) {
    return new Date(unixTs * 1000).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function quoteCardHtml(q) {
    return `
        <div class="quote-card">
            <blockquote class="quote-text">${highlight(q.text, currentQuery).replace(/ \| /g, '<br>')}</blockquote>
            <div class="quote-meta">
                <span class="quote-author">— <button class="nick-btn" data-nick="${escapeHtml(q.nick)}">${highlight(q.nick, currentQuery)}</button></span>
                <span class="quote-details">added by ${escapeHtml(q.owner)} &middot; ${formatDate(q.time)} &middot; <button class="quote-id-btn" data-id="${q.id}">#${q.id}</button></span>
            </div>
        </div>
    `;
}

function renderQuotes(quotes) {
    if (quotes.length === 0) {
        container.innerHTML = '<p class="no-results">No quotes found.</p>';
        return;
    }
    container.innerHTML = quotes.map(quoteCardHtml).join('');
}

function renderPagination(page, pages) {
    if (pages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    const buttons = [];

    buttons.push(`<button class="page-btn" ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">&lsaquo; Prev</button>`);

    const range = visiblePageRange(page, pages);
    let prev = null;
    for (const p of range) {
        if (prev !== null && p - prev > 1) {
            buttons.push('<span class="page-ellipsis">&hellip;</span>');
        }
        buttons.push(`<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`);
        prev = p;
    }

    buttons.push(`<button class="page-btn" ${page === pages ? 'disabled' : ''} data-page="${page + 1}">Next &rsaquo;</button>`);

    pagination.innerHTML = buttons.join('');
}

function visiblePageRange(current, total) {
    const delta = 2;
    const range = new Set([1, total]);
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
        range.add(i);
    }
    return [...range].sort((a, b) => a - b);
}

async function fetchQuotes(page, query, nick) {
    const params = new URLSearchParams({ page, per_page: PER_PAGE });
    if (query) params.set('q', query);
    if (nick) params.set('nick', nick);

    container.innerHTML = '<p class="loading">Loading...</p>';
    resultsInfo.textContent = '';

    try {
        const res = await fetch(`/api/quotes?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        renderQuotes(data.quotes);
        renderPagination(data.page, data.pages);
        if (nick) {
            resultsInfo.innerHTML = `${data.total} quote${data.total !== 1 ? 's' : ''} by <strong>${escapeHtml(nick)}</strong> <button id="clear-nick" class="clear-filter-btn">&times; clear</button>`;
            document.getElementById('clear-nick').addEventListener('click', clearNickFilter);
        } else if (query) {
            resultsInfo.textContent = `${data.total} result${data.total !== 1 ? 's' : ''} for "${query}"`;
        } else {
            resultsInfo.textContent = `${data.total} quotes`;
        }
    } catch (err) {
        container.innerHTML = `<p class="no-results">Failed to load quotes: ${escapeHtml(err.message)}</p>`;
        pagination.innerHTML = '';
    }
}

function clearNickFilter() {
    currentNick = '';
    currentPage = 1;
    fetchQuotes(currentPage, currentQuery, currentNick);
}

pagination.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page, 10);
    fetchQuotes(currentPage, currentQuery, currentNick);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

container.addEventListener('click', (e) => {
    const nickBtn = e.target.closest('.nick-btn');
    if (nickBtn) {
        currentNick = nickBtn.dataset.nick;
        currentPage = 1;
        currentQuery = '';
        searchInput.value = '';
        fetchQuotes(currentPage, currentQuery, currentNick);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const idBtn = e.target.closest('.quote-id-btn');
    if (idBtn) {
        openQuoteModal(parseInt(idBtn.dataset.id, 10));
    }
});

let debounceTimer;
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        currentNick = '';
        currentQuery = e.target.value.trim();
        currentPage = 1;
        fetchQuotes(currentPage, currentQuery, currentNick);
    }, 300);
});

// Quote detail modal
const quoteModal = document.getElementById('quote-modal');
const quoteModalTitle = document.getElementById('quote-modal-title');
const quoteModalContent = document.getElementById('quote-modal-content');
const quoteModalClose = document.getElementById('quote-modal-close');
const quoteModalDone = document.getElementById('quote-modal-done');
const quoteModalCopy = document.getElementById('quote-modal-copy');

function closeQuoteModal() {
    quoteModal.hidden = true;
    const url = new URL(window.location);
    url.searchParams.delete('quote');
    history.replaceState(null, '', url);
}

async function openQuoteModal(id) {
    quoteModal.hidden = false;
    quoteModalTitle.textContent = `Quote #${id}`;
    quoteModalContent.innerHTML = '<p class="loading">Loading...</p>';

    const url = new URL(window.location);
    url.searchParams.set('quote', id);
    history.replaceState(null, '', url);

    try {
        const res = await fetch(`/api/quotes/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const q = await res.json();
        quoteModalContent.innerHTML = `
            <div class="random-quote-body">
                <blockquote class="quote-text">${escapeHtml(q.text).replace(/ \| /g, '<br>')}</blockquote>
                <div class="quote-meta">
                    <span class="quote-author">— ${escapeHtml(q.nick)}</span>
                    <span class="quote-details">added by ${escapeHtml(q.owner)} &middot; ${formatDate(q.time)}</span>
                </div>
            </div>`;
    } catch (err) {
        quoteModalContent.innerHTML = `<p class="no-results">Failed to load: ${escapeHtml(err.message)}</p>`;
    }
}

quoteModalClose.addEventListener('click', closeQuoteModal);
quoteModalDone.addEventListener('click', closeQuoteModal);
quoteModal.addEventListener('click', (e) => { if (e.target === quoteModal) closeQuoteModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !quoteModal.hidden) closeQuoteModal(); });

quoteModalCopy.addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => fallbackCopy(url));
    } else {
        fallbackCopy(url);
    }
});

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(ok ? 'Link copied!' : 'Copy failed — copy the URL from the address bar');
}

// Toast
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => { toast.hidden = true; }, 300);
    }, 2000);
}

// Random quote modal
const randomModal = document.getElementById('random-modal');
const randomQuoteBtn = document.getElementById('random-quote-btn');
const randomModalClose = document.getElementById('random-modal-close');
const randomModalDone = document.getElementById('random-modal-done');
const randomModalCopy = document.getElementById('random-modal-copy');
const randomAgainBtn = document.getElementById('random-again-btn');
const randomQuoteContent = document.getElementById('random-quote-content');

function closeRandomModal() {
    randomModal.hidden = true;
    const url = new URL(window.location);
    url.searchParams.delete('quote');
    history.replaceState(null, '', url);
}

async function loadRandomQuote() {
    randomModalCopy.disabled = true;
    randomQuoteContent.innerHTML = '<p class="loading">Loading...</p>';
    try {
        const res = await fetch('/api/quotes/random/one');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const q = await res.json();
        randomQuoteContent.innerHTML = `
            <div class="random-quote-body">
                <blockquote class="quote-text">${escapeHtml(q.text).replace(/ \| /g, '<br>')}</blockquote>
                <div class="quote-meta">
                    <span class="quote-author">— ${escapeHtml(q.nick)}</span>
                    <span class="quote-details">added by ${escapeHtml(q.owner)} &middot; ${formatDate(q.time)} &middot; #${q.id}</span>
                </div>
            </div>`;
        const url = new URL(window.location);
        url.searchParams.set('quote', q.id);
        history.replaceState(null, '', url);
        randomModalCopy.disabled = false;
    } catch (err) {
        randomQuoteContent.innerHTML = `<p class="no-results">Failed to load: ${escapeHtml(err.message)}</p>`;
    }
}

randomQuoteBtn.addEventListener('click', () => {
    randomModal.hidden = false;
    loadRandomQuote();
});
randomModalClose.addEventListener('click', closeRandomModal);
randomModalDone.addEventListener('click', closeRandomModal);
randomAgainBtn.addEventListener('click', loadRandomQuote);
randomModal.addEventListener('click', (e) => { if (e.target === randomModal) closeRandomModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !randomModal.hidden) closeRandomModal(); });

randomModalCopy.addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => fallbackCopy(url));
    } else {
        fallbackCopy(url);
    }
});

// Char counters
function initCharCounter(inputId, counterId, max) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);
    function update() {
        const left = max - input.value.length;
        counter.textContent = `${left} char${left !== 1 ? 's' : ''} left`;
        counter.classList.toggle('char-counter--warning', left <= max * 0.2 && left > max * 0.1);
        counter.classList.toggle('char-counter--danger', left <= max * 0.1);
    }
    input.addEventListener('input', update);
    return update;
}

const resetNickCounter = initCharCounter('q-nick', 'nick-counter', 100);
const resetOwnerCounter = initCharCounter('q-owner', 'owner-counter', 100);
const resetTextCounter = initCharCounter('q-text', 'text-counter', 2000);

// Add quote modal
const modal = document.getElementById('add-modal');
const addQuoteBtn = document.getElementById('add-quote-btn');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const addQuoteForm = document.getElementById('add-quote-form');
const addError = document.getElementById('add-error');

function openModal() {
    addQuoteForm.reset();
    addError.hidden = true;
    resetNickCounter();
    resetOwnerCounter();
    resetTextCounter();
    modal.hidden = false;
    document.getElementById('q-nick').focus();
}

function closeModal() {
    modal.hidden = true;
}

addQuoteBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

addQuoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addError.hidden = true;

    const submitBtn = addQuoteForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
        const res = await fetch('/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: addQuoteForm.nick.value.trim(),
                owner: addQuoteForm.owner.value.trim(),
                text: addQuoteForm.text.value.trim(),
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        closeModal();
        currentPage = 1;
        currentQuery = '';
        currentNick = '';
        searchInput.value = '';
        fetchQuotes(currentPage, currentQuery, currentNick);
    } catch (err) {
        addError.textContent = err.message;
        addError.hidden = false;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save';
    }
});

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(str, query) {
    const escaped = escapeHtml(str);
    if (!query) return escaped;
    return escaped.replace(new RegExp(escapeRegex(escapeHtml(query)), 'gi'), '<mark>$&</mark>');
}

// Handle ?quote=ID on page load
const initialQuoteId = new URLSearchParams(window.location.search).get('quote');
if (initialQuoteId) {
    openQuoteModal(parseInt(initialQuoteId, 10));
}

fetchQuotes(currentPage, currentQuery, currentNick);
