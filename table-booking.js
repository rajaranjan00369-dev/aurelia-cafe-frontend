import { logger, IS_PRODUCTION } from "./logger.js";
import { safeFetch } from "./api-helper.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LocationService } from "./location-service.js";
import {
    getAuth,
    RecaptchaVerifier,
    signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyC0-iqTVeo0L-PZ9og_699vCsdEtxfrlSc",
    authDomain: "coffee-shop-d4c22.firebaseapp.com",
    projectId: "coffee-shop-d4c22",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);
auth.useDeviceLanguage();

// Central API Configuration
const AURELIA_CONFIG = window.AURELIA_CONFIG || {
    productionBaseUrl: 'https://aurelia-cafe-customer-backend.onrender.com',
    localBaseUrl: 'http://localhost:5000',
    join: function(routePath) {
        let baseUrl = window.AURELIA_API_URL;
        if (!baseUrl) {
            baseUrl = (!IS_PRODUCTION) ? this.localBaseUrl : this.productionBaseUrl;
        }
        baseUrl = baseUrl.replace(/\/+$/, '');
        let cleanPath = routePath.replace(/^\/+/, '');
        
        let origin = baseUrl;
        let basePaths = [];
        try {
            const urlObj = new URL(baseUrl);
            origin = urlObj.origin;
            basePaths = urlObj.pathname.split('/').filter(Boolean);
        } catch (e) {
            if (baseUrl.includes('://')) {
                const parts = baseUrl.split('/');
                origin = parts.slice(0, 3).join('/');
                basePaths = parts.slice(3).filter(Boolean);
            } else {
                basePaths = baseUrl.split('/').filter(Boolean);
                origin = '';
            }
        }
        
        const pathParts = cleanPath.split('/').filter(Boolean);
        let overlapCount = 0;
        const maxOverlap = Math.min(basePaths.length, pathParts.length);
        for (let i = 1; i <= maxOverlap; i++) {
            const baseSlice = basePaths.slice(-i);
            const pathSlice = pathParts.slice(0, i);
            if (JSON.stringify(baseSlice) === JSON.stringify(pathSlice)) {
                overlapCount = i;
            }
        }
        
        const combinedPaths = basePaths.concat(pathParts.slice(overlapCount));
        return origin ? `${origin}/${combinedPaths.join('/')}` : `/${combinedPaths.join('/')}`;
    }
};
window.AURELIA_CONFIG = AURELIA_CONFIG;

// Development test mode configurations
const IS_DEV = !IS_PRODUCTION;

// Central E.164 phone normalization function
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.trim().replace(/[\s\-\(\)]/g, '');
    
    // Convert 10 digit Indian numbers to +91XXXXXXXXXX
    if (/^\d{10}$/.test(clean)) {
        clean = '+91' + clean;
    }
    
    // Ensure +91 prefix for Indian numbers starting with 91 but missing +
    if (/^91\d{10}$/.test(clean)) {
        clean = '+' + clean;
    }
    
    // Guarantee E.164 leading +
    if (clean && !clean.startsWith('+')) {
        clean = '+' + clean;
    }
    
    return clean;
}

const isDevelopmentTestNumber = (phone) => {
    const normalized = normalizePhone(phone);
    return IS_DEV && (normalized === '+911234567890' || normalized === '+919999999999');
};

let confirmationResult = null;
let verifiedUserPhone = null;
let currentBookingData = null;
let currentAssignedTable = null;
let loadedCafeName = 'Aurelia Cafe';
let isPaymentModalOpen = false;

// Secure Auth State Gate
const authState = {
    otpSent: false,
    otpVerified: false,
    phoneVerified: false,
    paymentAllowed: false
};

let bookingState = 'idle'; // idle, validating, sending_otp, otp_sent, verifying_otp, payment_pending, booking_complete

function setBookingState(newState) {
    console.log(`[UI] State Transition: ${bookingState} -> ${newState}`);
    bookingState = newState;
}

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const getEl = (id) => document.getElementById(id);

