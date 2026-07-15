// Global variables
let originalImageFile = null;
let enhancedImageBlob = null;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const uploadSection = document.getElementById('uploadSection');
const settingsPanel = document.getElementById('settingsPanel');
const settingsToggle = document.getElementById('settingsToggle');
const settingsContent = document.getElementById('settingsContent');
const enhanceBtn = document.getElementById('enhanceBtn');
const processingSection = document.getElementById('processingSection');
const resultsSection = document.getElementById('resultsSection');
const comparisonContainer = document.getElementById('comparisonContainer');
const downloadBtn = document.getElementById('downloadBtn');
const processAnotherBtn = document.getElementById('processAnotherBtn');
const themeToggle = document.getElementById('themeToggle');

// Settings elements
const faceAlignCheckbox = document.getElementById('faceAlign');
const backgroundEnhanceCheckbox = document.getElementById('backgroundEnhance');
const faceUpsampleCheckbox = document.getElementById('faceUpsample');
const upscaleSlider = document.getElementById('upscale');
const upscaleValue = document.getElementById('upscaleValue');
const fidelitySlider = document.getElementById('fidelity');
const fidelityValue = document.getElementById('fidelityValue');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Run the (async) TMA init in the background so we never block the
    // rest of the page — including the manual theme toggle, which
    // would otherwise be unreachable if the SDK load is slow.
    initializeTelegramMiniApp();
    initializeEventListeners();
    initializeTheme();
    setupSystemThemeListener();
    updateSliderValues();
});

// Initialize event listeners
function initializeEventListeners() {
    // Upload area events
    uploadArea.addEventListener('click', () => imageInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // File input change
    imageInput.addEventListener('change', handleFileSelect);
    
    // Settings toggle
    settingsToggle.addEventListener('click', toggleAdvancedSettings);
    
    // Enhance button
    enhanceBtn.addEventListener('click', handleEnhanceImage);
    
    // Download button
    downloadBtn.addEventListener('click', handleDownload);
    
    // Process another button
    processAnotherBtn.addEventListener('click', resetApplication);
    
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Slider updates
    upscaleSlider.addEventListener('input', updateSliderValues);
    fidelitySlider.addEventListener('input', updateSliderValues);
    
    // Keyboard accessibility
    uploadArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            imageInput.click();
        }
    });
    
    // Make upload area focusable
    uploadArea.setAttribute('tabindex', '0');
}

// ============================================================
// Theme management
// ============================================================
const THEME_STORAGE_KEY = 'theme';
const THEME_USER_OVERRIDE_KEY = 'theme_user_override';

function getStoredTheme() {
    try { return localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { return null; }
}

function setStoredTheme(theme) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) {}
}

function getUserOverride() {
    try { return localStorage.getItem(THEME_USER_OVERRIDE_KEY) === '1'; } catch (e) { return false; }
}

function setUserOverride(isOverride) {
    try { localStorage.setItem(THEME_USER_OVERRIDE_KEY, isOverride ? '1' : '0'); } catch (e) {}
}

function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveInitialTheme() {
    // 1. If the user has manually toggled before, respect that
    if (getUserOverride()) {
        return getStoredTheme() || (systemPrefersDark() ? 'dark' : 'light');
    }
    // 2. If we are inside a Telegram webview AND the SDK has loaded
    //    with a colorScheme, trust it first. We must use the
    //    isTelegramMiniApp() guard — not just `window.Telegram` —
    //    because in a regular browser window.Telegram can be present
    //    from a leaked SDK script.
    if (isTelegramMiniApp()
        && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.colorScheme) {
        return window.Telegram.WebApp.colorScheme === 'dark' ? 'dark' : 'light';
    }
    // 3. Otherwise fall back to OS preference
    return systemPrefersDark() ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    setStoredTheme(theme);
    updateThemeIcon(theme);
    // Sync the meta theme-color so mobile chrome matches
    const themeColor = theme === 'dark' ? '#0f172a' : '#6366f1';
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
        el.setAttribute('content', themeColor);
    });
}

