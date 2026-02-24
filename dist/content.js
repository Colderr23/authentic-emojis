/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
/*!*************************!*\
  !*** ./src/content.mjs ***!
  \*************************/
__webpack_require__.r(__webpack_exports__);
console.log("LinkedIn Face Tracker: Content script loaded (v2.0.0 Sandbox).");

function createTrackerIframe() {
    if (document.getElementById('face-tracker-iframe')) return;

    const iframe = document.createElement('iframe');
    iframe.id = 'face-tracker-iframe';
    iframe.src = chrome.runtime.getURL('sandbox.html');
    iframe.allow = "camera; microphone";

    // Style the iframe to act as the floating window
    Object.assign(iframe.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '240px',
        height: '420px',
        border: 'none',
        zIndex: '2147483647',
        backgroundColor: 'transparent'
    });

    document.body.appendChild(iframe);
    console.log("LinkedIn Face Tracker: Iframe injected.");
}

// Listen for messages from the sandbox
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'EXPRESSION_DETECTED') {
        const { expression, emoji } = event.data;

        // Skip neutral
        if (emoji !== '😐') {
            injectEmojiIntoActivePost(emoji);
        }
    } else if (event.data && event.data.type === 'SANDBOX_READY') {
        // When sandbox boots, send it the current dev panel visibility preference
        chrome.storage.local.get(['showDevPanel']).then((result) => {
            const isVisible = result.showDevPanel !== undefined ? result.showDevPanel : true;
            event.source.postMessage({ type: 'TOGGLE_DEV_PANEL', isVisible }, '*');
        });
    }
});

// Listen for live toggle changes from the popup
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.showDevPanel) {
        const iframe = document.getElementById('face-tracker-iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'TOGGLE_DEV_PANEL', isVisible: changes.showDevPanel.newValue }, '*');
        }
    }
});

let activePost = null;
let isPaused = false;
let lastReactedPost = null;

// Track the most central post on scroll
function updateActivePost() {
    // Select the second parent div above the feed-shared-update-v2 element
    const posts = document.querySelectorAll('.scaffold-finite-scroll__content div:has(> div > .feed-shared-update-v2)');

    if (posts.length === 0) return;

    const viewportCenter = window.innerHeight / 2;
    let closestPost = null;
    let minDistance = Infinity;

    posts.forEach(post => {
        const rect = post.getBoundingClientRect();

        // Calculate the center of the post relative to viewport
        const postCenter = rect.top + rect.height / 2;
        const distance = Math.abs(viewportCenter - postCenter);

        if (distance < minDistance) {
            minDistance = distance;
            closestPost = post;
        }
    });

    // Update highlights
    if (closestPost !== activePost) {
        if (activePost) {
            activePost.style.boxShadow = '';
            activePost.style.borderRadius = '';
            activePost.style.transition = '';
        }

        activePost = closestPost;

        if (activePost) {
            activePost.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
            // Use a clean elevation shadow to make the card "float" above the feed
            // This is instantly noticeable but retains the native, colorless UI feel
            activePost.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1)';
            activePost.style.borderRadius = '8px';
        }
    }
}

let scrollTimeout;
window.addEventListener('scroll', () => {
    if (isPaused) return; // Pause tracking during injections to avoid highlight jumps
    window.clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateActivePost, 100); // 100ms debounce
}, { passive: true });

function injectEmojiIntoActivePost(emoji) {
    if (!activePost) {
        console.warn("LinkedIn Face Tracker: No active post selected.");
        return;
    }

    if (activePost === lastReactedPost) {
        console.log("LinkedIn Face Tracker: Already reacted to current active post. Ignoring.");
        return;
    }

    // Mark this post as the last reacted one
    lastReactedPost = activePost;

    // Pause scroll highlighting for 3 seconds to avoid jumping when comment UI expands/scrolls
    isPaused = true;
    setTimeout(() => {
        isPaused = false;
    }, 3000);

    // Attempt to find the comment box in the active post
    let commentBox = activePost.querySelector('.ql-editor[role="textbox"]');

    if (!commentBox) {
        // Comment box might be closed. Try to click the "Comment" button first.
        const commentBtns = Array.from(activePost.querySelectorAll('button')).filter(btn => {
            const label = btn.getAttribute('aria-label');
            return label && (label.toLowerCase().includes('comment') || label.toLowerCase().includes('reply'));
        });

        if (commentBtns.length > 0) {
            commentBtns[0].click();
            // Wait for React to render the comment box, then inject
            setTimeout(() => {
                commentBox = activePost.querySelector('.ql-editor[role="textbox"]');
                if (commentBox) {
                    insertTextIntoEditor(commentBox, emoji);
                } else {
                    console.warn("LinkedIn Face Tracker: Could not find comment box even after clicking comment button.");
                }
            }, 400); // 400ms delay for UI render
        } else {
            console.warn("LinkedIn Face Tracker: Could not find a Comment button to open.");
        }
    } else {
        insertTextIntoEditor(commentBox, emoji);
    }
}

function insertTextIntoEditor(editor, text) {
    // Focus the editor so execCommand targets the correct element,
    // but use preventScroll so the browser doesn't snap-scroll and ruin the activePost highlighting.
    editor.focus({ preventScroll: true });

    // Most reliable way to inject into React controlled contenteditable elements
    const success = document.execCommand('insertText', false, text);

    if (!success) {
        // Fallback for some browsers
        editor.innerHTML += text;
    }

    // Dispatch input events to inform React/Quill of the change
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    // Auto-submit the comment using a retry loop
    // We delay and retry to give LinkedIn's React app time to enable the button after the input event
    let retries = 0;
    const maxRetries = 5;

    function trySubmit() {
        if (!activePost) return;

        const container = activePost.querySelector('.comments-comment-box') || activePost;
        if (container) {
            const submitBtn = container.querySelector('button.comments-comment-box__submit-button--cr');

            // Wait for button to exist and verify it's not disabled
            if (submitBtn) {
                // Sometimes LinkedIn leaves the 'disabled' attribute even if visually ready
                if (submitBtn.hasAttribute('disabled')) {
                    submitBtn.removeAttribute('disabled');
                }

                submitBtn.click();
                console.log("LinkedIn Face Tracker: Auto-submitted comment.", retries);
                return; // Success
            }
        }

        retries++;
        if (retries < maxRetries) {
            setTimeout(trySubmit, 300); // Retry every 300ms
        } else {
            console.warn("LinkedIn Face Tracker: Submit button not found after retries.");
        }
    }

    setTimeout(trySubmit, 300);
}

// Start
createTrackerIframe();

/******/ })()
;
//# sourceMappingURL=content.js.map