// study/js/home.js - Study home page functionality

class StudyHome {
    constructor() {
        this.dataManager = new StudyDataManager();
        this.selectedCount = 'all';
        this.init();
    }

    init() {
        // Migrate old data if needed
        this.dataManager.migrateOldData();
        
        // Render initial content
        this.render();
        
        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Count selector
        document.querySelectorAll('.count-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectCount(e.target.dataset.count);
            });
        });

        // Category cards
        document.addEventListener('click', (e) => {
            if (e.target.closest('.category-card')) {
                const categoryName = e.target.closest('.category-card').dataset.category;
                this.navigateToStudy(categoryName);
            }
        });

        // Study options
        document.querySelectorAll('.study-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const mode = e.currentTarget.dataset.mode;
                this.navigateToStudy('all', mode);
            });
        });
    }

    selectCount(count) {
        this.selectedCount = count;
        
        // Update UI
        document.querySelectorAll('.count-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.count === count);
        });
    }

    navigateToStudy(category, mode = 'learn') {
        const params = new URLSearchParams({
            category: category,
            mode: mode,
            count: this.selectedCount
        });
        
        window.location.href = `learn.html?${params.toString()}`;
    }

    render() {
        this.renderProgressOverview();
        this.renderCategories();
        this.renderStudyOptions();
    }

    renderProgressOverview() {
        const stats = this.dataManager.getStats();
        const { overall } = stats;

        // Update progress circle
        const progressCircle = document.querySelector('.circle-progress');
        if (progressCircle) {
            progressCircle.style.setProperty('--progress', overall.progress);
        }

        // Update progress text
        const progressValue = document.querySelector('.progress-value');
        const progressLabel = document.querySelector('.progress-label');
        if (progressValue) progressValue.textContent = `${overall.progress}%`;
        if (progressLabel) progressLabel.textContent = 'Mastered';

        // Update stats
        this.updateStatItem('total-cards', overall.total, 'Total Cards');
        this.updateStatItem('new-cards', overall.new, 'New');
        this.updateStatItem('learning-cards', overall.learning, 'Learning');
        this.updateStatItem('mastered-cards', overall.learned + overall.mastered, 'Mastered');
    }

    updateStatItem(id, value, label) {
        const container = document.getElementById(id);
        if (container) {
            const valueEl = container.querySelector('.stat-value');
            const labelEl = container.querySelector('.stat-label');
            if (valueEl) valueEl.textContent = value;
            if (labelEl) labelEl.textContent = label;
        }
    }

    renderCategories() {
        const stats = this.dataManager.getStats();
        const container = document.getElementById('category-grid');
        
        if (!container) return;

        container.innerHTML = '';

        stats.byCategory.forEach(category => {
            const card = this.createCategoryCard(category);
            container.appendChild(card);
        });
    }

    createCategoryCard(category) {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.dataset.category = category.name;

        const masteredCount = category.learned + category.mastered;
        
        card.innerHTML = `
            <div class="category-header">
                <div class="category-name">${this.capitalizeFirst(category.name)}</div>
                <div class="category-count">${masteredCount}/${category.total}</div>
            </div>
            <div class="category-progress">
                <div class="category-progress-bar" style="width: ${category.progress}%"></div>
            </div>
            <div class="category-stats">
                <span>Progress: ${category.progress}%</span>
                <span>${category.new} new</span>
            </div>
        `;

        return card;
    }

    renderStudyOptions() {
        const stats = this.dataManager.getStats();
        const { overall } = stats;

        // Update study option counts
        const learnOption = document.querySelector('[data-mode="learn"]');
        const reviewOption = document.querySelector('[data-mode="review"]');
        
        if (learnOption) {
            const desc = learnOption.querySelector('.study-desc');
            if (desc) {
                desc.textContent = `${overall.new + overall.studied} cards to learn`;
            }
        }

        if (reviewOption) {
            const desc = reviewOption.querySelector('.study-desc');
            if (desc) {
                desc.textContent = `${overall.learning + overall.learned} cards to review`;
            }
        }
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StudyHome();
});