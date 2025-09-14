// study/js/create.js - Create card functionality

class CreateCard {
    constructor() {
        this.dataManager = new StudyDataManager();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.populateCategoryDropdown();
        this.updateStats();
    }

    setupEventListeners() {
        // Form submission
        const form = document.getElementById('create-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createCard();
            });
        }

        // Add card button
        const addBtn = document.getElementById('add-card-btn');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.createCard();
            });
        }

        // Category input toggle
        const categoryToggle = document.getElementById('category-toggle');
        if (categoryToggle) {
            categoryToggle.addEventListener('change', () => {
                this.toggleCategoryInput();
            });
        }

        // Import sample data
        const importBtn = document.getElementById('import-sample-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.importSampleData();
            });
        }

        // Quick add buttons
        document.querySelectorAll('.quick-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.dataset.category;
                this.setCategory(category);
            });
        });

        // Enter key handling for inputs
        document.getElementById('front-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('back-input')?.focus();
            }
        });

        document.getElementById('back-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createCard();
            }
        });
    }

    createCard() {
        const frontInput = document.getElementById('front-input');
        const backInput = document.getElementById('back-input');
        const categoryDropdown = document.getElementById('category-dropdown');
        const categoryTextInput = document.getElementById('category-text-input');
        const categoryToggle = document.getElementById('category-toggle');

        if (!frontInput || !backInput) return;

        const front = frontInput.value.trim();
        const back = backInput.value.trim();
        
        let category;
        if (categoryToggle && categoryToggle.checked) {
            // Using text input for new category
            category = categoryTextInput?.value.trim() || '';
        } else {
            // Using dropdown
            category = categoryDropdown?.value || '';
        }

        // Validation
        if (!front || !back || !category) {
            this.showMessage('Please fill in all fields', 'error');
            return;
        }

        // Check for duplicates
        const existingCards = this.dataManager.getFlashcards();
        const duplicate = existingCards.find(card => 
            card.front.toLowerCase() === front.toLowerCase() && 
            card.category.toLowerCase() === category.toLowerCase()
        );

        if (duplicate) {
            this.showMessage('A card with this front text already exists in this category', 'error');
            return;
        }

        // Create the card
        const newCard = this.dataManager.addFlashcard(front, back, category);
        
        if (newCard) {
            this.showMessage('Card created successfully!', 'success');
            this.clearForm();
            this.updateStats();
            this.populateCategoryDropdown();
        } else {
            this.showMessage('Failed to create card', 'error');
        }
    }

    toggleCategoryInput() {
        const toggle = document.getElementById('category-toggle');
        const dropdown = document.getElementById('category-dropdown');
        const textInput = document.getElementById('category-text-input');
        const label = document.querySelector('.category-toggle-label');

        if (!toggle || !dropdown || !textInput) return;

        if (toggle.checked) {
            // Show text input, hide dropdown
            dropdown.style.display = 'none';
            textInput.style.display = 'block';
            textInput.placeholder = 'Enter new category...';
            if (label) label.textContent = 'New Category';
        } else {
            // Show dropdown, hide text input
            dropdown.style.display = 'block';
            textInput.style.display = 'none';
            if (label) label.textContent = 'Existing Category';
        }
    }

    populateCategoryDropdown() {
        const dropdown = document.getElementById('category-dropdown');
        if (!dropdown) return;

        const categories = this.dataManager.getCategories();
        
        dropdown.innerHTML = '<option value="">Select category...</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = this.capitalizeFirst(category);
            dropdown.appendChild(option);
        });
    }

    setCategory(category) {
        const categoryDropdown = document.getElementById('category-dropdown');
        const categoryToggle = document.getElementById('category-toggle');
        
        if (categoryDropdown && categoryToggle) {
            categoryToggle.checked = false;
            this.toggleCategoryInput();
            categoryDropdown.value = category;
        }
    }

    clearForm() {
        const inputs = ['front-input', 'back-input', 'category-text-input'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        const dropdown = document.getElementById('category-dropdown');
        if (dropdown) dropdown.value = '';

        // Focus back on front input
        const frontInput = document.getElementById('front-input');
        if (frontInput) frontInput.focus();
    }

    updateStats() {
        const stats = this.dataManager.getStats();
        
        // Update total cards count
        const totalEl = document.getElementById('total-cards-stat');
        if (totalEl) {
            totalEl.textContent = stats.overall.total;
        }

        // Update categories count
        const categoriesEl = document.getElementById('categories-stat');
        if (categoriesEl) {
            categoriesEl.textContent = stats.byCategory.length;
        }

        // Update recent cards list
        this.updateRecentCards();
    }

    updateRecentCards() {
        const container = document.getElementById('recent-cards');
        if (!container) return;

        const allCards = this.dataManager.getFlashcards();
        const recentCards = allCards
            .sort((a, b) => new Date(b.created) - new Date(a.created))
            .slice(0, 5);

        container.innerHTML = '';

        if (recentCards.length === 0) {
            container.innerHTML = '<p class="no-cards">No cards created yet</p>';
            return;
        }

        recentCards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'recent-card';
            cardEl.innerHTML = `
                <div class="recent-card-content">
                    <div class="recent-card-text">
                        <strong>${this.escapeHtml(card.front)}</strong> → ${this.escapeHtml(card.back)}
                    </div>
                    <div class="recent-card-meta">
                        ${this.capitalizeFirst(card.category)} • ${this.formatDate(card.created)}
                    </div>
                </div>
                <button class="recent-card-delete" onclick="createCard.deleteCard('${card.id}')" title="Delete card">
                    🗑️
                </button>
            `;
            container.appendChild(cardEl);
        });
    }

    deleteCard(cardId) {
        if (confirm('Are you sure you want to delete this card?')) {
            if (this.dataManager.deleteFlashcard(cardId)) {
                this.showMessage('Card deleted successfully', 'success');
                this.updateStats();
                this.populateCategoryDropdown();
            } else {
                this.showMessage('Failed to delete card', 'error');
            }
        }
    }

    importSampleData() {
        if (confirm('This will add sample Korean vocabulary cards. Continue?')) {
            this.dataManager.importSampleData();
            this.showMessage('Sample data imported successfully!', 'success');
            this.updateStats();
            this.populateCategoryDropdown();
        }
    }

    showMessage(text, type = 'info') {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // Create new message
        const message = document.createElement('div');
        message.className = `message message-${type}`;
        message.textContent = text;

        // Insert at top of form
        const form = document.getElementById('create-form');
        if (form) {
            form.insertBefore(message, form.firstChild);
        }

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 3000);
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) return 'Today';
        if (diffDays === 2) return 'Yesterday';
        if (diffDays <= 7) return `${diffDays - 1} days ago`;
        
        return date.toLocaleDateString();
    }
}

// Initialize when DOM is loaded
let createCard;
document.addEventListener('DOMContentLoaded', () => {
    createCard = new CreateCard();
});