function initializeTheme() {
    const theme = resolveInitialTheme();
    applyTheme(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    setUserOverride(true); // mark this as a deliberate user choice
    // Light haptic on Telegram (only when we are actually inside TMA)
    if (isTelegramMiniApp()
        && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        try { window.Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (e) {}
    }
}

function updateThemeIcon(theme) {
    if (!themeToggle) return;
    const icon = themeToggle.querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Live-update theme when the OS preference changes (only if the user
// has NOT manually picked a theme).
function setupSystemThemeListener() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
        if (getUserOverride()) return; // user already decided, leave it alone
        applyTheme(systemPrefersDark() ? 'dark' : 'light');
    };
    if (mq.addEventListener) {
        mq.addEventListener('change', handler);
    } else if (mq.addListener) {
        mq.addListener(handler); // older Safari
    }
}

// ============================================================
// Telegram Mini App integration
// ============================================================

// Telegram appends one of these query parameters to the URL when the
// page is opened inside a Telegram webview. They are added by the
// Telegram client itself, so they are a reliable signal that the page
// is actually running inside a TMA — unlike window.Telegram.WebApp
// which can leak into the global scope via the SDK script even in
// regular browsers.
const _TMA_URL_PARAMS = ['tgWebAppData', 'tgWebAppVersion', 'tgWebAppPlatform', 'tgWebAppThemeParams'];

function _looksLikeTelegramWebviewUrl() {
    if (typeof window === 'undefined' || !window.location) return false;
    const search = (window.location.search || '').toLowerCase();
    if (!search) return false;
    for (const key of _TMA_URL_PARAMS) {
        if (search.indexOf(key.toLowerCase() + '=') !== -1) return true;
    }
    return false;
}

// The User-Agent of Telegram's webview contains the substring "Telegram"
// (Android webview reports "Telegram-Android/<ver>" / iOS reports
// "Telegram-iOS/<ver>"). This is a secondary signal — useful as a
// belt-and-suspenders check but never on its own, since user-agents are
// trivially spoofable and a few browsers also have "Telegram" in their
// UA (older versions of some webview wrappers). Combined with the URL
// param check, false positives are extremely unlikely.
function _userAgentMentionsTelegram() {
    return typeof navigator !== 'undefined'
        && /Telegram/i.test(navigator.userAgent || '');
}

// A cached promise so we only attempt to load the SDK once. The SDK
// is only fetched when we have a real reason to believe the page is
// inside a Telegram webview, so a regular browser never sees
// `window.Telegram` and the rest of the code can trust isTelegramMiniApp.
let _tmaSdkPromise = null;
function _loadTelegramSdk() {
    if (_tmaSdkPromise) return _tmaSdkPromise;
    _tmaSdkPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://telegram.org/js/telegram-web-app.js';
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
    return _tmaSdkPromise;
}

function isTelegramMiniApp() {
    // Cheap synchronous check: are we even in a Telegram webview by
    // URL or UA? If not, we are DEFINITELY not in a TMA — regardless
    // of whether window.Telegram happens to exist.
    return _looksLikeTelegramWebviewUrl() || _userAgentMentionsTelegram();
}

async function ensureTelegramSdkLoaded() {
    if (!isTelegramMiniApp()) return null;
    if (window.Telegram && window.Telegram.WebApp) return window.Telegram.WebApp;
    const ok = await _loadTelegramSdk();
    if (ok && window.Telegram && window.Telegram.WebApp) {
        return window.Telegram.WebApp;
    }
    return null;
}

async function initializeTelegramMiniApp() {
    // Only fetch the Telegram SDK if the URL / UA says we are inside
    // a Telegram webview. This is the bit that fixes the bug where
    // browsers like Brave and Comet would otherwise see window.Telegram
    // and mistakenly enter TMA mode.
    const tma = await ensureTelegramSdkLoaded();

    if (tma) {
        // 1. Mark the root so CSS can adapt
        document.documentElement.classList.add('tma-mode');
        document.body.classList.add('tma-mode');

        // 2. Tell Telegram we're ready (hides the loading splash)
        try { tma.ready(); } catch (e) {}

        // 3. Expand to full available height
        try { tma.expand(); } catch (e) {}

        // 4. Apply Telegram theme params as CSS variables (header bg, etc.)
        try {
            if (tma.themeParams) {
                const root = document.documentElement.style;
                const tp = tma.themeParams;
                if (tp.bg_color)        root.setProperty('--tma-bg', tp.bg_color);
                if (tp.secondary_bg_color) root.setProperty('--tma-secondary-bg', tp.secondary_bg_color);
                if (tp.text_color)      root.setProperty('--tma-text', tp.text_color);
                if (tp.hint_color)      root.setProperty('--tma-hint', tp.hint_color);
                if (tp.button_color)    root.setProperty('--tma-button', tp.button_color);
                if (tp.button_text_color) root.setProperty('--tma-button-text', tp.button_text_color);
                if (tp.link_color)      root.setProperty('--tma-link', tp.link_color);
            }
        } catch (e) {}

        // 5. Honor Telegram's colorScheme if the user hasn't manually toggled
        try {
            if (!getUserOverride() && tma.colorScheme) {
                applyTheme(tma.colorScheme === 'dark' ? 'dark' : 'light');
            }
        } catch (e) {}

        // 6. React to Telegram theme events
        try {
            tma.onEvent('themeChanged', () => {
                if (!getUserOverride() && tma.colorScheme) {
                    applyTheme(tma.colorScheme === 'dark' ? 'dark' : 'light');
                }
            });
        } catch (e) {}

        // 7. Safe-area insets from Telegram viewport
        try {
            if (typeof tma.viewportStableHeight === 'number') {
                document.documentElement.style.setProperty('--tma-viewport-h', tma.viewportStableHeight + 'px');
            }
            if (typeof tma.safeAreaInset === 'object' && tma.safeAreaInset) {
                document.documentElement.style.setProperty('--tma-safe-top', (tma.safeAreaInset.top || 0) + 'px');
                document.documentElement.style.setProperty('--tma-safe-bottom', (tma.safeAreaInset.bottom || 0) + 'px');
            }
        } catch (e) {}

        // 8. BackButton: if shown, closing the app returns to the bot
        try {
            tma.BackButton.show();
            tma.BackButton.onClick(() => {
                try { tma.close(); } catch (e) { window.close(); }
            });
        } catch (e) {}

        // 9. Re-route every external link through Telegram so it opens
        //    in the in-app browser (or external browser) instead of a new tab.
        rerouteExternalLinksForTelegram(tma);

        // 10. Show the "Running in Telegram" banner unless user dismissed it
        try {
            if (localStorage.getItem('tma_banner_dismissed') !== '1') {
                showTmaBanner();
            }
        } catch (e) {}

        // Wire up the close button independently of banner display logic
        // so that re-renders or caching can't strand it without a handler.
        wireTmaBannerDismiss();

        // 11. Disable the page-zoom gesture that conflicts with Telegram pull-to-close
        try {
            document.addEventListener('gesturestart', e => e.preventDefault());
        } catch (e) {}
    }

    // Always-on safety nets (work outside Telegram too):

    // If the file picker / drag-and-drop isn't supported in this context,
    // disable those UI paths and surface a clear message instead of erroring.
    if (!window.File || !window.FileReader || !window.FileList) {
        const area = document.getElementById('uploadArea');
        if (area) {
            area.style.pointerEvents = 'none';
            area.style.opacity = '0.6';
        }
    }
}

/**
 * Show the "Running in Telegram" banner. Idempotent.
 */
function showTmaBanner() {
    const banner = document.getElementById('tmaBanner');
    if (!banner) return;
    banner.hidden = false;
    // Force layout so the close button is interactable immediately in TMA
    // webviews (some Android webviews delay the first paint of newly-shown
    // elements which can swallow the very first tap).
    void banner.offsetHeight;
}

/**
 * Wire the banner's close button. Called once at startup, and re-arms
 * itself after a successful dismiss so the banner stays gone.
 */
function wireTmaBannerDismiss() {
    const banner = document.getElementById('tmaBanner');
    const closeBtn = document.getElementById('tmaBannerClose');
    if (!banner || !closeBtn) return;

    const dismiss = (event) => {
        // Block the global link-rerouter and any other delegated handlers
        // from seeing this click.
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
        banner.hidden = true;
        try { localStorage.setItem('tma_banner_dismissed', '1'); } catch (e) {}
    };

    // Use multiple event types for maximum compatibility with
    // Telegram's webviews (which can be flaky about click vs. touch).
    closeBtn.addEventListener('click', dismiss);
    closeBtn.addEventListener('touchend', dismiss, { passive: false });
    closeBtn.addEventListener('pointerup', dismiss);

    // Keyboard accessibility — Enter / Space on focused button.
    closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            dismiss(e);
        }
    });
}

