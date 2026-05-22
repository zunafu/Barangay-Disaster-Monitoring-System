// Global variables
let map, currentUser = null, markers = [], reportMarkerLocation = null, isGuestMode = false;
let GEOAPIFY_API_KEY = ''; // Will be loaded from server

// Report selection mode & locate helper
let reportSelectMode = false;
let reportSelectionReady = false; // guard to avoid immediate accidental map clicks opening modal
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
let userLocationLayer = null;

// Helper function to get profile picture URL
function getProfilePictureUrl(filename, size = null) {
    if (!filename) return null;

    // Determine the path based on current location
    const basePath = window.location.pathname.includes('/disaster-report/')
        ? '/disaster-report/uploads/'
        : window.location.pathname.includes('disaster-report')
            ? '/disaster-report/uploads/'
            : '/uploads/';

    return basePath + filename + '?v=' + Date.now();
}

// Helper function to reverse geocode coordinates to address
async function reverseGeocodeCoordinates(lat, lng, fallbackText = null) {
    // Return fallback text immediately if provided
    if (fallbackText) return fallbackText;

    // If no API key, return coordinates
    if (!GEOAPIFY_API_KEY || GEOAPIFY_API_KEY.trim() === '') {
        console.warn('Geoapify API key not configured');
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    try {
        const response = await fetch(
            `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEOAPIFY_API_KEY}`,
            { timeout: 3000 }
        );

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();

        if (data.features && data.features.length > 0) {
            return data.features[0].properties.formatted;
        }

        // Fallback if no results
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
        console.log('Geocoding failed:', error);
        // Return coordinates as fallback
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

// Helper function to enrich incidents with addresses (batch geocoding)
async function enrichIncidentsWithAddresses(incidents) {
    // Find incidents without addresses or with just coordinates
    const needsGeocoding = incidents.filter(inc =>
        (!inc.address || inc.address.trim() === '') && inc.latitude && inc.longitude
    );

    if (needsGeocoding.length === 0) return incidents;

    console.log(`Geocoding ${needsGeocoding.length} incidents...`);

    // Fetch addresses for incidents missing them
    const geocodingPromises = needsGeocoding.map(inc =>
        reverseGeocodeCoordinates(inc.latitude, inc.longitude)
            .then(address => ({ id: inc.id, address }))
            .catch(() => ({ id: inc.id, address: `${inc.latitude.toFixed(6)}, ${inc.longitude.toFixed(6)}` }))
    );

    const geocodingResults = await Promise.all(geocodingPromises);

    // Create a map of addresses by incident ID
    const addressMap = {};
    geocodingResults.forEach(result => {
        addressMap[result.id] = result.address;
    });

    // Update incidents with addresses
    return incidents.map(inc => {
        let finalAddress = inc.address;

        // If address is empty or missing, use geocoded address
        if (!finalAddress || finalAddress.trim() === '') {
            finalAddress = addressMap[inc.id] || `${inc.latitude.toFixed(6)}, ${inc.longitude.toFixed(6)}`;
        }

        return {
            ...inc,
            address: finalAddress
        };
    });
}

// ETA utilities removed


// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Load configuration first
    await loadConfig();

    checkAuth();
    setupEventListeners();
    // Start in guest mode - show map immediately
    browseAsGuest();
});

// Load configuration from server
async function loadConfig() {
    try {
        const response = await fetch('api.php?action=get_config');
        const config = await response.json();

        if (config.GEOAPIFY_API_KEY) {
            GEOAPIFY_API_KEY = config.GEOAPIFY_API_KEY;
            console.log('Config loaded successfully');
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('auth.php?action=check');
        const data = await response.json();

        if (data.authenticated) {
            currentUser = data.user;
            isGuestMode = false;
            updateUIForAuthState();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Browse as guest
function browseAsGuest() {
    isGuestMode = true;
    currentUser = null;
    updateUIForAuthState();
}

// Show auth modal
function showAuthModal(mode) {
    if (mode === 'register') {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    } else {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    }
    document.getElementById('authModal').classList.add('active');
    document.body.classList.add('modal-open');
}

// Close auth modal
function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');

    // Reset all forms
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    document.getElementById('otpForm').reset();
    document.getElementById('forgotPasswordForm').reset();
    document.getElementById('resetPasswordForm').reset();

    // Clear password input visibility
    const loginPwd = document.getElementById('loginPassword');
    const registerPwd = document.getElementById('registerPassword');
    const confirmPwd = document.getElementById('registerPasswordConfirm');
    const newPwd = document.getElementById('newPassword');
    const confirmNewPwd = document.getElementById('confirmNewPassword');

    if (loginPwd) loginPwd.type = 'password';
    if (registerPwd) registerPwd.type = 'password';
    if (confirmPwd) confirmPwd.type = 'password';
    if (newPwd) newPwd.type = 'password';
    if (confirmNewPwd) confirmNewPwd.type = 'password';

    // Reset password toggle icons and hide them
    document.querySelectorAll('#authModal .password-toggle').forEach(toggle => {
        toggle.style.opacity = '0';
        toggle.style.visibility = 'hidden';
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Hide password strength indicator
    const strengthDiv = document.getElementById('passwordStrength');
    if (strengthDiv) strengthDiv.style.display = 'none';

    // Reset form display states
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';

    removeModalOpenIfNoActive();
}

// Update UI based on auth state
function updateUIForAuthState() {
    const userInfo = document.getElementById('userInfo');
    const authButtons = document.getElementById('authButtons');
    const guestBanner = document.getElementById('guestBanner');
    const container = document.querySelector('.container');

    if (isGuestMode) {
        // Guest mode
        userInfo.innerHTML = `
            <div class="user-badge">
                <i class="fas fa-user-circle"></i> Guest Mode
            </div>
        `;

        authButtons.innerHTML = `
            <button class="btn btn-primary" onclick="showAuthModal('login')">
                <i class="fas fa-sign-in-alt"></i> Login
            </button>
            <button class="btn btn-outline" onclick="showAuthModal('register')">
                <i class="fas fa-user-plus"></i> Register
            </button>
        `;

        if (guestBanner) { guestBanner.style.display = 'block'; document.body.classList.add('guest-banner-visible'); }
        if (container) { container.classList.add('map-with-banner'); }

        // Show report buttons for guest mode
        const startBtn = document.getElementById('startReportBtn');
        const locateBtn = document.getElementById('locateBtn');
        if (startBtn) startBtn.style.display = 'flex';
        if (locateBtn) locateBtn.style.display = 'flex';
    } else {
        // Logged in mode
        const roleClass = `role-${currentUser.role}`;
        const profilePictureUrl = currentUser.profile_picture
            ? getProfilePictureUrl(currentUser.profile_picture)
            : `uploads/default-avatar.svg`;

        userInfo.innerHTML = `
            <img src="${profilePictureUrl}" alt="Profile" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);">
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <span style="font-weight: 500;">${currentUser.full_name}</span>
                <span class="role-badge ${roleClass}" style="align-self: flex-start; font-size: 0.75rem;">${currentUser.role}</span>
            </div>
        `;

        const adminButton = currentUser.role === 'admin' ? `
            <a href="admin-panel.html" class="btn btn-success" style="text-decoration: none;">
                <i class="fas fa-shield-alt"></i> Admin Panel
            </a>
        ` : '';

        const barangayButton = currentUser.role === 'barangay' ? `
            <a href="barangay-panel.html" class="btn btn-success" style="text-decoration: none;">
                <i class="fas fa-map-marker-alt"></i> Barangay Panel
            </a>
        ` : '';

        authButtons.innerHTML = adminButton + barangayButton + `
            <button class="btn btn-primary" onclick="openSettingsModal()" title="Account Settings">
                <i class="fas fa-cog"></i> Settings
            </button>
        `;

        if (guestBanner) { guestBanner.style.display = 'none'; document.body.classList.remove('guest-banner-visible'); }
        if (container) { container.classList.remove('map-with-banner'); }

        // Hide report buttons for barangay and admin roles
        const startBtn = document.getElementById('startReportBtn');
        const locateBtn = document.getElementById('locateBtn');
        const isReportingRole = currentUser.role === 'user';

        if (startBtn) startBtn.style.display = isReportingRole ? 'flex' : 'none';
        if (locateBtn) locateBtn.style.display = isReportingRole ? 'flex' : 'none';

        // Hide location field in report form for non-user roles
        const locationFormGroup = document.getElementById('locationFormGroup');
        if (locationFormGroup) locationFormGroup.style.display = isReportingRole ? 'block' : 'none';

        // Hide severity field for user role (only barangay and admin can set severity)
        const severityFormGroup = document.getElementById('severityFormGroup');
        if (severityFormGroup) severityFormGroup.style.display = isReportingRole ? 'none' : 'block';
    }

    // Initialize or update map
    if (!map) {
        initMap();
    }
    loadIncidents();
    updateAnnouncementFormVisibility();
}

// Setup event listeners
function setupEventListeners() {
    // Auth forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('otpForm').addEventListener('submit', handleOTPVerification);
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) resetPasswordForm.addEventListener('submit', handleResetPassword);
    document.getElementById('showRegister').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'none';
        if (forgotPasswordForm) forgotPasswordForm.style.display = 'none';
        if (resetPasswordForm) resetPasswordForm.style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });
    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'none';
        if (forgotPasswordForm) forgotPasswordForm.style.display = 'none';
        if (resetPasswordForm) resetPasswordForm.style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });
    const showForgotPasswordBtn = document.getElementById('showForgotPassword');
    if (showForgotPasswordBtn) {
        showForgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('otpForm').style.display = 'none';
            if (resetPasswordForm) resetPasswordForm.style.display = 'none';
            if (forgotPasswordForm) forgotPasswordForm.style.display = 'block';
        });
    }
    const backToLoginBtn = document.getElementById('backToLogin');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (forgotPasswordForm) forgotPasswordForm.style.display = 'none';
            if (resetPasswordForm) resetPasswordForm.style.display = 'none';
            document.getElementById('loginForm').style.display = 'block';
        });
    }
    const backToLoginFromResetBtn = document.getElementById('backToLoginFromReset');
    if (backToLoginFromResetBtn) {
        backToLoginFromResetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (resetPasswordForm) resetPasswordForm.style.display = 'none';
            document.getElementById('loginForm').style.display = 'block';
        });
    }
    document.getElementById('resendOtpBtn').addEventListener('click', handleResendOTP);
    document.getElementById('backToRegister').addEventListener('click', handleBackToRegister);

    // Report form
    document.getElementById('reportForm').addEventListener('submit', handleReportSubmit);

    // Toggle report-selection mode
    const startBtn = document.getElementById('startReportBtn');
    if (startBtn) startBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); enterReportSelectMode(); });

    // Locate button
    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) locateBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); locateUser(); });

    // Zoom in button
    const zoomInBtn = document.getElementById('zoomInBtn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (map) map.zoomIn(); });

    // Zoom out button
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (map) map.zoomOut(); });

    // Use my location quick action (visible while in selection mode)
    const useBtn = document.getElementById('useMyLocationBtn');
    if (useBtn) useBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); useMyLocationForReport(); });

    // Cancel selection quick action (visible while in selection mode)
    const cancelBtn = document.getElementById('cancelSelectBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); exitReportSelectMode(); showToast('Selection cancelled', 'info'); });

    // Sidebar / Community
    const hamburger = document.getElementById('hamburgerBtn');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');

    // Legend toggle (bottom-left) - show/hide disaster types
    const legendToggle = document.getElementById('legendToggleBtn');
    const legend = document.querySelector('.legend');
    if (legend && legendToggle) {
        legend.classList.remove('show');
        legendToggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); legend.classList.toggle('show'); });
    }

    // Responsive sidebar behavior: show on desktop by default, hide on mobile
    function setSidebarInitialState() {
        const isDesktop = window.innerWidth > 820;
        const mainApp = document.getElementById('mainApp');
        if (sidebar) {
            if (isDesktop) {
                sidebar.classList.add('open');
                mainApp && mainApp.classList.add('sidebar-open');
                // On desktop, ensure the voting list is loaded immediately when the Voting tab is active
                try {
                    const active = document.querySelector('.sidebar-tabs .tab.active')?.dataset.tab;
                    if (active === 'voting') loadVotingList();
                } catch (e) { /* ignore if elements not ready */ }
            } else {
                sidebar.classList.remove('open');
                mainApp && mainApp.classList.remove('sidebar-open');
            }
        }
    }
    // initialize
    setSidebarInitialState();
    window.addEventListener('resize', setSidebarInitialState);

    // Hamburger toggles the sidebar (only visible on mobile by CSS); ensure map invalidates its size after toggling
    const mainApp = document.getElementById('mainApp');
    if (hamburger) hamburger.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const opened = sidebar.classList.toggle('open');
        if (opened) { mainApp && mainApp.classList.add('sidebar-open'); } else { mainApp && mainApp.classList.remove('sidebar-open'); }
        loadVotingList(); loadChatMessages(); if (map) setTimeout(() => map.invalidateSize(), 350);
    });

    if (closeSidebar) closeSidebar.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sidebar.classList.remove('open'); mainApp && mainApp.classList.remove('sidebar-open'); if (map) setTimeout(() => map.invalidateSize(), 350); });

    // Sidebar tabs
    document.querySelectorAll('.sidebar-tabs .tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-tabs .tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tab + 'Tab').classList.remove('hidden');
            if (tab === 'voting') loadVotingList();
            if (tab === 'chat') loadChatMessages();
            if (tab === 'announcements') loadAnnouncements();
        });
    });

    // Chat form
    const chatForm = document.getElementById('chatForm');
    if (chatForm) chatForm.addEventListener('submit', (e) => { e.preventDefault(); sendChatMessage(); });

    // Password reset OTP resend button
    const resendResetOtpBtn = document.getElementById('resendResetOtpBtn');
    if (resendResetOtpBtn) resendResetOtpBtn.addEventListener('click', (e) => { e.preventDefault(); resendPasswordResetOTP(); });

    // Note: selection can only be cancelled by closing the report form after a location is chosen.
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const formData = new FormData();
    formData.append('action', 'login');
    formData.append('email', email);
    formData.append('password', password);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            isGuestMode = false;
            showToast('Login successful!', 'success');
            closeAuthModal();
            updateUIForAuthState();
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Login failed', 'error');
    }
}

