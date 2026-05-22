// about-us.js
// Aurelia Cafe — About Us Page Logic (Admin content, Slider, Ratings)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    addDoc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyC0-iqTVeo0L-PZ9og_699vCsdEtxfrlSc",
    authDomain: "coffee-shop-d4c22.firebaseapp.com",
    projectId: "coffee-shop-d4c22",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

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

    // Initialize Page
    loadAboutContent();
    loadReviews();
    initSlider();
    initRatingSystem();
});

// ── 1. Fetch Admin Content (Realtime) ─────────────────────────────────────────
function loadAboutContent() {
    const shimmer = getEl('aboutShimmer');
    try {
        const aboutRef = doc(db, 'about_us_settings', 'config');
        onSnapshot(aboutRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Map text areas
                const fields = {
                    'aboutHeadingLabel': data.badgeText,
                    'aboutTitle':        data.heading,
                    'aboutDescription':  data.description,
                    'aboutPhone':        data.phone,
                    'aboutLocation':     data.location,
                    'aboutHours':        data.openingHours
                };

                for (const [id, value] of Object.entries(fields)) {
                    const el = getEl(id);
                    if (el && value) el.innerHTML = value.replace(/\n/g, '<br>');
                }

                // Customer Rating Override
                const avgEl   = getEl('ratingAverage');
                const cntEl   = getEl('ratingCount');
                const starsEl = getEl('ratingStarsDisplay');
                
                if (data.rating) {
                    if (avgEl) avgEl.textContent = data.rating;
                    renderStarsDisplay(parseFloat(data.rating), starsEl);
                }
                if (data.reviewCount) {
                    if (cntEl) cntEl.textContent = `( ${data.reviewCount} Reviews )`;
                }

            } else {
                console.warn('[AboutPage] about_us_settings/config not found. Using defaults.');
            }
            if (shimmer) shimmer.style.display = 'none';
        }, (error) => {
            console.error('[AboutPage] Error loading content:', error);
            if (shimmer) shimmer.style.display = 'none';
        });
    } catch (error) {
        console.error('[AboutPage] Error setting up listener:', error);
        if (shimmer) shimmer.style.display = 'none';
    }
}

// ── 2. Image Slider (Realtime) ───────────────────────────────────────────────
let sliderImages = [];
let currentSlide = 0;
let slideInterval;

function initSlider() {
    const sliderContainer = getEl('aboutSlider');
    const dotsContainer   = getEl('aboutSliderDots');
    const shimmer         = getEl('sliderShimmer');

    if (!sliderContainer || !dotsContainer) return;

    const imagesRef = collection(db, 'about_us_slider_images');
    const q = query(imagesRef, orderBy('order', 'asc'));

    onSnapshot(q, (snapshot) => {
        // Clear existing slides and dots completely for rebuild
        sliderContainer.innerHTML = '';
        dotsContainer.innerHTML = '';
        if (shimmer) shimmer.remove();
        sliderImages = [];

        snapshot.forEach((doc) => {
            sliderImages.push(doc.data().imageUrl);
        });

        // Fallback to defaults if no images
        if (sliderImages.length === 0) {
            sliderImages = [
                'images/about/cafe-1.png',
                'images/about/cafe-2.png',
                'images/about/cafe-3.png'
            ];
        }

        // Add Slides
        sliderImages.forEach((src, idx) => {
            // Slide
            const slide = document.createElement('div');
            slide.className = `about-slide ${idx === 0 ? 'active' : ''}`;
            
            const img = document.createElement('img');
            img.src = src;
            img.alt = `Aurelia Cafe Ambience ${idx + 1}`;
            img.onerror = () => { img.src = 'images/latte.png'; }; // fallback
            
            slide.appendChild(img);
            sliderContainer.appendChild(slide);

            // Dot
            const dot = document.createElement('div');
            dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => goToSlide(idx));
            dotsContainer.appendChild(dot);
        });

        currentSlide = 0; // reset to 0 on new data
        resetAutoPlay();
    }, (error) => {
        console.error('[AboutPage] Error fetching slider images:', error);
    });
}

function updateSliderUI() {
    const slides = document.querySelectorAll('.about-slide');
    const dots   = document.querySelectorAll('.slider-dot');

    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentSlide);
    });
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentSlide);
    });
}

function goToSlide(idx) {
    currentSlide = idx;
    updateSliderUI();
    resetAutoPlay();
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % sliderImages.length;
    updateSliderUI();
}

function startAutoPlay() {
    slideInterval = setInterval(nextSlide, 4500);
}
function resetAutoPlay() {
    clearInterval(slideInterval);
    startAutoPlay();
}


// ── 3. Rating System (Live Fetch) ────────────────────────────────────────────
async function loadReviews() {
    // Legacy review logic disabled. Handled by about_us_settings realtime listener.
}

