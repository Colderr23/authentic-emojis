import { FilesetResolver, FaceLandmarker, HandLandmarker, ImageClassifier } from '@mediapipe/tasks-vision';

console.log("Sandbox: Script loaded. Complex Emotion mode.");

// UI Elements
const cameraStatusEl = document.getElementById('camera-status');
const trackingStatusEl = document.getElementById('tracking-status');
const handStatusEl = document.getElementById('hand-status');
const objectStatusEl = document.getElementById('object-status');
const expressionTextEl = document.getElementById('expression-text');
const testModeCheckbox = document.getElementById('test-mode');
const floatingEmojiEl = document.getElementById('floating-emoji');
const video = document.getElementById('webcam');

let faceLandmarker;
let handLandmarker;
let imageClassifier;
let lastVideoTime = -1;

let faceResults = undefined;
let handResults = undefined;
let classifierResults = undefined;

let tracking = false;
let lastFaceUpdate = 0;
let lastHandUpdate = 0;
let lastObjectUpdate = 0;

// Listen for dynamic UI toggles from the parent content script
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'TOGGLE_DEV_PANEL') {
        const statusContainer = document.getElementById('status-container');
        const videoContainer = document.getElementById('video-container');

        if (statusContainer) {
            statusContainer.style.display = event.data.isVisible ? 'block' : 'none';
        }
    }
});

function updateStatus(element, isOn, tooltip = "") {
    if (element) {
        element.className = isOn ? 'status-value status-on' : 'status-value status-off';
        if (tooltip) element.title = tooltip;
    }
}

async function initializeLandmarkers() {
    console.log("Sandbox: Initializing Landmarkers...");
    try {
        const wasmDir = "wasm/";
        const faceModelPath = "models/face_landmarker.task";
        const handModelPath = "models/hand_landmarker.task";

        console.log("Sandbox: Loading fileset resolver...");
        const filesetResolver = await FilesetResolver.forVisionTasks(wasmDir);

        console.log("Sandbox: Creating FaceLandmarker...");
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: faceModelPath,
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
        });

        console.log("Sandbox: Creating HandLandmarker...");
        handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: handModelPath,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });

        console.log("Sandbox: Landmarkers created.");

        try {
            console.log("Sandbox: Creating ImageClassifier...");
            const objModelPath = "models/efficientnet_lite0.tflite";
            imageClassifier = await ImageClassifier.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: objModelPath,
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                maxResults: 3
            });
            console.log("Sandbox: ImageClassifier created.");
        } catch (e) {
            console.error("Sandbox: Failed to init ImageClassifier, continuing without it.", e);
        }

        startWebcam();
    } catch (e) {
        console.error("Sandbox: Failed to init Landmarkers", e);
        updateStatus(trackingStatusEl, false, "Init Error: " + e.message);
        expressionTextEl.textContent = "Error: " + e.message;
    }
}