// ── Navbar scroll ────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    const navbar = getEl('navbar') || document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 30);
});

// ── Scroll reveal ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) e.target.classList.add('visible');
        });
    }, { threshold: 0.08 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));

    // Set minimum date to today
    const dateInput = getEl('bookingDate');
    if (dateInput) {
        const today = new Date();
        const yyyy  = today.getFullYear();
        const mm    = String(today.getMonth() + 1).padStart(2, '0');
        const dd    = String(today.getDate()).padStart(2, '0');
        dateInput.min = `${yyyy}-${mm}-${dd}`;
    }

    // Seating toggle
    const seatingBtns = document.querySelectorAll('.seating-btn');
    const seatingInput = getEl('bookingSeating');
    seatingBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            seatingBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (seatingInput) seatingInput.value = btn.dataset.value;
        });
    });

    // Clear error on input
    document.querySelectorAll('.booking-input, .booking-select').forEach(el => {
        el.addEventListener('input', () => clearError(el));
        el.addEventListener('change', () => clearError(el));
    });

    // Form Submit
    const form = getEl('bookingForm');
    if (form) {
        form.addEventListener('submit', handleBookingSubmit);
    }
    
    // OTP Modal Events
    const closeOtpBtn = getEl('closeOtpBtn');
    if (closeOtpBtn) closeOtpBtn.addEventListener('click', closeOtpModal);

    const verifyOtpBtn = getEl('verifyOtpBtn');
    if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    
    const resendOtpBtn = getEl('resendOtpBtn');
    if (resendOtpBtn) resendOtpBtn.addEventListener('click', handleResendOtp);
    
    // Setup Recaptcha
    initializeRecaptcha();

    // Init Dynamic Locations
    const locationService = new LocationService(db);
    locationService.setupDropdowns({
        branchSelect: getEl('bookingBranch'),
        floorSelect: getEl('bookingFloor'),
        tableSelect: getEl('bookingTable')
    });

    loadSettings();
});

