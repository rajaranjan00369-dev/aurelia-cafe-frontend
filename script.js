// =======================================================
// PRODUCT DATA
// =======================================================
import { getFirestore, collection, getDocs, orderBy, query }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
let products = [];
let firestoreCategories = []; // fetched live from `categories` collection

// =======================================================
// CURRENCY HELPER — Indian Rupee (INR)
// =======================================================
function formatINR(amount) {
    return '\u20B9' + Math.round(Number(amount) || 0).toLocaleString('en-IN');
}

// =======================================================
// SLIDER IMAGES
// =======================================================
const sliderImages = [
    "images/latte.png",
    "images/choclate-cake.png",
    "images/sandwich.png",
    "images/milkshake.png",
    "images/cup-cake.png",
    "images/choclate-bun.png"
];

// =======================================================
// GLOBAL STATE
// =======================================================
function loadCartFromStorage() {
    try {
        window.cart = JSON.parse(localStorage.getItem('aurelia_cart')) || [];
    } catch (e) {
        window.cart = [];
    }
}
loadCartFromStorage();
window.loadCartFromStorage = loadCartFromStorage;
let currentModalProduct = null;
let currentQty = 1;
let currentSlide = 0;
let slideInterval = null;

// =======================================================
// SAFE DOM HELPERS
// =======================================================
const getEl = (id) => document.getElementById(id);
const getQ = (sel) => document.querySelector(sel);
const getAll = (sel) => document.querySelectorAll(sel);

// =======================================================
// DOM ELEMENTS — MODAL
// =======================================================
const modalOverlay    = getEl('productModal');
const closeModalBtn   = getEl('closeModalBtn');
const modalImg        = getEl('modalImg');
const modalTitle      = getEl('modalTitle');
const modalDesc       = getEl('modalDesc');
const modalPrice      = getEl('modalPrice');
const qtyMinus        = getEl('qtyMinus');
const qtyPlus         = getEl('qtyPlus');
const qtyValue        = getEl('qtyValue');
const addToCartBtn    = getEl('addToCartBtn');

// =======================================================
// DOM ELEMENTS — CART
// =======================================================
const openCartBtn         = getEl('openCartBtn');
const cartOverlay         = getEl('cartOverlay');
const cartPanel           = getEl('cartPanel');
const closeCartBtn        = getEl('closeCartBtn');
const cartItemsContainer  = getEl('cartItemsContainer');
const cartTotalValue      = getEl('cartTotalValue');
const cartBadge           = getEl('cartBadge');

// =======================================================
// DOM ELEMENTS — NAVIGATION
// =======================================================
const navLinks     = getAll('.nav-link');
const homeSection  = getEl('home');
const menuSection  = getEl('menu');

// =======================================================
// DOM ELEMENTS — CHECKOUT
// =======================================================
const proceedCheckoutBtn = getEl('proceedCheckoutBtn');
const checkoutModal      = getEl('checkoutModal');
const closeCheckoutBtn   = getEl('closeCheckoutBtn');
const checkoutForm       = getEl('checkoutForm');
const checkoutPhone      = getEl('checkoutPhone');
const phoneError         = getEl('phoneError');

// =======================================================
// DOM ELEMENTS — SLIDER
// =======================================================
const sliderTrack = getEl('sliderTrack');
const sliderDots  = getEl('sliderDots');
const prevBtn     = getEl('sliderPrev');
const nextBtn     = getEl('sliderNext');

// =======================================================
// OVERLAY HELPERS
// =======================================================
function openOverlay(element) {
    if (!element) return;
    element.classList.add('active');
}

function closeOverlay(element) {
    if (!element) return;
    element.classList.remove('active');
}