// Validate password strength (essentials only)
function validatePasswordStrength(password) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one number';
    }
    return null; // Password is valid
}

// Get password strength level (for UI feedback)
function getPasswordStrengthLevel(password) {
    let strength = 0;

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength < 2) return { level: 'weak', color: '#dc2626', width: 25 };
    if (strength < 4) return { level: 'fair', color: '#f59e0b', width: 50 };
    if (strength < 5) return { level: 'good', color: '#3b82f6', width: 75 };
    return { level: 'strong', color: '#10b981', width: 100 };
}

// Setup password strength indicator
function setupPasswordStrengthIndicator() {
    const passwordInput = document.getElementById('registerPassword');
    const passwordConfirmInput = document.getElementById('registerPasswordConfirm');

    if (!passwordInput) return;

    passwordInput.addEventListener('input', (e) => {
        const password = e.target.value;
        const strengthDiv = document.getElementById('passwordStrength');
        const strengthBar = document.getElementById('passwordStrengthBar');
        const strengthText = document.getElementById('passwordStrengthText');

        if (password.length > 0) {
            const strength = getPasswordStrengthLevel(password);
            strengthDiv.style.display = 'block';
            strengthBar.style.backgroundColor = strength.color;
            strengthBar.style.width = strength.width + '%';
            strengthText.textContent = `Password strength: ${strength.level}`;
            strengthText.style.color = strength.color;
        } else {
            strengthDiv.style.display = 'none';
        }
    });

    // Clear confirm password when main password changes
    if (passwordConfirmInput) {
        passwordInput.addEventListener('input', () => {
            passwordConfirmInput.value = '';
        });
    }
}

// Setup password toggle with hide/show logic
function setupPasswordToggle() {
    const passwordToggles = document.querySelectorAll('.password-toggle');

    passwordToggles.forEach(toggle => {
        const targetId = toggle.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);

        if (!passwordInput) return;

        // Function to update toggle visibility and state
        const updateToggleVisibility = () => {
            if (passwordInput.value.length > 0) {
                toggle.style.opacity = '1';
                toggle.style.visibility = 'visible';
            } else {
                toggle.style.opacity = '0';
                toggle.style.visibility = 'hidden';
            }
        };

        // Update visibility on input
        passwordInput.addEventListener('input', updateToggleVisibility);

        // Toggle password visibility
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const icon = toggle.querySelector('i');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });

        // Initial state
        updateToggleVisibility();
    });
}

// Call password strength setup when page loads
document.addEventListener('DOMContentLoaded', setupPasswordStrengthIndicator);
document.addEventListener('DOMContentLoaded', setupPasswordToggle);

// Handle register
async function handleRegister(e) {
    e.preventDefault();

    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const fullName = document.getElementById('registerName').value;

    // Validate password confirmation
    if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'error');
        return;
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
        showToast(passwordError, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('action', 'register');
    formData.append('email', email);
    formData.append('password', password);
    formData.append('full_name', fullName);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            // Show OTP verification form
            showToast('Registration successful! Please verify your email.', 'success');
            showOTPForm(email);
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showToast('Registration failed', 'error');
    }
}

// Show OTP verification form
function showOTPForm(email) {
    // Hide register and login forms
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';

    // Show OTP form
    document.getElementById('otpForm').style.display = 'block';
    document.getElementById('otpEmail').value = email;
    document.getElementById('otpInput').value = '';
    document.getElementById('otpInput').focus();
}

// Handle OTP verification
async function handleOTPVerification(e) {
    e.preventDefault();

    const email = document.getElementById('otpEmail').value;
    const otp = document.getElementById('otpInput').value;

    if (otp.length !== 6 || isNaN(otp)) {
        showToast('Please enter a valid 6-digit OTP', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('action', 'verify-otp');
    formData.append('email', email);
    formData.append('otp', otp);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Email verified successfully! You can now login.', 'success');

            // Reset forms and show login
            document.getElementById('registerForm').reset();
            document.getElementById('otpForm').reset();
            document.getElementById('otpForm').style.display = 'none';
            document.getElementById('loginForm').style.display = 'block';

            // Pre-fill email
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').focus();
        } else {
            showToast(data.error || 'OTP verification failed', 'error');
        }
    } catch (error) {
        showToast('OTP verification failed', 'error');
    }
}

// Handle OTP resend
async function handleResendOTP(e) {
    e.preventDefault();

    const email = document.getElementById('otpEmail').value;

    const formData = new FormData();
    formData.append('action', 'resend-otp');
    formData.append('email', email);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('OTP sent to your email', 'success');
            document.getElementById('otpInput').value = '';
            document.getElementById('otpInput').focus();
        } else {
            showToast(data.error || 'Failed to resend OTP', 'error');
        }
    } catch (error) {
        showToast('Failed to resend OTP', 'error');
    }
}

// Handle back to register
function handleBackToRegister(e) {
    e.preventDefault();
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('otpForm').reset();
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('registerForm').reset();
    document.getElementById('registerEmail').focus();
}

// Handle forgot password request
async function handleForgotPassword(e) {
    e.preventDefault();

    const email = document.getElementById('forgotPasswordEmail').value;

    const formData = new FormData();
    formData.append('action', 'forgot-password');
    formData.append('email', email);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });

        // Check if response is OK
        if (!response.ok) {
            showToast('Server error: ' + response.statusText, 'error');
            console.error('Response status:', response.status, response.statusText);
            return;
        }

        const data = await response.json();

        if (data.success) {
            showToast('Password reset link sent to your email!', 'success');
            document.getElementById('forgotPasswordForm').reset();
            setTimeout(() => {
                document.getElementById('forgotPasswordForm').style.display = 'none';
                document.getElementById('loginForm').style.display = 'block';
            }, 1500);
        } else {
            showToast(data.error || 'Failed to send reset link', 'error');
            console.error('Error response:', data);
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        showToast('Failed to send reset link. Check browser console.', 'error');
    }
}

// Handle password reset
async function handleResetPassword(e) {
    e.preventDefault();

    const token = document.getElementById('resetToken').value;
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    // Validate passwords match
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    // Validate password strength
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
        showToast(strengthError, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('action', 'reset-password');
    formData.append('token', token);
    formData.append('password', password);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            document.getElementById('resetPasswordForm').reset();
            setTimeout(() => {
                document.getElementById('resetPasswordForm').style.display = 'none';
                document.getElementById('loginForm').style.display = 'block';
                closeAuthModal();
            }, 1500);
        } else {
            showToast(data.error || 'Password reset failed', 'error');
        }
    } catch (error) {
        console.error('Password reset error:', error);
        showToast('Password reset failed', 'error');
    }
}

// Logout
async function logout() {
    try {
        await fetch('auth.php?action=logout');
        currentUser = null;
        isGuestMode = true;
        showToast('Logged out successfully', 'success');
        updateUIForAuthState();
    } catch (error) {
        showToast('Logout failed', 'error');
    }
}

// Initialize map
function initMap() {
    // Initialize map centered on Philippines and disable built-in zoom controls
    map = L.map('map', { zoomControl: false }).setView([14.5995, 120.9842], 13);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Try to get user location (only show for user role or guests)
    if (navigator.geolocation && (!currentUser || currentUser.role === 'user' || isGuestMode)) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                map.setView([userLat, userLng], 13);

                // Add user location marker
                L.marker([userLat, userLng], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '<i class="fas fa-street-view" style="font-size: 2rem; color: #2563eb;"></i>',
                        iconSize: [30, 30]
                    })
                }).addTo(map).bindPopup('Your Location');
            },
            (error) => {
                console.log('Geolocation error:', error);
            }
        );
    }

    // Add click event for reporting - only active when in report selection mode
    map.on('click', (e) => {
        // Prevent accidental immediate clicks (e.g., from button press) by requiring a short delay after enabling selection
        if (!reportSelectMode || !reportSelectionReady) return; // prevent accidental reporting

        if (isGuestMode) {
            showToast('Please login or register to report incidents', 'info');
            exitReportSelectMode();
            return;
        }

        // User intentionally selected a location
        openReportModal(e.latlng);
        exitReportSelectMode();
    });

    // Ensure map redraws after layout changes (e.g., sidebar shown by default)
    // Invalidate size once tiles are loaded and on window resize to avoid clipped map
    map.once('load', () => { try { if (map && typeof map.invalidateSize === 'function') setTimeout(() => map.invalidateSize(), 200); } catch (e) { } });
    window.addEventListener('resize', () => { if (map && typeof map.invalidateSize === 'function') setTimeout(() => map.invalidateSize(), 200); });
    // Fallback: force resize shortly after initialization
    setTimeout(() => { try { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); } catch (e) { } }, 300);
}

// ---- Report selection helpers ----
function enterReportSelectMode() {
    if (!map) return;
    if (isGuestMode) {
        showToast('Please login or register to report incidents', 'info');
        return;
    }
    // Prevent barangay and admin users from creating reports
    if (currentUser && (currentUser.role === 'barangay' || currentUser.role === 'admin')) {
        showToast('Only users can create incident reports', 'error');
        return;
    }
    reportSelectMode = true;
    reportSelectionReady = false; // temporarily disable clicks until user can interact
    // allow clicks after a short delay to avoid the originating button click from firing the map click
    setTimeout(() => { reportSelectionReady = true; }, 300);

    map.getContainer().classList.add('map-select-mode');
    const useBtn = document.getElementById('useMyLocationBtn');
    if (useBtn) useBtn.classList.remove('hidden');
    const cancelBtn = document.getElementById('cancelSelectBtn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    const btn = document.getElementById('startReportBtn');
    if (btn) {
        btn.classList.add('active');
        // Keep the label consistent; reporting requires selecting a location first
    }
    if (isTouchDevice) {
        showToast('Tap the map to select a location.', 'info');
    } else {
        showToast('Click the map to select a location.', 'info');
    }
}

function exitReportSelectMode() {
    reportSelectMode = false;
    reportSelectionReady = false;
    if (map && map.getContainer) map.getContainer().classList.remove('map-select-mode');
    const useBtn = document.getElementById('useMyLocationBtn');
    if (useBtn) useBtn.classList.add('hidden');
    const cancelBtn = document.getElementById('cancelSelectBtn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    const btn = document.getElementById('startReportBtn');
    if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-map-pin"></i> Report Incident';
    }
}

function toggleReportSelectMode() {
    if (reportSelectMode) exitReportSelectMode(); else enterReportSelectMode();
}

async function locateUser() {
    if (!map) return;
    if (!navigator.geolocation) {
        showToast('Geolocation not supported in this browser', 'error');
        return;
    }
    showToast('Locating...', 'info');
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        map.setView([lat, lng], 16);

        // show temporary highlight
        if (userLocationLayer) {
            try { map.removeLayer(userLocationLayer); } catch (e) { }
            userLocationLayer = null;
        }
        userLocationLayer = L.circle([lat, lng], { radius: 80, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.08 }).addTo(map);
        setTimeout(() => { try { map.removeLayer(userLocationLayer); } catch (e) { } userLocationLayer = null; }, 6000);
        showToast('Centered to your location', 'success');
    }, (err) => {
        showToast('Unable to retrieve your location', 'error');
    }, { enableHighAccuracy: true });
}

// Use the device location (or map center fallback) to open the report modal immediately
function useMyLocationForReport() {
    if (isGuestMode) {
        showToast('Please login or register to report incidents', 'info');
        exitReportSelectMode();
        return;
    }

    if (!navigator.geolocation) {
        showToast('Geolocation not supported in this browser', 'error');
        if (map) {
            openReportModal(map.getCenter());
        }
        exitReportSelectMode();
        return;
    }

    showToast('Getting your location...', 'info');
    navigator.geolocation.getCurrentPosition((pos) => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        openReportModal(latlng);
        exitReportSelectMode();
    }, (err) => {
        showToast('Unable to get location. Using map center.', 'info');
        if (map) openReportModal(map.getCenter());
        exitReportSelectMode();
    }, { enableHighAccuracy: true });
}

