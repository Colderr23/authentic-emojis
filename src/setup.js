console.log("Setup script loaded.");

document.getElementById('grant-btn').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log("Permission granted!");
        
        // Stop stream immediately, we just needed the permission bit flipped
        stream.getTracks().forEach(track => track.stop());
        
        document.getElementById('grant-btn').style.display = 'none';
        document.getElementById('success-msg').style.display = 'block';
        document.getElementById('error-msg').style.display = 'none';
        
        // Notify background?
        // chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
        
    } catch (err) {
        console.error("Permission denied:", err);
        document.getElementById('error-msg').textContent = "Error: " + err.message + ". Please verify browser permissions.";
        document.getElementById('error-msg').style.display = 'block';
    }
});
