// study/js/view.js - View cards functionality

class ViewCards {
    constructor() {
        this.dataManager = new StudyDataManager();
        this.selectedCategory = 'all';
        this.selectedState = 'all';
        this.searchQuery = '';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.render();
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render();
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.selectedCategory = e.target.value;
                this.render();
            });
        }

        // State filter
        const stateFilter = document.getElementById('state-filter');
        if (stateFilter) {
            stateFilter.addEventListener('change', (e) => {
                this.selectedState = e.target.value;
                this.render();
            });
        }

        // Bulk actions
        const resetAllBtn = document.getElementById('reset-all-btn');
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => this.resetAllCards());
        }

        const deleteAllBtn = document.getElementById('delete-all-btn');
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', () => this.deleteAllCards());
        }

        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCards());
        }

        // Import functionality
        const importInput = document.getElementById('import-input');
        if (importInput) {
            importInput.addEventListener('change', (e) => this.importCards(e));
        }
    }

    render() {
        this.populateFilters();
        this.renderCards();
        this.updateStats();
    }

    populateFilters() {
        const categories = this.dataManager.getCategories();
        const categoryFilter = document.getElementById('category-filter');
        
        if (categoryFilter) {
            const currentValue = categoryFilter.value;
            categoryFilter.innerHTML = '<option value="all">All Categories</option>';
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = this.capitalizeFirst(category);
                categoryFilter.appendChild(option);
            });
            
            categoryFilter.value = currentValue;
        }
    }

    renderCards() {
        const container = document.getElementById('cards-container');
        if (!container) return;

        let cards = this.getFilteredCards();
        
        container.innerHTML = '';

        if (cards.length === 0) {
            container.innerHTML = `
                <div class="no-cards">
                    <div class="no-cards-icon">📚</div>
                    <div class="no-cards-title">No cards found</div>
                    <div class="no-cards-message">
                        ${this.searchQuery || this.selectedCategory !== 'all' || this.selectedState !== 'all' 
                            ? 'Try adjusting your filters or search query.'
                            : 'Create your first card to get started!'}
                    </div>
                    <a href="createCard.html" class="no-cards-btn">Create Cards</a>
                </div>
            `;
            return;
        }

        // Group by category
        const groupedCards = this.groupCardsByCategory(cards);
        
        Object.entries(groupedCards).forEach(([category, categoryCards]) => {
            const categorySection = this.createCategorySection(category, categoryCards);
            container.appendChild(categorySection);
        });
    }

    getFilteredCards() {
        let cards = this.dataManager.getFlashcards();

        // Filter by category
        if (this.selectedCategory !== 'all') {
            cards = cards.filter(card => card.category === this.selectedCategory);
        }

        // Filter by state
        if (this.selectedState !== 'all') {
            cards = cards.filter(card => card.state === this.selectedState);
        }

        // Filter by search query
        if (this.searchQuery) {
            cards = cards.filter(card => 
                card.front.toLowerCase().includes(this.searchQuery) ||
                card.back.toLowerCase().includes(this.searchQuery) ||
                card.category.toLowerCase().includes(this.searchQuery)
            );
        }

        // Sort by creation date (newest first)
        cards.sort((a, b) => new Date(b.created) - new Date(a.created));

        return cards;
    }

    groupCardsByCategory(cards) {
        return cards.reduce((groups, card) => {
            const category = card.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(card);
            return groups;
        }, {});
    }

    createCategorySection(category, cards) {
        const section = document.createElement('div');
        section.className = 'category-section';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <h4 class="category-title">${this.capitalizeFirst(category)}</h4>
            <span class="category-count">${cards.length} card${cards.length !== 1 ? 's' : ''}</span>
        `;

        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'cards-grid';

        cards.forEach(card => {
            const cardElement = this.createCardElement(card);
            cardsGrid.appendChild(cardElement);
        });

        section.appendChild(header);
        section.appendChild(cardsGrid);
        return section;
    }

    createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.className = `card-item state-${card.state}`;
        cardEl.dataset.cardId = card.id;

        const stateLabel = this.getStateLabel(card.state);
        const stateColor = this.getStateColor(card.state);

        cardEl.innerHTML = `
            <div class="card-content">
                <div class="card-front">${this.escapeHtml(card.front)}</div>
                <div class="card-back">${this.escapeHtml(card.back)}</div>
            </div>
            <div class="card-meta">
                <span class="card-state" style="background: ${stateColor}">${stateLabel}</span>
                <span class="card-stats">${card.timesStudied || 0} studied</span>
            </div>
            <div class="card-actions">
                <button class="card-action-btn edit-btn" onclick="viewCards.editCard('${card.id}')" title="Edit">
                    ✏️
                </button>
                <button class="card-action-btn delete-btn" onclick="viewCards.deleteCard('${card.id}')" title="Delete">
                    🗑️
                </button>
                <button class="card-action-btn reset-btn" onclick="viewCards.resetCard('${card.id}')" title="Reset Progress">
                    🔄
                </button>
            </div>
        `;

        return cardEl;
    }

    getStateLabel(state) {
        const labels = {
            [StudyDataManager.CARD_STATES.NEW]: 'New',
            [StudyDataManager.CARD_STATES.STUDIED]: 'Studied',
            [StudyDataManager.CARD_STATES.LEARNING]: 'Learning',
            [StudyDataManager.CARD_STATES.LEARNED]: 'Learned',
            [StudyDataManager.CARD_STATES.MASTERED]: 'Mastered'
        };
        return labels[state] || 'Unknown';
    }

    getStateColor(state) {
        const colors = {
            [StudyDataManager.CARD_STATES.NEW]: '#6b7280',
            [StudyDataManager.CARD_STATES.STUDIED]: '#f59e0b',
            [StudyDataManager.CARD_STATES.LEARNING]: '#3b82f6',
            [StudyDataManager.CARD_STATES.LEARNED]: '#10b981',
            [StudyDataManager.CARD_STATES.MASTERED]: '#8b5cf6'
        };
        return colors[state] || '#6b7280';
    }

    editCard(cardId) {
        const card = this.dataManager.getFlashcards().find(c => c.id === cardId);
        if (!card) return;

        const newFront = prompt('Edit front text:', card.front);
        if (newFront === null) return;

        const newBack = prompt('Edit back text:', card.back);
        if (newBack === null) return;

        const newCategory = prompt('Edit category:', card.category);
        if (newCategory === null) return;

        if (newFront.trim() && newBack.trim() && newCategory.trim()) {
            this.dataManager.updateFlashcard(cardId, {
                front: newFront.trim(),
                back: newBack.trim(),
                category: newCategory.toLowerCase().trim()
            });
            this.render();
            this.showMessage('Card updated successfully!', 'success');
        }
    }

    deleteCard(cardId) {
        if (confirm('Are you sure you want to delete this card?')) {
            if (this.dataManager.deleteFlashcard(cardId)) {
                this.render();
                this.showMessage('Card deleted successfully!', 'success');
            } else {
                this.showMessage('Failed to delete card', 'error');
            }
        }
    }

    resetCard(cardId) {
        if (confirm('Reset this card\'s learning progress?')) {
            this.dataManager.updateCardState(cardId, false);
            this.dataManager.updateFlashcard(cardId, {
                state: StudyDataManager.CARD_STATES.NEW,
                timesStudied: 0,
                timesCorrect: 0,
                lastStudied: null
            });
            this.render();
            this.showMessage('Card progress reset!', 'success');
        }
    }

    resetAllCards() {
        if (confirm('Reset ALL cards\' learning progress? This cannot be undone.')) {
            this.dataManager.resetAllCards();
            this.render();
            this.showMessage('All cards reset successfully!', 'success');
        }
    }

    deleteAllCards() {
        if (confirm('Delete ALL cards? This cannot be undone.')) {
            const data = this.dataManager.getData();
            data.flashcards = [];
            this.dataManager.saveData(data);
            this.render();
            this.showMessage('All cards deleted!', 'success');
        }
    }

    exportCards() {
        const cards = this.dataManager.getFlashcards();
        const dataStr = JSON.stringify(cards, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `flashcards_${new Date().toISOString().slice(0, 10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showMessage('Cards exported successfully!', 'success');
    }

    importCards(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedCards = JSON.parse(e.target.result);
                
                if (!Array.isArray(importedCards)) {
                    throw new Error('Invalid file format');
                }

                let importCount = 0;
                importedCards.forEach(cardData => {
                    if (cardData.front && cardData.back && cardData.category) {
                        // Check for duplicates
                        const exists = this.dataManager.getFlashcards().find(card => 
                            card.front.toLowerCase() === cardData.front.toLowerCase() &&
                            card.category.toLowerCase() === cardData.category.toLowerCase()
                        );
                        
                        if (!exists) {
                            this.dataManager.addFlashcard(
                                cardData.front,
                                cardData.back,
                                cardData.category
                            );
                            importCount++;
                        }
                    }
                });

                this.render();
                this.showMessage(`Imported ${importCount} cards successfully!`, 'success');
            } catch (error) {
                this.showMessage('Error importing cards. Please check file format.', 'error');
            }
        };
        
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    updateStats() {
        const stats = this.dataManager.getStats();
        const filteredCards = this.getFilteredCards();

        // Update filtered count
        const filteredCountEl = document.getElementById('filtered-count');
        if (filteredCountEl) {
            filteredCountEl.textContent = filteredCards.length;
        }

        // Update total count
        const totalCountEl = document.getElementById('total-count');
        if (totalCountEl) {
            totalCountEl.textContent = stats.overall.total;
        }

        // Update progress
        const progressEl = document.getElementById('overall-progress');
        if (progressEl) {
            progressEl.textContent = `${stats.overall.progress}%`;
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

        // Insert at top of main content
        const wrap = document.querySelector('.wrap');
        if (wrap) {
            wrap.insertBefore(message, wrap.firstChild);
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
    }s
}

// Initialize when DOM is loaded
let viewCards;
document.addEventListener('DOMContentLoaded', () => {
    viewCards = new ViewCards();
});