function renderStarsDisplay(average, container) {
    if (!container) return;
    container.innerHTML = '';
    const fullStars = Math.floor(average);
    const halfStar  = (average % 1) >= 0.5;

    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        if (i <= fullStars) {
            star.textContent = '★'; // Full
        } else if (i === fullStars + 1 && halfStar) {
            // Simple half star logic (could use CSS mask or specific icon)
            star.textContent = '★'; 
            star.style.opacity = '0.7'; 
        } else {
            star.textContent = '☆'; // Empty
            star.style.opacity = '0.3';
        }
        container.appendChild(star);
    }
}


// ── 4. Give Rating Interaction & Modal ───────────────────────────────────────
let selectedRating = 0;

function initRatingSystem() {
    const interactiveStars = document.querySelectorAll('.i-star');
    const modalStars       = document.querySelectorAll('.modal-star');
    
    // UI Stars Hover/Click
    interactiveStars.forEach(star => {
        star.addEventListener('mouseenter', () => {
            const val = parseInt(star.dataset.val);
            highlightStars(interactiveStars, val, 'hover-active');
        });
        star.addEventListener('mouseleave', () => {
            interactiveStars.forEach(s => s.classList.remove('hover-active'));
        });
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            highlightStars(interactiveStars, selectedRating, 'active');
        });
    });

    // Modal Stars Hover/Click
    modalStars.forEach(star => {
        star.addEventListener('mouseenter', () => {
            const val = parseInt(star.dataset.val);
            highlightStars(modalStars, val, 'hover-active', '☆', '★');
        });
        star.addEventListener('mouseleave', () => {
            modalStars.forEach(s => s.classList.remove('hover-active'));
        });
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            highlightStars(modalStars, selectedRating, 'active', '☆', '★');
            updateModalLabel(selectedRating);
        });
    });

    // Open Modal
    const submitBtn = getEl('submitRatingBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (selectedRating === 0) {
                // If user didn't click a star, default to 5
                selectedRating = 5;
                highlightStars(interactiveStars, 5, 'active');
            }
            openRatingModal();
        });
    }

    // Close Modal
    const closeBtn = getEl('ratingModalClose');
    const modal    = getEl('ratingModal');
    if (closeBtn) closeBtn.addEventListener('click', closeRatingModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeRatingModal();
        });
    }

    // Submit Final Rating
    const modalSubmitBtn = getEl('modalSubmitBtn');
    if (modalSubmitBtn) {
        modalSubmitBtn.addEventListener('click', handleRatingSubmit);
    }
}

function highlightStars(starsNodeList, val, className, emptyChar, fillChar) {
    starsNodeList.forEach((s) => {
        s.classList.remove('active', 'hover-active');
        if (emptyChar) s.textContent = emptyChar;
        
        if (parseInt(s.dataset.val) <= val) {
            s.classList.add(className);
            if (fillChar) s.textContent = fillChar;
        }
    });
}

function updateModalLabel(val) {
    const label = getEl('modalStarLabel');
    if (!label) return;
    const texts = ['Terrible', 'Poor', 'Average', 'Very Good', 'Excellent!'];
    label.textContent = texts[val - 1] || 'Select your rating';
}

function openRatingModal() {
    const modal = getEl('ratingModal');
    if (!modal) return;
    
    // Sync modal stars with selectedRating
    const modalStars = document.querySelectorAll('.modal-star');
    highlightStars(modalStars, selectedRating, 'active', '☆', '★');
    updateModalLabel(selectedRating);

    getEl('ratingComment').value = '';
    modal.classList.add('active');
}

function closeRatingModal() {
    const modal = getEl('ratingModal');
    if (modal) modal.classList.remove('active');
}

// ── Submit Review to Firebase ──
async function handleRatingSubmit() {
    const commentInput = getEl('ratingComment');
    const comment = commentInput ? commentInput.value.trim() : '';

    setModalLoadingState(true);

    try {
        await addDoc(collection(db, 'reviews'), {
            rating: selectedRating,
            comment: comment,
            createdAt: serverTimestamp()
        });

        setModalLoadingState(false);
        closeRatingModal();
        showToast();
        
        // Refresh live reviews
        loadReviews();

        // Reset UI stars
        selectedRating = 0;
        highlightStars(document.querySelectorAll('.i-star'), 0, 'active');

    } catch (error) {
        console.error('[AboutPage] Error submitting review:', error);
        setModalLoadingState(false);
        alert('Failed to submit review. Please try again.');
    }
}

function setModalLoadingState(loading) {
    const btn     = getEl('modalSubmitBtn');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoad = btn?.querySelector('.btn-loading');
    if (!btn) return;

    btn.disabled = loading;
    if (btnText) btnText.style.display = loading ? 'none' : 'block';
    if (btnLoad) btnLoad.style.display = loading ? 'flex' : 'none';
}

function showToast() {
    const toast = getEl('ratingToast');
    if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4500);
    }
}
