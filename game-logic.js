// Game Logic Module - Testable functions for Just Shapes and Kiro
// This module exports pure functions that can be tested independently

// Endless Mode configuration
export const ENDLESS_CONFIG = {
    // Base difficulty
    baseScrollSpeed: 4,
    baseMinGap: 150,
    baseMaxCluster: 3,
    
    // Scaling
    speedIncrementPer30s: 0.5,
    gapDecrementPer30s: 10,
    clusterIncrementPer60s: 1,
    
    // Caps
    maxScrollSpeed: 8,
    minGap: 80,
    maxClusterSize: 6,
    
    // Generation
    generateAheadDistance: 1000,
    cleanupBehindDistance: 500,
    
    // UI
    difficultyIndicatorDuration: 2
};

// Local storage key for high score
export const ENDLESS_HIGH_SCORE_KEY = 'kiro_endless_high_score';

/**
 * Calculates difficulty parameters based on survival time
 * @param {number} survivalTime - Time survived in seconds
 * @returns {Object} Current difficulty parameters
 */
export function calculateDifficulty(survivalTime) {
    // Handle invalid input
    if (survivalTime < 0 || isNaN(survivalTime) || survivalTime === undefined) {
        survivalTime = 0;
    }
    
    const level = Math.floor(survivalTime / 30) + 1;
    
    // Calculate scroll speed: base + (level-1) * increment, capped at max
    const scrollSpeed = Math.min(
        ENDLESS_CONFIG.baseScrollSpeed + (level - 1) * ENDLESS_CONFIG.speedIncrementPer30s,
        ENDLESS_CONFIG.maxScrollSpeed
    );
    
    // Calculate min gap: base - (level-1) * decrement, floored at min
    const minGap = Math.max(
        ENDLESS_CONFIG.baseMinGap - (level - 1) * ENDLESS_CONFIG.gapDecrementPer30s,
        ENDLESS_CONFIG.minGap
    );
    
    // Calculate max cluster size: base + floor(time/60), capped at max
    const maxClusterSize = Math.min(
        ENDLESS_CONFIG.baseMaxCluster + Math.floor(survivalTime / 60),
        ENDLESS_CONFIG.maxClusterSize
    );
    
    return {
        scrollSpeed,
        minGap,
        maxClusterSize,
        level
    };
}

/**
 * Generates obstacles ahead of the player position
 * @param {number} playerX - Current player X position
 * @param {number} cameraX - Current camera X position
 * @param {Object} difficulty - Current difficulty parameters
 * @param {Array} spikes - Existing spikes array (mutated)
 * @param {number} lastGeneratedX - X position of last generated obstacle group
 * @param {function} randomFn - Random function (default Math.random, injectable for testing)
 * @returns {number} Updated lastGeneratedX value
 */
export function generateObstaclesAhead(playerX, cameraX, difficulty, spikes, lastGeneratedX, randomFn = Math.random) {
    const generateAheadDistance = ENDLESS_CONFIG.generateAheadDistance;
    const targetX = cameraX + generateAheadDistance;
    
    // Start generating from lastGeneratedX or player position if no obstacles yet
    let currentX = lastGeneratedX > 0 ? lastGeneratedX : playerX + difficulty.minGap;
    
    while (currentX < targetX) {
        // Determine cluster size (1 to maxClusterSize)
        const clusterSize = Math.floor(randomFn() * difficulty.maxClusterSize) + 1;
        
        // Generate cluster of spikes
        for (let i = 0; i < clusterSize; i++) {
            spikes.push({
                x: currentX + (i * 40), // 40px spacing within cluster
                width: 30,
                height: 50
            });
        }
        
        // Move to next position with gap
        const clusterWidth = clusterSize * 40;
        const gap = difficulty.minGap + Math.floor(randomFn() * 50); // minGap + random 0-50
        currentX += clusterWidth + gap;
    }
    
    return currentX;
}

/**
 * Removes obstacles that are behind the camera
 * @param {number} cameraX - Current camera X position
 * @param {Array} spikes - Existing spikes array (mutated in place)
 */
export function cleanupObstaclesBehind(cameraX, spikes) {
    const cleanupDistance = ENDLESS_CONFIG.cleanupBehindDistance;
    const threshold = cameraX - cleanupDistance;
    
    // Filter in place by removing spikes behind threshold
    let writeIndex = 0;
    for (let i = 0; i < spikes.length; i++) {
        if (spikes[i].x >= threshold) {
            spikes[writeIndex] = spikes[i];
            writeIndex++;
        }
    }
    spikes.length = writeIndex;
}


