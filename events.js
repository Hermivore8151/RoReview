function attachEventListeners() {
    document.getElementById('hr-login-btn').onclick = login;
    document.getElementById('hr-logout-btn').onclick = logout;
    document.getElementById('hr-submit-review').onclick = submitReview;
    document.getElementById('hr-review-input').oninput = (e) => {
        document.getElementById('hr-char-count').textContent = e.target.value.length;
    };
    document.getElementById('hr-bulk-delete-btn').onclick = () => UI.toggleBulkMode(true);
    document.getElementById('hr-bulk-confirm').onclick = bulkDelete;
    document.getElementById('hr-bulk-cancel').onclick = () => UI.toggleBulkMode(false);

    document.querySelectorAll('.hr-profile-vote').forEach(btn => {
        btn.onclick = async () => {
            if (!currentUser) { login(); return; }
            await rateProfile(btn.dataset.vote);
        };
    });

    document.getElementById('hermivore-reviews-container').addEventListener('click', async (e) => {
        const target = e.target;

        if (target.classList.contains('btn-page')) { await UI.renderPage(parseInt(target.dataset.page)); return; }

        if (target.classList.contains('hr-block-btn')) {
            const author = parseInt(target.dataset.author);
            const isBlocked = target.dataset.blocked === 'true';
            if (!isBlocked && !confirm('Block this user from leaving new reviews on your profile?')) return;
            await setBlock(author, !isBlocked);
            return;
        }
        if (target.classList.contains('hr-unblock-btn')) {
            await setBlock(parseInt(target.dataset.author), false);
            return;
        }

        if (bulkDeleteMode && target.closest('.hr-review')) {
            const reviewEl = target.closest('.hr-review');
            const authorId = parseInt(reviewEl.dataset.authorId);
            if (bulkDeleteSelection.has(authorId)) {
                bulkDeleteSelection.delete(authorId);
            } else {
                bulkDeleteSelection.add(authorId);
            }
            await UI.renderPage(currentPage);
            return;
        }

        // --- VOTING (Fixed: Checks if it's a reply BEFORE treating it as a review) ---
        if (target.closest('.hr-vote-btn')) {
            if (!currentUser) { login(); return; }
            const btn = target.closest('.hr-vote-btn');
            const replyEl = target.closest('.hr-reply');
            
            if (replyEl) {
                // It's a reply vote
                const reviewEl = replyEl.closest('.hr-review');
                await rateReply(reviewEl.dataset.id, replyEl.dataset.replyId, btn.dataset.vote);
            } else {
                // It's a main review vote
                await rateReview(btn.closest('.hr-review').dataset.id, btn.dataset.vote);
            }
            return;
        }

        // --- REVIEW ACTIONS ---
        if (target.classList.contains('hr-delete-btn')) {
            await deleteReview(target.closest('.hr-review').dataset.id);
            return;
        }

        if (target.classList.contains('hr-edit-btn')) {
            const reviewEl = target.closest('.hr-review');
            const body = reviewEl.querySelector('.hr-review-body');
            const textarea = reviewEl.querySelector('.hr-edit-textarea');
            if (textarea.style.display === 'none') {
                body.style.display = 'none';
                textarea.style.display = 'block';
                target.textContent = 'Save';
            } else if (textarea.value.trim()) {
                await editReview(reviewEl.dataset.id, textarea.value.trim());
            }
            return;
        }

        // --- REPLY ACTIONS ---
        
        // Main "Reply" button on a review (Clears any chaining context)
        if (target.classList.contains('hr-toggle-reply-btn')) {
            const rId = target.dataset.reviewId;
            replyContext = null; 
            if (activeReplyInputs.has(rId)) activeReplyInputs.delete(rId);
            else activeReplyInputs.add(rId);
            await UI.renderPage(currentPage);
            return;
        }

        // "Reply" button on a reply (Sets chaining context)
        if (target.classList.contains('hr-open-reply-box')) {
            replyContext = {
                reviewId: target.dataset.reviewId,
                replyId: target.dataset.replyId,
                name: target.dataset.name,
            };
            activeReplyInputs.add(target.dataset.reviewId);
            await UI.renderPage(currentPage);
            // Focus the textarea after render
            const box = document.querySelector(`.hr-review[data-id="${replyContext.reviewId}"] .hr-reply-input`);
            if (box) box.focus();
            return;
        }

        // Cancel chaining context
        if (target.classList.contains('hr-cancel-reply-context')) {
            replyContext = null;
            await UI.renderPage(currentPage);
            return;
        }

        // Submit Reply
        if (target.classList.contains('hr-submit-reply')) {
            const rId = target.dataset.reviewId;
            // Safely find the textarea within the same container
            const container = target.closest('.hr-reply-input-container');
            const input = container ? container.querySelector('.hr-reply-input') : null;
            
            if (input) {
                const replyTo = (replyContext && replyContext.reviewId === rId) ? replyContext.replyId : null;
                await submitReply(rId, input.value, replyTo);
                replyContext = null;
                activeReplyInputs.delete(rId);
                await UI.renderPage(currentPage);
            }
            return;
        }

        // Expand Replies
        if (target.classList.contains('hr-expand-replies')) {
            expandedReplies.add(target.dataset.reviewId);
            await UI.renderPage(currentPage);
            return;
        }

        // Reply Delete
        if (target.classList.contains('hr-delete-reply-btn')) {
            const replyEl = target.closest('.hr-reply');
            const reviewEl = replyEl.closest('.hr-review');
            await deleteReply(reviewEl.dataset.id, replyEl.dataset.replyId);
            return;
        }

        // Reply Edit
        if (target.classList.contains('hr-edit-reply-btn')) {
            const replyEl = target.closest('.hr-reply');
            const reviewEl = replyEl.closest('.hr-review');
            const body = replyEl.querySelector('.hr-review-body');
            const textarea = replyEl.querySelector('.hr-edit-textarea');
            
            if (textarea.style.display === 'none') {
                body.style.display = 'none';
                textarea.style.display = 'block';
                target.textContent = 'Save';
            } else if (textarea.value.trim()) {
                await editReply(reviewEl.dataset.id, replyEl.dataset.replyId, textarea.value.trim());
            }
            return;
        }
    });
}