function rerouteExternalLinksForTelegram(tma) {
    // Intercept clicks on links with target="_blank" so Telegram handles them
    document.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href) return;
        // Skip in-page anchors and javascript: links
        if (href.startsWith('#') || href.startsWith('javascript:')) return;
        // Only re-route fully-qualified http(s) links
        if (!/^https?:\/\//i.test(href)) return;
        e.preventDefault();
        try {
            if (link.target === '_blank' || link.hasAttribute('data-tma-external')) {
                tma.openLink(href, { try_instant_view: false });
            } else {
                tma.openLink(href);
            }
        } catch (err) {
            window.open(href, '_blank', 'noopener,noreferrer');
        }
    });
}


// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// File selection handlers
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file.');
        return;
    }
    
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
        showError('File size must be less than 10MB.');
        return;
    }
    
    // Show loading state while processing
    showImageProcessing();
    
    // Optimize image before setting as original
    optimizeImageForUpload(file).then(optimizedFile => {
        originalImageFile = optimizedFile;
        showSettingsPanel();
        updateUploadAreaWithPreview(optimizedFile);
        hideImageProcessing();
    }).catch(error => {
        console.error('Image optimization error:', error);
        // Fallback to original file if optimization fails
        originalImageFile = file;
        showSettingsPanel();
        updateUploadAreaWithPreview(file);
        hideImageProcessing();
    });
}