async function loadSettings() {
    try {
        const result = await safeFetch(AURELIA_CONFIG.join('/api/booking/settings'), { cache: "no-store" });
        if (result && result.success && result.data) {
            const data = result.data;
            console.log('[Settings] Loaded settings:', data);
            
            // Apply dynamic branding
            if (data.cafeName) {
                loadedCafeName = data.cafeName;
                const logos = document.querySelectorAll(".logo");
                logos.forEach(el => {
                    el.textContent = loadedCafeName.toUpperCase();
                });
                if (document.title.includes("Aurelia Cafe")) {
                    document.title = document.title.replace("Aurelia Cafe", loadedCafeName);
                }
            }
            
            // Dynamically show booking rules as subtitle
            if (data.bookingRules) {
                const subtitle = document.querySelector('.form-subtitle');
                if (subtitle) {
                    subtitle.innerHTML = data.bookingRules.replace(/\n/g, '<br>');
                }
            }
            
            // Dynamically override time slots if configured in admin panel
            if (data.bookingTimings) {
                // If timings are comma separated, parse them, e.g. "08:00 AM, 09:00 AM"
                const slots = data.bookingTimings.split(',').map(s => s.trim()).filter(Boolean);
                if (slots.length > 0) {
                    const timeSelect = getEl('bookingTime');
                    if (timeSelect) {
                        timeSelect.innerHTML = '<option value="" disabled selected>Select Time</option>';
                        slots.forEach(slot => {
                            const opt = document.createElement('option');
                            opt.value = slot;
                            opt.textContent = slot;
                            timeSelect.appendChild(opt);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Settings] Failed to load dynamic settings:', err.message);
    }
}

function initializeRecaptcha() {
    console.log("[Auth] Initializing reCAPTCHA...");
    
    // 1. Ensure container exists and NEVER remove it
    let container = getEl('recaptcha-container');
    if (!container) {
        console.warn("[Auth] recaptcha-container not found in DOM. Creating one dynamically.");
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        // Ensure it's hidden but physically in the DOM
        if (container.style) container.style.display = 'none';
        document.body.appendChild(container);
    }

    // 2. Reuse existing active verifier
    if (window.recaptchaVerifier) {
        console.log("[Auth] Using existing verifier.");
        return window.recaptchaVerifier;
    }

    // Clear inner content to prevent duplicate widget rendering issues
    container.innerHTML = '';

    // 3. Initialize new verifier safely
    try {
        console.log("[Auth] Creating new RecaptchaVerifier instance.");
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible',
            'callback': (response) => {
                console.log("[Auth] reCAPTCHA solved locally.");
            },
            'expired-callback': () => {
                console.warn("[Auth] reCAPTCHA expired. Safely clearing...");
                if (window.recaptchaVerifier) {
                    try {
                        window.recaptchaVerifier.clear();
                    } catch (e) {
                        console.error("[Auth] Error clearing expired verifier:", e);
                    }
                    window.recaptchaVerifier = null;
                }
            }
        });
        
        console.log("[Auth] reCAPTCHA initialized successfully.");
        return window.recaptchaVerifier;
    } catch (e) {
        console.error("[Auth] Failed to initialize reCAPTCHA:", e);
        return null;
    }
}

function showOtpStep() {
    // STEP TRANSITION: Hide booking form section, show OTP modal
    const bookingHero = document.getElementById('table-booking');
    if (bookingHero) {
        bookingHero.style.display = 'none';
        console.log('[FLOW] Booking hero hidden');
    }

    const modal = getEl('otpModal');
    if (modal) {
        modal.style.display = 'flex';    // ensure it's not display:none
        modal.style.opacity = '1';        // override transition initial state
        modal.style.pointerEvents = 'auto';
        modal.classList.add('active');    // ← the class the CSS actually listens to
        console.log('[FLOW] Rendering OTP page');
        console.log('[UI] OTP container mounted');
    }
}

function closeOtpModal() {
    const modal = getEl('otpModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.style.opacity = '';
        modal.style.pointerEvents = '';
    }
    
    const bookingHero = document.getElementById('table-booking');
    if (bookingHero) {
        bookingHero.style.display = '';  // Restore hero section
    }
    
    // Reset auth state
    authState.otpSent = false;
    authState.otpVerified = false;
    authState.paymentAllowed = false;

    setBookingState('idle'); // Reset state so user can find another table
}



// ── Validation ────────────────────────────────────────────────────────────────
function clearError(input) {
    input.classList.remove('error');
    const errId = input.id.replace('booking', '') + 'Error';
    const errId2 = input.id + 'Error';
    const errEl = getEl(errId.charAt(0).toLowerCase() + errId.slice(1)) ||
                  getEl(errId2);
    if (errEl) errEl.classList.remove('show');
}

function showError(inputId, errorId, message) {
    const input = getEl(inputId);
    const errEl = getEl(errorId);
    if (input)  input.classList.add('error');
    if (errEl) {
        if (message) errEl.textContent = message;
        errEl.classList.add('show');
    }
}

function validateForm() {
    let valid = true;

    // Full Name
    const name = getEl('bookingName');
    if (!name?.value.trim() || name.value.trim().length < 2) {
        showError('bookingName', 'nameError', 'Please enter your full name.');
        valid = false;
    }

    // Phone — basic 7-15 digit validation
    const phone = getEl('bookingPhone');
    const phoneClean = phone?.value.replace(/[\s\-\+\(\)]/g, '');
    if (!phoneClean || !/^\d{7,15}$/.test(phoneClean)) {
        showError('bookingPhone', 'phoneError', 'Please enter a valid phone number.');
        valid = false;
    }

    // Email
    const email = getEl('bookingEmail');
    if (!email?.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        showError('bookingEmail', 'emailError', 'Please enter a valid email address.');
        valid = false;
    }

    // Date — must be today or future
    const dateVal = getEl('bookingDate')?.value;
    if (!dateVal) {
        showError('bookingDate', 'dateError', 'Please select a reservation date.');
        valid = false;
    } else {
        const selected = new Date(dateVal);
        const today    = new Date();
        today.setHours(0, 0, 0, 0);
        if (selected < today) {
            showError('bookingDate', 'dateError', 'Please select a future date.');
            valid = false;
        }
    }

    // Branch
    const branch = getEl('bookingBranch');
    if (!branch?.value) {
        showError('bookingBranch', 'branchError', 'Please select a branch.');
        valid = false;
    }

    // Time
    const time = getEl('bookingTime');
    if (!time?.value) {
        showError('bookingTime', 'timeError', 'Please select a time slot.');
        valid = false;
    }

    // Guests — must be >= 1
    const guests = getEl('bookingGuests');
    if (!guests?.value || Number(guests.value) < 1) {
        showError('bookingGuests', 'guestsError', 'Please select number of guests.');
        valid = false;
    }

    // Floor
    const floor = getEl('bookingFloor');
    if (!floor?.value) {
        showError('bookingFloor', 'floorError', 'Please select a floor.');
        valid = false;
    }

    // Table
    const table = getEl('bookingTable');
    if (!table?.value) {
        showError('bookingTable', 'tableError', 'Please select a table.');
        valid = false;
    }

    return valid;
}

// ── Verify Table Availability ───────────────────────────────────────────────────
async function verifySelectedTable(date, time, guests, tableId) {
    console.log(`[Booking] Verifying table: ${tableId} for ${guests} guests on ${date} at ${time}`);
    if (!tableId) throw new Error("Table ID is missing.");
    if (!date || !time) throw new Error("Date or time is missing.");
    
    try {
        // 1. Get the table doc
        const tableDoc = await getDoc(doc(db, 'tables', tableId));
        if (!tableDoc.exists()) throw new Error('Table not found in database.');
        const table = { id: tableDoc.id, ...tableDoc.data() };
        
        // 2. Check seats
        if (Number(table.seats) < guests) {
            throw new Error(`Table ${table.tableNumber || table.name || ''} only has ${table.seats} seats. You need a larger table for ${guests} guests.`);
        }

        // 3. Check reservations
        console.log('[Booking] Checking existing reservations...');
        const resQuery = query(collection(db, 'reservations'), 
            where('date', '==', date), 
            where('time', '==', time),
            where('tableId', '==', tableId),
            where('status', 'in', ['pending', 'confirmed', 'seated'])
        );
        const resSnap = await getDocs(resQuery);
        if (!resSnap.empty) {
            throw new Error('This table is already booked for the selected date and time.');
        }
        
        console.log('[Booking] Table verified successfully.');
        return table;
    } catch (error) {
        console.error('[Booking] Table Verification Error:', error);
        throw error; // Rethrow to be caught by handleBookingSubmit
    }
}

// ── Handle Submit ─────────────────────────────────────────────────────────────
async function handleBookingSubmit(e) {
    e.preventDefault();
    console.log('[Booking] "Find Table" clicked');

    if (bookingState !== 'idle') {
        console.warn('[Booking] Button clicked but a process is already running. Ignoring.');
        return;
    }

    try {
        setBookingState('validating');

        if (!validateForm()) {
            console.warn('[Booking] Form validation failed.');
            setBookingState('idle');
            return;
        }
        console.log('[Booking] Form validation passed.');

        setLoadingState(true);

        const dateEl = getEl('bookingDate');
        const timeEl = getEl('bookingTime');
        const guestsEl = getEl('bookingGuests');
        const floorEl = getEl('bookingFloor');
        const tableEl = getEl('bookingTable');
        const branchEl = getEl('bookingBranch');

        if (!dateEl || !timeEl || !guestsEl || !floorEl || !tableEl || !branchEl) {
            throw new Error('Missing required form fields in the DOM.');
        }

        const date = dateEl.value;
        const time = timeEl.value;
        const guests = Number(guestsEl.value);
        const floorId = floorEl.value;
        const tableId = tableEl.value;
        const branchId = branchEl.value;

        console.log(`[Booking] Inputs -> Branch: ${branchId}, Floor: ${floorId}, Table: ${tableId}`);

        console.log('[Booking] Backend API Check: Verifying table locally...');
        const assignedTable = await verifySelectedTable(date, time, guests, tableId);

        if (!assignedTable) {
            throw new Error('Selected table is not valid or unavailable.');
        }

        console.log(`[Booking] Available table found: ${assignedTable.id}`);

        currentBookingData = {
            name:             getEl('bookingName')?.value.trim() || '',
            phone:            getEl('bookingPhone')?.value.trim() || '',
            email:            getEl('bookingEmail')?.value.trim() || '',
            date:             date,
            time:             time,
            guests:           guests,
            floorId:          floorId,
            branchId:         branchId,
            specialRequest:   getEl('bookingSpecial')?.value.trim() || '',
            tableId:          assignedTable.id
        };
        currentAssignedTable = assignedTable;

        setBookingState('sending_otp');
        console.log('[Booking] Starting OTP flow...');
        await sendOTP(currentBookingData.phone);
        
        setLoadingState(false);
    } catch (error) {
        console.error('[Booking] Flow Error:', error);
        setBookingState('idle');
        setLoadingState(false);
        showToast('error', error.message || 'Something went wrong. Please check your connection and try again.');
    }
}

async function sendOTP(phoneNumber) {
    const formattedPhone = normalizePhone(phoneNumber);
    
    console.log(`[AUTH] Starting OTP send to raw input: "${phoneNumber}" -> normalized: "${formattedPhone}"`);
    
    try {
        bookingState = 'otp_sending';

        if (isDevelopmentTestNumber(formattedPhone)) {
            console.log("[AUTH] [DEVELOPMENT BYPASS] Simulating OTP sending for test number:", formattedPhone);
            confirmationResult = {
                confirm: async (otp) => {
                    if (otp === '123456') {
                        console.log("[AUTH] [DEVELOPMENT BYPASS] Correct mock OTP submitted.");
                        return {
                            user: {
                                uid: `mock-uid-${formattedPhone.replace('+', '')}`,
                                phone_number: formattedPhone,
                                phoneNumber: formattedPhone,
                                provider: 'phone',
                                testMode: true,
                                getIdToken: async () => `mock-token-${formattedPhone}`
                            }
                        };
                    } else {
                        console.warn("[AUTH] [DEVELOPMENT BYPASS] Incorrect mock OTP submitted:", otp);
                        throw { code: 'auth/invalid-verification-code', message: 'Invalid verification code' };
                    }
                }
            };
            console.log("[AUTH] [DEVELOPMENT BYPASS] Mock confirmationResult set up successfully.");
            authState.otpSent = true;
            setBookingState('otp_sent');
            console.log("[UI] Switching to OTP screen");
        } else {
            // Ensure verifier is fresh and ready
            const appVerifier = initializeRecaptcha();
            if (!appVerifier) throw new Error("Could not initialize reCAPTCHA.");
            
            console.log("[AUTH] Calling signInWithPhoneNumber...");
            confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
            
            console.log("[AUTH] OTP send success!");
            authState.otpSent = true;
            setBookingState('otp_sent');
            console.log("[UI] Switching to OTP screen");
        }
        
        // Show OTP phone display
        const phoneDisplay = getEl('otpPhoneDisplay');
        if (phoneDisplay) phoneDisplay.textContent = formattedPhone;
        
        const otpInput = getEl('otpInput');
        if (otpInput) {
            otpInput.value = '';
            otpInput.removeAttribute('aria-hidden');
        }
        
        const verifyBtn = getEl('verifyOtpBtn');
        if (verifyBtn) verifyBtn.disabled = false;
        
        const otpErr = getEl('otpError');
        if (otpErr) otpErr.style.display = 'none';

        // ← THE FIX: Use showOtpStep() which uses correct .active class
        showOtpStep();
        
        // Auto-focus input after DOM is painted
        requestAnimationFrame(() => {
            const input = getEl('otpInput');
            if (input) {
                input.focus();
                console.log('[UI] OTP input focused');
            }
            console.log('[UI] Verification UI ready');
        });
        
        startResendTimer();
        
    } catch (error) {
        console.error("[Auth] OTP send failure:", error);
        setBookingState('idle');
        
        // Safely clear ONLY on failure, preserving the DOM node
        if (window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier.clear();
            } catch (e) {
                console.error("[Auth] Safe clear error:", e);
            }
            window.recaptchaVerifier = null;
        }

        // Check container still exists and reset display safely
        const containerCheck = getEl('recaptcha-container');
        if (containerCheck && containerCheck.style) {
            containerCheck.style.display = 'none';
        }

        let errorMsg = "Failed to send OTP. Please check your phone number and try again.";
        
        switch(error.code) {
            case 'auth/invalid-phone-number':
                errorMsg = "The phone number entered is invalid.";
                break;
            case 'auth/too-many-requests':
                errorMsg = "Too many attempts. Please try again later.";
                break;
            case 'auth/billing-not-enabled':
                errorMsg = "Firebase billing is not enabled. SMS not supported.";
                break;
            case 'auth/network-request-failed':
                errorMsg = "Network error. Please check your internet connection.";
                break;
        }
        
        throw new Error(errorMsg);
    }
}

let resendInterval;
function startResendTimer() {
    let timeLeft = 60;
    const btn = getEl('resendOtpBtn');
    const timerSpan = getEl('resendTimer');
    
    if (!btn || !timerSpan) return;
    
    btn.disabled = true;
    timerSpan.textContent = timeLeft;
    
    clearInterval(resendInterval);
    resendInterval = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(resendInterval);
            btn.disabled = false;
            timerSpan.textContent = '0';
        }
    }, 1000);
}

