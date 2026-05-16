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
const PER_PAGE = 20;

function formatDate(unixTs) {
    return new Date(unixTs * 1000).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function renderQuotes(quotes) {
    if (quotes.length === 0) {
        container.innerHTML = '<p class="no-results">No quotes found.</p>';
        return;
    }

    container.innerHTML = quotes.map(q => `
        <div class="quote-card">
            <blockquote class="quote-text">${escapeHtml(q.text).replace(/ \| /g, '<br>')}</blockquote>
            <div class="quote-meta">
                <span class="quote-author">— ${escapeHtml(q.nick)}</span>
                <span class="quote-details">added by ${escapeHtml(q.owner)} &middot; ${formatDate(q.time)} &middot; #${q.id}</span>
            </div>
        </div>
    `).join('');
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

async function fetchQuotes(page, query) {
    const params = new URLSearchParams({ page, per_page: PER_PAGE });
    if (query) params.set('q', query);

    container.innerHTML = '<p class="loading">Loading...</p>';
    resultsInfo.textContent = '';

    try {
        const res = await fetch(`/api/quotes?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        renderQuotes(data.quotes);
        renderPagination(data.page, data.pages);
        resultsInfo.textContent = query
            ? `${data.total} result${data.total !== 1 ? 's' : ''} for "${query}"`
            : `${data.total} quotes`;
    } catch (err) {
        container.innerHTML = `<p class="no-results">Failed to load quotes: ${escapeHtml(err.message)}</p>`;
        pagination.innerHTML = '';
    }
}

pagination.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page, 10);
    fetchQuotes(currentPage, currentQuery);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

let debounceTimer;
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        currentQuery = e.target.value.trim();
        currentPage = 1;
        fetchQuotes(currentPage, currentQuery);
    }, 300);
});

// Random quote modal
const randomModal = document.getElementById('random-modal');
const randomQuoteBtn = document.getElementById('random-quote-btn');
const randomModalClose = document.getElementById('random-modal-close');
const randomModalDone = document.getElementById('random-modal-done');
const randomAgainBtn = document.getElementById('random-again-btn');
const randomQuoteContent = document.getElementById('random-quote-content');

function closeRandomModal() {
    randomModal.hidden = true;
}

async function loadRandomQuote() {
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
        searchInput.value = '';
        fetchQuotes(currentPage, currentQuery);
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

fetchQuotes(currentPage, currentQuery);
