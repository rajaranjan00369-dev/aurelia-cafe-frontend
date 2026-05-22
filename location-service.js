import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Clean service for managing dynamic location dropdowns (Branches, Floors, Tables)
 */
export class LocationService {
    constructor(db) {
        this.db = db;
        this.branchesUnsub = null;
        this.floorsUnsub = null;
        this.tablesUnsub = null;
    }

    /**
     * Set up dynamic dropdowns for a specific form
     * @param {Object} elements - DOM elements for the selects
     * @param {HTMLSelectElement} elements.branchSelect
     * @param {HTMLSelectElement} elements.floorSelect
     * @param {HTMLSelectElement} elements.tableSelect
     * @param {Function} [elements.onTableChange] - Optional callback when table changes
     */
    setupDropdowns({ branchSelect, floorSelect, tableSelect, onTableChange }) {
        if (!branchSelect || !floorSelect || !tableSelect) return;

        // Initial disable
        floorSelect.disabled = true;
        tableSelect.disabled = true;

        // 1. Fetch Branches
        this.branchesUnsub = onSnapshot(collection(this.db, 'branches'), (snap) => {
            const currentVal = branchSelect.value;
            branchSelect.innerHTML = '<option value="" disabled selected>Select Branch</option>';
            snap.forEach(doc => {
                const data = doc.data();
                branchSelect.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
            });

            // Restore selection if still valid
            if (currentVal && [...branchSelect.options].some(o => o.value === currentVal)) {
                branchSelect.value = currentVal;
            } else {
                this.resetFloorSelect(floorSelect, tableSelect);
            }
        });

        // 2. Listen to Branch Change
        branchSelect.addEventListener('change', () => {
            const branchId = branchSelect.value;
            
            // UI Loading state
            floorSelect.innerHTML = '<option value="" disabled selected>Loading Floors...</option>';
            floorSelect.disabled = true;
            tableSelect.innerHTML = '<option value="" disabled selected>Select Table</option>';
            tableSelect.disabled = true;
            
            // Clean up previous listeners
            if (this.floorsUnsub) this.floorsUnsub();
            if (this.tablesUnsub) this.tablesUnsub();
            
            // Fetch Floors for Branch
            const q = query(collection(this.db, 'floors'), where('branchId', '==', branchId));
            this.floorsUnsub = onSnapshot(q, (snap) => {
                const currentVal = floorSelect.value;
                floorSelect.innerHTML = '<option value="" disabled selected>Select Floor</option>';
                
                let hasFloors = false;
                snap.forEach(doc => {
                    hasFloors = true;
                    const data = doc.data();
                    floorSelect.innerHTML += `<option value="${doc.id}">${data.name}</option>`;
                });
                
                if (hasFloors) {
                    floorSelect.disabled = false;
                } else {
                    floorSelect.innerHTML = '<option value="" disabled selected>No floors available</option>';
                }
                
                // Restore selection if valid
                if (currentVal && [...floorSelect.options].some(o => o.value === currentVal)) {
                    floorSelect.value = currentVal;
                } else {
                    this.resetTableSelect(tableSelect);
                }
            });
        });

        // 3. Listen to Floor Change
        floorSelect.addEventListener('change', () => {
            const floorId = floorSelect.value;
            const branchId = branchSelect.value;
            
            tableSelect.innerHTML = '<option value="" disabled selected>Loading Tables...</option>';
            tableSelect.disabled = true;
            
            if (this.tablesUnsub) this.tablesUnsub();
            
            const q = query(
                collection(this.db, 'tables'), 
                where('floorId', '==', floorId), 
                where('branchId', '==', branchId)
            );
            
            this.tablesUnsub = onSnapshot(q, (snap) => {
                const currentVal = tableSelect.value;
                tableSelect.innerHTML = '<option value="" disabled selected>Select Table</option>';
                
                let hasTables = false;
                snap.forEach(doc => {
                    const data = doc.data();
                    // Optional: You could also filter out tables that are not "available" if your status system demands it.
                    if (data.status !== 'maintenance') {
                        hasTables = true;
                        // For display, use tableNumber if it exists, else name, else ID
                        const display = data.tableNumber ? `Table ${data.tableNumber}` : (data.name || `Table ${doc.id.slice(0, 4)}`);
                        tableSelect.innerHTML += `<option value="${doc.id}">${display}</option>`;
                    }
                });
                
                if (hasTables) {
                    tableSelect.disabled = false;
                } else {
                    tableSelect.innerHTML = '<option value="" disabled selected>No tables available</option>';
                }
                
                if (currentVal && [...tableSelect.options].some(o => o.value === currentVal)) {
                    tableSelect.value = currentVal;
                }
                
                if (onTableChange) onTableChange(tableSelect.value);
            });
        });
    }

    resetFloorSelect(floorSelect, tableSelect) {
        if (this.floorsUnsub) this.floorsUnsub();
        floorSelect.innerHTML = '<option value="" disabled selected>Select Floor</option>';
        floorSelect.disabled = true;
        this.resetTableSelect(tableSelect);
    }

    resetTableSelect(tableSelect) {
        if (this.tablesUnsub) this.tablesUnsub();
        tableSelect.innerHTML = '<option value="" disabled selected>Select Table</option>';
        tableSelect.disabled = true;
    }
    
    cleanup() {
        if (this.branchesUnsub) this.branchesUnsub();
        if (this.floorsUnsub) this.floorsUnsub();
        if (this.tablesUnsub) this.tablesUnsub();
    }
}
