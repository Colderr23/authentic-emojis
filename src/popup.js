const ENABLE_DEV_UI = false; // Set to false to hide the toggle in public release

document.addEventListener('DOMContentLoaded', () => {
    const toggleContainer = document.getElementById('dev-panel-toggle-container');
    if (!toggleContainer) return;

    const toggleCheckbox = document.getElementById('dev-panel-toggle');

    if (ENABLE_DEV_UI) {
        toggleContainer.style.display = 'flex';

        // Load existing state
        chrome.storage.local.get(['showDevPanel']).then((result) => {
            // Default to true if not set
            const isVisible = result.showDevPanel !== undefined ? result.showDevPanel : true;
            toggleCheckbox.checked = isVisible;
        });

        // Listen for changes
        toggleCheckbox.addEventListener('change', (e) => {
            chrome.storage.local.set({ showDevPanel: e.target.checked });
        });
    } else {
        // If dev UI is explicitly disabled in build, always force the panel hidden in storage
        chrome.storage.local.set({ showDevPanel: false });
    }
});