// =======================================================
// 1. RENDER PRODUCTS
// =======================================================
// formatTitle: converts slug/raw string to Title Case
function formatTitle(str) {
    return str.split(/[-_ ]+/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
}

function renderProducts() {
    const container = getQ('#dynamic-menu-container');
    if (!container) {
        console.warn('[renderProducts] Menu container not found!');
        return;
    }

    container.innerHTML = '';

    if (!products || products.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #b59b7b;">No products available.</div>';
        return;
    }

    // Build slug → products map
    const productsBySlug = {};
    products.forEach(product => {
        const slug = (product.category || 'uncategorized').toLowerCase().trim();
        if (!productsBySlug[slug]) productsBySlug[slug] = [];
        productsBySlug[slug].push(product);
    });

    console.log('[renderProducts] Products by slug:', Object.keys(productsBySlug));
    console.log('[renderProducts] Firestore categories order:', firestoreCategories.map(c => c.slug));

    // Step 1 — render in Firestore category order (only if products exist)
    firestoreCategories.forEach(cat => {
        const slug = cat.slug;
        if (productsBySlug[slug] && productsBySlug[slug].length > 0) {
            renderCategorySection(container, cat.name, productsBySlug[slug]);
            delete productsBySlug[slug];
        }
    });

    // Step 2 — render any orphan categories not in Firestore (fallback)
    Object.keys(productsBySlug).forEach(slug => {
        if (productsBySlug[slug] && productsBySlug[slug].length > 0) {
            console.log('[renderProducts] Orphan category (not in Firestore):', slug);
            renderCategorySection(container, formatTitle(slug), productsBySlug[slug]);
        }
    });
}

function renderCategorySection(container, title, catProducts) {
    console.log("Creating category section:", title, "| Products:", catProducts.length);

    const section = document.createElement('div');
    section.className = 'menu-category';
    // Force visibility — do NOT rely on reveal-on-scroll which starts at opacity:0
    section.style.cssText = 'opacity:1; transform:none; display:block; margin-bottom:60px;';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
        <div class="line"></div>
        <h3 class="category-title">${title.toUpperCase()}</h3>
        <div class="line"></div>
    `;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:20px;';

    catProducts.forEach(product => {
        console.log("Appending product:", product.name, "| Category:", product.category);

        const safeImage = product.image || product.imageUrl || product.img || 'images/latte.png';
        let stars = '';
        const rating = Number(product.rating) || 5;
        for (let i = 0; i < rating; i++) {
            stars += '<span class="star active">★</span>';
        }

        const card = document.createElement('div');
        card.className  = 'menu-card';
        card.dataset.id = product.id || '';

        const price = Number(product.price) || 0;

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${safeImage}" alt="${product.name || 'Product'}" onerror="this.onerror=null; this.src='images/latte.png';">
            </div>
            <h4 class="card-title">${product.name || 'Unknown'}</h4>
            <div class="card-rating">${stars}</div>
            <p class="card-desc">${product.desc || ''}</p>
            <div class="card-price">${formatINR(price)}</div>
        `;

        card.addEventListener('click', () => {
            if (product.id) {
                card.classList.add('clicked');
                setTimeout(() => {
                    card.classList.remove('clicked');
                    openProductModal(product.id);
                }, 150);
            }
        });

        grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
    console.log("Section appended to DOM:", title);
}

// =======================================================
// 2. PRODUCT MODAL
// =======================================================
function openProductModal(id) {
    const product = products.find(p => p.id === id);
    if (!product || !modalOverlay) return;

    currentModalProduct = product;
    currentQty = 1;

    if (modalImg) {
        const safeImage = product.image || product.imageUrl || product.img || 'images/latte.png';
        modalImg.src = safeImage;
        modalImg.onerror = function() { this.onerror=null; this.src = 'images/latte.png'; };
    }
    if (modalTitle)  modalTitle.textContent    = product.name;
    if (modalDesc)   modalDesc.textContent     = product.desc;
    if (modalPrice)  modalPrice.textContent    = formatINR(product.price || 0);
    if (qtyValue)    qtyValue.textContent      = currentQty;

    modalOverlay.classList.add('active');
}

function closeProductModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
    currentModalProduct = null;
}

// Modal Close Events
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeProductModal);
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeProductModal();
    });
}

