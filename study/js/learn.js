// study/js/learn.js - Study session functionality

class StudySession {
    constructor() {
        this.dataManager = new StudyDataManager();
        this.currentCardIndex = 0;
        this.studyCards = [];
        this.sessionStats = {
            correct: 0,
            incorrect: 0,
            total: 0
        };
        this.isFlipped = false;
        this.isKoreanFirst = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isSwiping = false;

        this.init();
    }

    init() {
        // Get session parameters
        this.parseUrlParams();
        
        // Setup study cards
        this.setupStudySession();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Start session
        this.startSession();
    }

    parseUrlParams() {
        const params = new URLSearchParams(window.location.search);
        this.category = params.get('category') || 'all';
        this.mode = params.get('mode') || 'learn';
        this.maxCards = params.get('count') === 'all' ? null : parseInt(params.get('count'));
    }

    setupStudySession() {
        // Determine which cards to include based on mode
        let includeStates = null;
        
        switch (this.mode) {
            case 'learn':
                includeStates = [
                    StudyDataManager.CARD_STATES.NEW,
                    StudyDataManager.CARD_STATES.STUDIED,
                    StudyDataManager.CARD_STATES.LEARNING
                ];
                break;
            case 'review':
                includeStates = [
                    StudyDataManager.CARD_STATES.LEARNING,
                    StudyDataManager.CARD_STATES.LEARNED
                ];
                break;
            case 'test':
                includeStates = null; // Include all states
                break;
        }

        this.studyCards = this.dataManager.getStudyCards(
            this.category, 
            this.maxCards, 
            includeStates
        );

        this.sessionStats.total = this.studyCards.length;
    }

    setupEventListeners() {
        // Card tap/click to flip
        const flashcard = document.getElementById('flashcard');
        if (flashcard) {
            flashcard.addEventListener('click', () => this.flipCard());
        }

        // Desktop buttons
        const incorrectBtn = document.getElementById('incorrect-btn');
        const correctBtn = document.getElementById('correct-btn');
        
        if (incorrectBtn) {
            incorrectBtn.addEventListener('click', () => this.answerCard(false));
        }
        if (correctBtn) {
            correctBtn.addEventListener('click', () => this.answerCard(true));
        }

        // Language toggle
        const langToggle = document.getElementById('language-toggle');
        if (langToggle) {
            langToggle.addEventListener('click', () => this.toggleLanguage());
        }

        // TTS button
        const ttsBtn = document.getElementById('tts-btn');
        if (ttsBtn) {
            ttsBtn.addEventListener('click', () => this.speakCard());
        }

        // Touch events for mobile swiping
        if (flashcard) {
            flashcard.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            flashcard.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            flashcard.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }

    handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isSwiping = false;
    }

    handleTouchMove(e) {
        if (e.touches.length !== 1) return;
        
        const deltaX = Math.abs(e.touches[0].clientX - this.touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - this.touchStartY);
        
        if (deltaX > deltaY && deltaX > 10) {
            this.isSwiping = true;
            e.preventDefault(); // Prevent scrolling
        }
    }

    handleTouchEnd(e) {
        if (e.changedTouches.length !== 1) return;
        
        const deltaX = e.changedTouches[0].clientX - this.touchStartX;
        const deltaY = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
        
        if (this.isSwiping && Math.abs(deltaX) > 50 && deltaY < 100) {
            // Swipe detected
            if (deltaX > 0) {
                this.answerCard(true); // Swipe right = correct
            } else {
                this.answerCard(false); // Swipe left = incorrect
            }
        } else if (!this.isSwiping && Math.abs(deltaX) < 10 && deltaY < 10) {
            // Tap detected
            this.flipCard();
        }
        
        this.isSwiping = false;
    }

    handleKeyPress(e) {
        switch (e.key) {
            case ' ':
            case 'Enter':
                e.preventDefault();
                this.flipCard();
                break;
            case 'ArrowLeft':
            case '1':
                e.preventDefault();
                this.answerCard(false);
                break;
            case 'ArrowRight':
            case '2':
                e.preventDefault();
                this.answerCard(true);
                break;
            case 'l':
            case 'L':
                e.preventDefault();
                this.toggleLanguage();
                break;
            case 's':
            case 'S':
                e.preventDefault();
                this.speakCard();
                break;
        }
    }

    startSession() {
        if (this.studyCards.length === 0) {
            this.showNoCards();
            return;
        }

        this.currentCardIndex = 0;
        this.showCard();
        this.updateProgress();
    }

    showCard() {
        if (this.currentCardIndex >= this.studyCards.length) {
            this.completeSession();
            return;
        }

        const card = this.studyCards[this.currentCardIndex];
        const flashcard = document.getElementById('flashcard');
        const cardFront = document.getElementById('card-front');
        const cardBack = document.getElementById('card-back');

        if (!flashcard || !cardFront || !cardBack) return;

        // Reset card state
        flashcard.classList.remove('flipped', 'slide-left', 'slide-right');
        this.isFlipped = false;

        // Set content based on language preference
        if (this.isKoreanFirst) {
            cardFront.textContent = card.back;
            cardBack.textContent = card.front;
        } else {
            cardFront.textContent = card.front;
            cardBack.textContent = card.back;
        }

        // Add animation for new card
        setTimeout(() => {
            flashcard.classList.add('new-card');
        }, 100);

        this.updateProgress();
    }

