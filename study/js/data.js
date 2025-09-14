// study/js/data.js - Data management for study section

class StudyDataManager {
    constructor() {
        this.STORAGE_KEY = 'levelupFlashData';
        this.initializeData();
    }

    // Card states
    static CARD_STATES = {
        NEW: 'new',
        STUDIED: 'studied',
        LEARNING: 'learning', 
        LEARNED: 'learned',
        MASTERED: 'mastered'
    };

    // Initialize data structure
    initializeData() {
        const existing = this.getData();
        if (!existing.flashcards) {
            this.saveData({
                flashcards: [],
                version: '2.0',
                lastUpdated: new Date().toISOString()
            });
        }
    }

    // Get all data from localStorage
    getData() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : { flashcards: [] };
        } catch (error) {
            console.error('Error reading study data:', error);
            return { flashcards: [] };
        }
    }

    // Save data to localStorage
    saveData(data) {
        try {
            data.lastUpdated = new Date().toISOString();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving study data:', error);
            return false;
        }
    }

    // Get all flashcards
    getFlashcards() {
        return this.getData().flashcards || [];
    }

    // Add a new flashcard
    addFlashcard(front, back, category) {
        const data = this.getData();
        const newCard = {
            id: this.generateId(),
            front: front.trim(),
            back: back.trim(),
            category: category.toLowerCase().trim(),
            state: StudyDataManager.CARD_STATES.NEW,
            timesStudied: 0,
            timesCorrect: 0,
            lastStudied: null,
            created: new Date().toISOString(),
            difficulty: 1 // 1-5 scale
        };

        data.flashcards.push(newCard);
        this.saveData(data);
        return newCard;
    }

    // Update card state after study session
    updateCardState(cardId, wasCorrect) {
        const data = this.getData();
        const card = data.flashcards.find(c => c.id === cardId);
        
        if (!card) return false;

        card.timesStudied++;
        card.lastStudied = new Date().toISOString();

        if (wasCorrect) {
            card.timesCorrect++;
            
            // State progression based on performance
            switch (card.state) {
                case StudyDataManager.CARD_STATES.NEW:
                    card.state = StudyDataManager.CARD_STATES.LEARNING;
                    break;
                case StudyDataManager.CARD_STATES.STUDIED:
                    card.state = StudyDataManager.CARD_STATES.LEARNING;
                    break;
                case StudyDataManager.CARD_STATES.LEARNING:
                    if (card.timesCorrect >= 3) {
                        card.state = StudyDataManager.CARD_STATES.LEARNED;
                    }
                    break;
                case StudyDataManager.CARD_STATES.LEARNED:
                    if (card.timesCorrect >= 5) {
                        card.state = StudyDataManager.CARD_STATES.MASTERED;
                    }
                    break;
            }
        } else {
            // Wrong answer - move back in progression
            switch (card.state) {
                case StudyDataManager.CARD_STATES.LEARNING:
                case StudyDataManager.CARD_STATES.LEARNED:
                case StudyDataManager.CARD_STATES.MASTERED:
                    card.state = StudyDataManager.CARD_STATES.STUDIED;
                    break;
                case StudyDataManager.CARD_STATES.NEW:
                    card.state = StudyDataManager.CARD_STATES.STUDIED;
                    break;
            }
        }

        this.saveData(data);
        return true;
    }

    // Get cards by category
    getCardsByCategory(category) {
        const cards = this.getFlashcards();
        if (category === 'all') return cards;
        return cards.filter(card => card.category === category);
    }

    // Get cards by state
    getCardsByState(state) {
        return this.getFlashcards().filter(card => card.state === state);
    }

    // Get cards for study session
    getStudyCards(category = 'all', maxCards = null, includeStates = null) {
        let cards = this.getCardsByCategory(category);

        // Filter by states if specified
        if (includeStates) {
            cards = cards.filter(card => includeStates.includes(card.state));
        }

        // Sort by priority (new cards first, then by last studied)
        cards.sort((a, b) => {
            const stateOrder = {
                [StudyDataManager.CARD_STATES.NEW]: 0,
                [StudyDataManager.CARD_STATES.STUDIED]: 1,
                [StudyDataManager.CARD_STATES.LEARNING]: 2,
                [StudyDataManager.CARD_STATES.LEARNED]: 3,
                [StudyDataManager.CARD_STATES.MASTERED]: 4
            };

            if (a.state !== b.state) {
                return stateOrder[a.state] - stateOrder[b.state];
            }

            // Same state - prioritize by last studied (oldest first)
            if (!a.lastStudied && !b.lastStudied) return 0;
            if (!a.lastStudied) return -1;
            if (!b.lastStudied) return 1;
            return new Date(a.lastStudied) - new Date(b.lastStudied);
        });

        // Limit cards if specified
        if (maxCards && cards.length > maxCards) {
            cards = cards.slice(0, maxCards);
        }

        return cards;
    }

    // Get all unique categories
    getCategories() {
        const cards = this.getFlashcards();
        const categories = [...new Set(cards.map(card => card.category))];
        return categories.sort();
    }

    // Get statistics
    getStats() {
        const cards = this.getFlashcards();
        const categories = this.getCategories();

        const overall = {
            total: cards.length,
            new: cards.filter(c => c.state === StudyDataManager.CARD_STATES.NEW).length,
            studied: cards.filter(c => c.state === StudyDataManager.CARD_STATES.STUDIED).length,
            learning: cards.filter(c => c.state === StudyDataManager.CARD_STATES.LEARNING).length,
            learned: cards.filter(c => c.state === StudyDataManager.CARD_STATES.LEARNED).length,
            mastered: cards.filter(c => c.state === StudyDataManager.CARD_STATES.MASTERED).length
        };

        const byCategory = categories.map(category => {
            const categoryCards = cards.filter(c => c.category === category);
            return {
                name: category,
                total: categoryCards.length,
                new: categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.NEW).length,
                studied: categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.STUDIED).length,
                learning: categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.LEARNING).length,
                learned: categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.LEARNED).length,
                mastered: categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.MASTERED).length,
                progress: categoryCards.length > 0 ? 
                    Math.round(((categoryCards.filter(c => c.state === StudyDataManager.CARD_STATES.LEARNED || c.state === StudyDataManager.CARD_STATES.MASTERED).length) / categoryCards.length) * 100) : 0
            };
        });

        overall.progress = overall.total > 0 ? 
            Math.round(((overall.learned + overall.mastered) / overall.total) * 100) : 0;

        return { overall, byCategory };
    }

    // Delete a flashcard
    deleteFlashcard(cardId) {
        const data = this.getData();
        const index = data.flashcards.findIndex(c => c.id === cardId);
        
        if (index === -1) return false;
        
        data.flashcards.splice(index, 1);
        this.saveData(data);
        return true;
    }

    // Update a flashcard
    updateFlashcard(cardId, updates) {
        const data = this.getData();
        const card = data.flashcards.find(c => c.id === cardId);
        
        if (!card) return false;
        
        Object.assign(card, updates);
        this.saveData(data);
        return true;
    }

    // Reset all card states
    resetAllCards() {
        const data = this.getData();
        data.flashcards.forEach(card => {
            card.state = StudyDataManager.CARD_STATES.NEW;
            card.timesStudied = 0;
            card.timesCorrect = 0;
            card.lastStudied = null;
        });
        this.saveData(data);
    }

    // Import sample data
    importSampleData() {
        const sampleCards = [
            { front: 'house', back: '집', category: 'noun' },
            { front: 'love', back: '사랑', category: 'noun' },
            { front: 'hello', back: '안녕하세요', category: 'greeting' },
            { front: 'goodbye', back: '안녕', category: 'greeting' },
            { front: 'school', back: '학교', category: 'place' },
            { front: 'mountain', back: '산', category: 'place' },
            { front: 'book', back: '책', category: 'object' },
            { front: 'pen', back: '펜', category: 'object' },
            { front: 'sleep', back: '잠', category: 'verb' },
            { front: 'study', back: '공부', category: 'verb' },
            { front: 'beautiful', back: '아름다운', category: 'adjective' },
            { front: 'big', back: '큰', category: 'adjective' },
            { front: 'small', back: '작은', category: 'adjective' },
            { front: 'good', back: '좋은', category: 'adjective' },
            { front: 'bad', back: '나쁜', category: 'adjective' }
        ];

        const data = this.getData();
        
        sampleCards.forEach(sample => {
            // Check if card already exists
            const exists = data.flashcards.find(card => 
                card.front.toLowerCase() === sample.front.toLowerCase() && 
                card.category === sample.category
            );
            
            if (!exists) {
                this.addFlashcard(sample.front, sample.back, sample.category);
            }
        });
    }

    // Generate unique ID
    generateId() {
        return 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Migrate old data format if needed
    migrateOldData() {
        const data = this.getData();
        let needsMigration = false;

        data.flashcards.forEach(card => {
            // Migrate old 'memorized' field to new state system
            if (card.hasOwnProperty('memorized') && !card.state) {
                if (card.memorized) {
                    card.state = StudyDataManager.CARD_STATES.LEARNED;
                } else {
                    card.state = StudyDataManager.CARD_STATES.NEW;
                }
                delete card.memorized;
                needsMigration = true;
            }

            // Add missing fields
            if (!card.id) {
                card.id = this.generateId();
                needsMigration = true;
            }
            if (!card.timesStudied) card.timesStudied = 0;
            if (!card.timesCorrect) card.timesCorrect = 0;
            if (!card.created) card.created = new Date().toISOString();
            if (!card.difficulty) card.difficulty = 1;
        });

        if (needsMigration) {
            this.saveData(data);
        }
    }
}

// Export for use in other files
window.StudyDataManager = StudyDataManager;