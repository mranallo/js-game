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