async function startWebcam() {
    try {
        console.log("Sandbox: Requesting camera...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.addEventListener('loadeddata', predictWebcam);
        tracking = true;
        updateStatus(cameraStatusEl, true);
        console.log("Sandbox: Webcam started.");
    } catch (err) {
        console.error("Sandbox: Error accessing webcam", err);
        updateStatus(cameraStatusEl, false, "Camera Error: " + err.message);
        expressionTextEl.textContent = "Camera Error";
    }
}

async function predictWebcam() {
    if (!faceLandmarker || !handLandmarker || !tracking) return;

    let now = performance.now();
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        faceResults = faceLandmarker.detectForVideo(video, now);
        handResults = handLandmarker.detectForVideo(video, now);
        if (imageClassifier) {
            try {
                classifierResults = imageClassifier.classifyForVideo(video, now);
            } catch (e) { /* ignore */ }
        }
    }

    let timeNow = Date.now();

    let hasGlasses = false;
    if (imageClassifier && classifierResults && classifierResults.classifications && classifierResults.classifications.length > 0) {
        if (timeNow - lastObjectUpdate > 500 && objectStatusEl) {
            updateStatus(objectStatusEl, true);
            lastObjectUpdate = timeNow;
        }

        const categories = classifierResults.classifications[0].categories;
        hasGlasses = categories.some(d => {
            const cat = d.categoryName.toLowerCase();
            return d.score > 0.15 && (cat.includes("glass") || cat.includes("spectacle") || cat.includes("shade"));
        });
    } else if (objectStatusEl) {
        if (timeNow - lastObjectUpdate > 1000) {
            updateStatus(objectStatusEl, false);
        }
    }

    // Process Face & Hand
    if (faceResults && faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0 && faceResults.faceBlendshapes[0].categories) {
        if (timeNow - lastFaceUpdate > 500) {
            updateStatus(trackingStatusEl, true);
            lastFaceUpdate = timeNow;
        }

        const faceBlendshapes = faceResults.faceBlendshapes[0].categories;
        let isHandNearFace = false;

        if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
            if (timeNow - lastHandUpdate > 500) {
                updateStatus(handStatusEl, true);
                lastHandUpdate = timeNow;
            }

            // Proximity check for hand and face
            if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
                const faceLms = faceResults.faceLandmarks[0];
                const handLms = handResults.landmarks[0];

                let minFX = 1, maxFX = 0, minFY = 1, maxFY = 0;
                for (let l of faceLms) {
                    if (l.x < minFX) minFX = l.x;
                    if (l.x > maxFX) maxFX = l.x;
                    if (l.y < minFY) minFY = l.y;
                    if (l.y > maxFY) maxFY = l.y;
                }

                let hSumX = 0, hSumY = 0;
                for (let l of handLms) {
                    hSumX += l.x;
                    hSumY += l.y;
                }
                const hCenterX = hSumX / handLms.length;
                const hCenterY = hSumY / handLms.length;

                // Strict check: Is the Hand Center physically overlapping with the Face Bounding Box?
                // The hand must be ON the face, not just near it
                if (hCenterX >= minFX && hCenterX <= maxFX &&
                    hCenterY >= minFY && hCenterY <= maxFY) {
                    isHandNearFace = true;
                }
            }
        } else {
            if (timeNow - lastHandUpdate > 1000) {
                updateStatus(handStatusEl, false);
            }
        }

        detectExpression(faceBlendshapes, isHandNearFace, hasGlasses);
    } else {
        if (timeNow - lastFaceUpdate > 1000) {
            updateStatus(trackingStatusEl, false, "No face detected");
        }
        if (timeNow - lastHandUpdate > 1000) {
            updateStatus(handStatusEl, false);
        }
    }

    requestAnimationFrame(predictWebcam);
}

let currentExpression = 'neutral';
let currentEmoji = '😐';

let pendingExpression = 'neutral';
let pendingEmoji = '😐';
let pendingExpressionStartTime = 0;
const HOLD_DURATION_MS = 200; // Require user to hold the expression for 200ms
let requireNeutralReset = false; // Prevents back-to-back expressions without returning to neutral