// Image optimization for better upload performance
function optimizeImageForUpload(file) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // Calculate optimal dimensions (max 2048px on longest side)
            const maxDimension = 2048;
            let { width, height } = img;
            
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width *= ratio;
                height *= ratio;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create a new file object with optimized data
                        const optimizedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(optimizedFile);
                    } else {
                        reject(new Error('Failed to optimize image'));
                    }
                },
                'image/jpeg',
                0.85 // 85% quality for good balance of size and quality
            );
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

function showImageProcessing() {
    const processingIndicator = document.createElement('div');
    processingIndicator.id = 'imageProcessing';
    processingIndicator.className = 'image-processing-overlay';
    processingIndicator.innerHTML = `
        <div class="processing-content">
            <div class="mini-spinner"></div>
            <span>Optimizing image...</span>
        </div>
    `;
    uploadArea.appendChild(processingIndicator);
}

function hideImageProcessing() {
    const processingIndicator = document.getElementById('imageProcessing');
    if (processingIndicator) {
        processingIndicator.remove();
    }
}

function updateUploadAreaWithPreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadArea.innerHTML = `
            <div class="upload-preview">
                <img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 8px; object-fit: cover;">
                <p style="margin-top: 1rem; color: var(--text-secondary);">${file.name}</p>
                <p style="color: var(--text-muted); font-size: 0.875rem;">Click to change image</p>
            </div>
        `;
    };
    reader.readAsDataURL(file);
}

function showSettingsPanel() {
    settingsPanel.style.display = 'block';
    settingsPanel.classList.add('slide-up');
}

// Settings management
function toggleAdvancedSettings() {
    const isExpanded = settingsContent.style.display !== 'none';
    settingsContent.style.display = isExpanded ? 'none' : 'grid';
    
    const icon = settingsToggle.querySelector('i');
    icon.className = isExpanded ? 'fas fa-cog' : 'fas fa-times';
    
    const text = settingsToggle.querySelector('span');
    text.textContent = isExpanded ? 'Advanced' : 'Hide';
}

function updateSliderValues() {
    upscaleValue.textContent = upscaleSlider.value + 'x';
    fidelityValue.textContent = fidelitySlider.value;
}

// Image enhancement
async function handleEnhanceImage() {
    if (!originalImageFile) {
        showError('Please select an image first.');
        return;
    }
    
    // Show processing section
    showProcessingSection();
    
    // Prepare form data
    const formData = new FormData();
    formData.append('image', originalImageFile);
    formData.append('face_align', faceAlignCheckbox.checked);
    formData.append('background_enhance', backgroundEnhanceCheckbox.checked);
    formData.append('face_upsample', faceUpsampleCheckbox.checked);
    formData.append('upscale', upscaleSlider.value);
    formData.append('codeformer_fidelity', fidelitySlider.value);
    
    try {
        // Update processing text
        updateProcessingText('Uploading image...', 'Please wait while we process your request');
        
        const response = await fetch('/api/enhance_image', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Enhancement failed');
        }
        
        // Update processing text
        updateProcessingText('Processing complete!', 'Preparing your enhanced image...');
        
        // Get the enhanced image blob
        enhancedImageBlob = await response.blob();
        
        // Show results
        setTimeout(() => {
            showResults();
        }, 1000);
        
    } catch (error) {
        console.error('Enhancement error:', error);
        showError('Enhancement failed: ' + error.message);
        hideProcessingSection();
    }
}