// Quantity Controls
if (qtyMinus) {
    qtyMinus.addEventListener('click', () => {
        if (currentQty > 1) {
            currentQty--;
            if (qtyValue) qtyValue.textContent = currentQty;
        }
    });
}

if (qtyPlus) {
    qtyPlus.addEventListener('click', () => {
        currentQty++;
        if (qtyValue) qtyValue.textContent = currentQty;
    });
}

// Add to Cart from Modal
if (addToCartBtn) {
    addToCartBtn.addEventListener('click', () => {
    if (!currentModalProduct) return;

    const productName = currentModalProduct.name; // ✅ save first

    addToCart(currentModalProduct, currentQty);
    closeProductModal();

    showFeedback(`${productName} added to cart!`); // ✅ safe
});
}

// =======================================================
// 3. CART SYSTEM
// =======================================================
function addToCart(product, quantity) {
    const existing = window.cart.find(item => item.product.id === product.id);
    if (existing) {
        existing.quantity += quantity;
    } else {
        window.cart.push({ product, quantity });
    }
    updateCartUI();
}

function removeFromCart(id) {
    const index = window.cart.findIndex(item => item.product.id === id);
    if (index !== -1) {
        window.cart.splice(index, 1); // 🔥 same array modify
    }
    updateCartUI();
}

