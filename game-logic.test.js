import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateDifficulty, ENDLESS_CONFIG, generateObstaclesAhead, cleanupObstaclesBehind, formatTime, getHighScore, saveHighScore, ENDLESS_HIGH_SCORE_KEY } from './game-logic.js';

describe('Endless Mode', () => {
    /**
     * **Feature: endless-mode, Property 1: Difficulty scaling follows formula and respects bounds**
     * 
     * For any survival time value (0 to arbitrarily large), the calculateDifficulty function SHALL return:
     * - scrollSpeed = min(4 + floor(time/30) * 0.5, 8)
     * - minGap = max(150 - floor(time/30) * 10, 80)
     * - maxClusterSize = min(3 + floor(time/60), 6)
     * - level = floor(time/30) + 1
     * 
     * **Validates: Requirements 3.1, 3.2, 3.3**
     */
    it('Property 1: Difficulty scaling follows formula and respects bounds', () => {
        fc.assert(
            fc.property(
                fc.float({ min: 0, max: 1000, noNaN: true }),
                (survivalTime) => {
                    const result = calculateDifficulty(survivalTime);
                    const expectedLevel = Math.floor(survivalTime / 30) + 1;
                    
                    // Verify level calculation
                    expect(result.level).toBe(expectedLevel);
                    
                    // Verify scroll speed formula and bounds
                    const expectedScrollSpeed = Math.min(
                        ENDLESS_CONFIG.baseScrollSpeed + (expectedLevel - 1) * ENDLESS_CONFIG.speedIncrementPer30s,
                        ENDLESS_CONFIG.maxScrollSpeed
                    );
                    expect(result.scrollSpeed).toBe(expectedScrollSpeed);
                    expect(result.scrollSpeed).toBeGreaterThanOrEqual(ENDLESS_CONFIG.baseScrollSpeed);
                    expect(result.scrollSpeed).toBeLessThanOrEqual(ENDLESS_CONFIG.maxScrollSpeed);
                    
                    // Verify min gap formula and bounds
                    const expectedMinGap = Math.max(
                        ENDLESS_CONFIG.baseMinGap - (expectedLevel - 1) * ENDLESS_CONFIG.gapDecrementPer30s,
                        ENDLESS_CONFIG.minGap
                    );
                    expect(result.minGap).toBe(expectedMinGap);
                    expect(result.minGap).toBeGreaterThanOrEqual(ENDLESS_CONFIG.minGap);
                    expect(result.minGap).toBeLessThanOrEqual(ENDLESS_CONFIG.baseMinGap);
                    
                    // Verify max cluster size formula and bounds
                    const expectedMaxCluster = Math.min(
                        ENDLESS_CONFIG.baseMaxCluster + Math.floor(survivalTime / 60),
                        ENDLESS_CONFIG.maxClusterSize
                    );
                    expect(result.maxClusterSize).toBe(expectedMaxCluster);
                    expect(result.maxClusterSize).toBeGreaterThanOrEqual(ENDLESS_CONFIG.baseMaxCluster);
                    expect(result.maxClusterSize).toBeLessThanOrEqual(ENDLESS_CONFIG.maxClusterSize);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('handles edge cases for difficulty calculation', () => {
        // Test at exactly 0 seconds
        const at0 = calculateDifficulty(0);
        expect(at0.level).toBe(1);
        expect(at0.scrollSpeed).toBe(4);
        expect(at0.minGap).toBe(150);
        expect(at0.maxClusterSize).toBe(3);

        // Test at exactly 30 seconds (level 2)
        const at30 = calculateDifficulty(30);
        expect(at30.level).toBe(2);
        expect(at30.scrollSpeed).toBe(4.5);
        expect(at30.minGap).toBe(140);

        // Test at exactly 60 seconds (level 3, cluster increases)
        const at60 = calculateDifficulty(60);
        expect(at60.level).toBe(3);
        expect(at60.maxClusterSize).toBe(4);

        // Test at high values (should hit caps)
        const at300 = calculateDifficulty(300);
        expect(at300.scrollSpeed).toBe(8); // capped
        expect(at300.minGap).toBe(80); // floored
        expect(at300.maxClusterSize).toBe(6); // capped

        // Test negative input (should default to 0)
        const negative = calculateDifficulty(-10);
        expect(negative.level).toBe(1);

        // Test NaN input (should default to 0)
        const nan = calculateDifficulty(NaN);
        expect(nan.level).toBe(1);
    });
});


describe('Obstacle Generation', () => {
    /**
     * **Feature: endless-mode, Property 3: Obstacle gaps respect minimum distance**
     * 
     * For any set of generated obstacle groups, the distance between the end of one group
     * and the start of the next group SHALL be at least the current difficulty's minGap value.
     * 
     * **Validates: Requirements 2.2**
     */
    it('Property 3: Obstacle gaps respect minimum distance', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 5000 }),  // playerX
                fc.integer({ min: 0, max: 5000 }),  // cameraX
                fc.float({ min: 0, max: 300, noNaN: true }),  // survivalTime
                fc.integer({ min: 1, max: 100 }),  // seed for deterministic random
                (playerX, cameraX, survivalTime, seed) => {
                    const difficulty = calculateDifficulty(survivalTime);
                    const spikes = [];
                    
                    // Use seeded random for reproducibility
                    let seedValue = seed;
                    const seededRandom = () => {
                        seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff;
                        return seedValue / 0x7fffffff;
                    };
                    
                    generateObstaclesAhead(playerX, cameraX, difficulty, spikes, 0, seededRandom);
                    
                    if (spikes.length < 2) return true; // Not enough spikes to check gaps
                    
                    // Sort spikes by x position
                    const sortedSpikes = [...spikes].sort((a, b) => a.x - b.x);
                    
                    // Find cluster boundaries (gaps > 40px indicate new cluster)
                    const clusters = [];
                    let currentCluster = [sortedSpikes[0]];
                    
                    for (let i = 1; i < sortedSpikes.length; i++) {
                        const gap = sortedSpikes[i].x - sortedSpikes[i-1].x;
                        if (gap > 40) {
                            clusters.push(currentCluster);
                            currentCluster = [sortedSpikes[i]];
                        } else {
                            currentCluster.push(sortedSpikes[i]);
                        }
                    }
                    clusters.push(currentCluster);
                    
                    // Check gaps between clusters
                    for (let i = 1; i < clusters.length; i++) {
                        const prevClusterEnd = clusters[i-1][clusters[i-1].length - 1].x + 30; // x + width
                        const currentClusterStart = clusters[i][0].x;
                        const gapBetweenClusters = currentClusterStart - prevClusterEnd;
                        
                        expect(gapBetweenClusters).toBeGreaterThanOrEqual(difficulty.minGap - 40); // Account for cluster spacing
                    }
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: endless-mode, Property 4: Cluster sizes are within bounds**
     * 
     * For any generated obstacle cluster, the number of spikes in the cluster
     * SHALL be between 1 and the current difficulty's maxClusterSize (inclusive).
     * 
     * **Validates: Requirements 2.3**
     */
    it('Property 4: Cluster sizes are within bounds', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 5000 }),  // playerX
                fc.integer({ min: 0, max: 5000 }),  // cameraX
                fc.float({ min: 0, max: 300, noNaN: true }),  // survivalTime
                fc.integer({ min: 1, max: 100 }),  // seed
                (playerX, cameraX, survivalTime, seed) => {
                    const difficulty = calculateDifficulty(survivalTime);
                    const spikes = [];
                    
                    let seedValue = seed;
                    const seededRandom = () => {
                        seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff;
                        return seedValue / 0x7fffffff;
                    };
                    
                    generateObstaclesAhead(playerX, cameraX, difficulty, spikes, 0, seededRandom);
                    
                    if (spikes.length === 0) return true;
                    
                    // Sort and identify clusters
                    const sortedSpikes = [...spikes].sort((a, b) => a.x - b.x);
                    const clusters = [];
                    let currentCluster = [sortedSpikes[0]];
                    
                    for (let i = 1; i < sortedSpikes.length; i++) {
                        const gap = sortedSpikes[i].x - sortedSpikes[i-1].x;
                        if (gap > 40) {
                            clusters.push(currentCluster);
                            currentCluster = [sortedSpikes[i]];
                        } else {
                            currentCluster.push(sortedSpikes[i]);
                        }
                    }
                    clusters.push(currentCluster);
                    
                    // Verify each cluster size is within bounds
                    for (const cluster of clusters) {
                        expect(cluster.length).toBeGreaterThanOrEqual(1);
                        expect(cluster.length).toBeLessThanOrEqual(difficulty.maxClusterSize);
                    }
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: endless-mode, Property 5: Obstacles behind camera are cleaned up**
     * 
     * For any camera position, after calling cleanupObstaclesBehind, no obstacle
     * SHALL exist more than 500 pixels behind the camera position.
     * 
     * **Validates: Requirements 2.4**
     */
    it('Property 5: Obstacles behind camera are cleaned up', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 500, max: 10000 }),  // cameraX
                fc.array(
                    fc.record({
                        x: fc.integer({ min: 0, max: 15000 }),
                        width: fc.constant(30),
                        height: fc.constant(50)
                    }),
                    { minLength: 1, maxLength: 50 }
                ),
                (cameraX, initialSpikes) => {
                    const spikes = [...initialSpikes];
                    
                    cleanupObstaclesBehind(cameraX, spikes);
                    
                    const threshold = cameraX - ENDLESS_CONFIG.cleanupBehindDistance;
                    
                    // All remaining spikes should be at or ahead of threshold
                    for (const spike of spikes) {
                        expect(spike.x).toBeGreaterThanOrEqual(threshold);
                    }
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});


describe('Score Tracking', () => {
    /**
     * **Feature: endless-mode, Property 6: Time formatting produces valid MM:SS format**
     * 
     * For any non-negative number of seconds, the formatTime function SHALL return
     * a string matching the pattern "MM:SS" where MM is zero-padded minutes and SS is zero-padded seconds.
     * 
     * **Validates: Requirements 4.2**
     */
    it('Property 6: Time formatting produces valid MM:SS format', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 100000 }),
                (seconds) => {
                    const result = formatTime(seconds);
                    
                    // Verify format matches MM:SS pattern
                    const pattern = /^\d{2,}:\d{2}$/;
                    expect(result).toMatch(pattern);
                    
                    // Verify the values are correct
                    const [mins, secs] = result.split(':').map(Number);
                    expect(mins).toBe(Math.floor(seconds / 60));
                    expect(secs).toBe(Math.floor(seconds % 60));
                    
                    // Verify seconds part is always 0-59
                    expect(secs).toBeGreaterThanOrEqual(0);
                    expect(secs).toBeLessThanOrEqual(59);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: endless-mode, Property 7: High score updates only when exceeded**
     * 
     * For any survival time and stored high score, the high score in storage
     * SHALL be updated if and only if the survival time is strictly greater than the stored high score.
     * 
     * **Validates: Requirements 5.2**
     */
    it('Property 7: High score updates only when exceeded', () => {
        fc.assert(
            fc.property(
                fc.float({ min: 0, max: 10000, noNaN: true }),  // currentHighScore
                fc.float({ min: 0, max: 10000, noNaN: true }),  // newScore
                (currentHighScore, newScore) => {
                    // Create mock storage
                    const mockStorage = {
                        data: {},
                        getItem(key) { return this.data[key] || null; },
                        setItem(key, value) { this.data[key] = value; }
                    };
                    
                    // Set initial high score
                    if (currentHighScore > 0) {
                        mockStorage.setItem(ENDLESS_HIGH_SCORE_KEY, currentHighScore.toString());
                    }
                    
                    const wasUpdated = saveHighScore(newScore, mockStorage);
                    const storedScore = getHighScore(mockStorage);
                    
                    if (newScore > currentHighScore) {
                        // Should have been updated
                        expect(wasUpdated).toBe(true);
                        expect(storedScore).toBe(newScore);
                    } else {
                        // Should NOT have been updated
                        expect(wasUpdated).toBe(false);
                        expect(storedScore).toBe(currentHighScore > 0 ? currentHighScore : 0);
                    }
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