function detectExpression(blendshapes, hasHand, hasGlasses) {
    const smileLeft = blendshapes.find(c => c.categoryName === 'mouthSmileLeft')?.score || 0;
    const smileRight = blendshapes.find(c => c.categoryName === 'mouthSmileRight')?.score || 0;

    const frownLeft = blendshapes.find(c => c.categoryName === 'mouthFrownLeft')?.score || 0;
    const frownRight = blendshapes.find(c => c.categoryName === 'mouthFrownRight')?.score || 0;

    const browInnerUp = blendshapes.find(c => c.categoryName === 'browInnerUp')?.score || 0;
    const browDownLeft = blendshapes.find(c => c.categoryName === 'browDownLeft')?.score || 0;
    const browDownRight = blendshapes.find(c => c.categoryName === 'browDownRight')?.score || 0;

    // New blendshapes for 🤨, 😳
    const browOuterUpLeft = blendshapes.find(c => c.categoryName === 'browOuterUpLeft')?.score || 0;
    const browOuterUpRight = blendshapes.find(c => c.categoryName === 'browOuterUpRight')?.score || 0;
    const eyeWideLeft = blendshapes.find(c => c.categoryName === 'eyeWideLeft')?.score || 0;
    const eyeWideRight = blendshapes.find(c => c.categoryName === 'eyeWideRight')?.score || 0;

    const smileScore = (smileLeft + smileRight) / 2;
    const frownScore = (frownLeft + frownRight) / 2;
    const browFurrowScore = (browDownLeft + browDownRight) / 2;

    const smirkDiff = Math.abs(smileLeft - smileRight);
    const browRaiseDiff = Math.abs(browOuterUpLeft - browOuterUpRight);
    const browUpScore = (browOuterUpLeft + browOuterUpRight) / 2;
    const wideEyeScore = (eyeWideLeft + eyeWideRight) / 2;

    let newExpression = 'neutral';
    let newEmoji = '😐';

    if (hasGlasses) {
        newExpression = 'sunglasses';
        newEmoji = '😎';
    } else if (wideEyeScore > 0.15 || (browOuterUpLeft > 0.2 && browOuterUpRight > 0.2)) {
        // Both eyes wide open OR both eyebrows explicitly raised = surprised/flushed
        newExpression = 'flushed';
        newEmoji = '😳';
    } else if (browRaiseDiff > 0.1 && Math.max(browOuterUpLeft, browOuterUpRight) > 0.15) {
        // Since both brows raised is caught above, any significant difference here means ONE brow is raised
        newExpression = 'skeptical';
        newEmoji = '🤨';
    } else if (smirkDiff > 0.1 && Math.max(smileLeft, smileRight) > 0.15) {
        // One side of mouth smiling significantly more (smirk)
        newExpression = 'smirk';
        newEmoji = '😏';
    } else if (hasHand && smileScore < 0.3 && frownScore < 0.4) {
        // If a hand is visible and we aren't strongly smiling or frowning, assume "thinking"
        newExpression = 'thinking';
        newEmoji = '🤔';
    } else if (smileScore > 0.6) {
        newExpression = 'big_smile';
        newEmoji = '😃';
    } else if (smileScore > 0.15) {
        newExpression = 'slight_smile';
        newEmoji = '🙂';
    } else if (frownScore > 0.3 || (browFurrowScore > 0.5 && browInnerUp > 0.2)) {
        // High frown OR furrowed brows with inner brows up (classic confused face)
        newExpression = 'confused';
        newEmoji = '😕';
    }

    let timeNow = Date.now();

    if (newExpression !== pendingExpression) {
        // Expression changed. Reset the pending timer.
        pendingExpression = newExpression;
        pendingEmoji = newEmoji;
        pendingExpressionStartTime = timeNow;
    } else {
        // The expression has been held. Check how long it's been held.
        if (timeNow - pendingExpressionStartTime >= HOLD_DURATION_MS) {
            // Held long enough! If it's different from the CURRENT locked-in expression, update and broadcast.
            if (pendingExpression !== currentExpression) {

                // If we just captured an expression, MUST return to neutral first
                if (requireNeutralReset && pendingExpression !== 'neutral') {
                    return; // Ignore the held expression until they reset to neutral
                }

                currentExpression = pendingExpression;
                currentEmoji = pendingEmoji;

                // Lock out further non-neutral captures until a neutral reset occurs
                requireNeutralReset = (currentExpression !== 'neutral');

                if (!testModeCheckbox || !testModeCheckbox.checked) {
                    window.parent.postMessage({
                        type: 'EXPRESSION_DETECTED',
                        expression: currentExpression,
                        emoji: currentEmoji
                    }, '*');
                } else {
                    console.log(`Sandbox [TEST MODE]: Captured ${currentEmoji} (${currentExpression}) but did not inject.`);
                }

                expressionTextEl.textContent = currentEmoji;
                expressionTextEl.style.fontSize = '24px';

                // Fire expanding animation over the video feed (but not for neutral resets)
                if (floatingEmojiEl && currentEmoji !== '😐') {
                    floatingEmojiEl.textContent = currentEmoji;
                    floatingEmojiEl.classList.remove('animate-pop');
                    // Force a reflow so the animation restarts
                    void floatingEmojiEl.offsetWidth;
                    floatingEmojiEl.classList.add('animate-pop');
                }
            }
        }
    }
}

// Request initial dev panel state
window.parent.postMessage({ type: 'SANDBOX_READY' }, '*');

// Start immediately
initializeLandmarkers();
