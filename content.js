async function init() {
    const userMatch = window.location.pathname.match(/\/users\/(\d+)\//);
    const gameMatch = window.location.pathname.match(/\/games\/(\d+)\//);
    
    let newTargetId = null;
    let newIsGame = false;
    
    if (userMatch) {
        newTargetId = userMatch[1];
        newIsGame = false;
    } else if (gameMatch) {
        newTargetId = gameMatch[1];
        newIsGame = true;
    } else {
        return;
    }

    if (newTargetId === targetId && newIsGame === targetIsGame && document.getElementById('hermivore-reviews-container')) return;
    
    targetId = newTargetId;
    targetIsGame = newIsGame;
    targetUsername = targetIsGame ? await fetchGameName(targetId) : await fetchUsername(targetId);
    
    bulkDeleteMode = false;
    bulkDeleteSelection.clear();

    disconnectActiveObserver();

    const tryInject = () => {
        const mainContent = document.querySelector('.content-main') || document.querySelector('main') || document.body;
        if (mainContent && !document.getElementById('hermivore-reviews-container')) {
            const isProfile = document.querySelector('.profile-header') || window.location.pathname.includes('/profile');
            const isGame = window.location.pathname.includes('/games/');
            
            if (isProfile || isGame) {
                UI.injectCSS();
                mainContent.insertAdjacentHTML('beforeend', UI.getReviewHTML());
                UI.applyTheme();
                attachEventListeners();
                if (targetIsGame) {
                    setupGameReviewsTab();
                    applyTabVisibility();
                }
                loadState().then(async () => {
                    UI.renderAuthState();
                    await loadReviews();
                });
                return true;
            }
        }
        return false;
    };

    if (!tryInject()) {
        const observer = new MutationObserver(() => {
            if (tryInject()) {
                activeObserver.disconnect();
                activeObserver = null;
            }
        });
        
        activeObserver = observer;
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

let lastPath = location.pathname;
new MutationObserver(() => {
    const path = location.pathname;
    if (path !== lastPath) {
        lastPath = path;
        const old = document.getElementById('hermivore-reviews-container');
        if (old) old.remove();
        const oldTab = document.getElementById('hr-tab-reviews');
        if (oldTab) oldTab.remove();
        reviewsTabActive = false;

        // NEW: undo any display:none we left on Roblox's tab content while on a game page
        const tc = document.querySelector('.tab-content') || document.querySelector('.rbx-tab-content');
        if (tc) tc.style.display = '';

        disconnectActiveObserver();

        if (path.match(/\/users\/(\d+)\//) || path.match(/\/games\/(\d+)\//)) init();
        else targetId = null;
    } else if (targetIsGame) {
        setupGameReviewsTab();
    }
}).observe(document, { subtree: true, childList: true });

init();