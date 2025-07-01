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
    initializeEventListeners();
    initializeTheme();
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

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
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
function handleDownload() {
    if (!enhancedImageBlob) {
        showError('No enhanced image available for download.');
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

