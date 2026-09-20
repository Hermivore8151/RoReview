const API_BASE = 'https://hermivore.cat';
async function remoteFetch(url, options = {}) {
    const res = await chrome.runtime.sendMessage({ type: 'fetch', url, options });
    return { ok: res.ok, status: res.status, json: async () => res.data };
}
const REVIEWS_PER_PAGE = 10;
const FALLBACK_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#c8ccd0"/><circle cx="24" cy="18" r="9" fill="#9aa0a6"/><path d="M6 44c2-10 10-15 18-15s16 5 18 15z" fill="#9aa0a6"/></svg>`
);

let currentUser = null;
let targetId = null;
let targetIsGame = false;
let reviewsTabActive = false;
let targetUsername = '';
let allReviews = [];
let expandedReplies = new Set();
let activeReplyInputs = new Set();
let replyContext = null; // { reviewId, replyId, name } when replying to a specific reply
let profileRating = { up: [], down: [] };
let currentPage = 1;
let activeObserver = null;
let bulkDeleteMode = false;
let bulkDeleteSelection = new Set();
let blockedUsers = [];
let viewerBlocked = false;
const avatarCache = {};
const usernameCache = {};

async function loadState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['session_token', 'user_id', 'username'], (result) => {
            if (result.session_token) {
                currentUser = { id: result.user_id, name: result.username, session_token: result.session_token };
            }
            resolve();
        });
    });
}

async function saveState() {
    return new Promise((resolve) => {
        chrome.storage.local.set({
            session_token: currentUser.session_token,
            user_id: currentUser.id,
            username: currentUser.name
        }, resolve);
    });
}

function logout() {
    chrome.storage.local.remove(['session_token', 'user_id', 'username'], () => {
        currentUser = null;
        UI.renderAuthState();
        UI.updateSummary();
        UI.renderPage();
    });
}

function disconnectActiveObserver() {
    if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
    }
}