    flipCard() {
        const flashcard = document.getElementById('flashcard');
        if (!flashcard) return;

        this.isFlipped = !this.isFlipped;
        flashcard.classList.toggle('flipped', this.isFlipped);
    }

    answerCard(isCorrect) {
        const currentCard = this.studyCards[this.currentCardIndex];
        const flashcard = document.getElementById('flashcard');

        // Update card state in data
        this.dataManager.updateCardState(currentCard.id, isCorrect);

        // Update session stats
        if (isCorrect) {
            this.sessionStats.correct++;
        } else {
            this.sessionStats.incorrect++;
        }

        // Animate card out
        if (flashcard) {
            const slideClass = isCorrect ? 'slide-right' : 'slide-left';
            flashcard.classList.add(slideClass);
        }

        // Move to next card after animation
        setTimeout(() => {
            this.currentCardIndex++;
            this.showCard();
        }, 500);
    }

    toggleLanguage() {
        this.isKoreanFirst = !this.isKoreanFirst;
        const toggle = document.getElementById('language-toggle');
        
        if (toggle) {
            toggle.textContent = this.isKoreanFirst ? '한국어' : 'English';
            toggle.classList.toggle('korean', this.isKoreanFirst);
        }

        // Refresh current card with new language order
        if (this.currentCardIndex < this.studyCards.length) {
            const card = this.studyCards[this.currentCardIndex];
            const cardFront = document.getElementById('card-front');
            const cardBack = document.getElementById('card-back');

            if (cardFront && cardBack) {
                if (this.isKoreanFirst) {
                    cardFront.textContent = card.back;
                    cardBack.textContent = card.front;
                } else {
                    cardFront.textContent = card.front;
                    cardBack.textContent = card.back;
                }
            }
        }
    }

    speakCard() {
        if (this.currentCardIndex >= this.studyCards.length) return;

        const card = this.studyCards[this.currentCardIndex];
        let textToSpeak, language;

        if (this.isFlipped) {
            // Speaking the back side
            textToSpeak = this.isKoreanFirst ? card.front : card.back;
            language = this.isKoreanFirst ? 'en-US' : 'ko-KR';
        } else {
            // Speaking the front side
            textToSpeak = this.isKoreanFirst ? card.back : card.front;
            language = this.isKoreanFirst ? 'ko-KR' : 'en-US';
        }

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = language;
            utterance.rate = 0.8;
            speechSynthesis.speak(utterance);
        }
    }

    updateProgress() {
        const progressEl = document.getElementById('session-progress');
        if (progressEl) {
            progressEl.textContent = `${this.currentCardIndex + 1} / ${this.studyCards.length}`;
        }
    }

    showNoCards() {
        const container = document.querySelector('.study-container');
        if (container) {
            container.innerHTML = `
                <div class="session-complete">
                    <div class="complete-icon">📚</div>
                    <div class="complete-title">No Cards Found</div>
                    <div class="complete-message">
                        There are no cards to study in this category and mode.
                    </div>
                    <div class="complete-actions">
                        <a href="studyHome.html" class="complete-btn primary">Back to Study Hub</a>
                        <a href="createCard.html" class="complete-btn secondary">Create Cards</a>
                    </div>
                </div>
            `;
        }
    }

    completeSession() {
        const accuracy = this.sessionStats.total > 0 ? 
            Math.round((this.sessionStats.correct / this.sessionStats.total) * 100) : 0;

        const container = document.querySelector('.study-container');
        if (container) {
            container.innerHTML = `
                <div class="session-complete">
                    <div class="complete-icon">🎉</div>
                    <div class="complete-title">Session Complete!</div>
                    <div class="complete-message">
                        Great job! You've finished studying ${this.sessionStats.total} cards.
                    </div>
                    <div class="complete-stats">
                        <div class="complete-stat">
                            <div class="complete-stat-value">${this.sessionStats.correct}</div>
                            <div class="complete-stat-label">Correct</div>
                        </div>
                        <div class="complete-stat">
                            <div class="complete-stat-value">${this.sessionStats.incorrect}</div>
                            <div class="complete-stat-label">Incorrect</div>
                        </div>
                        <div class="complete-stat">
                            <div class="complete-stat-value">${accuracy}%</div>
                            <div class="complete-stat-label">Accuracy</div>
                        </div>
                    </div>
                    <div class="complete-actions">
                        <a href="studyHome.html" class="complete-btn primary">Study Hub</a>
                        <button class="complete-btn secondary" onclick="location.reload()">Study Again</button>
                        <a href="createCard.html" class="complete-btn secondary">Add Cards</a>
                    </div>
                </div>
            `;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StudySession();
});