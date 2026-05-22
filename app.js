// app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LocationService } from "./location-service.js";

// Central API Configuration
const AURELIA_CONFIG = window.AURELIA_CONFIG || {
  productionBaseUrl: 'https://aurelia-cafe-customer-backend.onrender.com',
  localBaseUrl: 'http://localhost:5000',
  join: function(routePath) {
    let baseUrl = window.AURELIA_API_URL;
    if (!baseUrl) {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      baseUrl = isLocal ? this.localBaseUrl : this.productionBaseUrl;
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

// 🔴 APNA CONFIG YAHA DALO
const firebaseConfig = {
  apiKey: "AIzaSyC0-iqTVeo0L-PZ9og_699vCsdEtxfrlSc",
  authDomain: "coffee-shop-d4c22.firebaseapp.com",
  projectId: "coffee-shop-d4c22",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.db = db;

// 🟢 CUSTOMER ORDER VISIBILITY LOGIC
let activeOrderUnsubscribes = {};
let currentActiveOrdersData = {};
let visibilityCheckInterval = null;

function getActiveOrders() {
  try {
    return JSON.parse(localStorage.getItem('aurelia_active_orders')) || [];
  } catch (e) {
    return [];
  }
}

function saveActiveOrders(orders) {
  localStorage.setItem('aurelia_active_orders', JSON.stringify(orders));
}

function getStatusUI(status) {
  switch (status?.toLowerCase()) {
    case 'pending': return '<span style="color: #ff9800;">Pending ⏳</span>';
    case 'accepted': return '<span style="color: #4caf50;">Accepted ✅</span>';
    case 'preparing': return '<span style="color: #2196f3;">Preparing 🍽️</span>';
    case 'completed': return '<span style="color: #9c27b0;">Completed ✔️</span>';
    default: return `<span>${status}</span>`;
  }
}

function formatTimeRemaining(customerVisibleUntilMs) {
  const diff = customerVisibleUntilMs - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  return `${mins} min left`;
}

function renderActiveOrdersUI() {
  const activeOrdersList = document.getElementById("activeOrdersList");
  const activeOrdersContainer = document.getElementById("activeOrdersContainer");
  
  if (!activeOrdersList || !activeOrdersContainer) return;
  
  if (Object.keys(currentActiveOrdersData).length === 0) {
    activeOrdersContainer.style.display = 'none';
    activeOrdersList.innerHTML = '';
    return;
  }
  
  activeOrdersContainer.style.display = 'block';
  activeOrdersList.innerHTML = '';
  
  const sortedOrders = Object.values(currentActiveOrdersData).sort((a, b) => {
    const timeA = a.createdAt?.toMillis() || 0;
    const timeB = b.createdAt?.toMillis() || 0;
    return timeB - timeA;
  });

  sortedOrders.forEach(order => {
    const orderCard = document.createElement('div');
    orderCard.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      border: 1px solid rgba(181, 155, 123, 0.2);
    `;
    
    let timeRemainingHtml = '';
    if (order.customerVisibleUntil) {
      const ms = order.customerVisibleUntil.toMillis();
      timeRemainingHtml = `<div style="font-size: 0.8rem; color: #888; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">Auto-hides in: ${formatTimeRemaining(ms)}</div>`;
    }
    
    const itemsText = order.items ? order.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : '';

    orderCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 600; font-size: 0.9rem;">Order ${order.id.slice(0,6).toUpperCase()}</div>
        <div style="font-size: 0.9rem;">${getStatusUI(order.status)}</div>
      </div>
      <div style="font-size: 0.85rem; color: #ddd; margin-bottom: 5px; line-height: 1.4;">${itemsText}</div>
      <div style="font-size: 0.85rem; font-weight: 600; color: var(--accent-color);">₹${order.total}</div>
      ${timeRemainingHtml}
    `;
    activeOrdersList.appendChild(orderCard);
  });
}

function checkVisibilityTimeouts() {
  let ordersChanged = false;
  let activeIds = getActiveOrders();
  
  Object.keys(currentActiveOrdersData).forEach(id => {
    const order = currentActiveOrdersData[id];
    if (order.customerVisibleUntil) {
      const ms = order.customerVisibleUntil.toMillis();
      if (Date.now() >= ms) {
        delete currentActiveOrdersData[id];
        if (activeOrderUnsubscribes[id]) {
          activeOrderUnsubscribes[id]();
          delete activeOrderUnsubscribes[id];
        }
        activeIds = activeIds.filter(orderId => orderId !== id);
        ordersChanged = true;
      }
    }
  });
  
  if (ordersChanged) {
    saveActiveOrders(activeIds);
  }
  renderActiveOrdersUI();
}

function listenToActiveOrders() {
  const activeIds = getActiveOrders();
  
  if (activeIds.length > 0 && !visibilityCheckInterval) {
    visibilityCheckInterval = setInterval(checkVisibilityTimeouts, 60000);
  }
  
  activeIds.forEach(id => {
    if (activeOrderUnsubscribes[id]) return;
    
    activeOrderUnsubscribes[id] = onSnapshot(doc(db, "orders", id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        data.id = docSnap.id;
        
        if (data.customerVisibleUntil) {
          const ms = data.customerVisibleUntil.toMillis();
          if (Date.now() >= ms) {
            const currentIds = getActiveOrders();
            saveActiveOrders(currentIds.filter(oid => oid !== id));
            delete currentActiveOrdersData[id];
            activeOrderUnsubscribes[id]();
            delete activeOrderUnsubscribes[id];
            renderActiveOrdersUI();
            return;
          }
        }
        
        currentActiveOrdersData[id] = data;
        renderActiveOrdersUI();
      }
    });
  });
}

// ✦ DYNAMIC BRANDING INJECTOR
async function initDynamicBranding() {
  try {
    const res = await fetch(AURELIA_CONFIG.join('/api/booking/settings'), { cache: "no-store" });
    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data && result.data.cafeName) {
        const cafeName = result.data.cafeName;
        
        // 1. Update logo containers
        const logos = document.querySelectorAll(".logo");
        logos.forEach(el => {
          el.textContent = cafeName.toUpperCase();
        });
        
        // 2. Update about-us heading labels if present
        const aboutHeading = document.getElementById("aboutHeadingLabel");
        if (aboutHeading) {
          aboutHeading.textContent = `ABOUT ${cafeName.toUpperCase()}`;
        }
        
        // 3. Update document title
        if (document.title.includes("Aurelia Cafe")) {
          document.title = document.title.replace("Aurelia Cafe", cafeName);
        }
      }
    }
  } catch (err) {
    console.warn("Branding fetch failed, using default 'Aurelia Cafe':", err.message);
  }
}

// 🧾 FORM SUBMIT HANDLE
document.addEventListener("DOMContentLoaded", () => {
  initDynamicBranding();
  listenToActiveOrders();

  const branchSelect = document.getElementById("checkoutBranch");
  const floorSelect = document.getElementById("checkoutFloor");
  const tableSelect = document.getElementById("checkoutTable");
  if (branchSelect && floorSelect && tableSelect) {
    const locationService = new LocationService(window.db);
    locationService.setupDropdowns({
      branchSelect,
      floorSelect,
      tableSelect
    });
  }

  const form = document.getElementById("checkoutForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("checkoutName").value;
    const phone = document.getElementById("checkoutPhone").value;
    const branch = document.getElementById("checkoutBranch").value;
    const tableSelect = document.getElementById("checkoutTable");
    const notes = document.getElementById("checkoutNotes").value;
    
    if (!name.trim() || !phone.trim() || !branch || !tableSelect.value) {
      alert("Fill required fields");
      return;
    }
    
    const tableId = tableSelect.value;
    const tableNumberText = tableSelect.options[tableSelect.selectedIndex]?.text || '';
    const tableNumber = tableNumberText.replace('Table ', '');

    if (window.cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    const formattedItems = window.cart.map(item => ({
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity
    }));

    const total = formattedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const orderData = {
      customerName: name,
      mobile: phone,
      branchId: branch,
      tableId: tableId,
      tableNumber: tableNumber,
      notes: notes,
      items: formattedItems,
      total: total
    };

    try {
      // 🛑 SECURITY UPDATE: Frontend NEVER writes directly to Firestore anymore
      const checkoutUrl = AURELIA_CONFIG.join('/api/order/checkout');

      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to place order securely.');
      }

      // Add to active orders for UI listening
      const activeIds = getActiveOrders();
      activeIds.push(result.orderId);
      saveActiveOrders(activeIds);
      listenToActiveOrders();

      alert("Order placed successfully! ☕");

      if (typeof window.afterOrderSuccess === 'function') {
        window.afterOrderSuccess();
      } else {
        window.cart = [];
        localStorage.setItem('aurelia_cart', JSON.stringify([]));
        const badge = document.getElementById("cartBadge");
        if (badge) badge.innerText = "0";
        const container = document.getElementById("cartItemsContainer");
        if (container) container.innerHTML = `<div class="empty-cart-msg">Your cart is empty.</div>`;
        const totalVal = document.getElementById("cartTotalValue");
        if (totalVal) totalVal.innerText = "₹0";
      }
      form.reset();

    } catch (error) {
      console.error(error);
      alert("Error placing order");
    }
  });

});