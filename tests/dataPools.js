/* --------------------------------
   dataPools.js — Realistic Value Pools
   Arrays of real values for each module
----------------------------------*/
(function() {
    'use strict';

    const BODY_PARTS = [
        'Chest', 'Back', 'Biceps', 'Triceps', 'Shoulders', 'Legs', 'Lats', 'Forearms', 'Cardio'
    ];

    const EXERCISES_BY_PART = {
        'Chest':     ['Bench Press', 'Incline Bench Press', 'Dumbbell Fly', 'Cable Crossover', 'Push-Up', 'Decline Bench Press'],
        'Back':      ['Deadlift', 'Barbell Row', 'T-Bar Row', 'Seated Cable Row', 'Pull-Up'],
        'Biceps':    ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl'],
        'Triceps':   ['Tricep Pushdown', 'Skull Crusher', 'Overhead Extension', 'Close-Grip Bench Press', 'Dip'],
        'Shoulders': ['Overhead Press', 'Lateral Raise', 'Front Raise', 'Face Pull', 'Arnold Press'],
        'Legs':      ['Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Extension', 'Leg Curl', 'Calf Raise', 'Lunge'],
        'Lats':      ['Lat Pulldown', 'Wide-Grip Pull-Up', 'Straight-Arm Pulldown', 'Single-Arm Lat Pulldown'],
        'Forearms':  ['Wrist Curl', 'Reverse Wrist Curl', 'Farmer Walk', 'Plate Pinch'],
        'Cardio':    ['Treadmill Run', 'Cycling', 'Rowing Machine', 'Jump Rope', 'Elliptical']
    };

    // Realistic weight ranges by body part [min, max] in lbs
    const WEIGHT_RANGES = {
        'Chest':     [95, 225],
        'Back':      [135, 315],
        'Biceps':    [20, 50],
        'Triceps':   [30, 80],
        'Shoulders': [25, 135],
        'Legs':      [135, 405],
        'Lats':      [80, 180],
        'Forearms':  [15, 45],
        'Cardio':    [0, 0]
    };

    // Realistic rep ranges by body part [min, max]
    const REP_RANGES = {
        'Chest':     [5, 12],
        'Back':      [5, 10],
        'Biceps':    [8, 15],
        'Triceps':   [8, 15],
        'Shoulders': [8, 12],
        'Legs':      [5, 12],
        'Lats':      [8, 12],
        'Forearms':  [12, 20],
        'Cardio':    [15, 30]
    };

    const STORES = [
        'Walmart', 'Trader Joe\'s', 'Starbucks', 'Target', 'Amazon', 'Whole Foods',
        'Costco', 'Aldi', 'Kroger', 'Wegmans'
    ];

    const GROCERY_ITEMS = [
        { name: 'Bananas (bunch)', price: 0.69, subcategory: 'Produce' },
        { name: 'Roma Tomato', price: 0.82, subcategory: 'Produce' },
        { name: 'Avocados Bag (5-6 ct)', price: 2.97, subcategory: 'Produce' },
        { name: 'Baby Spinach (5 oz)', price: 2.48, subcategory: 'Produce' },
        { name: 'Red Bell Pepper', price: 1.28, subcategory: 'Produce' },
        { name: 'Broccoli Crown', price: 1.74, subcategory: 'Produce' },
        { name: 'Sweet Potatoes (3 lb)', price: 3.47, subcategory: 'Produce' },
        { name: 'Whole Milk (1 gal)', price: 3.66, subcategory: 'Dairy' },
        { name: 'Large Eggs (18 ct)', price: 4.98, subcategory: 'Dairy' },
        { name: 'Greek Yogurt (32 oz)', price: 5.47, subcategory: 'Dairy' },
        { name: 'Shredded Mozzarella (8 oz)', price: 2.24, subcategory: 'Dairy' },
        { name: 'Butter Unsalted (1 lb)', price: 3.98, subcategory: 'Dairy' },
        { name: 'Cheetos Crunchy (15 oz)', price: 5.94, subcategory: 'Snacks' },
        { name: 'Goldfish Crackers (30 oz)', price: 8.98, subcategory: 'Snacks' },
        { name: 'Mixed Nuts (26 oz)', price: 9.97, subcategory: 'Snacks' },
        { name: 'Protein Bars (12 ct)', price: 14.98, subcategory: 'Snacks' },
        { name: 'Tortilla Chips (13 oz)', price: 3.98, subcategory: 'Snacks' },
        { name: 'King\'s Hawaiian Rolls (24 ct)', price: 7.88, subcategory: 'Bakery' },
        { name: 'Whole Wheat Bread', price: 2.68, subcategory: 'Bakery' },
        { name: 'Bagels (6 ct)', price: 3.27, subcategory: 'Bakery' },
        { name: 'Hamburger Buns (8 ct)', price: 1.98, subcategory: 'Bakery' },
        { name: 'Rice (5 lb)', price: 4.62, subcategory: 'Pantry' },
        { name: 'Pasta Spaghetti (16 oz)', price: 1.18, subcategory: 'Pantry' },
        { name: 'Peanut Butter (16 oz)', price: 2.98, subcategory: 'Pantry' },
        { name: 'Olive Oil (17 oz)', price: 5.47, subcategory: 'Pantry' },
        { name: 'Canned Black Beans (15 oz)', price: 0.78, subcategory: 'Pantry' },
        { name: 'Chicken Broth (32 oz)', price: 1.68, subcategory: 'Pantry' },
        { name: 'Soy Sauce (15 oz)', price: 2.14, subcategory: 'Pantry' },
        { name: 'Chicken Breast (2 lb)', price: 6.94, subcategory: 'Meat' },
        { name: 'Ground Beef 80/20 (1 lb)', price: 5.48, subcategory: 'Meat' },
        { name: 'Salmon Fillet (1 lb)', price: 8.97, subcategory: 'Meat' },
        { name: 'Pork Chops (1.5 lb)', price: 5.96, subcategory: 'Meat' },
        { name: 'Turkey Deli Slices (8 oz)', price: 3.98, subcategory: 'Meat' },
        { name: 'Bacon (16 oz)', price: 6.47, subcategory: 'Meat' },
        { name: 'Orange Juice (52 oz)', price: 3.98, subcategory: 'Beverages' },
        { name: 'Spring Water (24-pack)', price: 3.98, subcategory: 'Beverages' },
        { name: 'Coffee Grounds (12 oz)', price: 7.98, subcategory: 'Beverages' },
        { name: 'Frozen Pizza', price: 4.88, subcategory: 'Frozen' },
        { name: 'Frozen Vegetables (12 oz)', price: 1.28, subcategory: 'Frozen' },
        { name: 'Ice Cream (1.5 qt)', price: 4.98, subcategory: 'Frozen' }
    ];

    const RECEIPT_CATEGORIES = ['Groceries', 'Cafe', 'Rental'];

    const CAFE_ITEMS = [
        { name: 'Iced Caramel Macchiato', price: 5.95 },
        { name: 'Caffe Latte', price: 4.95 },
        { name: 'Cold Brew', price: 4.45 },
        { name: 'Chai Tea Latte', price: 5.25 },
        { name: 'Mocha Frappuccino', price: 5.75 },
        { name: 'Croissant', price: 3.45 },
        { name: 'Blueberry Muffin', price: 3.25 },
        { name: 'Bagel with Cream Cheese', price: 4.15 }
    ];

    const FLASH_PAIRS = [
        { front: 'house', back: '집', category: 'noun' },
        { front: 'water', back: '물', category: 'noun' },
        { front: 'book', back: '책', category: 'noun' },
        { front: 'friend', back: '친구', category: 'noun' },
        { front: 'food', back: '음식', category: 'noun' },
        { front: 'school', back: '학교', category: 'noun' },
        { front: 'car', back: '차', category: 'noun' },
        { front: 'to eat', back: '먹다', category: 'verb' },
        { front: 'to go', back: '가다', category: 'verb' },
        { front: 'to see', back: '보다', category: 'verb' },
        { front: 'to sleep', back: '자다', category: 'verb' },
        { front: 'to study', back: '공부하다', category: 'verb' },
        { front: 'to work', back: '일하다', category: 'verb' },
        { front: 'to buy', back: '사다', category: 'verb' },
        { front: 'big', back: '크다', category: 'adj' },
        { front: 'small', back: '작다', category: 'adj' },
        { front: 'good', back: '좋다', category: 'adj' },
        { front: 'bad', back: '나쁘다', category: 'adj' },
        { front: 'fast', back: '빠르다', category: 'adj' },
        { front: 'hello', back: '안녕하세요', category: 'greeting' },
        { front: 'thank you', back: '감사합니다', category: 'greeting' },
        { front: 'goodbye', back: '안녕히 가세요', category: 'greeting' },
        { front: 'excuse me', back: '실례합니다', category: 'greeting' },
        { front: 'hospital', back: '병원', category: 'place' },
        { front: 'restaurant', back: '식당', category: 'place' }
    ];

    const CARD_STATES = ['new', 'studied', 'learning', 'learned', 'mastered'];

    const INGREDIENTS = [
        { name: 'Chicken Breast', caloriesPer100g: 165, protein: 31, carbs: 0, fat: 3.6, category: 'Meat' },
        { name: 'White Rice (cooked)', caloriesPer100g: 130, protein: 2.7, carbs: 28, fat: 0.3, category: 'Grain' },
        { name: 'Broccoli', caloriesPer100g: 34, protein: 2.8, carbs: 7, fat: 0.4, category: 'Vegetable' },
        { name: 'Banana', caloriesPer100g: 89, protein: 1.1, carbs: 23, fat: 0.3, category: 'Fruit' },
        { name: 'Egg (whole)', caloriesPer100g: 155, protein: 13, carbs: 1.1, fat: 11, category: 'Dairy' },
        { name: 'Salmon', caloriesPer100g: 208, protein: 20, carbs: 0, fat: 13, category: 'Meat' },
        { name: 'Sweet Potato', caloriesPer100g: 86, protein: 1.6, carbs: 20, fat: 0.1, category: 'Vegetable' },
        { name: 'Greek Yogurt', caloriesPer100g: 59, protein: 10, carbs: 3.6, fat: 0.7, category: 'Dairy' },
        { name: 'Oatmeal (cooked)', caloriesPer100g: 71, protein: 2.5, carbs: 12, fat: 1.5, category: 'Grain' },
        { name: 'Ground Beef', caloriesPer100g: 254, protein: 17, carbs: 0, fat: 20, category: 'Meat' },
        { name: 'Pasta (cooked)', caloriesPer100g: 131, protein: 5, carbs: 25, fat: 1.1, category: 'Grain' },
        { name: 'Avocado', caloriesPer100g: 160, protein: 2, carbs: 9, fat: 15, category: 'Fruit' },
        { name: 'Almonds', caloriesPer100g: 579, protein: 21, carbs: 22, fat: 50, category: 'Nut' },
        { name: 'Peanut Butter', caloriesPer100g: 588, protein: 25, carbs: 20, fat: 50, category: 'Nut' },
        { name: 'Whole Wheat Bread', caloriesPer100g: 247, protein: 13, carbs: 41, fat: 3.4, category: 'Grain' },
        { name: 'Milk (whole)', caloriesPer100g: 61, protein: 3.2, carbs: 4.8, fat: 3.3, category: 'Dairy' },
        { name: 'Spinach', caloriesPer100g: 23, protein: 2.9, carbs: 3.6, fat: 0.4, category: 'Vegetable' },
        { name: 'Olive Oil', caloriesPer100g: 884, protein: 0, carbs: 0, fat: 100, category: 'Fat' },
        { name: 'Cheese (cheddar)', caloriesPer100g: 403, protein: 25, carbs: 1.3, fat: 33, category: 'Dairy' },
        { name: 'Tofu', caloriesPer100g: 76, protein: 8, carbs: 1.9, fat: 4.8, category: 'Protein' }
    ];

    const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

    const TRIP_NAMES = [
        'Tokyo Adventure', 'European Tour', 'NYC Weekend', 'Beach Getaway',
        'Mountain Retreat', 'Seoul Food Tour', 'London Explorer', 'Island Hopping'
    ];

    const DEST_NAMES = [
        'Tokyo', 'Paris', 'London', 'Seoul', 'New York', 'Barcelona',
        'Rome', 'Sydney', 'Bangkok', 'Amsterdam', 'Prague', 'Lisbon',
        'Singapore', 'Reykjavik', 'Kyoto'
    ];

    const EVENT_TITLES = [
        'Gym Session', 'Study Korean 1hr', 'Meal Prep Sunday', 'Budget Review',
        'Dentist Appointment', 'Team Meeting', 'Grocery Run', 'Yoga Class',
        'Read 30 Pages', 'Practice Guitar', 'Clean Apartment', 'Call Mom',
        'Side Project Work', 'Laundry Day', 'Oil Change'
    ];

    const EVENT_CATEGORIES = ['general', 'workout', 'study', 'travel', 'reminder'];

    window.DataPools = {
        BODY_PARTS,
        EXERCISES_BY_PART,
        WEIGHT_RANGES,
        REP_RANGES,
        STORES,
        GROCERY_ITEMS,
        RECEIPT_CATEGORIES,
        CAFE_ITEMS,
        FLASH_PAIRS,
        CARD_STATES,
        INGREDIENTS,
        MEAL_NAMES,
        TRIP_NAMES,
        DEST_NAMES,
        EVENT_TITLES,
        EVENT_CATEGORIES
    };
})();