async function handleResendOtp() {
    if (!currentBookingData || !currentBookingData.phone) return;
    try {
        await sendOTP(currentBookingData.phone);
        showToast('success', 'OTP resent successfully!');
    } catch (error) {
        showToast('error', error.message);
    }
}

async function handleVerifyOtp() {
    if (bookingState !== 'otp_sent') return;

    console.log('[Booking] Verifying OTP...');
    const otpInput = getEl('otpInput')?.value.trim();
    if (!otpInput || otpInput.length !== 6) {
        const otpErr = getEl('otpError');
        if (otpErr) otpErr.style.display = 'block';
        return;
    }

    const btn = getEl('verifyOtpBtn');
    if (!btn) return;
    const btnText = btn.querySelector('.btn-text');
    const btnLoad = btn.querySelector('.btn-loading');
    
    btn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoad) btnLoad.style.display = 'flex';
    const otpErr = getEl('otpError');
    if (otpErr) otpErr.style.display = 'none';

    try {
        setBookingState('verifying_otp');
        console.log('[Booking] Submitting OTP to Firebase...');
        const result = await confirmationResult.confirm(otpInput);
        
        console.log('[Booking] OTP Verified Successfully!');
        
        // Strict Auth Unlocking
        authState.otpVerified = true;
        authState.phoneVerified = true;
        authState.paymentAllowed = true;

        verifiedUserPhone = result.user.phoneNumber || result.user.phone_number;
        const idToken = await result.user.getIdToken();
        
        // OTP Verified! Proceed to Payment
        setBookingState('payment_pending');
        console.log('[Booking] Payment flow started...');
        await initiatePayment(idToken);
        
    } catch (error) {
        console.error("[Booking] Error verifying OTP:", error);
        setBookingState('otp_sent');
        if (otpErr) {
            otpErr.textContent = "Invalid OTP. Please try again.";
            otpErr.style.display = 'block';
        }
        
        btn.disabled = false;
        if (btnText) btnText.style.display = 'flex';
        if (btnLoad) btnLoad.style.display = 'none';
    }
}