// Open report modal
async function openReportModal(latlng) {
    reportMarkerLocation = latlng;

    // Set coordinates
    document.getElementById('reportLat').value = latlng.lat;
    document.getElementById('reportLng').value = latlng.lng;

    // Set default address with "Loading..." indicator
    document.getElementById('reportAddress').value = 'Loading address...';

    // Add temporary marker
    if (window.tempMarker) {
        map.removeLayer(window.tempMarker);
    }

    window.tempMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'temp-marker',
            html: `<div class="marker-circle severity-medium"><div class="marker-emoji">📍</div></div>`,
            iconSize: [44, 44]
        })
    }).addTo(map);

    // Close the sidebar only on small screens so desktop layout remains stable
    const sidebar = document.getElementById('sidebar');
    const mainApp = document.getElementById('mainApp');
    if (window.innerWidth <= 820) {
        if (sidebar) sidebar.classList.remove('open');
        if (mainApp) mainApp.classList.remove('sidebar-open');
        // Ensure map redraws after layout change on small screens
        if (map && typeof map.invalidateSize === 'function') setTimeout(() => map.invalidateSize(), 300);
    } else {
        // Desktop: keep sidebar open and only refresh map slightly to avoid layout shift
        if (map && typeof map.invalidateSize === 'function') setTimeout(() => map.invalidateSize(), 120);
    }

    document.getElementById('reportModal').classList.add('active');
    document.body.classList.add('modal-open');

    // Hide/show severity field based on user role
    const severityFormGroup = document.getElementById('severityFormGroup');
    const severitySelect = document.getElementById('reportSeverity');
    if (severityFormGroup && severitySelect) {
        if (currentUser && currentUser.role === 'user') {
            severityFormGroup.style.display = 'none';
            severitySelect.value = 'medium';
        } else {
            severityFormGroup.style.display = 'block';
        }
    }

    // Get address using reverse geocoding
    try {
        const address = await reverseGeocodeCoordinates(latlng.lat, latlng.lng);
        document.getElementById('reportAddress').value = address;
    } catch (error) {
        console.log('Failed to get address:', error);
        document.getElementById('reportAddress').value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    }
}

// ------------ Voting & Community Chat helpers ------------
async function loadVotingList() {
    const container = document.getElementById('votingList');
    if (!container) return;
    container.innerHTML = 'Loading...';

    try {
        const res = await fetch('api.php?action=get_incidents');
        let incidents = await res.json();
        // sort by confirmation_count desc
        incidents.sort((a, b) => (b.confirmation_count || 0) - (a.confirmation_count || 0));

        // Enrich incidents with addresses if needed
        incidents = await enrichIncidentsWithAddresses(incidents);

        if (incidents.length === 0) { container.innerHTML = '<p>No incidents yet</p>'; return; }

        container.innerHTML = '';
        incidents.forEach((inc, idx) => {
            const el = document.createElement('div');
            el.className = 'voting-item clickable';

            // Badges for severity and status
            const severityClass = `severity-${inc.severity || 'medium'}`;
            const severityText = inc.severity ? inc.severity.toUpperCase() : 'MEDIUM';
            const statusClass = `status-${inc.status || 'reported'}`;
            const statusText = inc.status === 'reported' ? 'Reported' : inc.status === 'responding' ? 'Responding' : inc.status === 'in_area' ? 'In Area' : 'Resolved';

            // Icon map (emoji) for disaster types
            const iconMap = { fire: '🔥', flood: '🌊', earthquake: '🏚️', typhoon: '🌀', landslide: '⛰️', accident: '🚗', other: '❓' };
            const icon = iconMap[inc.disaster_type] || '❓';

            // Reporter info with profile picture
            const reporterPic = getProfilePictureUrl(inc.reporter_profile_picture) || `uploads/default-avatar.svg`;

            el.innerHTML = `
                <div class="voting-left">
                    <div class="voting-icon">${icon}</div>
                    <div>
                        <div style="font-weight:600">${escapeHtml(inc.title)}</div>
                        <div class="meta">${escapeHtml(inc.disaster_type)} • ${escapeHtml(inc.address || '')}</div>
                        <div style="margin-top:0.5rem; display:flex; align-items:center; gap:0.5rem; font-size:0.85rem;">
                            <img src="${reporterPic}" alt="${inc.reporter_name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                            <span><strong>Reported by:</strong> ${escapeHtml(inc.reporter_name)}</span>
                        </div>
                        <div style="margin-top:0.25rem; display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                            ${inc.severity ? `<div class="badge-label"><span class="badge-key">Severity:</span><span class="severity-badge ${severityClass}">${severityText}</span></div>` : ''}
                            <div class="badge-label"><span class="badge-key">Status:</span><span class="status-badge ${statusClass}">${statusText}</span></div>
                        </div>
                    </div>
                </div>
                <div style="text-align:right">
                    <div class="meta">Confirmations: <strong class="confirm-count">${inc.confirmation_count || 0}</strong></div>
                    <div class="priority-badge">#${idx + 1}</div>
                </div>`;
            container.appendChild(el);

            el.addEventListener('click', () => {
                // center map and open details for this incident
                try {
                    if (map && inc.latitude && inc.longitude) {
                        map.setView([inc.latitude, inc.longitude], 16);
                    }
                } catch (e) { /* ignore */ }

                // Only close the sidebar and collapse layout on small screens to avoid layout shift on desktop
                const sb = document.getElementById('sidebar');
                const main = document.getElementById('mainApp');
                if (window.innerWidth <= 820) {
                    if (sb) sb.classList.remove('open');
                    if (main) main.classList.remove('sidebar-open');
                    if (map) setTimeout(() => { try { map.invalidateSize(); } catch (e) { } }, 300);
                } else {
                    // On desktop keep sidebar open and avoid changing layout; only refresh map if needed
                    if (map) setTimeout(() => { try { map.invalidateSize(); } catch (e) { } }, 120);
                }

                showIncidentDetails(inc.id);
            });
        });
    } catch (e) { container.innerHTML = '<p>Error loading list</p>'; }
}

async function loadChatMessages(opts = {}) {
    const { forceScroll = false } = opts;
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // If first time loading, show loading indicator
    if (!container.dataset.initialized) container.innerHTML = 'Loading...';

    try {
        const res = await fetch('api.php?action=get_chat_messages');
        const messages = await res.json();

        // Build existing map of messages
        const existingEls = Array.from(container.querySelectorAll('.chat-message'));
        const existingMap = {};
        existingEls.forEach(el => { if (el.dataset && el.dataset.id) existingMap[el.dataset.id] = el; });

        // If no existing messages, render them all
        if (existingEls.length === 0) {
            container.innerHTML = '';
            messages.forEach(m => container.appendChild(renderChatMessage(m)));
            container.dataset.initialized = '1';
            if (forceScroll) container.scrollTop = container.scrollHeight;
            return;
        }

        // Determine if user is near bottom
        const nearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 120;
        let appended = false;

        // Update or append messages
        messages.forEach(m => {
            const id = String(m.id);
            if (existingMap[id]) {
                const el = existingMap[id];
                // update body if changed
                const bodyEl = el.querySelector('.chat-body');
                if (bodyEl && bodyEl.innerText !== (m.message || '')) {
                    bodyEl.innerHTML = `<div>${escapeHtml(m.message)}</div>`;
                }
                // update like/dislike counts
                const likeSpan = el.querySelector(`.chat-like-count[data-like-id="${id}"]`);
                const dislikeSpan = el.querySelector(`.chat-dislike-count[data-dislike-id="${id}"]`);
                if (likeSpan) likeSpan.textContent = m.likes || 0;
                if (dislikeSpan) dislikeSpan.textContent = m.dislikes || 0;
                // update replies if counts differ (simple approach)
                const repliesWrap = el.querySelector(`[data-replies-for="${id}"]`);
                if (m.replies && m.replies.length) {
                    if (!repliesWrap) {
                        const newReplies = document.createElement('div'); newReplies.style.marginTop = '0.5rem'; newReplies.style.paddingLeft = '0.75rem'; newReplies.dataset.repliesFor = id;
                        m.replies.forEach(r => {
                            const replyEl = renderChatReply(r);
                            newReplies.appendChild(replyEl);
                        });
                        el.appendChild(newReplies);
                    } else if (repliesWrap.children.length !== m.replies.length) {
                        repliesWrap.innerHTML = '';
                        m.replies.forEach(r => {
                            const replyEl = renderChatReply(r);
                            repliesWrap.appendChild(replyEl);
                        });
                    }
                }
            } else {
                // new message -> append
                container.appendChild(renderChatMessage(m));
                appended = true;
            }
        });

        // If new messages appended and user is near bottom (or forceScroll), scroll to bottom
        if (appended && (forceScroll || nearBottom)) {
            container.scrollTop = container.scrollHeight;
        }

    } catch (e) {
        if (!container.dataset.initialized) container.innerHTML = '<p>Error loading chat</p>';
    }
}

