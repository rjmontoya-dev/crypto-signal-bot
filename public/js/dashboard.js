function dashboard() {
  return {
    activeTab: 'signals',
    signals: [],
    stats: {
      overview: {},
      tokenStats: [],
      directionStats: { long: {}, short: {} },
      topRules: []
    },
    config: {},
    logs: [],
    cronEnabled: true,
    filters: {
      outcome: 'all',
      status: '',
      symbol: '',
      sort: 'created_at',
      order: 'DESC'
    },
    pagination: {
      currentPage: 1,
      pageSize: 10,
      totalRecords: 0,
      totalPages: 0
    },
    scanning: false,
    showModal: false,
    selectedSignal: null,
    showCloseModal: false,
    tradeToClose: null,
    closeForm: {
      outcome: '',
      pnlPercent: ''
    },
    toast: {
      show: false,
      message: '',
      type: 'info'
    },

    async init() {
      await this.refreshData();
      await this.fetchCronStatus();
      // Auto-refresh every 30 seconds
      setInterval(() => this.refreshData(), 30000);
    },

    async refreshData() {
      await Promise.all([
        this.fetchSignals(),
        this.fetchStats(),
        this.fetchConfig(),
        this.fetchCronStatus()
      ]);
    },

    async fetchSignals() {
      try {
        const params = new URLSearchParams({
          ...this.filters,
          page: this.pagination.currentPage,
          pageSize: this.pagination.pageSize
        });
        const response = await fetch(`/api/signals?${params}`);
        const data = await response.json();
        
        if (data.success) {
          this.signals = data.data;
          if (data.pagination) {
            this.pagination = { ...this.pagination, ...data.pagination };
          }
        }
      } catch (error) {
        console.error('Error fetching signals:', error);
        this.showToast('Failed to fetch signals', 'error');
      }
    },

    async fetchStats() {
      try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        if (data.success) {
          this.stats = data.data;
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    },

    async fetchConfig() {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.success) {
          this.config = data.data;
        }
      } catch (error) {
        console.error('Error fetching config:', error);
      }
    },

    async fetchLogs() {
      try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        
        if (data.success) {
          this.logs = data.data;
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
        this.showToast('Failed to fetch logs', 'error');
      }
    },

    async triggerScan() {
      if (this.scanning) return;
      
      this.scanning = true;
      try {
        const response = await fetch('/api/scan', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          this.showToast('Manual scan triggered! Check logs for progress.', 'success');
          // Refresh signals after 5 seconds
          setTimeout(() => this.refreshData(), 5000);
        } else {
          this.showToast('Failed to trigger scan: ' + data.error, 'error');
        }
      } catch (error) {
        console.error('Error triggering scan:', error);
        this.showToast('Failed to trigger scan', 'error');
      } finally {
        this.scanning = false;
      }
    },

    async fetchCronStatus() {
      try {
        const response = await fetch('/api/cron-status');
        const data = await response.json();
        
        if (data.success) {
          this.cronEnabled = data.enabled;
        }
      } catch (error) {
        console.error('Error fetching cron status:', error);
      }
    },

    async toggleCron() {
      try {
        const newState = !this.cronEnabled;
        const response = await fetch('/api/cron-toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newState })
        });
        const data = await response.json();
        
        if (data.success) {
          this.cronEnabled = data.enabled;
          this.showToast(data.message, 'success');
        } else {
          this.showToast('Failed to toggle cron: ' + data.error, 'error');
        }
      } catch (error) {
        console.error('Error toggling cron:', error);
        this.showToast('Failed to toggle automated scans', 'error');
      }
    },

    async resetLock() {
      try {
        const response = await fetch('/api/reset-lock', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          this.showToast(data.message, 'success');
        } else {
          this.showToast('Failed to reset lock: ' + data.error, 'error');
        }
      } catch (error) {
        console.error('Error resetting lock:', error);
        this.showToast('Failed to reset lock', 'error');
      }
    },

    viewDetails(signal) {
      this.selectedSignal = signal;
      this.showModal = true;
    },

    openCloseTrade(signal) {
      this.tradeToClose = signal;
      this.closeForm = {
        outcome: '',
        pnlPercent: ''
      };
      this.showCloseModal = true;
    },

    updatePnlRequirement() {
      // Reset PnL when switching to skip
      if (this.closeForm.outcome === 'skip') {
        this.closeForm.pnlPercent = '0';
      } else if (this.closeForm.pnlPercent === '0') {
        this.closeForm.pnlPercent = '';
      }
    },

    async submitCloseTrade() {
      // Validate outcome is selected
      if (!this.closeForm.outcome) {
        this.showToast('Please select an outcome', 'error');
        return;
      }
      
      // Validate PnL is provided for win/loss
      if (this.closeForm.outcome !== 'skip' && this.closeForm.pnlPercent === '') {
        this.showToast('Please enter PnL percentage', 'error');
        return;
      }

      try {
        const response = await fetch('/api/close-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signalId: this.tradeToClose.id,
            outcome: this.closeForm.outcome,
            pnlPercent: parseFloat(this.closeForm.pnlPercent)
          })
        });

        const data = await response.json();

        if (data.success) {
          this.showToast(data.message, 'success');
          this.showCloseModal = false;
          this.tradeToClose = null;
          // Refresh data to show updated trade
          await this.refreshData();
        } else {
          this.showToast('Failed to close trade: ' + data.message, 'error');
        }
      } catch (error) {
        console.error('Error closing trade:', error);
        this.showToast('Failed to close trade', 'error');
      }
    },

    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleString();
    },

    get paginatedSignals() {
      return this.signals;
    },

    get pageNumbers() {
      const pages = [];
      const current = this.pagination.currentPage;
      const total = this.pagination.totalPages;
      
      // Always show first page
      if (total > 0) pages.push(1);
      
      // Calculate range around current page
      let start = Math.max(2, current - 1);
      let end = Math.min(total - 1, current + 1);
      
      // Add ellipsis after first page if needed
      if (start > 2) pages.push('...');
      
      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      // Add ellipsis before last page if needed
      if (end < total - 1) pages.push('...');
      
      // Always show last page if more than 1 page
      if (total > 1) pages.push(total);
      
      return pages;
    },

    goToPage(page) {
      if (page === '...' || page < 1 || page > this.pagination.totalPages) return;
      this.pagination.currentPage = page;
      this.fetchSignals();
    },

    previousPage() {
      if (this.pagination.currentPage > 1) {
        this.pagination.currentPage--;
        this.fetchSignals();
      }
    },

    nextPage() {
      if (this.pagination.currentPage < this.pagination.totalPages) {
        this.pagination.currentPage++;
        this.fetchSignals();
      }
    },

    changePageSize() {
      this.pagination.currentPage = 1;
      this.fetchSignals();
    },

    showToast(message, type = 'info') {
      this.toast = { show: true, message, type };
      setTimeout(() => {
        this.toast.show = false;
      }, 3000);
    }
  };
}