function updateCartUI() {
    // Save to local storage
    localStorage.setItem('aurelia_cart', JSON.stringify(window.cart));

    // Update badge
    
    const totalItems = window.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartBadge) cartBadge.textContent = totalItems;

    if (!cartItemsContainer) return;

    // Empty cart
    if (window.cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-msg" 
                style="text-align:center;padding:20px;">
                Your cart is empty.
            </div>`;
        if (cartTotalValue) cartTotalValue.textContent = formatINR(0);
        return;
    }

    // Build cart items
    let total = 0;
    cartItemsContainer.innerHTML = '';

    window.cart.forEach(item => {

        // 🔥 CRASH GUARD (MOST IMPORTANT)
        if (!item || !item.product) return;

        const safeImage = item.product.image || item.product.imageUrl || item.product.img || 'images/latte.png';
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;

        const row = document.createElement('div');
        row.style.cssText = `
            display:flex;
            align-items:center;
            margin-bottom:15px;
            border-bottom:1px solid #eee;
            padding-bottom:10px;
        `;

        row.innerHTML = `
            <img 
                src="${safeImage}" 
                onerror="this.onerror=null; this.src='images/latte.png';"
                style="width:50px;height:50px;
                object-fit:cover;border-radius:4px;
                margin-right:15px;">
            <div style="flex-grow:1;">
                <div style="font-weight:600;
                    font-size:0.9rem;">
                    ${item.product.name}
                </div>
                <div style="font-size:0.8rem;color:#666;">
                    ${formatINR(item.product.price)}
                    x ${item.quantity}
                </div>
            </div>
            <div style="font-weight:600;margin-right:15px;">
                ${formatINR(itemTotal)}
            </div>
            <button 
                class="cart-remove-btn"
                data-id="${item.product.id}"
                style="background:none;border:none;
                color:red;font-size:1.2rem;
                cursor:pointer;">
                &times;
            </button>
        `;

        // Remove button event
        row.querySelector('.cart-remove-btn')
            .addEventListener('click', () => {
                removeFromCart(item.product.id);
            });

        cartItemsContainer.appendChild(row);
    });

    if (cartTotalValue) {
        cartTotalValue.textContent = formatINR(total);
    }
}
window.updateCartUI = updateCartUI;

// =======================================================
// 4. CART PANEL OPEN/CLOSE
// =======================================================
function openCart() {
    if (cartOverlay) {
        cartOverlay.style.display   = 'block';
        cartOverlay.style.opacity   = '1';
    }
    if (cartPanel) {
        cartPanel.style.transform = 'translateX(0)';
    }
}

function closeCart() {
    if (cartOverlay) {
        cartOverlay.style.opacity = '0';
        setTimeout(() => {
            if (cartOverlay) cartOverlay.style.display = 'none';
        }, 300);
    }
    if (cartPanel) {
        cartPanel.style.transform = 'translateX(100%)';
    }
}

if (openCartBtn)  openCartBtn.addEventListener('click', openCart);
if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
if (cartOverlay)  cartOverlay.addEventListener('click', closeCart);

// =======================================================
// 5. CHECKOUT MODAL
// =======================================================
function openCheckoutModal() {
    if (!checkoutModal) return;
    checkoutModal.classList.add('active');
}

function closeCheckoutModal() {
    if (!checkoutModal) return;
    checkoutModal.classList.remove('active');
}

if (proceedCheckoutBtn) {
    proceedCheckoutBtn.addEventListener('click', () => {
        if (window.cart.length === 0) {
            showFeedback('Your cart is empty!');
            return;
        }
        closeCart();
        setTimeout(openCheckoutModal, 350);
    });
}

if (closeCheckoutBtn) {
    closeCheckoutBtn.addEventListener('click', closeCheckoutModal);
}

if (checkoutModal) {
    checkoutModal.addEventListener('click', (e) => {
        if (e.target === checkoutModal) closeCheckoutModal();
    });
}

// Phone validation live
if (checkoutPhone) {
    checkoutPhone.addEventListener('input', () => {
        if (phoneError) phoneError.style.display = 'none';
        checkoutPhone.style.borderColor = 'var(--card-border)';
    });
}

// =======================================================
// 6. CHECKOUT FORM SUBMIT (Local only — Firebase in app.js)
// =======================================================
window.afterOrderSuccess = function () {
    window.cart = [];
    localStorage.setItem('aurelia_cart', JSON.stringify(window.cart));
    updateCartUI();
    closeCheckoutModal();
};

// =======================================================
// 7. NAVIGATION — HOME / MENU
// =======================================================

// Helper: is this page index.html?
function isHomePage() {
    return !!(document.getElementById('home') && document.getElementById('menu'));
}

// Core: show menu section with fade transition (index.html only)
function showMenuSection(isPopState = false) {
    const homeEl = document.getElementById('home');
    const menuEl = document.getElementById('menu');
    if (!homeEl || !menuEl) return;

    // Update active states
    document.querySelectorAll('.nav-link').forEach(l => {
        const h = l.getAttribute('href') || '';
        if (h === '#menu' || h === 'index.html#menu' || h === './index.html#menu') {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    const triggerFadeIn = () => {
        menuEl.style.display = 'block';
        void menuEl.offsetWidth; // force reflow
        menuEl.classList.add('active', 'show');
        menuEl.style.pointerEvents = 'auto';
        menuEl.style.opacity = '1';
        menuEl.style.transform = 'translateY(0)';
        menuEl.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('visible'));

        if (!isPopState) {
            window.history.pushState(null, '', 'index.html#menu');
        }
    };

    if (homeEl.style.display !== 'none') {
        homeEl.classList.remove('active', 'show');
        homeEl.style.pointerEvents = 'none';
        homeEl.style.opacity = '0';
        homeEl.style.transform = 'translateY(10px)';
        setTimeout(() => {
            homeEl.style.display = 'none';
            triggerFadeIn();
        }, 400);
    } else {
        triggerFadeIn();
    }
}

// Core: show home section with fade transition (index.html only)
function showHomeSection(isPopState = false) {
    const homeEl = document.getElementById('home');
    const menuEl = document.getElementById('menu');
    if (!homeEl || !menuEl) return;

    document.querySelectorAll('.nav-link').forEach(l => {
        const h = l.getAttribute('href') || '';
        if (h === './index.html' || h === 'index.html' || h === '#home') {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    const triggerFadeIn = () => {
        homeEl.style.display = 'flex';
        void homeEl.offsetWidth; // force reflow
        homeEl.classList.add('active', 'show');
        homeEl.style.pointerEvents = 'auto';
        homeEl.style.opacity = '1';
        homeEl.style.transform = 'translateY(0)';
        homeEl.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('visible'));

        if (!isPopState) {
            window.history.pushState(null, '', 'index.html');
        }
    };

    if (menuEl.style.display !== 'none') {
        menuEl.classList.remove('active', 'show');
        menuEl.style.pointerEvents = 'none';
        menuEl.style.opacity = '0';
        menuEl.style.transform = 'translateY(10px)';
        setTimeout(() => {
            menuEl.style.display = 'none';
            triggerFadeIn();
        }, 400);
    } else {
        triggerFadeIn();
    }
}

function initNavigation() {
    const homeEl = document.getElementById('home');
    const menuEl = document.getElementById('menu');

    // ── Set up transitions ──
    if (homeEl) {
        homeEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }
    if (menuEl) {
        menuEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    }

    // ── Initial state on index.html ──
    if (homeEl && menuEl) {
        if (window.location.hash === '#menu') {
            // Opened directly at #menu
            homeEl.style.display = 'none';
            homeEl.style.opacity = '0';
            homeEl.style.pointerEvents = 'none';
            homeEl.classList.remove('active', 'show');

            menuEl.style.display = 'block';
            menuEl.style.opacity = '1';
            menuEl.style.transform = 'translateY(0)';
            menuEl.style.pointerEvents = 'auto';
            menuEl.classList.add('active', 'show');
            menuEl.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('visible'));

            document.querySelectorAll('.nav-link').forEach(l => {
                const h = l.getAttribute('href') || '';
                l.classList.toggle('active',
                    h === '#menu' || h === 'index.html#menu' || h === './index.html#menu');
            });
        } else {
            // Normal home load
            menuEl.style.display = 'none';
            menuEl.style.opacity = '0';
            menuEl.style.pointerEvents = 'none';
            menuEl.classList.remove('active', 'show');

            homeEl.style.display = 'flex';
            homeEl.style.opacity = '1';
            homeEl.style.transform = 'translateY(0)';
            homeEl.style.pointerEvents = 'auto';
            homeEl.classList.add('active', 'show');

            document.querySelectorAll('.nav-link').forEach(l => {
                const h = l.getAttribute('href') || '';
                l.classList.toggle('active',
                    h === './index.html' || h === 'index.html' || h === '#home');
            });
        }
    }

    // ── MENU nav link clicks ──
    document.querySelectorAll(
        'a[href="./index.html#menu"], a[href="index.html#menu"], a[href="#menu"]'
    ).forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            if (isHomePage()) {
                showMenuSection();
            } else {
                window.location.href = './index.html#menu';
            }
        });
    });

    // ── HOME nav link clicks (index.html only) ──
    document.querySelectorAll(
        'a[href="./index.html"], a[href="index.html"], a[href="#home"]'
    ).forEach(link => {
        link.addEventListener('click', e => {
            if (isHomePage()) {
                e.preventDefault();
                showHomeSection();
            }
        });
    });

    // ── Hero & Bottom CTA button click listeners ──
    document.querySelectorAll('.hero-cta, .bottom-cta').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            if (isHomePage()) {
                showMenuSection();
            } else {
                window.location.href = './index.html#menu';
            }
        });
    });

    // ── Window Popstate / History listener ──
    window.addEventListener('popstate', () => {
        if (!isHomePage()) return;
        if (window.location.hash === '#menu') {
            showMenuSection(true);
        } else {
            showHomeSection(true);
        }
    });
}

// =======================================================
// 8. SLIDER SYSTEM
// =======================================================
function initSlider() {
    if (!sliderTrack) return;

    sliderTrack.innerHTML = '';
    if (sliderDots) sliderDots.innerHTML = '';

    sliderImages.forEach((imgSrc, index) => {
        // Create slide
        const slide    = document.createElement('div');
        slide.className = 'slide';
        slide.innerHTML = `<img src="${imgSrc}" alt="Slide ${index + 1}">`;

        slide.addEventListener('click', () => {
            if (slide.classList.contains('slide-prev') ||
                slide.classList.contains('slide-prev-2')) {
                prevSlide();
                resetAutoPlay();
            }
            if (slide.classList.contains('slide-next') ||
                slide.classList.contains('slide-next-2')) {
                nextSlide();
                resetAutoPlay();
            }
        });

        sliderTrack.appendChild(slide);

        // Create dot
        if (sliderDots) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => {
                goToSlide(index);
                resetAutoPlay();
            });
            sliderDots.appendChild(dot);
        }
    });

    updateSlider();
    startAutoPlay();

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            prevSlide();
            resetAutoPlay();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            nextSlide();
            resetAutoPlay();
        });
    }
}

function updateSlider() {
    const slides = getAll('.slide');
    const dots   = getAll('.dot');
    const total  = slides.length;

    if (total === 0) return;

    slides.forEach((slide, index) => {
        slide.className = 'slide';

        if (index === currentSlide) {
            slide.classList.add('slide-active');
        } else if (index === (currentSlide - 1 + total) % total) {
            slide.classList.add('slide-prev');
        } else if (index === (currentSlide - 2 + total) % total) {
            slide.classList.add('slide-prev-2');
        } else if (index === (currentSlide + 1) % total) {
            slide.classList.add('slide-next');
        } else if (index === (currentSlide + 2) % total) {
            slide.classList.add('slide-next-2');
        } else {
            slide.classList.add('slide-hidden');
        }
    });

    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % sliderImages.length;
    updateSlider();
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + sliderImages.length) % sliderImages.length;
    updateSlider();
}

function goToSlide(index) {
    currentSlide = index;
    updateSlider();
}

function startAutoPlay() {
    slideInterval = setInterval(nextSlide, 3500);
}

function resetAutoPlay() {
    clearInterval(slideInterval);
    startAutoPlay();
}

// =======================================================
// 9. SCROLL REVEAL
// =======================================================
function initScrollReveal() {
    const elements = getAll('.reveal-on-scroll');
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    elements.forEach(el => observer.observe(el));
}

// =======================================================
// 10. FEEDBACK TOAST
// =======================================================
function showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.textContent = message;
    Object.assign(feedback.style, {
        position:        'fixed',
        bottom:          '20px',
        right:           '20px',
        backgroundColor: '#2c2c2c',
        color:           '#fff',
        padding:         '12px 24px',
        borderRadius:    '4px',
        boxShadow:       '0 4px 12px rgba(0,0,0,0.15)',
        zIndex:          '9999',
        opacity:         '0',
        transform:       'translateY(20px)',
        transition:      'opacity 0.3s, transform 0.3s',
        fontFamily:      "'Inter', sans-serif",
        fontSize:        '14px'
    });

    document.body.appendChild(feedback);

    requestAnimationFrame(() => {
        feedback.style.opacity   = '1';
        feedback.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        feedback.style.opacity   = '0';
        feedback.style.transform = 'translateY(20px)';
        setTimeout(() => feedback.remove(), 300);
    }, 2500);
}

// =======================================================
// 11. MOBILE NAV — HAMBURGER
// =======================================================
function initMobileNav() {
    const navContainer = getQ('.nav-container');
    const navLinksEl   = getQ('.nav-links');

    if (!navContainer || !navLinksEl) return;
    if (getQ('.hamburger-btn')) return;

    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger-btn';
    hamburger.setAttribute('aria-label', 'Toggle navigation menu');
    hamburger.innerHTML = '<span></span><span></span><span></span>';

    navContainer.insertBefore(hamburger, navLinksEl);

    const overlay = document.createElement('div');
    overlay.className = 'mobile-menu-overlay';
    navContainer.appendChild(overlay);

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navLinksEl.classList.toggle('mobile-open');
        hamburger.classList.toggle('open', isOpen);
        overlay.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    const closeMenu = () => {
        navLinksEl.classList.remove('mobile-open');
        hamburger.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    navLinksEl.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            // Delay menu closing to ensure browser registers the click for navigation
            setTimeout(closeMenu, 250);
        });
    });

    const openCartBtn = document.getElementById('openCartBtn');
    if (openCartBtn) {
        openCartBtn.addEventListener('click', () => {
            setTimeout(closeMenu, 100);
        });
    }

    overlay.addEventListener('click', closeMenu);

    document.addEventListener('click', (e) => {
        if (
            navLinksEl.classList.contains('mobile-open') &&
            !navLinksEl.contains(e.target) &&
            e.target !== hamburger
        ) {
            closeMenu();
        }
    });
}

// =======================================================
// 12. CART PANEL MOBILE FIX
// =======================================================
function fixCartPanelMobile() {
    const panel = getEl('cartPanel');
    if (!panel) return;

    panel.style.removeProperty('background-color');
    panel.style.removeProperty('width');
    panel.style.removeProperty('box-shadow');

    Object.assign(panel.style, {
        position:      'fixed',
        top:           '0',
        right:         '0',
        height:        '100vh',
        zIndex:        '1001',
        display:       'flex',
        flexDirection: 'column',
        transform:     'translateX(100%)',
        transition:    'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)'
    });
}

// =======================================================
// DOMContentLoaded — INIT ALL
// =======================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Load and render cart immediately before other operations
    loadCartFromStorage();
    updateCartUI();

    // Core init (execute immediately for fast UI response)
    initNavigation();
    initMobileNav();
    initSlider();
    fixCartPanelMobile();

    // Modal overlay setup
    if (modalOverlay) {
        modalOverlay.style.transition = 'opacity 0.3s ease';
    }

    // Cart overlay setup
    if (cartOverlay) {
        Object.assign(cartOverlay.style, {
            transition:      'opacity 0.3s ease',
            position:        'fixed',
            top:             '0',
            left:            '0',
            width:           '100vw',
            height:          '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex:          '1000',
            display:         'none',
            opacity:         '0'
        });
    }

    // Cart items container
    if (cartItemsContainer) {
        Object.assign(cartItemsContainer.style, {
            flexGrow:  '1',
            overflowY: 'auto',
            padding:   '20px'
        });
    }

async function loadProductsFromFirebase() {
    console.log('[Firebase] Loading products and categories...');
    const container = getQ('#dynamic-menu-container');

    if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #b59b7b;">Loading menu...</div>';
    }

    try {
        if (!window.db) {
            console.warn('[Firebase] window.db not ready, waiting 500ms...');
            await new Promise(r => setTimeout(r, 500));
        }

        const db = window.db || getFirestore();

        // ── Fetch categories (ordered by name) ──────────────────────────
        try {
            const catSnap = await getDocs(
                query(collection(db, 'categories'), orderBy('name', 'asc'))
            );
            firestoreCategories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log('[Firebase] Categories loaded:', firestoreCategories.map(c => c.slug));
        } catch (catErr) {
            console.warn('[Firebase] Could not load categories (collection may be empty):', catErr.message);
            firestoreCategories = [];
        }

        // ── Fetch products ───────────────────────────────────────────────
        const querySnapshot = await getDocs(collection(db, 'products'));
        console.log('[Firebase] Products fetched:', querySnapshot.size);

        products = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const cat = (data.category || 'uncategorized').toLowerCase().trim();
            products.push({
                id: doc.id,
                name: data.name || 'Unknown',
                category: cat,
                price: Number(data.price) || 0,
                desc: data.desc || data.description || '',
                image: data.image || data.imageUrl || data.img || 'images/latte.png',
                rating: Number(data.rating) || 5
            });
        });

        console.log('[Firebase] Normalized products:', products);
        renderProducts();

    } catch (error) {
        console.error('[Firebase] Error loading data:', error);
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: red;">Failed to load menu. Please try again later.</div>';
        }
    }
}
await loadProductsFromFirebase();
});

// Synchronize cart across pages/tabs and handle bfcache
window.addEventListener('pageshow', () => {
    loadCartFromStorage();
    updateCartUI();
});

window.addEventListener('storage', (e) => {
    if (e.key === 'aurelia_cart') {
        loadCartFromStorage();
        updateCartUI();
    }
});