function renderChatMessage(msg) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message';
    wrapper.id = `chat_message_${msg.id}`;
    wrapper.dataset.id = msg.id;

    const meta = document.createElement('div'); meta.className = 'chat-meta';
    const profilePic = getProfilePictureUrl(msg.author_profile_picture) || `uploads/default-avatar.svg`;
    const isOwner = !isGuestMode && currentUser && currentUser.id === msg.user_id;

    const roleClass = msg.author_role === 'admin' ? 'role-admin' : msg.author_role === 'barangay' ? 'role-barangay' : 'role-user';
    const roleBadge = (msg.author_role === 'admin' || msg.author_role === 'barangay') ? `<span class="role-badge ${roleClass}" style="font-size: 0.65rem; margin-left: 0.5rem;">${msg.author_role}</span>` : '';

    const metaContent = `<img src="${profilePic}" alt="${msg.author_name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 0.5rem;"><div style="flex: 1;"><strong>${escapeHtml(msg.author_name)}</strong>${roleBadge}</div><div>${new Date(msg.created_at).toLocaleString()}</div>${isOwner ? '<button class="chat-menu-btn" onclick="toggleChatMenu(' + msg.id + ')" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #9ca3af; padding: 0; margin-left: 0.5rem;"><i class="fas fa-ellipsis-v"></i></button>' : ''}`;
    meta.innerHTML = metaContent;
    meta.style.display = 'flex'; meta.style.alignItems = 'center'; meta.style.gap = '0.25rem';

    const body = document.createElement('div'); body.className = 'chat-body'; body.innerHTML = `<div>${escapeHtml(msg.message)}</div>`;

    const actions = document.createElement('div'); actions.className = 'chat-actions';
    const likeBtn = document.createElement('button'); likeBtn.className = 'reaction-btn'; likeBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span class="reaction-count" data-like-id="${msg.id}">${msg.likes || 0}</span>`;
    const dislikeBtn = document.createElement('button'); dislikeBtn.className = 'reaction-btn'; dislikeBtn.innerHTML = `<i class="fas fa-thumbs-down"></i> <span class="reaction-count" data-dislike-id="${msg.id}">${msg.dislikes || 0}</span>`;
    const replyBtn = document.createElement('button'); replyBtn.className = 'chat-action-btn-sm'; replyBtn.innerHTML = `<i class="fas fa-reply"></i>`;

    // Set initial active state based on user_reaction
    if (msg.user_reaction === 'like') {
        likeBtn.classList.add('active-like');
    } else if (msg.user_reaction === 'dislike') {
        dislikeBtn.classList.add('active-dislike');
    }

    likeBtn.addEventListener('click', () => reactChatMessage(msg.id, 'like'));
    dislikeBtn.addEventListener('click', () => reactChatMessage(msg.id, 'dislike'));
    replyBtn.addEventListener('click', () => showReplyInput(wrapper, msg.id));

    actions.appendChild(likeBtn); actions.appendChild(dislikeBtn); actions.appendChild(replyBtn);

    wrapper.appendChild(meta); wrapper.appendChild(body); wrapper.appendChild(actions);

    // Add menu for owner
    if (isOwner) {
        const menuDiv = document.createElement('div');
        menuDiv.id = `chat_menu_${msg.id}`;
        menuDiv.style.display = 'none';
        menuDiv.style.position = 'absolute';
        menuDiv.style.right = '0.5rem';
        menuDiv.style.top = '1.8rem';
        menuDiv.style.background = 'white';
        menuDiv.style.border = '1px solid #e5e7eb';
        menuDiv.style.borderRadius = '6px';
        menuDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        menuDiv.style.zIndex = '1000';
        menuDiv.style.minWidth = '120px';
        menuDiv.innerHTML = '<button onclick="editChatMessage(' + msg.id + ')" style="background: none; border: none; cursor: pointer; width: 100%; text-align: left; padding: 0.75rem 1rem; color: #3b82f6; font-size: 0.875rem; white-space: nowrap; border-bottom: 1px solid #e5e7eb;"><i class="fas fa-edit"></i> Edit</button><button onclick="deleteChatMessage(' + msg.id + ')" style="background: none; border: none; cursor: pointer; width: 100%; text-align: left; padding: 0.75rem 1rem; color: #ef4444; font-size: 0.875rem; white-space: nowrap;"><i class="fas fa-trash"></i> Unsend</button>';
        wrapper.appendChild(menuDiv);
    }

    // replies
    if (msg.replies && msg.replies.length) {
        const repliesWrap = document.createElement('div'); repliesWrap.style.marginTop = '0.5rem'; repliesWrap.style.paddingLeft = '0.75rem'; repliesWrap.dataset.repliesFor = msg.id;
        msg.replies.forEach(r => {
            const replyEl = renderChatReply(r);
            repliesWrap.appendChild(replyEl);
        });
        wrapper.appendChild(repliesWrap);
    }

    return wrapper;
}

function renderChatReply(reply) {
    const replyPic = getProfilePictureUrl(reply.author_profile_picture) || `uploads/default-avatar.svg`;
    const rEl = document.createElement('div');
    rEl.className = 'chat-message reply';
    rEl.style.background = '#fff';
    rEl.dataset.id = reply.id;

    const roleClass = reply.author_role === 'admin' ? 'role-admin' : reply.author_role === 'barangay' ? 'role-barangay' : 'role-user';
    const roleBadge = (reply.author_role === 'admin' || reply.author_role === 'barangay') ? `<span class="role-badge ${roleClass}" style="font-size: 0.65rem; margin-left: 0.5rem;">${reply.author_role}</span>` : '';

    const meta = document.createElement('div');
    meta.style.display = 'flex';
    meta.style.alignItems = 'center';
    meta.style.gap = '0.25rem';
    meta.style.marginBottom = '0.25rem';
    meta.innerHTML = `<img src="${replyPic}" alt="${reply.author_name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;"><strong>${escapeHtml(reply.author_name)}</strong>${roleBadge}<div style="font-size: 0.75rem; color: #999;">${new Date(reply.created_at).toLocaleString()}</div>`;

    const body = document.createElement('div');
    body.className = 'chat-body';
    body.innerHTML = `<div>${escapeHtml(reply.message)}</div>`;

    const actions = document.createElement('div');
    actions.className = 'chat-actions';
    const likeBtn = document.createElement('button');
    likeBtn.className = 'reaction-btn';
    likeBtn.innerHTML = `<i class="fas fa-thumbs-up"></i> <span class="reaction-count" data-like-id="${reply.id}">${reply.likes || 0}</span>`;
    const dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'reaction-btn';
    dislikeBtn.innerHTML = `<i class="fas fa-thumbs-down"></i> <span class="reaction-count" data-dislike-id="${reply.id}">${reply.dislikes || 0}</span>`;

    likeBtn.addEventListener('click', () => reactChatMessage(reply.id, 'like'));
    dislikeBtn.addEventListener('click', () => reactChatMessage(reply.id, 'dislike'));

    actions.appendChild(likeBtn);
    actions.appendChild(dislikeBtn);

    rEl.appendChild(meta);
    rEl.appendChild(body);
    rEl.appendChild(actions);

    return rEl;
}

function showReplyInput(container, parentId) {
    // prevent multiple
    if (container.querySelector('.reply-input')) return;
    const box = document.createElement('div'); box.style.marginTop = '0.5rem';
    box.innerHTML = `<input class="reply-input" placeholder="Write a reply" /><button class="btn btn-primary">Send</button>`;
    container.appendChild(box);
    const input = box.querySelector('input'); const btn = box.querySelector('button');
    btn.addEventListener('click', async () => {
        const text = input.value.trim(); if (!text) return;
        const fd = new FormData(); fd.append('action', 'create_chat_message'); fd.append('message', text); fd.append('parent_message_id', parentId);
        const r = await fetch('api.php', { method: 'POST', body: fd }); const data = await r.json();
        if (data.success) { box.remove(); showToast('Reply posted', 'success'); loadChatMessages({ forceScroll: true }); } else { showToast(data.error || 'Failed', 'error'); }
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput'); if (!input) return;
    const text = input.value.trim(); if (!text) return;
    if (isGuestMode) { showToast('Please login to join the chat', 'info'); showAuthModal('login'); return; }
    const fd = new FormData(); fd.append('action', 'create_chat_message'); fd.append('message', text);
    const res = await fetch('api.php', { method: 'POST', body: fd }); const data = await res.json();
    if (data.success) { input.value = ''; loadChatMessages({ forceScroll: true }); showToast('Message sent', 'success'); } else { showToast(data.error || 'Failed to send', 'error'); }
}

async function reactChatMessage(messageId, reaction, likeBtn, dislikeBtn) {
    if (isGuestMode) { showToast('Please login to react', 'info'); showAuthModal('login'); return; }
    const fd = new FormData(); fd.append('action', 'react_chat_message'); fd.append('message_id', messageId); fd.append('reaction', reaction);
    const r = await fetch('api.php', { method: 'POST', body: fd }); const data = await r.json();
    if (data.success) {
        const msgEl = document.querySelector(`.chat-message[data-id="${messageId}"]`);
        if (!msgEl) return;

        const likeBtn = msgEl.querySelector('.reaction-btn:has(i.fa-thumbs-up)');
        const dislikeBtn = msgEl.querySelector('.reaction-btn:has(i.fa-thumbs-down)');
        const likeSpan = msgEl.querySelector('[data-like-id]');
        const dislikeSpan = msgEl.querySelector('[data-dislike-id]');

        if (likeSpan) likeSpan.textContent = data.likes;
        if (dislikeSpan) dislikeSpan.textContent = data.dislikes;

        // Update active states
        if (likeBtn) {
            likeBtn.classList.toggle('active-like', data.user_reaction === 'like');
            likeBtn.classList.remove('active-dislike');
        }
        if (dislikeBtn) {
            dislikeBtn.classList.toggle('active-dislike', data.user_reaction === 'dislike');
            dislikeBtn.classList.remove('active-like');
        }
    } else { showToast(data.error || 'Failed', 'error'); }
}

// utility
function escapeHtml(s) { return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Modal open state helper: remove the body class only when no modal is active
function removeModalOpenIfNoActive() {
    if (document.querySelectorAll('.modal.active').length === 0) {
        document.body.classList.remove('modal-open');
    }
}

// auto-refresh chat and announcements when sidebar open
setInterval(() => { const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('open')) { const active = document.querySelector('.sidebar-tabs .tab.active'); if (active && active.dataset.tab === 'chat') loadChatMessages(); if (active && active.dataset.tab === 'announcements') loadAnnouncements(); } }, 8000);

// Close report modal
function closeReportModal() {
    document.getElementById('reportModal').classList.remove('active');

    // Reset form
    document.getElementById('reportForm').reset();

    // Clear image preview
    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }

    // Clear file input
    const fileInput = document.getElementById('reportImage');
    if (fileInput) fileInput.value = '';

    // Clear coordinate inputs
    const latInput = document.getElementById('reportLat');
    const lngInput = document.getElementById('reportLng');
    const addressInput = document.getElementById('reportAddress');

    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    if (addressInput) addressInput.value = '';

    // Remove temporary marker
    if (window.tempMarker) {
        try {
            map.removeLayer(window.tempMarker);
        } catch (e) { /* ignore */ }
        window.tempMarker = null;
    }

    removeModalOpenIfNoActive();
}

// Show report user modal
// Preview image
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('imagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Camera capture functions
let cameraStream = null;

function openCameraCapture() {
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Your browser does not support camera access. Please use a modern browser like Chrome, Firefox, Safari, or Edge.', 'error');
        return;
    }

    document.getElementById('cameraModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeCameraModal() {
    document.getElementById('cameraModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    stopCamera();
}

async function startCamera() {
    try {
        // Check browser support first
        if (!navigator.mediaDevices) {
            throw new Error('MediaDevices not supported. Make sure you are using HTTPS or localhost.');
        }

        if (!navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported by your browser.');
        }

        console.log('Starting camera...');
        console.log('Browser supports mediaDevices:', !!navigator.mediaDevices);
        console.log('Browser supports getUserMedia:', !!navigator.mediaDevices.getUserMedia);

        // First try with environment camera (back camera on mobile)
        let constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Environment camera stream obtained');
        } catch (err) {
            console.warn('Environment camera failed, trying any available camera:', err);
            // Fallback: try any camera without facingMode preference
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            console.log('Fallback camera stream obtained');
        }

        const video = document.getElementById('cameraVideo');
        if (!video) {
            throw new Error('Video element not found in DOM');
        }

        video.srcObject = cameraStream;

        // Ensure video is playing
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.error('Error playing video:', e));
        }

        video.style.display = 'block';
        console.log('Camera started successfully');

        // Hide preview if exists
        document.getElementById('cameraPhotoPreview').style.display = 'none';

        // Show/hide buttons
        document.getElementById('startCameraBtn').style.display = 'none';
        document.getElementById('stopCameraBtn').style.display = 'inline-block';
        document.getElementById('captureControls').style.display = 'flex';
        document.getElementById('usePhotoControls').style.display = 'none';
        document.getElementById('captureBtn').style.display = 'inline-block';
        document.getElementById('retryBtn').style.display = 'none';

    } catch (error) {
        console.error('Camera error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);

        let errorMessage = 'Camera error: ';

        if (!navigator.mediaDevices) {
            errorMessage = 'Camera not available. Please use a modern browser (Chrome, Firefox, Safari, or Edge) and check if camera is connected.';
        } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage = 'Camera permission denied. Please allow camera access in your browser/device settings and try again.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage = 'No camera found on this device. Please connect a camera.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage = 'Camera is already in use by another application. Please close it first.';
        } else if (error.name === 'SecurityError') {
            errorMessage = 'Camera access error. Try using HTTPS or accessing from localhost.';
        } else if (error.name === 'TypeError') {
            errorMessage = 'Camera not supported on this browser. Please use a modern browser like Chrome, Firefox, Safari, or Edge.';
        } else {
            errorMessage += error.message || 'Unknown error. Check browser console for details.';
        }

        console.error('Final error message:', errorMessage);
        showToast(errorMessage, 'error');

        // Reset buttons to initial state
        document.getElementById('startCameraBtn').style.display = 'inline-block';
        document.getElementById('stopCameraBtn').style.display = 'none';
        document.getElementById('captureControls').style.display = 'none';
    }
}

function stopCamera() {
    if (cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => track.stop());
        cameraStream = null;

        const video = document.getElementById('cameraVideo');
        video.style.display = 'none';
        video.srcObject = null;

        document.getElementById('startCameraBtn').style.display = 'inline-block';
        document.getElementById('stopCameraBtn').style.display = 'none';
        document.getElementById('captureControls').style.display = 'none';
    }
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to image
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const preview = document.getElementById('cameraPhotoPreview');
    preview.src = imageData;
    preview.style.display = 'block';

    // Hide video
    video.style.display = 'none';

    // Update buttons
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('retryBtn').style.display = 'inline-block';
    document.getElementById('usePhotoControls').style.display = 'flex';
    document.getElementById('stopCameraBtn').style.display = 'none';
}

function useCapture() {
    const preview = document.getElementById('cameraPhotoPreview');
    const reportPreview = document.getElementById('imagePreview');

    // Copy the captured image to the report form
    reportPreview.src = preview.src;
    reportPreview.style.display = 'block';

    // Store the image data in the file input
    // Create a blob from the canvas
    const canvas = document.getElementById('cameraCanvas');
    canvas.toBlob((blob) => {
        // Create a File from the blob
        const file = new File([blob], 'camera_photo.jpg', { type: 'image/jpeg' });

        // Create a DataTransfer object and add the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // Set the file input's files
        document.getElementById('reportImage').files = dataTransfer.files;
    });

    // Close camera modal
    closeCameraModal();
    showToast('Photo captured successfully!', 'success');
}

// Handle report submit
async function handleReportSubmit(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('action', 'create_incident');
    formData.append('disaster_type', document.getElementById('disasterType').value);
    formData.append('title', document.getElementById('reportTitle').value);
    formData.append('description', document.getElementById('reportDescription').value);

    // For barangay/admin, send the selected severity
    // Users don't submit severity at all - it will be NULL in database
    if (currentUser && currentUser.role !== 'user') {
        formData.append('severity', document.getElementById('reportSeverity').value);
    }

    formData.append('latitude', document.getElementById('reportLat').value);
    formData.append('longitude', document.getElementById('reportLng').value);
    formData.append('address', document.getElementById('reportAddress').value);

    const imageFile = document.getElementById('reportImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Incident reported successfully!', 'success');
            closeReportModal();
            addIncidentMarker(data.incident);
            // Ensure marker HTML/class/status is updated in-place immediately
            if (typeof updateMapMarker === 'function') {
                updateMapMarker(data.incident);
            }

            try { loadVotingList(); } catch (e) { /* ignore */ }
        } else {
            showToast(data.error || 'Failed to report incident', 'error');
        }
    } catch (error) {
        showToast('Failed to report incident', 'error');
    }
}

// Load incidents
async function loadIncidents() {
    try {
        const response = await fetch('api.php?action=get_incidents');
        const incidents = await response.json();

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Add markers for each incident
        incidents.forEach(incident => addIncidentMarker(incident));
    } catch (error) {
        console.error('Failed to load incidents:', error);
    }
}

// Add incident marker
function addIncidentMarker(incident) {
    const iconClass = `icon-${incident.disaster_type}`;
    const iconMap = {
        fire: '🔥',
        flood: '🌊',
        earthquake: '🏚️',
        typhoon: '🌀',
        landslide: '⛰️',
        accident: '🚗',
        other: '❓'
    };

    // Severity-based circular marker + status badge
    const severityClass = incident.severity ? `severity-${incident.severity}` : 'severity-neutral';
    const severityIcon = incident.severity === 'critical' ? '‼️' : '⚠️';
    const statusIconMap = { reported: '📝', responding: '🚨', in_area: '📍', resolved: '✖' };
    const statusIcon = statusIconMap[incident.status] || '';

    const lat = typeof incident.latitude === 'string' ? parseFloat(incident.latitude) : incident.latitude;
    const lng = typeof incident.longitude === 'string' ? parseFloat(incident.longitude) : incident.longitude;
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: `disaster-marker ${iconClass} ${severityClass}`,
            html: `
                <div class="marker-circle ${severityClass}">
                    <div class="marker-emoji">${iconMap[incident.disaster_type]}</div>
                    ${incident.severity ? `<div class="marker-severity-badge">${severityIcon}</div>` : ''}
                    <div class="marker-status-badge marker-${incident.status}">${statusIcon}</div>
                </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 48], // Bottom center for popup alignment
            popupAnchor: [0, -48] // Place popup above marker, not covering it
        })
    }).addTo(map);

    // Store incident ID on marker for real-time updates
    marker.incidentId = incident.id;

    const severityText = incident.severity ? incident.severity.toUpperCase() : 'PENDING';
    const severityClassPopup = incident.severity ? `severity-${incident.severity}` : 'severity-neutral';
    const statusText = incident.status === 'reported' ? 'Reported' : incident.status === 'responding' ? 'Responding' : incident.status === 'in_area' ? 'In Area' : 'Resolved';
    const statusClassPopup = `status-${incident.status}`;

    marker.bindPopup(`
        <div style="min-width: 240px;">
            <h3 style="margin-bottom: 0.5rem;">${incident.title}</h3>
            <p style="margin: 0.5rem 0; color: #6b7280; text-transform: capitalize;">${incident.disaster_type}</p>
            <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
                ${incident.severity ? `<span class="severity-badge ${severityClassPopup}">${severityText}</span>` : ''}
                <span class="status-badge ${statusClassPopup}">${statusText}</span>
            </div>

            <button onclick="showIncidentDetails(${incident.id})" class="btn btn-primary" style="margin-top: 0.5rem; width: 100%;">
                View Details
            </button>
        </div>
    `);

    markers.push(marker);
    // Fix marker offset by forcing map to recalculate positions
    if (map && typeof map.invalidateSize === 'function') {
        setTimeout(() => map.invalidateSize(), 0);
    }
}

