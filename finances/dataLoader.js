/**
 * dataLoader.js - Automatic Receipt Data Loader
 * Loads hardcoded receipts from receiptsData.json into localStorage on first visit
 * 
 * Usage: Just add this script tag to the <head> of your HTML files:
 * <script src="dataLoader.js"></script>
 */

(function() {
  'use strict';
  
  const STORAGE_KEYS = {
    RECEIPTS: 'finances:receipts',
    DATA_LOADED: 'finances:dataLoaded',
    DATA_VERSION: 'finances:dataVersion'
  };
  
  const CURRENT_VERSION = '1.0';
  
  /**
   * Check if hardcoded data has already been loaded
   */
  function isDataLoaded() {
    const loaded = localStorage.getItem(STORAGE_KEYS.DATA_LOADED);
    const version = localStorage.getItem(STORAGE_KEYS.DATA_VERSION);
    return loaded === 'true' && version === CURRENT_VERSION;
  }
  
  /**
   * Load receipts from JSON file and save to localStorage
   */
  async function loadHardcodedData() {
    try {
      console.log('🔄 Loading hardcoded receipt data...');
      
      const response = await fetch('receiptsData.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.receipts || !Array.isArray(data.receipts)) {
        throw new Error('Invalid receiptsData.json format');
      }
      
      // Save receipts to localStorage
      localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(data.receipts));
      
      // Mark as loaded
      localStorage.setItem(STORAGE_KEYS.DATA_LOADED, 'true');
      localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_VERSION);
      
      console.log(`✅ Loaded ${data.receipts.length} receipts from hardcoded data`);
      console.log(`📊 Total: $${data.metadata.totalSpent.toFixed(2)} | Items: ${data.metadata.totalItems}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error loading hardcoded data:', error);
      return false;
    }
  }
  
  /**
   * Initialize data loading on page load
   */
  function initialize() {
    // Only run in browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    // Check if data already loaded
    if (isDataLoaded()) {
      console.log('✅ Hardcoded receipt data already loaded');
      return;
    }
    
    // Load data automatically
    loadHardcodedData();
  }
  
  /**
   * Merge new hardcoded data with existing receipts
   * (useful for adding more receipts without deleting user-entered ones)
   */
  async function mergeHardcodedData() {
    try {
      console.log('🔄 Merging hardcoded data with existing receipts...');
      
      const response = await fetch('receiptsData.json');
      const data = await response.json();
      
      // Get existing receipts
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
      
      // Create set of existing receipt IDs
      const existingIds = new Set(existing.map(r => r.id));
      
      // Add only new receipts
      let added = 0;
      data.receipts.forEach(receipt => {
        if (!existingIds.has(receipt.id)) {
          existing.push(receipt);
          added++;
        }
      });
      
      // Save merged receipts
      localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(existing));
      
      console.log(`✅ Merged data: ${added} new receipts added, ${existing.length} total`);
      return true;
    } catch (error) {
      console.error('❌ Error merging data:', error);
      return false;
    }
  }
  
  /**
   * Force reload hardcoded data (clears existing and reloads)
   * WARNING: This will delete all user-entered receipts!
   */
  async function forceReloadHardcodedData() {
    const confirmed = confirm(
      '⚠️ WARNING: This will DELETE all existing receipts and reload from hardcoded data.\n\n' +
      'Are you sure you want to continue?'
    );
    
    if (!confirmed) {
      console.log('❌ Force reload cancelled');
      return false;
    }
    
    // Clear data loaded flag
    localStorage.removeItem(STORAGE_KEYS.DATA_LOADED);
    localStorage.removeItem(STORAGE_KEYS.DATA_VERSION);
    localStorage.removeItem(STORAGE_KEYS.RECEIPTS);
    
    // Reload data
    const success = await loadHardcodedData();
    
    if (success) {
      console.log('✅ Data force reloaded successfully');
      // Reload page to show new data
      window.location.reload();
    }
    
    return success;
  }
  
  /**
   * Get all receipts from localStorage
   */
  function getReceipts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
    } catch (e) {
      console.error('Error loading receipts:', e);
      return [];
    }
  }
  
  /**
   * Get receipt statistics
   */
  function getReceiptStats() {
    const receipts = getReceipts();
    
    const stats = {
      totalReceipts: receipts.length,
      totalItems: receipts.reduce((sum, r) => sum + r.items.length, 0),
      totalSpent: receipts.reduce((sum, r) => sum + parseFloat(r.total || 0), 0),
      stores: [...new Set(receipts.map(r => r.store))],
      dateRange: {
        earliest: receipts.length > 0 ? receipts.reduce((min, r) => r.date < min ? r.date : min, receipts[0].date) : null,
        latest: receipts.length > 0 ? receipts.reduce((max, r) => r.date > max ? r.date : max, receipts[0].date) : null
      }
    };
    
    return stats;
  }
  
  /**
   * Console helper to check data status
   */
  function printDataStatus() {
    const loaded = isDataLoaded();
    const stats = getReceiptStats();
    
    console.log('=====================================');
    console.log('📊 FINANCES DATA STATUS');
    console.log('=====================================');
    console.log('Data Loaded:', loaded ? '✅ Yes' : '❌ No');
    console.log('Version:', localStorage.getItem(STORAGE_KEYS.DATA_VERSION) || 'None');
    console.log('Total Receipts:', stats.totalReceipts);
    console.log('Total Items:', stats.totalItems);
    console.log('Total Spent:', `$${stats.totalSpent.toFixed(2)}`);
    console.log('Stores:', stats.stores.join(', '));
    console.log('Date Range:', `${stats.dateRange.earliest || 'N/A'} to ${stats.dateRange.latest || 'N/A'}`);
    console.log('=====================================');
    console.log('🛠️ AVAILABLE COMMANDS:');
    console.log('printDataStatus() - Show this status');
    console.log('getReceipts() - Get all receipts');
    console.log('getReceiptStats() - Get statistics');
    console.log('mergeHardcodedData() - Add new receipts without deleting existing');
    console.log('forceReloadHardcodedData() - Clear & reload (WARNING: deletes all receipts)');
    console.log('=====================================');
  }
  
  // Export functions to window for console access
  window.initializeHardcodedData = loadHardcodedData;
  window.mergeHardcodedData = mergeHardcodedData;
  window.forceReloadHardcodedData = forceReloadHardcodedData;
  window.getReceipts = getReceipts;
  window.getReceiptStats = getReceiptStats;
  window.printDataStatus = printDataStatus;
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();