function showProcessingSection() {
    settingsPanel.style.display = 'none';
    processingSection.style.display = 'block';
    processingSection.classList.add('fade-in');
}

function hideProcessingSection() {
    processingSection.style.display = 'none';
    settingsPanel.style.display = 'block';
}

function updateProcessingText(title, subtitle) {
    document.getElementById('processingText').textContent = title;
    document.getElementById('processingSubtext').textContent = subtitle;
}

// Results display
function showResults() {
    processingSection.style.display = 'none';
    resultsSection.style.display = 'block';
    resultsSection.classList.add('slide-up');
    
    createImageComparison();
}

// Progressive loading and memory management
function createImageComparison() {
    // Create URLs for the images
    const originalUrl = URL.createObjectURL(originalImageFile);
    const enhancedUrl = URL.createObjectURL(enhancedImageBlob);
    
    // Store URLs for cleanup
    window.imageUrls = window.imageUrls || [];
    window.imageUrls.push(originalUrl, enhancedUrl);
    
    // Create the comparison slider with enhanced features
    comparisonContainer.innerHTML = `
        <div class="comparison-wrapper">
            <img-comparison-slider class="comparison-slider" hover>
                <img slot="first" src="${originalUrl}" alt="Original Image" loading="lazy" onload="this.classList.add('loaded')" />
                <img slot="second" src="${enhancedUrl}" alt="Enhanced Image" loading="lazy" onload="this.classList.add('loaded')" />
            </img-comparison-slider>
            <div class="comparison-labels">
                <div class="label-left">
                    <i class="fas fa-image"></i>
                    <span>Original</span>
                </div>
                <div class="comparison-info">
                    <i class="fas fa-arrows-alt-h"></i>
                    <span>Drag to compare</span>
                </div>
                <div class="label-right">
                    <i class="fas fa-sparkles"></i>
                    <span>Enhanced</span>
                </div>
            </div>
        </div>
        <div class="comparison-stats">
            <div class="stat-item">
                <span class="stat-label">Original Size:</span>
                <span class="stat-value" id="originalSize">${formatFileSize(originalImageFile.size)}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Enhanced Size:</span>
                <span class="stat-value" id="enhancedSize">${formatFileSize(enhancedImageBlob.size)}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Format:</span>
                <span class="stat-value">WebP</span>
            </div>
        </div>
    `;
    
    // Add keyboard navigation for the comparison slider
    const slider = comparisonContainer.querySelector('img-comparison-slider');
    if (slider) {
        slider.addEventListener('keydown', handleSliderKeyboard);
        slider.setAttribute('tabindex', '0');
        slider.setAttribute('role', 'slider');
        slider.setAttribute('aria-label', 'Image comparison slider');
        
        // Add smooth animation on load with performance optimization
        requestAnimationFrame(() => {
            slider.style.opacity = '1';
            slider.style.transform = 'scale(1)';
        });
    }
    
    // Preload images for better performance
    preloadImages([originalUrl, enhancedUrl]);
}