// Update a single marker in real-time
function updateMapMarker(incident) {
    // Find the marker for this incident
    const marker = markers.find(m => m.incidentId === incident.id);

    if (marker) {
        // Get the Leaflet div icon element
        const iconElement = marker.getElement();

        if (iconElement) {
            // Prepare updated icon HTML
            const iconMap = {
                fire: '🔥',
                flood: '🌊',
                earthquake: '🏚️',
                typhoon: '🌀',
                landslide: '⛰️',
                accident: '🚗',
                other: '❓'
            };
            const iconClass = `icon-${incident.disaster_type}`;
            const severityClass = incident.severity ? `severity-${incident.severity}` : 'severity-neutral';
            const severityIcon = incident.severity === 'critical' ? '‼️' : '⚠️';
            const statusIconMap = { reported: '📝', responding: '🚨', in_area: '📍', resolved: '✖' };
            const statusIcon = statusIconMap[incident.status] || '';

            // Update the icon element's classes
            iconElement.className = `leaflet-marker-icon disaster-marker ${iconClass} ${severityClass} leaflet-zoom-animated leaflet-interactive`;

            // Update the inner HTML
            iconElement.innerHTML = `
                <div class="marker-circle ${severityClass}">
                    <div class="marker-emoji">${iconMap[incident.disaster_type]}</div>
                    ${incident.severity ? `<div class="marker-severity-badge">${severityIcon}</div>` : ''}
                    <div class="marker-status-badge marker-${incident.status}">${statusIcon}</div>
                </div>
            `;

            // Update popup content
            const severityText = incident.severity ? incident.severity.toUpperCase() : 'PENDING';
            const severityClassPopup = incident.severity ? `severity-${incident.severity}` : 'severity-neutral';
            const statusText = incident.status === 'reported' ? 'Reported' : incident.status === 'responding' ? 'Responding' : incident.status === 'in_area' ? 'In Area' : 'Resolved';
            const statusClassPopup = `status-${incident.status}`;

            const popupContent = `
                <div style="min-width: 240px;">
                    <h3 style="margin-bottom: 0.5rem;">${incident.title}</h3>
                    <p style="margin: 0.5rem 0; color: #6b7280; text-transform: capitalize;">${incident.disaster_type}</p>
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
                        ${incident.severity ? `<span class="severity-badge ${severityClassPopup}">${severityText}</span>` : ''}
                        <span class="status-badge ${statusClassPopup}">${statusText}</span>
                    </div>

                    <button onclick="showIncidentDetails(${incident.id})" class="btn btn-primary" style="margin-top: 0.5rem; width: 100%;">
                        View Details
                    </button>
                </div>
            `;

            marker.setPopupContent(popupContent);
        }
    } else {
        // If marker doesn't exist, add it
        addIncidentMarker(incident);
    }
}

// Show incident details
async function showIncidentDetails(incidentId) {
    // Store current incident ID globally
    window.currentIncidentId = incidentId;

    try {
        const response = await fetch(`api.php?action=get_incident&id=${incidentId}`);
        const incident = await response.json();

        if (incident.error) {
            showToast('Failed to load incident details', 'error');
            return;
        }

        // Ensure address is populated - if missing, use reverse geocoding
        if (!incident.address && incident.latitude && incident.longitude) {
            incident.address = await reverseGeocodeCoordinates(incident.latitude, incident.longitude);
        }

        // Load comments
        const commentsResponse = await fetch(`api.php?action=get_comments&incident_id=${incidentId}`);
        const comments = await commentsResponse.json();

        const iconMap = {
            fire: '🔥',
            flood: '🌊',
            earthquake: '🏚️',
            typhoon: '🌀',
            landslide: '⛰️',
            accident: '🚗',
            other: '❓'
        };

        const severityClass = incident.severity ? `severity-${incident.severity}` : 'severity-neutral';
        const severityText = incident.severity ? incident.severity.toUpperCase() : 'PENDING';
        const statusClass = `status-${incident.status}`;
        const statusText = incident.status === 'reported' ? 'Reported' : incident.status === 'responding' ? 'Responding' : incident.status === 'in_area' ? 'In Area' : 'Resolved';

        let detailsHTML = `
            <div class="incident-details">
                <div style="text-align: center; margin-bottom: 1rem;">
                    <div class="detail-icon ${severityClass}" style="margin:auto;">
                        <div class="marker-emoji" style="font-size: 2.5rem;">${iconMap[incident.disaster_type]}</div>
                    </div>
                    <h3>${incident.title}</h3>
                    <div class="detail-badges" style="margin-top:0.5rem;">
                        ${incident.severity ? `
                        <div class="badge-col">
                            <div class="badge-key" style="font-size:0.85rem; margin-bottom:0.25rem;">Severity</div>
                            <span class="severity-badge ${severityClass}">${severityText}</span>
                        </div>
                        ` : ''}
                        <div class="badge-col">
                            <div class="badge-key" style="font-size:0.85rem; margin-bottom:0.25rem;">Status</div>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                    </div>

                </div>
                
                ${incident.image_path ? `<img src="${incident.image_path}" class="incident-image">` : ''}
                
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span>${incident.disaster_type}</span>
                </div>
                
                ${incident.severity ? `
                <div class="detail-row">
                    <span class="detail-label">Severity:</span>
                    <span style="text-transform: uppercase; font-weight: 600;">${incident.severity}</span>
                </div>
                ` : ''}
                
                <div class="detail-row">
                    <span class="detail-label">Reported by:</span>
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="${getProfilePictureUrl(incident.reporter_profile_picture) || 'uploads/default-avatar.svg'}" alt="${incident.reporter_name}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                        <span>${incident.reporter_name}</span>
                        <span class="role-badge role-${incident.reporter_role}" style="font-size: 0.65rem;">${incident.reporter_role}</span>
                    </span>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">Location:&nbsp;</span>
                    <span>${incident.address || 'Unknown'}</span>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span>${new Date(incident.created_at).toLocaleString()}</span>
                </div>
                
                <div style="margin-top: 1rem;">
                    <strong>Description:</strong>
                    <p style="margin-top: 0.5rem;">${incident.description}</p>
                </div>
                
                ${(!isGuestMode && (currentUser.role === 'barangay' || currentUser.role === 'admin')) ? `
                    <div class="manage-section">
                        <h4>
                            <i class="fas fa-tools"></i> Manage Incident
                        </h4>
                        <div class="manage-controls">
                            <div class="status-control">
                                <select id="statusSelect">
                                    <option value="reported" ${incident.status === 'reported' ? 'selected' : ''}>📝 Reported</option>
                                    <option value="responding" ${incident.status === 'responding' ? 'selected' : ''}>🔄 Responding</option>
                                    <option value="in_area" ${incident.status === 'in_area' ? 'selected' : ''}>📍 In Area</option>
                                </select>
                                <button onclick="updateIncidentStatusOnly(${incident.id})" class="btn btn-primary">
                                    <i class="fas fa-sync-alt"></i> Update Status
                                </button>
                            </div>

                            <div class="severity-control">
                                <select id="severitySelect">
                                    <option value="none" ${!incident.severity ? 'selected' : ''}>⚪ None</option>
                                    <option value="low" ${incident.severity === 'low' ? 'selected' : ''}>🟢 Low</option>
                                    <option value="medium" ${incident.severity === 'medium' ? 'selected' : ''}>🟡 Medium</option>
                                    <option value="high" ${incident.severity === 'high' ? 'selected' : ''}>🟠 High</option>
                                    <option value="critical" ${incident.severity === 'critical' ? 'selected' : ''}>🔴 Critical</option>
                                </select>
                                <button onclick="updateIncidentSeverity(${incident.id})" class="btn btn-warning">
                                    <i class="fas fa-exclamation-triangle"></i> Update Severity
                                </button>
                            </div>

                            <button onclick="resolveIncident(${incident.id})" class="btn btn-danger" style="white-space: nowrap;">
                                <i class="fas fa-check-circle"></i> Resolve
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                ${!isGuestMode && (currentUser.role !== 'barangay' && currentUser.role !== 'admin') ? `
                    <div style="margin-top: 1rem;">
                        <button onclick="${incident.user_confirmed ? "showToast('Confirmations cannot be undone', 'info')" : `toggleConfirmIncident(${incident.id})`}" class="btn ${incident.user_confirmed ? 'btn-success' : 'btn-primary'}" id="confirmBtn_${incident.id}">
                            <i class="fas ${incident.user_confirmed ? 'fa-check-circle' : 'fa-thumbs-up'}"></i> 
                            ${incident.user_confirmed ? 'Confirmed' : 'Confirm'} (${incident.confirmation_count})
                        </button>
                        ${incident.user_confirmed ? `
                            <p style="margin-top: 0.5rem; font-size: 0.85rem; color: #059669;">
                                <i class="fas fa-check-circle"></i> You have confirmed this incident
                            </p>
                        ` : ''}
                    </div>
                ` : isGuestMode ? `
                    <div style="margin-top: 1rem;">
                        <button onclick="showToast('Please login or register to confirm incidents', 'info')" class="btn btn-outline">
                            <i class="fas fa-thumbs-up"></i> Confirm (${incident.confirmation_count})
                        </button>
                    </div>
                ` : ''}
                
                <div class="comments-section">
                    <h3 style="margin-bottom: 1rem;"><i class="fas fa-comments"></i> Comments</h3>
                    
                    ${isGuestMode ? `
                        <div style="background: #eff6ff; padding: 1rem; border-radius: 8px; text-align: center; margin-bottom: 1rem;">
                            <i class="fas fa-lock"></i> Please login or register to add comments
                        </div>
                    ` : `
                        <div class="form-group">
                            <textarea id="commentText" placeholder="Add a comment..." style="margin-bottom: 0.5rem;"></textarea>
                            <button onclick="addComment(${incident.id})" class="btn btn-primary">
                                <i class="fas fa-paper-plane"></i> Post Comment
                            </button>
                        </div>
                    `}
                    
                    <div id="commentsList" style="margin-top: 1rem;">
        `;

        // Organize comments into parent and replies
        const parentComments = comments.filter(c => !c.parent_comment_id);
        const replyMap = {};

        comments.forEach(comment => {
            if (comment.parent_comment_id) {
                if (!replyMap[comment.parent_comment_id]) {
                    replyMap[comment.parent_comment_id] = [];
                }
                replyMap[comment.parent_comment_id].push(comment);
            }
        });

        // Render parent comments with their replies
        parentComments.forEach(comment => {
            detailsHTML += renderComment(comment, false);

            // Render replies
            if (replyMap[comment.id]) {
                replyMap[comment.id].forEach(reply => {
                    detailsHTML += renderComment(reply, true);
                });
            }
        });

        detailsHTML += `
                    </div>
                </div>
            </div>
        `;

        document.getElementById('incidentDetails').innerHTML = detailsHTML;
        document.getElementById('detailsModal').classList.add('active');
        document.body.classList.add('modal-open');


    } catch (error) {
        showToast('Failed to load incident details', 'error');
    }
}

// Render a single comment
function renderComment(comment, isReply = false) {
    const likeClass = comment.user_reaction === 'like' ? 'active-like' : '';
    const dislikeClass = comment.user_reaction === 'dislike' ? 'active-dislike' : '';
    const profilePicture = getProfilePictureUrl(comment.profile_picture) || `uploads/default-avatar.svg`;
    const isOwner = !isGuestMode && currentUser && currentUser.id === comment.user_id;

    return `
        <div class="comment ${isReply ? 'reply' : ''}" id="comment_${comment.id}">
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.5rem;">
                <img src="${profilePicture}" alt="${comment.full_name}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                <div style="flex: 1;">
                    <div class="comment-header">
                        <span class="comment-author">${comment.full_name}</span>
                        <span class="role-badge role-${comment.role}" style="font-size: 0.65rem; margin-left: 0.5rem;">${comment.role}</span>
                        ${isOwner ? `
                            <div style="margin-left: auto; position: relative;">
                                <button class="comment-menu-btn" onclick="toggleCommentMenu(${comment.id}, event)" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #9ca3af; padding: 0;">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div id="comment_menu_${comment.id}" class="comment-menu" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 100;">
                                    <button onclick="deleteComment(${comment.id}); event.stopPropagation();" style="background: none; border: none; cursor: pointer; width: 100%; text-align: left; padding: 0.75rem 1rem; color: #ef4444; font-size: 0.875rem; white-space: nowrap;">
                                        <i class="fas fa-trash"></i> Unsend
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="comment-time">${new Date(comment.created_at).toLocaleString()}</div>
                    <p style="margin: 0.5rem 0;">${comment.comment}</p>
                    
                    <div class="comment-actions">
                        ${isGuestMode ? `
                            <button class="comment-action-btn" onclick="showToast('Please login to react', 'info')">
                                <i class="fas fa-thumbs-up"></i> ${comment.likes || 0}
                            </button>
                            <button class="comment-action-btn" onclick="showToast('Please login to react', 'info')">
                                <i class="fas fa-thumbs-down"></i> ${comment.dislikes || 0}
                            </button>
                            <button class="comment-action-btn" onclick="showToast('Please login to reply', 'info')">
                                <i class="fas fa-reply"></i> Reply
                            </button>
                        ` : `
                            <button class="comment-action-btn ${likeClass}" onclick="reactToComment(${comment.id}, 'like')">
                                <i class="fas fa-thumbs-up"></i> <span id="likes_${comment.id}">${comment.likes || 0}</span>
                            </button>
                            <button class="comment-action-btn ${dislikeClass}" onclick="reactToComment(${comment.id}, 'dislike')">
                                <i class="fas fa-thumbs-down"></i> <span id="dislikes_${comment.id}">${comment.dislikes || 0}</span>
                            </button>
                            ${!isReply ? `
                                <button class="comment-action-btn" onclick="toggleReplyForm(${comment.id})">
                                    <i class="fas fa-reply"></i> Reply
                                </button>
                            ` : ''}
                        `}
                    </div>
                    
                    ${!isGuestMode && !isReply ? `
                        <div id="reply_form_${comment.id}" class="reply-form" style="display: none;">
                            <textarea id="reply_text_${comment.id}" class="reply-input" placeholder="Write a reply..."></textarea>
                            <div class="reply-actions">
                                <button onclick="submitReply(${comment.id})" class="btn btn-primary btn-sm">
                                    <i class="fas fa-paper-plane"></i> Reply
                                </button>
                                <button onclick="toggleReplyForm(${comment.id})" class="btn btn-outline btn-sm">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Delete chat message
async function deleteChatMessage(messageId) {
    if (!confirm('Are you sure you want to unsend this message?')) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'delete_chat_message');
    formData.append('message_id', messageId);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Message unsent', 'success');

            // Instantly remove the chat message from DOM with animation
            const messageElement = document.getElementById(`chat_message_${messageId}`);
            if (messageElement) {
                // Add fade-out animation
                messageElement.style.transition = 'opacity 0.3s ease-out';
                messageElement.style.opacity = '0';

                // Remove after animation completes
                setTimeout(() => {
                    if (messageElement && messageElement.parentNode) {
                        messageElement.remove();

                        // Trigger custom event for real-time updates
                        window.dispatchEvent(new CustomEvent('chatMessageDeleted', {
                            detail: { messageId: messageId }
                        }));
                    }
                }, 300);
            }
        } else {
            showToast(data.error || 'Failed to unsend message', 'error');
        }
    } catch (error) {
        showToast('Failed to unsend message', 'error');
    }
}

