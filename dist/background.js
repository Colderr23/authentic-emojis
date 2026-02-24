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
/*!****************************!*\
  !*** ./src/background.mjs ***!
  \****************************/
__webpack_require__.r(__webpack_exports__);
let isEnabled = true;

// On startup, we can just use the default icon.
chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setIcon({ path: "icon_enabled.png" });
});

chrome.action.onClicked.addListener(async (tab) => {
    isEnabled = !isEnabled;
    const iconBase = isEnabled ? "icon_enabled.png" : "icon_disabled.png";
    const title = isEnabled ? "LinkedIn Face Tracker: ON" : "LinkedIn Face Tracker: OFF";

    // Update the extension icon
    chrome.action.setIcon({ path: iconBase });
    chrome.action.setTitle({ title: title });

    // Broadcast the new state to all active LinkedIn tabs
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
    for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { type: 'TOGGLE_EXTENSION', enabled: isEnabled }).catch(() => {
            // Ignore errors for tabs without content scripts injected
        });
    }
});

/******/ })()
;
//# sourceMappingURL=background.js.map