async function initiatePayment(idToken) {
    if (!authState.otpVerified || !authState.paymentAllowed) {
        console.error("[SECURITY] Payment bypass attempt blocked! OTP not verified.");
        showToast('error', 'Authentication Error: You must verify your OTP before proceeding to payment.');
        setBookingState('otp_sent');
        return;
    }

    if (isPaymentModalOpen) {
        console.warn("[Booking] Razorpay payment modal is already open.");
        return;
    }
    isPaymentModalOpen = true;

    // Normalize phone numbers before sending/comparing
    const rawBookingPhone = currentBookingData.phone || '';
    const rawAuthPhone = verifiedUserPhone || auth.currentUser?.phoneNumber || auth.currentUser?.phone_number || '';
    
    const normalizedBookingPhone = normalizePhone(rawBookingPhone);
    const normalizedAuthPhone = normalizePhone(rawAuthPhone);
    
    console.log(`[PHONE] Booking phone: "${rawBookingPhone}" -> "${normalizedBookingPhone}"`);
    console.log(`[PHONE] Auth phone:    "${rawAuthPhone}" -> "${normalizedAuthPhone}"`);
    
    const isMatch = normalizedBookingPhone === normalizedAuthPhone;
    console.log(`[PHONE] Normalized match result: ${isMatch ? 'MATCH' : 'MISMATCH'}`);
    
    // Ensure the booking payload phone is normalized to strict E.164 format before sending
    currentBookingData.phone = normalizedBookingPhone;

    console.log(`[Booking] Calling Backend API: ${AURELIA_CONFIG.join('/api/booking/create-order')}`);
    try {
        // 1. Call Backend to Create Order
        let data;
        try {
            data = await safeFetch(AURELIA_CONFIG.join('/api/booking/create-order'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ bookingData: currentBookingData })
            });
        } catch (networkError) {
            throw new Error(`Cannot connect to backend server at port 5000. Is it running? (${networkError.message})`);
        }

        if (!data || !data.success) {
            throw new Error(data?.message || 'Failed to initialize payment on the server.');
        }

        console.log('[Booking] Opening Razorpay UI...');
        const options = {
            key: data.keyId,
            amount: data.amount * 100,
            currency: data.order.currency,
            name: loadedCafeName || "Aurelia Cafe",
            description: "Table Reservation Advance",
            image: `${window.location.origin}/images/logo.png`, // Add logo if available
            order_id: data.order.id,
            handler: async function (paymentResponse) {
                isPaymentModalOpen = false;
                await verifyPaymentOnServer(paymentResponse);
            },
            prefill: {
                name: currentBookingData.name,
                email: currentBookingData.email,
                contact: currentBookingData.phone
            },
            theme: {
                color: "#C69C6D"
            },
            modal: {
                ondismiss: function() {
                    isPaymentModalOpen = false;
                    resetVerifyBtn();
                    showToast('error', 'Payment cancelled.');
                }
            }
        };

        let rzp;
        try {
            if (typeof Razorpay === 'undefined') {
                throw new Error("Razorpay SDK is not loaded. Please disable your ad blocker or check your internet connection.");
            }
            rzp = new Razorpay(options);
        } catch (initError) {
            isPaymentModalOpen = false;
            console.error('[Booking] Failed to initialize Razorpay:', initError);
            resetVerifyBtn();
            setBookingState('otp_sent');
            showToast('error', initError.message || 'Payment initialization failed. Please try again.');
            return;
        }

        rzp.on('payment.failed', function (response){
            isPaymentModalOpen = false;
            console.error('[Booking] Razorpay Payment Failed:', response.error);
            resetVerifyBtn();
            showToast('error', response.error.description || 'Payment failed.');
        });

        try {
            rzp.open();
        } catch (openError) {
            isPaymentModalOpen = false;
            console.error('[Booking] Failed to open Razorpay modal:', openError);
            resetVerifyBtn();
            setBookingState('otp_sent');
            showToast('error', 'Failed to open payment modal. Please enable popups if blocked.');
        }
        
    } catch (error) {
        isPaymentModalOpen = false;
        console.error("[Booking] Error initiating payment:", error);
        resetVerifyBtn();
        setBookingState('otp_sent');
        showToast('error', error.message || 'Could not connect to payment server. Please check your connection or try again later.');
    }
}