// Edit chat message
function editChatMessage(messageId) {
    // Close menu
    const menu = document.getElementById(`chat_menu_${messageId}`);
    if (menu) menu.style.display = 'none';

    const messageEl = document.getElementById(`chat_message_${messageId}`);
    if (!messageEl) return;

    const bodyEl = messageEl.querySelector('.chat-body');
    if (!bodyEl) return;

    const currentText = bodyEl.innerText;

    // Create edit box
    const editBox = document.createElement('div');
    editBox.style.marginTop = '0.5rem';
    editBox.style.padding = '0.5rem';
    editBox.style.background = '#f3f4f6';
    editBox.style.borderRadius = '6px';
    editBox.innerHTML = `
        <textarea style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; resize: vertical; min-height: 80px;">${escapeHtml(currentText)}</textarea>
        <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
            <button onclick="saveChatMessageEdit(${messageId}, this)" style="padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem;"><i class="fas fa-check"></i> Save</button>
            <button onclick="cancelChatMessageEdit(${messageId})" style="padding: 0.5rem 1rem; background: #e5e7eb; color: #374151; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem;"><i class="fas fa-times"></i> Cancel</button>
        </div>
    `;

    messageEl.appendChild(editBox);
    messageEl.dataset.editingId = messageId;
}

// Save chat message edit
async function saveChatMessageEdit(messageId, buttonEl) {
    const messageEl = document.getElementById(`chat_message_${messageId}`);
    if (!messageEl) return;

    const editBox = messageEl.querySelector('[style*="margin-top: 0.5rem"]');
    const textarea = editBox ? editBox.querySelector('textarea') : null;
    if (!textarea) return;

    const newText = textarea.value.trim();
    if (!newText) {
        showToast('Message cannot be empty', 'error');
        return;
    }

    // Disable button
    buttonEl.disabled = true;
    buttonEl.style.opacity = '0.6';

    const formData = new FormData();
    formData.append('action', 'edit_chat_message');
    formData.append('message_id', messageId);
    formData.append('message', newText);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Message edited', 'success');
            // Update body
            const bodyEl = messageEl.querySelector('.chat-body');
            if (bodyEl) {
                bodyEl.innerHTML = `<div>${escapeHtml(newText)}</div>`;
            }
            // Remove edit box
            if (editBox) editBox.remove();
            delete messageEl.dataset.editingId;
        } else {
            showToast(data.error || 'Failed to edit message', 'error');
            buttonEl.disabled = false;
            buttonEl.style.opacity = '1';
        }
    } catch (error) {
        showToast('Failed to edit message', 'error');
        buttonEl.disabled = false;
        buttonEl.style.opacity = '1';
    }
}

// Cancel chat message edit
function cancelChatMessageEdit(messageId) {
    const messageEl = document.getElementById(`chat_message_${messageId}`);
    if (!messageEl) return;

    const editBox = messageEl.querySelector('[style*="margin-top: 0.5rem"]');
    if (editBox && editBox.querySelector('textarea')) {
        editBox.remove();
        delete messageEl.dataset.editingId;
    }
}

// Toggle chat message menu
function toggleChatMenu(messageId) {
    // Close all other menus first
    document.querySelectorAll('[id^="chat_menu_"]').forEach(menu => {
        if (menu.id !== `chat_menu_${messageId}`) {
            menu.style.display = 'none';
        }
    });

    const menu = document.getElementById(`chat_menu_${messageId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================================================
// ANNOUNCEMENT FUNCTIONS
// ============================================================================

async function loadAnnouncements() {
    const container = document.getElementById('announcementMessages');
    if (!container) return;

    container.innerHTML = 'Loading...';

    try {
        const res = await fetch('api.php?action=get_announcements');
        const announcements = await res.json();

        container.innerHTML = '';

        if (announcements.length === 0) {
            container.innerHTML = '<p style="padding: 1rem; text-align: center; color: #999;">No announcements yet</p>';
            updateAnnouncementFormVisibility();
            return;
        }

        announcements.forEach(a => {
            const announcementEl = document.createElement('div');
            announcementEl.className = 'announcement-item';
            announcementEl.dataset.id = a.id;
            announcementEl.style.marginBottom = '1rem';
            announcementEl.style.padding = '1rem';
            announcementEl.style.borderRadius = '8px';
            announcementEl.style.backgroundColor = '#fff8e1';
            announcementEl.style.borderLeft = '4px solid #f59e0b';

            const authorPic = getProfilePictureUrl(a.author_profile_picture) || `uploads/default-avatar.svg`;
            const roleClass = a.author_role === 'admin' ? 'role-admin' : 'role-barangay';

            announcementEl.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <img src="${authorPic}" alt="${a.author_name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem;">
                            <strong>${escapeHtml(a.author_name)}</strong>
                            <span class="badge-label"><span class="role-badge ${roleClass}">${escapeHtml(a.author_role)}</span></span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">${new Date(a.created_at).toLocaleString()}</div>
                    </div>
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem; color: #1f2937;">${escapeHtml(a.title)}</div>
                    <div style="line-height: 1.5; color: #333;">${escapeHtml(a.message).replace(/\n/g, '<br>')}</div>
                </div>
                <div id="announcement_comments_${a.id}" style="margin-top: 0.75rem; border-top: 1px solid #e5e7eb; padding-top: 0.75rem;">
                    <!-- Comments will be rendered here -->
                </div>
                <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid #e5e7eb;">
                    <button onclick="showAnnouncementReplyInput(${a.id})" class="chat-action-btn-sm" style="background: none; border: none; color: #2563eb; cursor: pointer; padding: 0; font-size: 0.9rem;">
                        <i class="fas fa-reply"></i> Reply
                    </button>
                </div>
                <div id="announcement_reply_form_${a.id}"></div>
            `;

            container.appendChild(announcementEl);

            // Render comments
            const commentsContainer = announcementEl.querySelector(`#announcement_comments_${a.id}`);
            if (a.comments && a.comments.length > 0) {
                a.comments.forEach(c => {
                    const commentEl = renderAnnouncementComment(c, a.id);
                    commentsContainer.appendChild(commentEl);
                });
            } else {
                commentsContainer.innerHTML = '<p style="font-size: 0.9rem; color: #999; text-align: center; padding: 0.5rem;">No comments yet</p>';
            }
        });

        updateAnnouncementFormVisibility();
    } catch (e) {
        console.error('Error loading announcements:', e);
        container.innerHTML = '<p style="padding: 1rem; color: #ef4444;">Error loading announcements</p>';
    }
}