// Preload images for better performance
function preloadImages(urls) {
    urls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

// Memory cleanup
function cleanupImageUrls() {
    if (window.imageUrls) {
        window.imageUrls.forEach(url => URL.revokeObjectURL(url));
        window.imageUrls = [];
    }
}

// Enhanced reset with memory cleanup
function resetApplication() {
    // Cleanup memory
    cleanupImageUrls();
    
    // Reset variables
    originalImageFile = null;
    enhancedImageBlob = null;
    
    // Reset file input
    imageInput.value = '';
    
    // Reset upload area
    uploadArea.innerHTML = `
        <div class="upload-content">
            <i class="fas fa-cloud-upload-alt upload-icon"></i>
            <h3>Drop your image here</h3>
            <p>or <span class="upload-link">browse files</span></p>
            <p class="upload-info">Supports JPG, PNG, WebP • Max 10MB</p>
        </div>
    `;
    
    // Hide sections
    settingsPanel.style.display = 'none';
    processingSection.style.display = 'none';
    resultsSection.style.display = 'none';
    
    // Reset settings to defaults
    faceAlignCheckbox.checked = true;
    backgroundEnhanceCheckbox.checked = true;
    faceUpsampleCheckbox.checked = true;
    upscaleSlider.value = 2;
    fidelitySlider.value = 0.5;
    updateSliderValues();
    
    // Reset settings content visibility
    settingsContent.style.display = 'grid';
    const icon = settingsToggle.querySelector('i');
    icon.className = 'fas fa-cog';
    const text = settingsToggle.querySelector('span');
    text.textContent = 'Advanced';
    
    // Clear any existing notifications
    clearNotifications();
}

// Performance monitoring (optional)
function measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${name} took ${end - start} milliseconds`);
    return result;
}

// Debounced resize handler for responsive optimizations
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Trigger any responsive adjustments here
        const slider = document.querySelector('img-comparison-slider');
        if (slider) {
            // Force re-render of comparison slider on resize
            slider.style.display = 'none';
            requestAnimationFrame(() => {
                slider.style.display = '';
            });
        }
    }, 250);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    cleanupImageUrls();
});

// Enhanced keyboard navigation for comparison slider
function handleSliderKeyboard(e) {
    const slider = e.target;
    let currentValue = parseFloat(slider.value || 50);
    
    switch(e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
            e.preventDefault();
            currentValue = Math.max(0, currentValue - 5);
            slider.value = currentValue;
            break;
        case 'ArrowRight':
        case 'ArrowUp':
            e.preventDefault();
            currentValue = Math.min(100, currentValue + 5);
            slider.value = currentValue;
            break;
        case 'Home':
            e.preventDefault();
            slider.value = 0;
            break;
        case 'End':
            e.preventDefault();
            slider.value = 100;
            break;
    }
}

// Download functionality
//
// In a Telegram Mini App, "downloading" the image is awkward — there is
// no real filesystem. Instead, we forward the processed image back to
// the user's Telegram chat via the bot, and show a toast confirming the
// delivery. Outside Telegram the original file-download flow is used.
function handleDownload() {
    if (!enhancedImageBlob) {
        showError('No enhanced image available for download.');
        return;
    }

    if (isTelegramMiniApp()) {
        sendEnhancedImageToTelegramChat(enhancedImageBlob);
        return;
    }

    const url = URL.createObjectURL(enhancedImageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enhanced_image.webp';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show success message
    showSuccess('Image downloaded successfully!');
}

/**
 * Upload the processed image to the backend, which then forwards it to
 * the originating Telegram chat via the bot. Falls back to a normal
 * browser download if anything goes wrong so the user is never stuck.
 */
async function sendEnhancedImageToTelegramChat(blob) {
    const tma = window.Telegram.WebApp;
    const initData = (tma && tma.initData) || '';

    // While we are talking to the backend, lock the button so the user
    // cannot double-tap and trigger two uploads.
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.classList.add('is-loading');
    }

    showInfo('Sending image to your Telegram chat…');

    // Build a filename with a sensible extension. The blob's type wins
    // when we can read it.
    const mime = blob.type || 'image/jpeg';
    const ext = mime.includes('png')  ? 'png'
              : mime.includes('webp') ? 'webp'
              : mime.includes('gif')  ? 'gif'
                                      : 'jpg';
    const filename = `enhanced_image.${ext}`;

    const formData = new FormData();
    formData.append('image', blob, filename);
    formData.append('caption', 'Your enhanced image ✨');

    try {
        const response = await fetch('/api/telegram/send_photo', {
            method: 'POST',
            headers: {
                // The backend verifies this header to ensure the request
                // really came from a Telegram client.
                'X-Telegram-Init-Data': initData,
            },
            body: formData,
        });

        // Try to parse JSON either way so we can show a useful error.
        let payload = null;
        try { payload = await response.json(); } catch (e) { /* non-JSON */ }

        if (!response.ok || !payload || !payload.ok) {
            const message = (payload && payload.error) || `Server returned ${response.status}`;
            throw new Error(message);
        }

        // Notify Telegram the action completed (haptic + popup feedback).
        try {
            if (tma.HapticFeedback) tma.HapticFeedback.notificationOccurred('success');
            if (tma.showPopup) {
                tma.showPopup({
                    title: 'Sent ✅',
                    message: 'Image sent to your Telegram chat',
                    buttons: [{ type: 'ok' }],
                });
            }
        } catch (e) { /* not critical */ }

        showSuccess('Image sent to your Telegram chat');
    } catch (err) {
        console.error('Failed to send image via Telegram:', err);
        try {
            if (tma.HapticFeedback) tma.HapticFeedback.notificationOccurred('error');
            if (tma.showPopup) {
                tma.showPopup({
                    title: 'Could not send',
                    message: 'Falling back to a regular download. ' + (err && err.message ? err.message : ''),
                    buttons: [{ type: 'ok' }],
                });
            }
        } catch (e) {}

        // Fallback so the user is never left empty-handed: do a normal
        // browser download. This is invisible inside Telegram's webview
        // but the user at least keeps the file in app storage.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showError('Could not send to Telegram chat: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('is-loading');
        }
    }
}

// Reset application
function resetApplication() {
    // Reset variables
    originalImageFile = null;
    enhancedImageBlob = null;
    
    // Reset file input
    imageInput.value = '';
    
    // Reset upload area
    uploadArea.innerHTML = `
        <div class="upload-content">
            <i class="fas fa-cloud-upload-alt upload-icon"></i>
            <h3>Drop your image here</h3>
            <p>or <span class="upload-link">browse files</span></p>
            <p class="upload-info">Supports JPG, PNG, WebP • Max 10MB</p>
        </div>
    `;
    
    // Hide sections
    settingsPanel.style.display = 'none';
    processingSection.style.display = 'none';
    resultsSection.style.display = 'none';
    
    // Reset settings to defaults
    faceAlignCheckbox.checked = true;
    backgroundEnhanceCheckbox.checked = true;
    faceUpsampleCheckbox.checked = true;
    upscaleSlider.value = 2;
    fidelitySlider.value = 0.5;
    updateSliderValues();
    
    // Reset settings content visibility
    settingsContent.style.display = 'grid';
    const icon = settingsToggle.querySelector('i');
    icon.className = 'fas fa-cog';
    const text = settingsToggle.querySelector('span');
    text.textContent = 'Advanced';
    
    // Clear any existing notifications
    clearNotifications();
}

// Notification system
function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showInfo(message) {
    showNotification(message, 'info');
}

function showNotification(message, type) {
    // Remove existing notifications
    clearNotifications();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add notification styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-lg);
                padding: 1rem 1.5rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                box-shadow: var(--shadow-xl);
                z-index: 1000;
                max-width: 400px;
                animation: slideInRight 0.3s ease-out;
            }
            
            .notification-error {
                border-left: 4px solid var(--error-color);
            }
            
            .notification-error i:first-child {
                color: var(--error-color);
            }
            
            .notification-success {
                border-left: 4px solid var(--success-color);
            }

            .notification-success i:first-child {
                color: var(--success-color);
            }

            .notification-info {
                border-left: 4px solid var(--primary-color);
            }

            .notification-info i:first-child {
                color: var(--primary-color);
            }

            .btn[disabled].is-loading {
                opacity: 0.7;
                cursor: progress;
            }

            .notification-close {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--text-muted);
                padding: 0.25rem;
                margin-left: auto;
            }
            
            .notification-close:hover {
                color: var(--text-primary);
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @media (max-width: 480px) {
                .notification {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function clearNotifications() {
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(notification => notification.remove());
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling for uncaught errors
window.addEventListener('error', function(e) {
    console.error('Uncaught error:', e.error);
    showError('An unexpected error occurred. Please try again.');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showError('An unexpected error occurred. Please try again.');
});

// Service worker registration (for future PWA features)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Service worker registration can be added here in the future
    });
}

// ============================================================
// Telegram-aware overrides for image handling
// ============================================================
//
// In a Telegram Mini App the user is usually on a phone. Drag-and-drop
// doesn't apply, and the system file picker behavior can differ. The
// native <input type="file"> is still the most reliable way, so we
// keep that as the primary path. We just hide the drag visual hint
// and ensure the tap target stays big enough.

(function patchUploadForTMA() {
    const isTma = isTelegramMiniApp();
    if (!isTma) return;

    const style = document.createElement('style');
    style.textContent = `
        .tma-mode .upload-area::after {
            content: "Tap to choose a photo";
            display: block;
            margin-top: 0.5rem;
            color: var(--text-muted);
            font-size: 0.85rem;
        }
        .tma-mode #enhanceBtn {
            /* Use Telegram's main button feel when available */
            box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
        }
    `;
    document.head.appendChild(style);
})();