/**
 * Formats survival time as MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
    // Handle invalid input
    if (seconds < 0 || isNaN(seconds) || seconds === undefined) {
        seconds = 0;
    }
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Retrieves the high score from local storage
 * @param {Object} storage - Storage object (default localStorage, injectable for testing)
 * @returns {number} High score in seconds, or 0 if none exists
 */
export function getHighScore(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        if (!storage) return 0;
        const stored = storage.getItem(ENDLESS_HIGH_SCORE_KEY);
        return stored ? parseFloat(stored) : 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Saves a new high score to local storage (only if it exceeds current high score)
 * @param {number} score - Score in seconds
 * @param {Object} storage - Storage object (default localStorage, injectable for testing)
 * @returns {boolean} True if high score was updated, false otherwise
 */
export function saveHighScore(score, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        if (!storage) return false;
        const currentHighScore = getHighScore(storage);
        if (score > currentHighScore) {
            storage.setItem(ENDLESS_HIGH_SCORE_KEY, score.toString());
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}


// ============================================
// Secret Menu - Cheat Code System
// ============================================

/**
 * Valid cheat codes and their effects
 * All current codes are skin codes (mutually exclusive)
 */
export const CHEAT_CODES = {
    '12x5v2': { name: 'Lion', effect: 'skin_lion', type: 'skin' },
    'ts2': { name: 'T-Rex', effect: 'skin_trex', type: 'skin' },
    'pillow': { name: 'Gray Cat', effect: 'skin_graycat', type: 'skin' },
    'mooney': { name: 'Black Cat', effect: 'skin_blackcat', type: 'skin' },
    'elbow': { name: 'Orange Cat', effect: 'skin_orangecat', type: 'skin' },
    '772517': { name: 'Dog', effect: 'skin_dog', type: 'skin' },
    '39213': { name: 'Penguin', effect: 'skin_penguin', type: 'skin' }
};


/**
 * Checks if a code is a valid cheat code (case-insensitive)
 * @param {string} code - The code to validate
 * @returns {boolean} True if the code is valid
 */
export function isValidCheatCode(code) {
    if (typeof code !== 'string') return false;
    const normalizedCode = code.toLowerCase().trim();
    return normalizedCode in CHEAT_CODES;
}


/**
 * Toggles a cheat code on or off
 * - If code is not active, activates it
 * - If code is active, deactivates it
 * - For skin codes: activating one deactivates any other active skin
 * @param {string} code - The code to toggle
 * @param {Set<string>} activeCodes - Current set of active codes
 * @returns {Object} { activeCodes: Set, activated: boolean, valid: boolean }
 */
export function toggleCheatCode(code, activeCodes) {
    const normalizedCode = typeof code === 'string' ? code.toLowerCase().trim() : '';
    
    // Check if code is valid
    if (!isValidCheatCode(normalizedCode)) {
        return { activeCodes: new Set(activeCodes), activated: false, valid: false };
    }
    
    const newActiveCodes = new Set(activeCodes);
    const codeInfo = CHEAT_CODES[normalizedCode];
    
    // Check if code is already active
    if (newActiveCodes.has(normalizedCode)) {
        // Deactivate the code
        newActiveCodes.delete(normalizedCode);
        return { activeCodes: newActiveCodes, activated: false, valid: true };
    }
    
    // For skin codes, deactivate any other active skin first
    if (codeInfo.type === 'skin') {
        for (const activeCode of newActiveCodes) {
            if (CHEAT_CODES[activeCode] && CHEAT_CODES[activeCode].type === 'skin') {
                newActiveCodes.delete(activeCode);
            }
        }
    }
    
    // Activate the code
    newActiveCodes.add(normalizedCode);
    return { activeCodes: newActiveCodes, activated: true, valid: true };
}


/**
 * Gets the currently active skin effect, or null if no skin is active
 * @param {Set<string>} activeCodes - Current set of active codes
 * @returns {string|null} The effect string of the active skin, or null
 */
export function getActiveSkin(activeCodes) {
    for (const code of activeCodes) {
        const codeInfo = CHEAT_CODES[code];
        if (codeInfo && codeInfo.type === 'skin') {
            return codeInfo.effect;
        }
    }
    return null;
}