function renderAnnouncementComment(comment, announcementId, isReply = false) {
    const commentEl = document.createElement('div');
    commentEl.className = 'announcement-comment' + (isReply ? ' reply' : '');
    commentEl.dataset.id = comment.id;
    commentEl.style.marginBottom = '0.75rem';
    commentEl.style.padding = '0.75rem';
    commentEl.style.backgroundColor = isReply ? '#f9fafb' : '#fff';
    commentEl.style.borderRadius = '6px';
    commentEl.style.marginLeft = isReply ? '1.5rem' : '0';

    const authorPic = getProfilePictureUrl(comment.author_profile_picture) || `uploads/default-avatar.svg`;
    const isOwner = !isGuestMode && currentUser && currentUser.id === comment.user_id;
    const roleClass = comment.author_role === 'admin' ? 'role-admin' : comment.author_role === 'barangay' ? 'role-barangay' : 'role-user';

    commentEl.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem;">
            <img src="${authorPic}" alt="${comment.author_name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-top: 0.1rem;">
            <div style="flex: 1;">
                <div style="display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.25rem;">
                    <strong style="font-size: 0.9rem;">${escapeHtml(comment.author_name)}</strong>
                    <span class="badge-label"><span class="role-badge ${roleClass}" style="font-size: 0.65rem;">${escapeHtml(comment.author_role)}</span></span>
                    <span style="font-size: 0.8rem; color: #999;">${new Date(comment.created_at).toLocaleString()}</span>
                </div>
                <div style="font-size: 0.95rem; line-height: 1.4; color: #333; margin-bottom: 0.5rem;">${escapeHtml(comment.message)}</div>
                <div style="display: flex; gap: 1rem; font-size: 0.85rem; align-items: center;">
                    <button onclick="reactAnnouncementComment(${comment.id}, 'like')" class="reaction-btn" data-comment-id="${comment.id}" data-reaction="like" style="background: none; border: none; cursor: pointer; padding: 0;">
                        <i class="fas fa-thumbs-up"></i> <span class="reaction-count">${comment.likes || 0}</span>
                    </button>
                    <button onclick="reactAnnouncementComment(${comment.id}, 'dislike')" class="reaction-btn" data-comment-id="${comment.id}" data-reaction="dislike" style="background: none; border: none; cursor: pointer; padding: 0;">
                        <i class="fas fa-thumbs-down"></i> <span class="reaction-count">${comment.dislikes || 0}</span>
                    </button>
                    ${isOwner ? `<button onclick="toggleAnnouncementCommentMenu(${comment.id})" style="background: none; border: none; cursor: pointer; padding: 0; margin-left: auto; color: #9ca3af; font-size: 1.2rem;"><i class="fas fa-ellipsis-v"></i></button>` : ''}
                </div>
            </div>
        </div>
    `;

    // Add menu for owner
    if (isOwner) {
        const menuDiv = document.createElement('div');
        menuDiv.id = `announcement_comment_menu_${comment.id}`;
        menuDiv.style.display = 'none';
        menuDiv.style.position = 'absolute';
        menuDiv.style.right = '0.5rem';
        menuDiv.style.top = '0.25rem';
        menuDiv.style.background = 'white';
        menuDiv.style.border = '1px solid #e5e7eb';
        menuDiv.style.borderRadius = '6px';
        menuDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        menuDiv.style.zIndex = '1000';
        menuDiv.style.minWidth = '120px';
        menuDiv.innerHTML = '<button onclick="deleteAnnouncementComment(' + comment.id + ')" style="background: none; border: none; cursor: pointer; width: 100%; text-align: left; padding: 0.75rem 1rem; color: #ef4444; font-size: 0.875rem; white-space: nowrap;"><i class="fas fa-trash"></i> Delete</button>';
        commentEl.appendChild(menuDiv);
    }

    // Set initial active state based on user_reaction
    setTimeout(() => {
        const likeBtn = commentEl.querySelector(`[data-comment-id="${comment.id}"][data-reaction="like"]`);
        const dislikeBtn = commentEl.querySelector(`[data-comment-id="${comment.id}"][data-reaction="dislike"]`);
        if (comment.user_reaction === 'like' && likeBtn) {
            likeBtn.classList.add('active-like');
        } else if (comment.user_reaction === 'dislike' && dislikeBtn) {
            dislikeBtn.classList.add('active-dislike');
        }
    }, 0);

    // Add replies if they exist
    if (comment.replies && comment.replies.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.style.marginTop = '0.5rem';
        comment.replies.forEach(reply => {
            const replyEl = renderAnnouncementComment(reply, announcementId, true);
            repliesContainer.appendChild(replyEl);
        });
        commentEl.appendChild(repliesContainer);
    }

    return commentEl;
}

function showAnnouncementReplyInput(announcementId) {
    const formContainer = document.getElementById(`announcement_reply_form_${announcementId}`);
    if (!formContainer) return;

    if (isGuestMode) {
        showToast('Please login to comment', 'info');
        showAuthModal('login');
        return;
    }

    if (formContainer.querySelector('.announcement-reply-input-form')) {
        formContainer.innerHTML = '';
        return;
    }

    const form = document.createElement('form');
    form.className = 'announcement-reply-input-form';
    form.style.display = 'flex';
    form.style.gap = '0.5rem';
    form.style.marginTop = '0.75rem';
    form.style.paddingTop = '0.75rem';
    form.style.borderTop = '1px solid #e5e7eb';

    form.innerHTML = `
        <input type="text" class="announcement-reply-text" placeholder="Write a comment..." autocomplete="off" style="flex: 1; padding: 0.5rem; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 0.9rem;">
        <button type="submit" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Post</button>
    `;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('.announcement-reply-text');
        const text = input.value.trim();
        if (!text) return;

        const fd = new FormData();
        fd.append('action', 'create_announcement_comment');
        fd.append('announcement_id', announcementId);
        fd.append('message', text);

        try {
            const res = await fetch('api.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) {
                showToast('Comment posted', 'success');
                loadAnnouncements();
            } else {
                showToast(data.error || 'Failed to post comment', 'error');
            }
        } catch (e) {
            showToast('Error posting comment', 'error');
        }
    });

    formContainer.innerHTML = '';
    formContainer.appendChild(form);
}

async function reactAnnouncementComment(commentId, reaction) {
    if (isGuestMode) {
        showToast('Please login to react', 'info');
        showAuthModal('login');
        return;
    }

    const fd = new FormData();
    fd.append('action', 'react_announcement_comment');
    fd.append('comment_id', commentId);
    fd.append('reaction', reaction);

    try {
        const res = await fetch('api.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            const likeBtn = document.querySelector(`[data-comment-id="${commentId}"][data-reaction="like"]`);
            const dislikeBtn = document.querySelector(`[data-comment-id="${commentId}"][data-reaction="dislike"]`);
            const reactCounts = document.querySelectorAll(`[data-comment-id="${commentId}"] .reaction-count`);

            if (likeBtn) {
                likeBtn.classList.toggle('active-like', data.user_reaction === 'like');
                likeBtn.classList.remove('active-dislike');
            }
            if (dislikeBtn) {
                dislikeBtn.classList.toggle('active-dislike', data.user_reaction === 'dislike');
                dislikeBtn.classList.remove('active-like');
            }

            if (reactCounts.length >= 1) reactCounts[0].textContent = data.likes;
            if (reactCounts.length >= 2) reactCounts[1].textContent = data.dislikes;
        } else {
            showToast(data.error || 'Failed to react', 'error');
        }
    } catch (e) {
        showToast('Error reacting to comment', 'error');
    }
}

// Toggle announcement comment menu
function toggleAnnouncementCommentMenu(commentId) {
    // Close all other menus first
    document.querySelectorAll('[id^="announcement_comment_menu_"]').forEach(menu => {
        if (menu.id !== `announcement_comment_menu_${commentId}`) {
            menu.style.display = 'none';
        }
    });

    const menu = document.getElementById(`announcement_comment_menu_${commentId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

async function deleteAnnouncementComment(commentId) {
    // Close menu
    const menu = document.getElementById(`announcement_comment_menu_${commentId}`);
    if (menu) menu.style.display = 'none';

    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }

    const fd = new FormData();
    fd.append('action', 'delete_announcement_comment');
    fd.append('comment_id', commentId);

    try {
        const res = await fetch('api.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            showToast('Comment deleted', 'success');
            loadAnnouncements();
        } else {
            showToast(data.error || 'Failed to delete comment', 'error');
        }
    } catch (e) {
        showToast('Error deleting comment', 'error');
    }
}

function updateAnnouncementFormVisibility() {
    const formContainer = document.getElementById('announcementFormContainer');
    const userMessage = document.getElementById('announcementUserMessage');

    if (isGuestMode || !currentUser) {
        if (formContainer) formContainer.style.display = 'none';
        if (userMessage) userMessage.style.display = 'block';
        if (userMessage) userMessage.textContent = 'Please login to interact with announcements.';
        return;
    }

    if (currentUser.role === 'barangay' || currentUser.role === 'admin') {
        if (formContainer) formContainer.style.display = 'block';
        if (userMessage) userMessage.style.display = 'none';
    } else {
        if (formContainer) formContainer.style.display = 'none';
        if (userMessage) userMessage.style.display = 'block';
        if (userMessage) userMessage.textContent = '📢 Official announcements and updates from your barangay and admin officials. Read, reply, and react to stay informed with the latest community news!';
    }
}

// Handle announcement form submission
const announcementForm = document.getElementById('announcementForm');
if (announcementForm) {
    announcementForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isGuestMode || !currentUser || (currentUser.role !== 'barangay' && currentUser.role !== 'admin')) {
            showToast('Only barangay and admin can post announcements', 'error');
            return;
        }

        const titleInput = document.getElementById('announcementInput');
        const title = titleInput.value.trim();

        if (!title) {
            showToast('Please enter an announcement', 'error');
            return;
        }

        const fd = new FormData();
        fd.append('action', 'create_announcement');
        fd.append('title', title);
        fd.append('message', title);

        try {
            const res = await fetch('api.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) {
                titleInput.value = '';
                showToast('Announcement posted', 'success');
                loadAnnouncements();
            } else {
                showToast(data.error || 'Failed to post announcement', 'error');
            }
        } catch (e) {
            showToast('Error posting announcement', 'error');
        }
    });
}

// Toggle comment menu
function toggleCommentMenu(commentId, event) {
    // Prevent event from bubbling
    if (event) {
        event.stopPropagation();
    }

    // Close all other menus
    document.querySelectorAll('[id^="comment_menu_"]').forEach(menu => {
        if (menu.id !== `comment_menu_${commentId}`) {
            menu.style.display = 'none';
        }
    });

    // Toggle this menu
    const menu = document.getElementById(`comment_menu_${commentId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Delete comment
async function deleteComment(commentId) {
    const menu = document.getElementById(`comment_menu_${commentId}`);
    if (menu) menu.style.display = 'none';

    if (!confirm('Are you sure you want to unsend this message?')) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'delete_comment');
    formData.append('comment_id', commentId);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Message unsent', 'success');

            // Instantly remove the comment from DOM with animation
            const commentElement = document.getElementById(`comment_${commentId}`);
            if (commentElement) {
                // Add fade-out animation
                commentElement.style.transition = 'opacity 0.3s ease-out, max-height 0.3s ease-out';
                commentElement.style.opacity = '0';
                commentElement.style.maxHeight = '0';
                commentElement.style.overflow = 'hidden';

                // Remove after animation completes
                setTimeout(() => {
                    if (commentElement && commentElement.parentNode) {
                        commentElement.remove();

                        // Trigger custom event for real-time updates
                        window.dispatchEvent(new CustomEvent('commentDeleted', {
                            detail: { commentId: commentId }
                        }));
                    }
                }, 300);
            } else {
                // Fallback: reload incident if element not found
                const incidentId = window.currentIncidentId;
                if (incidentId) {
                    showIncidentDetails(incidentId);
                }
            }
        } else {
            showToast(data.error || 'Failed to unsend message', 'error');
        }
    } catch (error) {
        console.error('Delete comment error:', error);
        showToast('Failed to unsend message', 'error');
    }
}

// Delete chat message
function closeDetailsModal() {
    document.getElementById('detailsModal').classList.remove('active');

    // Clear incident details content
    const detailsDiv = document.getElementById('incidentDetails');
    if (detailsDiv) detailsDiv.innerHTML = '';

    // Clear comment input if it exists
    const commentText = document.getElementById('commentText');
    if (commentText) commentText.value = '';

    // Clear all reply form inputs
    document.querySelectorAll('.reply-input').forEach(input => {
        input.value = '';
    });

    // Hide all reply forms
    document.querySelectorAll('.reply-form').forEach(form => {
        form.style.display = 'none';
    });

    if (window.etaInterval) {
        clearInterval(window.etaInterval);
        window.etaInterval = null;
    }

    // Clear global incident ID
    window.currentIncidentId = null;

    removeModalOpenIfNoActive();
}

/* ETA functions removed */

// Toggle confirm incident (tap to confirm, tap again to unconfirm)
async function toggleConfirmIncident(incidentId) {
    if (isGuestMode) {
        showToast('Please login or register to confirm incidents', 'info');
        return;
    }

    // Get current incident to check if user already confirmed
    try {
        const response = await fetch(`api.php?action=get_incident&id=${incidentId}`);
        const incident = await response.json();

        if (incident.error) {
            showToast('Failed to load incident details', 'error');
            return;
        }

        // If already confirmed, prevent unconfirming
        if (incident.user_confirmed) {
            showToast('You have already confirmed this incident. Confirmations cannot be undone.', 'info');
            return;
        }

        // Show confirmation warning before confirming
        if (!confirm('Are you sure you want to confirm this incident? Confirmations cannot be undone.')) {
            return;
        }

        const formData = new FormData();
        formData.append('action', 'confirm_incident');
        formData.append('incident_id', incidentId);

        const confirmResponse = await fetch('api.php', {
            method: 'POST',
            body: formData
        });

        if (!confirmResponse.ok) {
            showToast('Server error: ' + confirmResponse.statusText, 'error');
            return;
        }

        const confirmData = await confirmResponse.json();

        if (confirmData.success) {
            showToast('Incident confirmed! Thank you for verifying this report.', 'success');
            showIncidentDetails(incidentId); // Reload details
            // Refresh voting list so the sidebar updates immediately (desktop and mobile)
            try { loadVotingList(); } catch (e) { /* ignore */ }
        } else {
            showToast(confirmData.error || 'Failed to confirm incident', 'error');
        }
    } catch (error) {
        console.error('Error confirming incident:', error);
        showToast('Failed to confirm incident: ' + error.message, 'error');
    }
}

// Legacy function - keeping for compatibility
async function confirmIncident(incidentId) {
    toggleConfirmIncident(incidentId);
}

// Add comment
async function addComment(incidentId) {
    if (isGuestMode) {
        showToast('Please login or register to add comments', 'info');
        return;
    }

    const commentText = document.getElementById('commentText').value.trim();

    if (!commentText) {
        showToast('Please enter a comment', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('action', 'add_comment');
    formData.append('incident_id', incidentId);
    formData.append('comment', commentText);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Comment added!', 'success');
            document.getElementById('commentText').value = '';
            showIncidentDetails(incidentId); // Reload details
        } else {
            showToast(data.error || 'Failed to add comment', 'error');
        }
    } catch (error) {
        showToast('Failed to add comment', 'error');
    }
}

// Toggle reply form
function toggleReplyForm(commentId) {
    const form = document.getElementById(`reply_form_${commentId}`);
    if (form.style.display === 'none') {
        form.style.display = 'block';
        document.getElementById(`reply_text_${commentId}`).focus();
    } else {
        form.style.display = 'none';
        document.getElementById(`reply_text_${commentId}`).value = '';
    }
}

// Submit reply
async function submitReply(parentCommentId) {
    const replyText = document.getElementById(`reply_text_${parentCommentId}`).value.trim();

    if (!replyText) {
        showToast('Please enter a reply', 'error');
        return;
    }

    const incidentId = window.currentIncidentId;

    const formData = new FormData();
    formData.append('action', 'add_comment');
    formData.append('incident_id', incidentId);
    formData.append('comment', replyText);
    formData.append('parent_comment_id', parentCommentId);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast('Reply added!', 'success');
            showIncidentDetails(incidentId); // Reload details
        } else {
            showToast(data.error || 'Failed to add reply', 'error');
        }
    } catch (error) {
        showToast('Failed to add reply', 'error');
    }
}

// React to comment
async function reactToComment(commentId, reaction) {
    if (isGuestMode) {
        showToast('Please login or register to react', 'info');
        return;
    }

    const formData = new FormData();
    formData.append('action', 'react_comment');
    formData.append('comment_id', commentId);
    formData.append('reaction', reaction);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            // Update counts
            document.getElementById(`likes_${commentId}`).textContent = data.likes;
            document.getElementById(`dislikes_${commentId}`).textContent = data.dislikes;

            // Update button states
            const likeBtn = document.querySelector(`#comment_${commentId} .comment-action-btn:nth-child(1)`);
            const dislikeBtn = document.querySelector(`#comment_${commentId} .comment-action-btn:nth-child(2)`);

            likeBtn.classList.remove('active-like');
            dislikeBtn.classList.remove('active-dislike');

            if (data.user_reaction === 'like') {
                likeBtn.classList.add('active-like');
            } else if (data.user_reaction === 'dislike') {
                dislikeBtn.classList.add('active-dislike');
            }
        } else {
            showToast(data.error || 'Failed to react', 'error');
        }
    } catch (error) {
        showToast('Failed to react', 'error');
    }
}