async function verifyPaymentOnServer(paymentResponse) {
    console.log('[Booking] Verifying payment on server...', paymentResponse.razorpay_order_id);
    const btn = getEl('verifyOtpBtn');
    if (btn) btn.disabled = true;

    try {
        // Verify with Firebase Backend
        let authIdToken;
        if (auth.currentUser) {
            authIdToken = await auth.currentUser.getIdToken();
        } else if (isDevelopmentTestNumber(currentBookingData.phone)) {
            authIdToken = `mock-token-${currentBookingData.phone}`;
        } else {
            throw new Error("User session not found.");
        }
        
        let data;
        try {
            data = await safeFetch(AURELIA_CONFIG.join('/api/booking/verify-payment'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authIdToken}`
                },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature
                })
            });
        } catch (netErr) {
            throw new Error(`Connection to verification server failed. (${netErr.message})`);
        }

        if (data && data.success) {
            setBookingState('booking_complete');
            console.log('[Booking] Booking completely successful and verified!');
            closeOtpModal();
            showToast('success', `Booking Confirmed! Assigned Table: ${currentAssignedTable?.tableNumber || currentAssignedTable?.name || 'Assigned'}`);
            
            const form = getEl('bookingForm');
            if (form) form.reset();
            
            resetVerifyBtn();
        } else {
            throw new Error(data?.message || 'Payment verification failed on server.');
        }

    } catch (error) {
        console.error('[Booking] Verify Payment Error:', error);
        setBookingState('otp_sent'); // Revert state so they can try again if they want
        resetVerifyBtn();
        showToast('error', error.message || 'An error occurred during verification.');
    }
}

function resetVerifyBtn() {
    const btn = getEl('verifyOtpBtn');
    if (!btn) return;
    const btnText = btn.querySelector('.btn-text');
    const btnLoad = btn.querySelector('.btn-loading');
    btn.disabled = false;
    btnText.style.display = 'flex';
    btnLoad.style.display = 'none';
}

// ── Loading State ─────────────────────────────────────────────────────────────
function setLoadingState(loading) {
    const btn     = getEl('bookingSubmitBtn');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoad = btn?.querySelector('.btn-loading');
    if (!btn) return;

    btn.disabled = loading;
    if (btnText) btnText.style.display = loading ? 'none' : 'flex';
    if (btnLoad) btnLoad.style.display = loading ? 'flex' : 'none';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(type, message) {
    const successToast = getEl('bookingToast');
    const errorToast   = getEl('bookingToastError');
    const errMsgEl     = getEl('toastErrorMsg');

    if (type === 'success' && successToast) {
        const successMsgEl = successToast.querySelector('.toast-msg');
        if (successMsgEl && message) successMsgEl.textContent = message;
        successToast.classList.add('show');
        setTimeout(() => successToast.classList.remove('show'), 4500);
    } else if (type === 'error' && errorToast) {
        if (errMsgEl && message) errMsgEl.textContent = message;
        errorToast.classList.add('show');
        setTimeout(() => errorToast.classList.remove('show'), 5000);
    }
}
