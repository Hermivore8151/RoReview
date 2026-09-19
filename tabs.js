function findGameTabBar() {
    return document.querySelector('#horizontal-tabs') ||
           document.querySelector('.tabs-horizontal ul') ||
           document.querySelector('ul[role="tablist"]');
}

function setupGameReviewsTab() {
    if (!targetIsGame) return false;
    if (document.getElementById('hr-tab-reviews')) return true;
    const tabList = findGameTabBar();
    if (!tabList) return false;

    const sample = tabList.querySelector('li');
    const li = document.createElement('li');
    li.id = 'hr-tab-reviews';
    if (sample) li.className = sample.className;

    const sampleLink = sample ? (sample.querySelector('a') || sample.querySelector('button')) : null;
    const link = document.createElement(sampleLink ? sampleLink.tagName.toLowerCase() : 'a');
    if (sampleLink) link.className = sampleLink.className;
    link.textContent = 'Reviews';
    link.href = '#';
    li.appendChild(link);

    [li, link].forEach(el => {
        el.className = String(el.className).split(/\s+/)
            .filter(c => c && !/active|selected|current/i.test(c)).join(' ');
    });

    tabList.appendChild(li);
    return true;
}

function applyTabVisibility() {
    const content = document.querySelector('.tab-content') || document.querySelector('.rbx-tab-content');
    const container = document.getElementById('hermivore-reviews-container');
    if (content) content.style.display = reviewsTabActive ? 'none' : '';
    if (container) container.style.display = reviewsTabActive ? '' : 'none';
}

function setReviewsTab(on) {
    reviewsTabActive = on;

    const tabList = findGameTabBar();
    if (tabList) {
        tabList.querySelectorAll('li').forEach(li => {
            const isOurs = li.id === 'hr-tab-reviews';
            const l = li.querySelector('a,button');
            if (isOurs) {
                li.classList.toggle('active', on);
                if (l) l.classList.toggle('active', on);
            } else if (on) {
                li.classList.remove('active');
                if (l) l.classList.remove('active');
            }
        });
    }

    applyTabVisibility();
    requestAnimationFrame(applyTabVisibility);
    setTimeout(applyTabVisibility, 50);

    if (on) {
        const container = document.getElementById('hermivore-reviews-container');
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

document.addEventListener('click', (e) => {
    if (!targetIsGame || !(e.target instanceof Element)) return;

    if (e.target.closest('#hr-tab-reviews')) {
        e.preventDefault();
        e.stopPropagation();
        setReviewsTab(true);
        return;
    }

    const tabList = findGameTabBar();
    if (tabList && tabList.contains(e.target) && reviewsTabActive) {
        setReviewsTab(false);
    }
}, true);

window.addEventListener('hashchange', () => { if (targetIsGame && reviewsTabActive) setReviewsTab(false); });
window.addEventListener('popstate',   () => { if (targetIsGame && reviewsTabActive) setReviewsTab(false); });