// Update incident status only (for barangay/admin)
async function updateIncidentStatusOnly(incidentId) {
    const statusSelect = document.getElementById('statusSelect');
    const status = statusSelect.value;

    if (!status) {
        showToast('Please select a status', 'error');
        return;
    }

    const statusText = status === 'reported' ? 'Reported' : status === 'responding' ? 'Responding' : status === 'in_area' ? 'In Area' : 'Updated';
    if (!confirm(`Are you sure you want to update the status to ${statusText}?`)) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'update_status');
    formData.append('incident_id', incidentId);
    formData.append('status', status);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Status updated to ${statusText}!`, 'success');
            showIncidentDetails(incidentId); // Reload details
            loadIncidents(); // Reload map
            try { loadVotingList(); } catch (e) { /* ignore */ } // Update sidebar
        } else {
            showToast(data.error || 'Failed to update status', 'error');
        }
    } catch (error) {
        showToast('Failed to update status', 'error');
    }
}

// Update incident severity (for barangay/admin)
async function updateIncidentSeverity(incidentId) {
    const severitySelect = document.getElementById('severitySelect');
    const severity = severitySelect.value;

    if (!severity) {
        showToast('Please select a severity', 'error');
        return;
    }

    const severityText = severity === 'none' ? 'None' : severity.charAt(0).toUpperCase() + severity.slice(1);
    if (!confirm(`Are you sure you want to update the severity to ${severityText}?`)) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'update_severity');
    formData.append('incident_id', incidentId);
    formData.append('severity', severity);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            showToast(`Severity updated to ${severityText}!`, 'success');
            showIncidentDetails(incidentId); // Reload details
            loadIncidents(); // Reload map
            try { loadVotingList(); } catch (e) { /* ignore */ } // Update sidebar
        } else {
            showToast(data.error || 'Failed to update severity', 'error');
        }
    } catch (error) {
        showToast('Failed to update severity', 'error');
    }
}

// Resolve incident (for barangay/admin) - deletes from database
async function resolveIncident(incidentId) {
    if (!confirm('This will mark the incident as RESOLVED and permanently remove it from the system. Continue?')) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'update_status');
    formData.append('incident_id', incidentId);
    formData.append('status', 'resolved');

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success && data.deleted) {
            showToast('Incident resolved and removed!', 'success');
            closeDetailsModal();
            loadIncidents(); // Reload map
            try { loadVotingList(); } catch (e) { /* ignore */ }
        } else {
            showToast(data.error || 'Failed to resolve incident', 'error');
        }
    } catch (error) {
        showToast('Failed to resolve incident', 'error');
    }
}

// Update incident status (legacy function - keeping for compatibility)
async function updateIncidentStatus(incidentId, status) {
    if (!status) return;

    // Confirm deletion if resolving
    if (status === 'resolved') {
        if (!confirm('This will mark the incident as resolved and remove it from the system. Continue?')) {
            return;
        }
    }

    const formData = new FormData();
    formData.append('action', 'update_status');
    formData.append('incident_id', incidentId);
    formData.append('status', status);

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            if (data.deleted) {
                showToast('Incident resolved and removed!', 'success');
                closeDetailsModal();
                loadIncidents(); // Reload map
            } else {
                const statusText = status === 'responding' ? 'Responding' : 'Updated';
                showToast(`Status updated to ${statusText}!`, 'success');
                showIncidentDetails(incidentId); // Reload details
                loadIncidents(); // Reload map
            }
        } else {
            showToast(data.error || 'Failed to update status', 'error');
        }
    } catch (error) {
        showToast('Failed to update status', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type]}" style="font-size: 1.5rem;"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}



// Refresh incidents every 30 seconds
setInterval(() => {
    if (currentUser || isGuestMode) {
        loadIncidents();
    }
}, 30000);

// ========== ACCOUNT SETTINGS FUNCTIONS ==========

// Open settings modal
function openSettingsModal() {
    if (!currentUser) return;

    document.getElementById('settingsModal').classList.add('active');
    document.body.classList.add('modal-open');
    loadProfileSettings();

    // Attach event listeners for file upload
    setTimeout(() => {
        const uploadBtn = document.getElementById('uploadPictureBtn');
        const profileInput = document.getElementById('profilePictureInput');

        if (uploadBtn && !uploadBtn.hasAttribute('data-listener-attached')) {
            uploadBtn.setAttribute('data-listener-attached', 'true');
            uploadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (profileInput) profileInput.click();
            });
        }

        if (profileInput && !profileInput.hasAttribute('data-listener-attached')) {
            profileInput.setAttribute('data-listener-attached', 'true');
            profileInput.addEventListener('change', previewProfilePicture);
        }
    }, 50);
}

// Close settings modal
function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    resetPasswordResetForm();
}

// Load profile settings
async function loadProfileSettings() {
    try {
        // Clear file input to reset any preview from before refresh
        const fileInput = document.getElementById('profilePictureInput');
        if (fileInput) {
            fileInput.value = '';
        }

        const response = await fetch('settings.php?action=get_profile');
        const data = await response.json();

        if (data.success && data.user) {
            const user = data.user;

            // Update profile picture
            if (user.profile_picture) {
                const imageUrl = getProfilePictureUrl(user.profile_picture);
                document.getElementById('settingsProfilePicture').src = imageUrl;
                console.log('Loading profile picture from:', imageUrl);
            } else {
                document.getElementById('settingsProfilePicture').src = `uploads/default-avatar.svg`;
            }

            // Update user info
            document.getElementById('settingsFullName').textContent = user.full_name;
            document.getElementById('settingsEmail').textContent = user.email;
            document.getElementById('settingsFullNameInput').value = user.full_name;
            document.getElementById('settingsEmailInput').value = user.email;

            // Update role badge
            const roleBadge = document.getElementById('settingsRoleBadge');
            roleBadge.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            roleBadge.className = `profile-role-badge role-${user.role}`;

            // Update account info
            const createdDate = new Date(user.created_at);
            document.getElementById('memberSinceDate').textContent = createdDate.toLocaleDateString();
            document.getElementById('accountRole').textContent = user.role;

            // Show deactivate section only for non-admin users
            const deactivateSection = document.getElementById('deactivateSection');
            if (deactivateSection) {
                deactivateSection.style.display = user.role === 'admin' ? 'none' : 'block';
            }
        } else {
            showToast(data.error || 'Failed to load profile', 'error');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Error loading profile', 'error');
    }
}

// Save profile settings
async function saveProfileSettings() {
    const fullName = document.getElementById('settingsFullNameInput').value.trim();

    if (!fullName) {
        showToast('Full name cannot be empty', 'error');
        return;
    }

    try {
        // First, upload profile picture if one is selected (suppress its notification)
        const fileInput = document.getElementById('profilePictureInput');
        if (fileInput && fileInput.files[0]) {
            await uploadProfilePictureToServer(true);
        }

        // Then update profile information
        const formData = new FormData();
        formData.append('action', 'update_profile');
        formData.append('full_name', fullName);

        const response = await fetch('settings.php', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentUser.full_name = fullName;
            showToast('Profile updated successfully', 'success');
            loadProfileSettings();
            updateUIForAuthState();
            try { loadVotingList(); } catch (e) { /* ignore */ } // Update sidebar voting tab
            // Clear chat cache and force full reload
            try {
                const chatContainer = document.getElementById('chatMessages');
                if (chatContainer) {
                    delete chatContainer.dataset.initialized;
                    chatContainer.innerHTML = '';
                }
                loadChatMessages({ forceScroll: true });
            } catch (e) { /* ignore */ } // Update sidebar chat
        } else {
            showToast(data.error || 'Failed to save profile', 'error');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Error saving profile', 'error');
    }
}

// Upload profile picture
// Preview profile picture when file is selected (don't upload yet)
function previewProfilePicture() {
    const fileInput = document.getElementById('profilePictureInput');
    const file = fileInput.files[0];

    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('File size exceeds 5MB limit', 'error');
        fileInput.value = '';
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'error');
        fileInput.value = '';
        return;
    }

    // Show preview locally using FileReader
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('settingsProfilePicture').src = e.target.result;
        showToast('Preview updated. Click Save Profile to confirm.', 'info');
    };
    reader.readAsDataURL(file);
}

// Upload profile picture when save is clicked
async function uploadProfilePictureToServer(suppressNotification = false) {
    const fileInput = document.getElementById('profilePictureInput');
    const file = fileInput.files[0];

    if (!file) return;

    try {
        const formData = new FormData();
        formData.append('action', 'upload_profile_picture');
        formData.append('profile_picture', file);

        console.log('Uploading profile picture...', file.name);

        const response = await fetch('settings.php', {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            showToast('Server error: HTTP ' + response.status, 'error');
            return;
        }

        const text = await response.text();
        console.log('Raw response:', text);

        try {
            const data = JSON.parse(text);
            console.log('Parsed JSON:', data);

            if (data.success) {
                // Update currentUser with new profile picture
                if (data.profile_picture) {
                    currentUser.profile_picture = data.profile_picture;
                }
                if (!suppressNotification) {
                    showToast('Profile picture updated successfully', 'success');
                }
                fileInput.value = '';
                // Refresh navbar
                updateUIForAuthState();
            } else {
                showToast(data.error || 'Failed to upload picture', 'error');
            }
        } catch (e) {
            console.error('Failed to parse JSON:', e.message);
            console.error('Response text:', text);
            console.error('First 200 chars:', text.substring(0, 200));
            showToast('Server returned invalid data', 'error');
        }
    } catch (error) {
        console.error('Upload request error:', error);
        showToast('Network error: ' + error.message, 'error');
    }
}

// Request password reset OTP
async function requestPasswordResetOTP() {
    try {
        const response = await fetch('settings.php?action=request_password_reset', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Show OTP verify form
            document.getElementById('otpRequestContainer').classList.remove('active');
            document.getElementById('otpVerifyContainer').classList.add('active');
            showToast('OTP sent to your email', 'success');
        } else {
            showToast(data.error || 'Failed to send OTP', 'error');
        }
    } catch (error) {
        console.error('Error requesting OTP:', error);
        showToast('Error sending OTP', 'error');
    }
}

// Resend OTP
async function resendPasswordResetOTP() {
    await requestPasswordResetOTP();
}

// Submit password reset
async function submitPasswordReset() {
    const otp = document.getElementById('resetOTPInput').value.trim();
    const password = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    if (!otp || !password || !confirmPassword) {
        showToast('All fields are required', 'error');
        return;
    }

    if (otp.length !== 6) {
        showToast('OTP must be 6 digits', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    if (!/[A-Z]/.test(password)) {
        showToast('Password must contain at least one uppercase letter', 'error');
        return;
    }

    if (!/[0-9]/.test(password)) {
        showToast('Password must contain at least one number', 'error');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'reset_password');
        formData.append('otp', otp);
        formData.append('password', password);
        formData.append('confirm_password', confirmPassword);

        const response = await fetch('settings.php', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast('Password reset successfully', 'success');
            resetPasswordResetForm();
        } else {
            showToast(data.error || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showToast('Error resetting password', 'error');
    }
}

// Cancel password reset
function cancelPasswordReset() {
    resetPasswordResetForm();
}

// Reset password reset form
function resetPasswordResetForm() {
    document.getElementById('otpRequestContainer').classList.add('active');
    document.getElementById('otpVerifyContainer').classList.remove('active');

    document.getElementById('resetOTPInput').value = '';
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';
}

// Logout user
async function logoutUser() {
    try {
        const response = await fetch('auth.php?action=logout', {
            method: 'POST'
        });

        if (response.ok) {
            currentUser = null;
            isGuestMode = true;
            closeSettingsModal();
            updateUIForAuthState();
            showToast('Logged out successfully', 'success');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showToast('Error logging out', 'error');
    }
}

async function deactivateOwnAccount() {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }

    const confirmed = confirm(
        'Are you sure you want to deactivate your account?\n\n' +
        '✓ Your data will be preserved\n' +
        '✓ You can reactivate anytime\n' +
        '✓ You will not be able to login until then\n\n' +
        'Are you sure?'
    );

    if (!confirmed) {
        return;
    }

    const fd = new FormData();
    fd.append('action', 'deactivate_user');
    fd.append('user_id', currentUser.id);

    try {
        const res = await fetch('api.php', { method: 'POST', body: fd });
        const data = await res.json();

        if (data.success) {
            showToast('Account deactivated successfully. You will be logged out.', 'success');
            setTimeout(() => {
                currentUser = null;
                isGuestMode = true;
                closeSettingsModal();
                updateUIForAuthState();
                showToast('You have been logged out', 'info');
            }, 1500);
        } else {
            showToast(data.error || 'Failed to deactivate account', 'error');
        }
    } catch (e) {
        showToast('Error deactivating account', 'error');
    }
}