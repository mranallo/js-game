// Just Shapes and Kiro - Game Engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Mode enum
const GameMode = {
    STANDARD: 'standard',
    ENDLESS: 'endless'
};

// Endless Mode configuration
const ENDLESS_CONFIG = {
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
const ENDLESS_HIGH_SCORE_KEY = 'kiro_endless_high_score';

// Game constants
const GAME_DURATION = 72; // Song length in seconds
const SCROLL_SPEED = 4;
const GRAVITY = 0.4;
const JUMP_FORCE_MIN = -10; // Short hop
const JUMP_FORCE_MAX = -17; // Full jump
const JUMP_HOLD_TIME = 150; // ms to reach full jump
const GROUND_Y = canvas.height - 80;
const PLAYER_SIZE = 50;

// Audio system - simple and reliable
const music = new Audio('music.mp3');
music.loop = false;

// Endless Mode state variables
let gameMode = GameMode.STANDARD;
let survivalTime = 0;
let currentDifficulty = null;
let lastDifficultyLevel = 0;
let difficultyIndicatorTime = 0;
let endlessHighScore = 0;
let lastGeneratedX = 0;

/**
 * Calculates difficulty parameters based on survival time
 * @param {number} survivalTime - Time survived in seconds
 * @returns {Object} Current difficulty parameters
 */
function calculateDifficulty(survivalTime) {
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
 */
function generateObstaclesAhead() {
    if (gameMode !== GameMode.ENDLESS) return;
    
    const generateAheadDistance = ENDLESS_CONFIG.generateAheadDistance;
    const targetX = cameraX + canvas.width + generateAheadDistance;
    
    let currentX = lastGeneratedX > 0 ? lastGeneratedX : player.x + currentDifficulty.minGap;
    
    while (currentX < targetX) {
        const clusterSize = Math.floor(Math.random() * currentDifficulty.maxClusterSize) + 1;
        
        for (let i = 0; i < clusterSize; i++) {
            spikes.push({
                x: currentX + (i * 40),
                y: GROUND_Y,
                width: 40,
                height: 50
            });
        }
        
        const clusterWidth = clusterSize * 40;
        const gap = currentDifficulty.minGap + Math.floor(Math.random() * 50);
        currentX += clusterWidth + gap;
    }
    
    lastGeneratedX = currentX;
}

/**
 * Removes obstacles that are behind the camera
 */
function cleanupObstaclesBehind() {
    if (gameMode !== GameMode.ENDLESS) return;
    
    const threshold = cameraX - ENDLESS_CONFIG.cleanupBehindDistance;
    
    let writeIndex = 0;
    for (let i = 0; i < spikes.length; i++) {
        if (spikes[i].x >= threshold) {
            spikes[writeIndex] = spikes[i];
            writeIndex++;
        }
    }
    spikes.length = writeIndex;
}

// Beat reactive values
let bassLevel = 0;
let midLevel = 0;
let highLevel = 0;
let beatPulse = 0;
let dropActive = false;
let dropIntensity = 0;
let lastDropTime = -10;
let bigDropIntensity = 0; // Extra intense for big drops
let screenShake = 0;
// Track which big drops have been triggered (by their time)
let triggeredBigDrops = new Set();
let flashScreen = 0; // White flash on big drops

// Music timeline data (loaded from JSON)
let musicTimeline = null;
let timelineLoaded = false;

// Load the pre-analyzed music timeline
fetch('music_timeline.json')
    .then(response => {
        if (!response.ok) throw new Error('Failed to load timeline');
        return response.json();
    })
    .then(data => {
        if (data && data.bigDrops && data.timeline) {
            musicTimeline = data;
            timelineLoaded = true;
        }
    })
    .catch(e => {
        musicTimeline = null;
        timelineLoaded = false;
    });

// Update audio levels from timeline or simulate
function updateAudioLevels() {
    try {
        // Decay drop intensity
        dropIntensity = Math.max(0, dropIntensity - 0.02);
        bigDropIntensity = Math.max(0, bigDropIntensity - 0.006);
        screenShake = Math.max(0, screenShake - 0.04);
        flashScreen = Math.max(0, flashScreen - 0.08);
        
        const currentTime = music.currentTime || 0;
    
    // Check for BIG DROPS from the analyzed music timeline
    if (timelineLoaded && musicTimeline && musicTimeline.bigDrops) {
        for (const bigDrop of musicTimeline.bigDrops) {
            const dropTime = bigDrop.time;
            const inWindow = currentTime >= dropTime - 0.3 && currentTime <= dropTime + 0.7;
            const dropKey = dropTime.toFixed(1);
            
            if (inWindow && !triggeredBigDrops.has(dropKey)) {
                triggeredBigDrops.add(dropKey);
                
                // The 22s drop (30.6%) is the MAIN "yo" drop - make it the biggest!
                const isMainDrop = dropTime >= 21.5 && dropTime <= 22.5;
                
                if (isMainDrop) {
                    // MEGA DROP - the "yo" moment!
                    bigDropIntensity = 2.5;
                    dropIntensity = 2.5;
                    screenShake = 2.0;
                    flashScreen = 1.5;
                } else {
                    // Regular big drop
                    bigDropIntensity = 1.2;
                    dropIntensity = 1.2;
                    screenShake = 1.0;
                    flashScreen = 0.7;
                }
            }
        }
    } else if (currentTime >= GAME_DURATION * 0.29 && currentTime <= GAME_DURATION * 0.31) {
        // Fallback: trigger at ~30% if no timeline
        if (!triggeredBigDrops.has('fallback')) {
            triggeredBigDrops.add('fallback');
            bigDropIntensity = 1.0;
            dropIntensity = 1.0;
            screenShake = 1.0;
        }
    }
    
    if (timelineLoaded && musicTimeline && musicTimeline.timeline) {
        // Use pre-analyzed timeline data
        
        // Find the closest timeline entry (50ms intervals)
        const index = Math.floor(currentTime / 0.05);
        const entry = musicTimeline.timeline[Math.min(index, musicTimeline.timeline.length - 1)];
        
        if (entry) {
            bassLevel = entry.bass;
            midLevel = entry.mid;
            highLevel = entry.high;
            
            // Create beat pulse from onset strength and beat markers
            const newPulse = entry.beat ? 1.0 : entry.onset * 0.8;
            beatPulse = Math.max(beatPulse * 0.85, newPulse);
            
            // Check for drop
            if (entry.drop && (currentTime - lastDropTime) > 1.5) {
                dropActive = true;
                dropIntensity = 1.0;
                screenShake = 0.5;
                lastDropTime = currentTime;
            }
        }
    } else {
        // Fallback: Simulate beats at ~120 BPM
        const beatTime = gameTime * 2;
        const beatPhase = beatTime % 1;
        
        bassLevel = Math.pow(Math.max(0, 1 - beatPhase * 4), 2);
        midLevel = Math.pow(Math.max(0, 1 - ((beatPhase + 0.25) % 1) * 3), 2) * 0.7;
        highLevel = Math.sin(gameTime * 8) * 0.3 + 0.3;
        beatPulse = Math.max(beatPulse * 0.9, bassLevel);
        
        // Simulate drops every ~15 seconds
        if (Math.floor(gameTime) % 15 === 0 && Math.floor(gameTime) !== Math.floor(lastDropTime)) {
            dropIntensity = 1.0;
            lastDropTime = Math.floor(gameTime);
        }
    }
    } catch (e) {
        // Silently handle any audio level errors to prevent game crash
        bassLevel = 0;
        midLevel = 0;
        highLevel = 0;
    }
}

// Jump state
let isHoldingJump = false;
let jumpStartTime = 0;

// Game state
let gameState = 'start'; // start, playing, gameover, win
let gameTime = 0;
let lastTime = 0;
let cameraX = 0;
let levelEndX = 0; // Will be calculated on level start

// Player object
const player = {
    x: 150,
    y: GROUND_Y - PLAYER_SIZE,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    velocityY: 0,
    isJumping: false,
    isOnGround: true,
    // Squash/stretch for bouncy animation
    scaleX: 1,
    scaleY: 1,
    landingSquash: 0 // How much to squash on landing (0-1)
};

// Kiro logo image
const kiroLogo = new Image();
kiroLogo.src = 'kiro-logo.png';
let logoLoaded = false;
kiroLogo.onload = () => { logoLoaded = true; };

// Spikes array - will be generated for the level
let spikes = [];

// Particle effects
let particles = [];

// Fireworks for win screen
let fireworks = [];
let fireworkParticles = [];

// Dynamic background elements
let bgShapes = [];
let bgStripes = [];

// Color palettes that transition through the level
const colorPalettes = [
    { bg: '#1a0a2e', accent: '#790ECB', shapes: ['#ff1744', '#790ECB', '#ff6090'] },
    { bg: '#0d1b2a', accent: '#00bcd4', shapes: ['#00bcd4', '#00ff88', '#790ECB'] },
    { bg: '#2d132c', accent: '#ff6090', shapes: ['#ff1744', '#ffeb3b', '#ff6090'] },
    { bg: '#0a0a0f', accent: '#00ff88', shapes: ['#00ff88', '#790ECB', '#00bcd4'] }
];

// Generate background elements
function generateBackground() {
    bgShapes = [];
    bgStripes = [];
    
    // Generate vertical stripes (like in Just Shapes and Beats)
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i++) {
        bgStripes.push({
            x: (canvas.width / stripeCount) * i,
            width: canvas.width / stripeCount,
            offset: Math.random() * 100,
            speed: 0.5 + Math.random() * 0.5
        });
    }
    
    // Generate floating shapes across the level
    const shapeCount = 80;
    for (let i = 0; i < shapeCount; i++) {
        const shapeType = Math.floor(Math.random() * 4); // 0: circle, 1: square, 2: triangle, 3: diamond
        bgShapes.push({
            x: Math.random() * levelEndX * 1.2,
            y: Math.random() * (GROUND_Y - 100) + 50,
            size: 20 + Math.random() * 60,
            type: shapeType,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.02,
            floatOffset: Math.random() * Math.PI * 2,
            floatSpeed: 0.5 + Math.random() * 1.5,
            floatAmount: 5 + Math.random() * 15,
            layer: Math.floor(Math.random() * 3), // 0: far, 1: mid, 2: near
            colorIndex: Math.floor(Math.random() * 3)
        });
    }
}

// Get current color palette based on progress
function getCurrentPalette() {
    const progress = player.x / levelEndX;
    const paletteIndex = Math.min(Math.floor(progress * colorPalettes.length), colorPalettes.length - 1);
    const nextIndex = Math.min(paletteIndex + 1, colorPalettes.length - 1);
    const blend = (progress * colorPalettes.length) % 1;
    
    return {
        current: colorPalettes[paletteIndex],
        next: colorPalettes[nextIndex],
        blend: blend
    };
}

// Interpolate between two hex colors
function lerpColor(color1, color2, t) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Generate level spikes
function generateLevel() {
    spikes = [];
    const startX = 150; // Player start position
    levelEndX = startX + SCROLL_SPEED * GAME_DURATION * 60; // End position
    const obstacleEndX = levelEndX * 0.9; // Obstacles cover 90% of course
    let x = 500; // Start first spike after some distance
    
    while (x < obstacleEndX) {
        // Random gap between spikes (adjusted for difficulty)
        const gap = 150 + Math.random() * 200;
        
        // Sometimes create spike clusters
        const clusterSize = Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 2 : 1;
        
        for (let i = 0; i < clusterSize; i++) {
            spikes.push({
                x: x + (i * 60),
                y: GROUND_Y,
                width: 40,
                height: 50
            });
        }
        
        x += gap + (clusterSize * 60);
    }
}

// Draw triangle spike
function drawSpike(spike) {
    const screenX = spike.x - cameraX;
    
    // Only draw if on screen
    if (screenX < -spike.width || screenX > canvas.width + spike.width) return;
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenX, spike.y);
    ctx.lineTo(screenX + spike.width / 2, spike.y - spike.height);
    ctx.lineTo(screenX + spike.width, spike.y);
    ctx.closePath();
    
    // Gradient fill for spikes
    const gradient = ctx.createLinearGradient(screenX, spike.y, screenX, spike.y - spike.height);
    gradient.addColorStop(0, '#ff1744');
    gradient.addColorStop(1, '#ff6090');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Glow effect
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();
}

// ============================================
// Player Skin Drawing Functions
// ============================================

/**
 * Draws a lion head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawLionSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    // Calculate center point for scaling
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // Apply scale transformation from center
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50; // Base size is 50x50
    
    // Mane (outer circle with jagged edges)
    ctx.fillStyle = '#D4740C'; // Orange-brown mane
    ctx.beginPath();
    const maneRadius = 24 * scale;
    const manePoints = 12;
    for (let i = 0; i < manePoints * 2; i++) {
        const angle = (i / (manePoints * 2)) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 === 0 ? maneRadius : maneRadius * 0.75;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    // Inner mane layer (darker)
    ctx.fillStyle = '#B8620A';
    ctx.beginPath();
    const innerManeRadius = 20 * scale;
    for (let i = 0; i < manePoints * 2; i++) {
        const angle = (i / (manePoints * 2)) * Math.PI * 2 - Math.PI / 2 + Math.PI / manePoints;
        const radius = i % 2 === 0 ? innerManeRadius : innerManeRadius * 0.8;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    // Face (circle)
    ctx.fillStyle = '#F5C16C'; // Golden tan face
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.fillStyle = '#D4740C';
    // Left ear
    ctx.beginPath();
    ctx.arc(centerX - 12 * scale, centerY - 12 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.arc(centerX + 12 * scale, centerY - 12 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner ears
    ctx.fillStyle = '#F5C16C';
    ctx.beginPath();
    ctx.arc(centerX - 12 * scale, centerY - 12 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 12 * scale, centerY - 12 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes (white)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX - 5 * scale, centerY - 3 * scale, 4 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 5 * scale, centerY - 3 * scale, 4 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#2D1B00';
    ctx.beginPath();
    ctx.arc(centerX - 5 * scale, centerY - 2 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 5 * scale, centerY - 2 * scale, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 4 * scale, centerY - 3 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 6 * scale, centerY - 3 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 3 * scale);
    ctx.lineTo(centerX - 4 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX + 4 * scale, centerY + 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Mouth
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1.5 * scale;
    ctx.lineCap = 'round';
    // Left curve
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 8 * scale);
    ctx.quadraticCurveTo(centerX - 4 * scale, centerY + 12 * scale, centerX - 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    // Right curve
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 8 * scale);
    ctx.quadraticCurveTo(centerX + 4 * scale, centerY + 12 * scale, centerX + 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    
    // Whisker dots
    ctx.fillStyle = '#8B4513';
    const dotSize = 1 * scale;
    // Left side
    ctx.beginPath();
    ctx.arc(centerX - 8 * scale, centerY + 5 * scale, dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX - 9 * scale, centerY + 7 * scale, dotSize, 0, Math.PI * 2);
    ctx.fill();
    // Right side
    ctx.beginPath();
    ctx.arc(centerX + 8 * scale, centerY + 5 * scale, dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 9 * scale, centerY + 7 * scale, dotSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a T-Rex head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawTRexSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Head base (green)
    ctx.fillStyle = '#4A7C23';
    ctx.beginPath();
    ctx.ellipse(centerX + 5 * scale, centerY, 20 * scale, 18 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Snout (elongated)
    ctx.fillStyle = '#5A8C33';
    ctx.beginPath();
    ctx.ellipse(centerX + 18 * scale, centerY + 2 * scale, 12 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Lower jaw
    ctx.fillStyle = '#3A6C13';
    ctx.beginPath();
    ctx.ellipse(centerX + 15 * scale, centerY + 10 * scale, 10 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Teeth (top)
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const toothX = centerX + 12 * scale + i * 4 * scale;
        ctx.moveTo(toothX, centerY + 4 * scale);
        ctx.lineTo(toothX + 2 * scale, centerY + 9 * scale);
        ctx.lineTo(toothX - 2 * scale, centerY + 9 * scale);
        ctx.closePath();
        ctx.fill();
    }
    
    // Eye ridge
    ctx.fillStyle = '#3A6C13';
    ctx.beginPath();
    ctx.ellipse(centerX - 2 * scale, centerY - 8 * scale, 10 * scale, 4 * scale, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye (white)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX - 2 * scale, centerY - 5 * scale, 6 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupil (slit)
    ctx.fillStyle = '#1A1A00';
    ctx.beginPath();
    ctx.ellipse(centerX - 2 * scale, centerY - 5 * scale, 2 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 4 * scale, centerY - 7 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Nostril
    ctx.fillStyle = '#2A5C03';
    ctx.beginPath();
    ctx.ellipse(centerX + 26 * scale, centerY - 2 * scale, 2 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Scales/texture dots
    ctx.fillStyle = '#3A6C13';
    const scalePositions = [
        [-8, -2], [-10, 3], [-6, 6], [0, 8], [5, 10]
    ];
    for (const [sx, sy] of scalePositions) {
        ctx.beginPath();
        ctx.arc(centerX + sx * scale, centerY + sy * scale, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

/**
 * Draws a gray/white cat head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawGrayCatSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Ears (pointed)
    ctx.fillStyle = '#808080';
    // Left ear
    ctx.beginPath();
    ctx.moveTo(centerX - 18 * scale, centerY - 5 * scale);
    ctx.lineTo(centerX - 12 * scale, centerY - 22 * scale);
    ctx.lineTo(centerX - 5 * scale, centerY - 8 * scale);
    ctx.closePath();
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(centerX + 18 * scale, centerY - 5 * scale);
    ctx.lineTo(centerX + 12 * scale, centerY - 22 * scale);
    ctx.lineTo(centerX + 5 * scale, centerY - 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Inner ears (pink)
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.moveTo(centerX - 16 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX - 12 * scale, centerY - 18 * scale);
    ctx.lineTo(centerX - 7 * scale, centerY - 9 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centerX + 16 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX + 12 * scale, centerY - 18 * scale);
    ctx.lineTo(centerX + 7 * scale, centerY - 9 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Head (gray circle)
    ctx.fillStyle = '#808080';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // White muzzle area
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 6 * scale, 10 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // White chest patch
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 16 * scale, 8 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes (green)
    ctx.fillStyle = '#90EE90';
    ctx.beginPath();
    ctx.ellipse(centerX - 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils (vertical slits)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.ellipse(centerX - 7 * scale, centerY - 3 * scale, 2 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 7 * scale, centerY - 3 * scale, 2 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 5 * scale, centerY - 5 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 9 * scale, centerY - 5 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose (pink triangle)
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 2 * scale);
    ctx.lineTo(centerX - 3 * scale, centerY + 6 * scale);
    ctx.lineTo(centerX + 3 * scale, centerY + 6 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Mouth
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 1.5 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 6 * scale);
    ctx.lineTo(centerX, centerY + 9 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX - 4 * scale, centerY + 12 * scale, centerX - 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX + 4 * scale, centerY + 12 * scale, centerX + 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    
    // Whiskers
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1 * scale;
    // Left whiskers
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 7 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 4 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 8 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 12 * scale);
    ctx.stroke();
    // Right whiskers
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 7 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 4 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 8 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 12 * scale);
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Draws a black cat head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawBlackCatSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Ears (pointed)
    ctx.fillStyle = '#1A1A1A';
    // Left ear
    ctx.beginPath();
    ctx.moveTo(centerX - 18 * scale, centerY - 5 * scale);
    ctx.lineTo(centerX - 12 * scale, centerY - 22 * scale);
    ctx.lineTo(centerX - 5 * scale, centerY - 8 * scale);
    ctx.closePath();
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(centerX + 18 * scale, centerY - 5 * scale);
    ctx.lineTo(centerX + 12 * scale, centerY - 22 * scale);
    ctx.lineTo(centerX + 5 * scale, centerY - 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Inner ears (dark pink)
    ctx.fillStyle = '#8B4557';
    ctx.beginPath();
    ctx.moveTo(centerX - 16 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX - 12 * scale, centerY - 18 * scale);
    ctx.lineTo(centerX - 7 * scale, centerY - 9 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centerX + 16 * scale, centerY - 7 * scale);
    ctx.lineTo(centerX + 12 * scale, centerY - 18 * scale);
    ctx.lineTo(centerX + 7 * scale, centerY - 9 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Head (black circle)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Subtle fur highlight
    ctx.fillStyle = '#2A2A2A';
    ctx.beginPath();
    ctx.ellipse(centerX - 5 * scale, centerY - 8 * scale, 8 * scale, 6 * scale, -0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes (yellow/gold - classic black cat)
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.ellipse(centerX - 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils (vertical slits)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(centerX - 7 * scale, centerY - 3 * scale, 1.5 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 7 * scale, centerY - 3 * scale, 1.5 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 5 * scale, centerY - 5 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 9 * scale, centerY - 5 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose (dark pink)
    ctx.fillStyle = '#8B4557';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 2 * scale);
    ctx.lineTo(centerX - 3 * scale, centerY + 6 * scale);
    ctx.lineTo(centerX + 3 * scale, centerY + 6 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Mouth
    ctx.strokeStyle = '#3A3A3A';
    ctx.lineWidth = 1.5 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 6 * scale);
    ctx.lineTo(centerX, centerY + 9 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX - 4 * scale, centerY + 12 * scale, centerX - 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX + 4 * scale, centerY + 12 * scale, centerX + 6 * scale, centerY + 10 * scale);
    ctx.stroke();
    
    // Whiskers (subtle gray)
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 1 * scale;
    // Left whiskers
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 7 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 4 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 8 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX - 20 * scale, centerY + 12 * scale);
    ctx.stroke();
    // Right whiskers
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 7 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 4 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 8 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 6 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX + 20 * scale, centerY + 12 * scale);
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Draws a long-haired orange cat head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawOrangeCatSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Ears (pointed)
    ctx.fillStyle = '#FF8C00';
    // Left ear
    ctx.beginPath();
    ctx.moveTo(centerX - 16 * scale, centerY - 8 * scale);
    ctx.lineTo(centerX - 10 * scale, centerY - 24 * scale);
    ctx.lineTo(centerX - 4 * scale, centerY - 10 * scale);
    ctx.closePath();
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(centerX + 16 * scale, centerY - 8 * scale);
    ctx.lineTo(centerX + 10 * scale, centerY - 24 * scale);
    ctx.lineTo(centerX + 4 * scale, centerY - 10 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Inner ears (pink)
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.moveTo(centerX - 14 * scale, centerY - 10 * scale);
    ctx.lineTo(centerX - 10 * scale, centerY - 20 * scale);
    ctx.lineTo(centerX - 6 * scale, centerY - 11 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centerX + 14 * scale, centerY - 10 * scale);
    ctx.lineTo(centerX + 10 * scale, centerY - 20 * scale);
    ctx.lineTo(centerX + 6 * scale, centerY - 11 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Head (orange circle)
    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Lighter face markings
    ctx.fillStyle = '#FFB060';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 2 * scale, 12 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // White muzzle
    ctx.fillStyle = '#FFF5E6';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 8 * scale, 8 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Tabby stripes on forehead
    ctx.strokeStyle = '#D06010';
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    // M shape
    ctx.beginPath();
    ctx.moveTo(centerX - 8 * scale, centerY - 8 * scale);
    ctx.lineTo(centerX - 4 * scale, centerY - 12 * scale);
    ctx.lineTo(centerX, centerY - 9 * scale);
    ctx.lineTo(centerX + 4 * scale, centerY - 12 * scale);
    ctx.lineTo(centerX + 8 * scale, centerY - 8 * scale);
    ctx.stroke();
    
    // Eyes (amber/gold)
    ctx.fillStyle = '#FFB347';
    ctx.beginPath();
    ctx.ellipse(centerX - 6 * scale, centerY - 2 * scale, 4 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 6 * scale, centerY - 2 * scale, 4 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.ellipse(centerX - 6 * scale, centerY - 2 * scale, 1.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 6 * scale, centerY - 2 * scale, 1.5 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 4 * scale, centerY - 4 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 8 * scale, centerY - 4 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose (pink)
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 4 * scale);
    ctx.lineTo(centerX - 3 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX + 3 * scale, centerY + 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Mouth
    ctx.strokeStyle = '#D06010';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 8 * scale);
    ctx.lineTo(centerX, centerY + 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 10 * scale);
    ctx.quadraticCurveTo(centerX - 3 * scale, centerY + 13 * scale, centerX - 5 * scale, centerY + 11 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 10 * scale);
    ctx.quadraticCurveTo(centerX + 3 * scale, centerY + 13 * scale, centerX + 5 * scale, centerY + 11 * scale);
    ctx.stroke();
    
    // Whiskers
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1 * scale;
    // Left whiskers
    ctx.beginPath();
    ctx.moveTo(centerX - 5 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX - 18 * scale, centerY + 5 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 5 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX - 18 * scale, centerY + 9 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 5 * scale, centerY + 10 * scale);
    ctx.lineTo(centerX - 18 * scale, centerY + 13 * scale);
    ctx.stroke();
    // Right whiskers
    ctx.beginPath();
    ctx.moveTo(centerX + 5 * scale, centerY + 8 * scale);
    ctx.lineTo(centerX + 18 * scale, centerY + 5 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 5 * scale, centerY + 9 * scale);
    ctx.lineTo(centerX + 18 * scale, centerY + 9 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 5 * scale, centerY + 10 * scale);
    ctx.lineTo(centerX + 18 * scale, centerY + 13 * scale);
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Draws a dog head skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawDogSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Floppy ears (behind head)
    ctx.fillStyle = '#8B4513';
    // Left ear
    ctx.beginPath();
    ctx.ellipse(centerX - 16 * scale, centerY + 5 * scale, 8 * scale, 14 * scale, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.ellipse(centerX + 16 * scale, centerY + 5 * scale, 8 * scale, 14 * scale, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Head (golden/tan)
    ctx.fillStyle = '#D4A574';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Snout (lighter)
    ctx.fillStyle = '#E8C9A0';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 8 * scale, 10 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Forehead patch (darker)
    ctx.fillStyle = '#B8956C';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 10 * scale, 10 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes (brown, friendly)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX - 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 7 * scale, centerY - 3 * scale, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils (round, friendly)
    ctx.fillStyle = '#4A3520';
    ctx.beginPath();
    ctx.arc(centerX - 6 * scale, centerY - 2 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 8 * scale, centerY - 2 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 5 * scale, centerY - 4 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 9 * scale, centerY - 4 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyebrows (expressive)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - 11 * scale, centerY - 9 * scale);
    ctx.quadraticCurveTo(centerX - 7 * scale, centerY - 12 * scale, centerX - 3 * scale, centerY - 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 11 * scale, centerY - 9 * scale);
    ctx.quadraticCurveTo(centerX + 7 * scale, centerY - 12 * scale, centerX + 3 * scale, centerY - 10 * scale);
    ctx.stroke();
    
    // Nose (black, shiny)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 5 * scale, 5 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose shine
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.ellipse(centerX - 1 * scale, centerY + 4 * scale, 2 * scale, 1.5 * scale, -0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Mouth (happy smile)
    ctx.strokeStyle = '#6B4423';
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX - 6 * scale, centerY + 15 * scale, centerX - 10 * scale, centerY + 12 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 9 * scale);
    ctx.quadraticCurveTo(centerX + 6 * scale, centerY + 15 * scale, centerX + 10 * scale, centerY + 12 * scale);
    ctx.stroke();
    
    // Tongue (optional happy dog)
    ctx.fillStyle = '#FF6B8A';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 14 * scale, 4 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF8FAA';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 13 * scale, 2 * scale, 2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a penguin skin for the player
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position (top-left)
 * @param {number} y - Y position (top-left)
 * @param {number} width - Width of the skin
 * @param {number} height - Height of the skin
 * @param {number} scaleX - Horizontal scale for squash/stretch
 * @param {number} scaleY - Vertical scale for squash/stretch
 */
function drawPenguinSkin(ctx, x, y, width, height, scaleX = 1, scaleY = 1) {
    ctx.save();
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-centerX, -centerY);
    
    const size = Math.min(width, height);
    const scale = size / 50;
    
    // Body (black oval)
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 2 * scale, 18 * scale, 22 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // White belly
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 6 * scale, 12 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Head (black circle, slightly overlapping body)
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 10 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // White face patches
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(centerX - 6 * scale, centerY - 8 * scale, 5 * scale, 6 * scale, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 6 * scale, centerY - 8 * scale, 5 * scale, 6 * scale, 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes (cute round eyes)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.arc(centerX - 5 * scale, centerY - 10 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 5 * scale, centerY - 10 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX - 4 * scale, centerY - 11 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 6 * scale, centerY - 11 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    
    // Beak (orange)
    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 6 * scale);
    ctx.lineTo(centerX - 5 * scale, centerY - 2 * scale);
    ctx.lineTo(centerX, centerY + 2 * scale);
    ctx.lineTo(centerX + 5 * scale, centerY - 2 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Beak highlight
    ctx.fillStyle = '#FFB347';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 6 * scale);
    ctx.lineTo(centerX - 3 * scale, centerY - 3 * scale);
    ctx.lineTo(centerX, centerY - 1 * scale);
    ctx.lineTo(centerX + 3 * scale, centerY - 3 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Flippers (small wings on sides)
    ctx.fillStyle = '#1A1A2E';
    // Left flipper
    ctx.beginPath();
    ctx.ellipse(centerX - 18 * scale, centerY + 5 * scale, 5 * scale, 10 * scale, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Right flipper
    ctx.beginPath();
    ctx.ellipse(centerX + 18 * scale, centerY + 5 * scale, 5 * scale, 10 * scale, -0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Feet (orange)
    ctx.fillStyle = '#FF8C00';
    // Left foot
    ctx.beginPath();
    ctx.ellipse(centerX - 6 * scale, centerY + 22 * scale, 5 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right foot
    ctx.beginPath();
    ctx.ellipse(centerX + 6 * scale, centerY + 22 * scale, 5 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Rosy cheeks (cute)
    ctx.fillStyle = 'rgba(255, 150, 150, 0.4)';
    ctx.beginPath();
    ctx.ellipse(centerX - 10 * scale, centerY - 5 * scale, 3 * scale, 2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX + 10 * scale, centerY - 5 * scale, 3 * scale, 2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// Draw player (Kiro logo or active skin)
function drawPlayer() {
    const screenX = player.x - cameraX;
    
    ctx.save();
    
    // Glow effect around player
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 20;
    
    // Calculate scaled dimensions
    const scaledWidth = player.width * player.scaleX;
    const scaledHeight = player.height * player.scaleY;
    
    // Offset to keep player grounded (scale from bottom center)
    const offsetX = (player.width - scaledWidth) / 2;
    const offsetY = player.height - scaledHeight;
    
    // Check for active skin
    const activeSkin = getActiveSkin();
    
    if (activeSkin) {
        // Render the active skin
        const drawX = screenX + offsetX;
        const drawY = player.y + offsetY;
        
        switch (activeSkin) {
            case 'skin_lion':
                drawLionSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_trex':
                drawTRexSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_graycat':
                drawGrayCatSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_blackcat':
                drawBlackCatSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_orangecat':
                drawOrangeCatSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_dog':
                drawDogSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            case 'skin_penguin':
                drawPenguinSkin(ctx, drawX, drawY, player.width, player.height, player.scaleX, player.scaleY);
                break;
            default:
                // Unknown skin, fall back to Kiro logo
                if (logoLoaded) {
                    ctx.drawImage(kiroLogo, screenX + offsetX, player.y + offsetY, scaledWidth, scaledHeight);
                } else {
                    ctx.fillStyle = '#790ECB';
                    ctx.fillRect(screenX + offsetX, player.y + offsetY, scaledWidth, scaledHeight);
                }
        }
    } else if (logoLoaded) {
        // No skin active, draw Kiro logo
        ctx.drawImage(
            kiroLogo, 
            screenX + offsetX, 
            player.y + offsetY, 
            scaledWidth, 
            scaledHeight
        );
    } else {
        // Fallback: draw a purple square
        ctx.fillStyle = '#790ECB';
        ctx.fillRect(screenX + offsetX, player.y + offsetY, scaledWidth, scaledHeight);
    }
    
    ctx.restore();
}

// Draw ground
function drawGround() {
    ctx.save();
    
    // Ground line
    ctx.strokeStyle = '#790ECB';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();
    
    // Grid pattern on ground
    ctx.strokeStyle = 'rgba(121, 14, 203, 0.3)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    
    const gridOffset = cameraX % 50;
    for (let x = -gridOffset; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    ctx.restore();
}

// Draw background with dynamic elements
function drawBackground() {
    // Update audio levels for beat reactivity
    updateAudioLevels();
    
    const palette = getCurrentPalette();
    const bgColor = lerpColor(palette.current.bg, palette.next.bg, palette.blend);
    
    // Fill background with transitioning color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw vertical stripes (darker bands) - subtle pulse with mid frequencies
    for (let i = 0; i < bgStripes.length; i++) {
        const stripe = bgStripes[i];
        const pulseAmount = Math.sin(gameTime * stripe.speed + stripe.offset) * 0.05;
        const beatBoost = midLevel * 0.08;
        // Alternate stripe widths on beats
        const widthMod = (i % 2 === 0) ? (1 + bassLevel * 0.1) : (1 - bassLevel * 0.05);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + pulseAmount + beatBoost})`;
        ctx.fillRect(stripe.x, 0, stripe.width * widthMod, canvas.height);
    }
    
    // Draw wave lines across the screen (react to high frequencies)
    ctx.save();
    ctx.strokeStyle = lerpColor(palette.current.accent, palette.next.accent, palette.blend);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15 + highLevel * 0.1;
    for (let wave = 0; wave < 3; wave++) {
        ctx.beginPath();
        const baseY = 100 + wave * 80;
        for (let x = 0; x < canvas.width; x += 5) {
            const waveY = baseY + Math.sin((x + cameraX * 0.3 + gameTime * 50) * 0.02 + wave) * (20 + highLevel * 30);
            if (x === 0) ctx.moveTo(x, waveY);
            else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
    }
    ctx.restore();
    
    // Draw floating shapes by layer (far to near)
    for (let layer = 0; layer < 3; layer++) {
        const parallaxSpeed = 0.3 + layer * 0.25;
        const alpha = 0.12 + layer * 0.08;
        
        for (const shape of bgShapes) {
            if (shape.layer !== layer) continue;
            
            const screenX = shape.x - cameraX * parallaxSpeed;
            
            // Skip if off screen
            if (screenX < -shape.size * 2 || screenX > canvas.width + shape.size * 2) continue;
            
            // Floating animation - more movement on beats
            const floatY = shape.y + Math.sin(gameTime * shape.floatSpeed + shape.floatOffset) * (shape.floatAmount + bassLevel * 10);
            
            // Update rotation - gentle speed up on beats
            shape.rotation += shape.rotationSpeed * (1 + beatPulse * 0.5);
            
            // Get color from current palette
            const shapeColor = palette.current.shapes[shape.colorIndex];
            
            // Subtle scale with bass
            const beatScale = 1 + bassLevel * 0.15;
            
            ctx.save();
            ctx.translate(screenX, floatY);
            ctx.rotate(shape.rotation);
            ctx.scale(beatScale, beatScale);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = shapeColor;
            
            // Draw shape based on type
            switch (shape.type) {
                case 0: // Circle
                    ctx.beginPath();
                    ctx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 1: // Square
                    ctx.fillRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
                    break;
                case 2: // Triangle
                    ctx.beginPath();
                    ctx.moveTo(0, -shape.size / 2);
                    ctx.lineTo(shape.size / 2, shape.size / 2);
                    ctx.lineTo(-shape.size / 2, shape.size / 2);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case 3: // Diamond
                    ctx.beginPath();
                    ctx.moveTo(0, -shape.size / 2);
                    ctx.lineTo(shape.size / 2, 0);
                    ctx.lineTo(0, shape.size / 2);
                    ctx.lineTo(-shape.size / 2, 0);
                    ctx.closePath();
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
        }
    }
    
    // Pulsing circles - smoother, less intense
    const pulseTime = gameTime * 2;
    const accentColor = lerpColor(palette.current.accent, palette.next.accent, palette.blend);
    for (let i = 0; i < 3; i++) {
        const pulse = Math.sin(pulseTime + i * 2) * 0.5 + 0.5;
        // Gentler bass expansion
        const bassBoost = bassLevel * 50 * (3 - i);
        const size = 100 + pulse * 100 + i * 60 + bassBoost;
        const x = (canvas.width * (i + 1) / 4) + Math.sin(gameTime * 0.5 + i) * 50;
        const y = GROUND_Y - 150 + Math.cos(gameTime * 0.3 + i) * 30;
        
        ctx.save();
        ctx.globalAlpha = 0.06 - i * 0.015;
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    // Draw ring pulses on strong beats
    if (beatPulse > 0.6) {
        ctx.save();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = (beatPulse - 0.6) * 0.3;
        const ringSize = Math.max(0, (1 - (beatPulse - 0.6) / 0.4) * 200 + 50);
        ctx.beginPath();
        ctx.arc(canvas.width / 2, GROUND_Y / 2, ringSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    
    // DROP EFFECTS - dramatic visuals on bass drops
    if (dropIntensity > 0) {
        const dropColor = '#ff1744';
        const dropColor2 = palette.current.accent;
        
        // 1. Radiating laser beams from center bottom
        ctx.save();
        ctx.globalAlpha = dropIntensity * 0.4;
        const beamCount = 12;
        const beamWidth = 8 + dropIntensity * 15;
        for (let i = 0; i < beamCount; i++) {
            const angle = (i / beamCount) * Math.PI - Math.PI / 2;
            const spread = 0.8; // How wide the fan spreads
            const beamAngle = angle * spread;
            
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height + 50);
            ctx.rotate(beamAngle);
            
            // Gradient beam
            const gradient = ctx.createLinearGradient(0, 0, 0, -canvas.height * 1.5);
            gradient.addColorStop(0, dropColor);
            gradient.addColorStop(0.5, dropColor2);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.fillRect(-beamWidth / 2, 0, beamWidth, -canvas.height * 1.5);
            ctx.restore();
        }
        ctx.restore();
        
        // 2. Large rising shapes from bottom
        ctx.save();
        ctx.globalAlpha = dropIntensity * 0.3;
        const riseAmount = (1 - dropIntensity) * 200;
        
        // Big circle rising from bottom left
        ctx.fillStyle = dropColor;
        ctx.beginPath();
        ctx.arc(canvas.width * 0.2, canvas.height - riseAmount + 100, 150 + dropIntensity * 50, 0, Math.PI * 2);
        ctx.fill();
        
        // Big circle rising from bottom right
        ctx.fillStyle = dropColor2;
        ctx.beginPath();
        ctx.arc(canvas.width * 0.8, canvas.height - riseAmount + 150, 120 + dropIntensity * 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // 3. Concentric expanding rings
        ctx.save();
        ctx.strokeStyle = dropColor;
        ctx.lineWidth = 3;
        const clampedDrop = Math.min(dropIntensity, 1); // Clamp for ring calculation
        for (let ring = 0; ring < 4; ring++) {
            const ringProgress = (1 - clampedDrop) + ring * 0.15;
            if (ringProgress > 0 && ringProgress < 1) {
                ctx.globalAlpha = (1 - ringProgress) * 0.5;
                const ringSize = Math.max(0, ringProgress * 400);
                ctx.beginPath();
                ctx.arc(canvas.width / 2, GROUND_Y / 2, ringSize, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();
        
        // 4. Screen edge glow
        ctx.save();
        const edgeGradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.8
        );
        edgeGradient.addColorStop(0, 'transparent');
        edgeGradient.addColorStop(1, dropColor);
        ctx.globalAlpha = dropIntensity * 0.2;
        ctx.fillStyle = edgeGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}

// Draw extra intense effects for the BIG DROP at 30 seconds
function drawBigDropEffects() {
    try {
        // Clamp intensity to prevent gradient overflow crashes
        const intensity = Math.min(bigDropIntensity || 0, 1.5);
        const rawIntensity = bigDropIntensity || 0;
        
        // White flash at the start of the drop
        if (flashScreen > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(flashScreen * 0.7, 1)})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
    }
    
    // 1. Massive center burst
    ctx.save();
    const burstRadius = Math.min(canvas.width * intensity, canvas.width * 1.5);
    const burstGradient = ctx.createRadialGradient(
        canvas.width / 2, GROUND_Y / 2, 0,
        canvas.width / 2, GROUND_Y / 2, burstRadius
    );
    burstGradient.addColorStop(0, 'rgba(255, 23, 68, 0.8)');
    burstGradient.addColorStop(0.3, 'rgba(121, 14, 203, 0.4)');
    burstGradient.addColorStop(1, 'transparent');
    ctx.globalAlpha = intensity * 0.6;
    ctx.fillStyle = burstGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // 2. Thick radiating lines from all directions
    ctx.save();
    ctx.globalAlpha = intensity * 0.7;
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 10 + intensity * 20;
    const lineCount = 16;
    for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2;
        const length = canvas.width * (1 - intensity * 0.3);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, GROUND_Y / 2);
        ctx.lineTo(
            canvas.width / 2 + Math.cos(angle) * length,
            GROUND_Y / 2 + Math.sin(angle) * length
        );
        ctx.stroke();
    }
    ctx.restore();
    
    // 3. Multiple expanding rings
    ctx.save();
    for (let ring = 0; ring < 6; ring++) {
        const ringProgress = (1 - intensity) * 1.5 + ring * 0.1;
        if (ringProgress > 0 && ringProgress < 1.2) {
            ctx.strokeStyle = ring % 2 === 0 ? '#ff1744' : '#790ECB';
            ctx.lineWidth = 5 + (1 - ringProgress) * 10;
            ctx.globalAlpha = Math.max(0, (1 - ringProgress) * 0.8);
            ctx.beginPath();
            ctx.arc(canvas.width / 2, GROUND_Y / 2, Math.max(0, ringProgress * 500), 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.restore();
    
    // 4. Corner bursts
    ctx.save();
    ctx.globalAlpha = Math.min(intensity * 0.5, 0.75);
    const corners = [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]];
    const cornerRadius = Math.min(300 * intensity, 450);
    for (const [cx, cy] of corners) {
        const cornerGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerRadius);
        cornerGradient.addColorStop(0, '#ff1744');
        cornerGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = cornerGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    
    // 5. Pulsing vignette
    ctx.save();
    const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.2,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    );
    vignetteGradient.addColorStop(0, 'transparent');
    vignetteGradient.addColorStop(1, `rgba(255, 23, 68, ${intensity * 0.4})`);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    

    
    // 7. Extra effect for MAIN drop - pulsing border
    if (rawIntensity > 1.8) {
        ctx.save();
        ctx.strokeStyle = '#790ECB';
        ctx.lineWidth = Math.min(20 * rawIntensity, 50);
        ctx.globalAlpha = Math.min((rawIntensity - 1.8) * 1.5, 1);
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
        ctx.restore();
    }
    } catch (e) {
        // Silently handle any rendering errors
        ctx.restore();
    }
}

// Draw minimap at top of screen (Standard Mode only)
function drawMinimap() {
    if (gameMode === GameMode.ENDLESS) return; // Don't draw minimap in endless mode
    
    const startX = 150; // Player start position
    const mapWidth = canvas.width - 100;
    const mapHeight = 20;
    const mapX = 50;
    const mapY = 15;
    
    ctx.save();
    
    // Minimap background
    ctx.fillStyle = 'rgba(30, 30, 40, 0.8)';
    ctx.strokeStyle = '#790ECB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapWidth, mapHeight, 5);
    ctx.fill();
    ctx.stroke();
    
    // Draw spikes on minimap
    ctx.fillStyle = '#ff1744';
    for (const spike of spikes) {
        const spikeMapX = mapX + (spike.x / levelEndX) * mapWidth;
        if (spikeMapX >= mapX && spikeMapX <= mapX + mapWidth) {
            ctx.fillRect(spikeMapX, mapY + 5, 2, mapHeight - 10);
        }
    }
    
    // Player position on minimap
    const playerMapX = mapX + (player.x / levelEndX) * mapWidth;
    ctx.fillStyle = '#790ECB';
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(playerMapX, mapY + mapHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Finish flag indicator
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(mapX + mapWidth - 5, mapY + 3);
    ctx.lineTo(mapX + mapWidth - 5, mapY + mapHeight - 3);
    ctx.lineTo(mapX + mapWidth - 12, mapY + 8);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
}

// Draw survival timer for Endless Mode
function drawSurvivalTimer() {
    if (gameMode !== GameMode.ENDLESS) return;
    
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Timer background
    ctx.fillStyle = 'rgba(30, 30, 40, 0.8)';
    ctx.beginPath();
    ctx.roundRect(canvas.width / 2 - 60, 10, 120, 40, 8);
    ctx.fill();
    
    // Timer text with glow
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#790ECB';
    ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
    ctx.fillText(formatTime(survivalTime), canvas.width / 2, 16);
    
    ctx.restore();
}

// Show difficulty level indicator
function showDifficultyIndicator(deltaTime) {
    if (gameMode !== GameMode.ENDLESS) return;
    if (difficultyIndicatorTime <= 0) return;
    
    difficultyIndicatorTime -= deltaTime;
    
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Fade out effect
    const alpha = Math.min(1, difficultyIndicatorTime / 0.5);
    ctx.globalAlpha = alpha;
    
    // Level text with glow
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Level ${currentDifficulty.level}`, canvas.width / 2, 80);
    
    ctx.restore();
}


// Create particle effect
function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1,
            color: color,
            size: Math.random() * 5 + 2
        });
    }
}

// Update and draw particles
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - cameraX, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Check collision between player and spike
function checkCollision(spike) {
    const playerScreenX = player.x;
    const playerRight = playerScreenX + player.width * 0.7;
    const playerLeft = playerScreenX + player.width * 0.3;
    const playerBottom = player.y + player.height;
    const playerTop = player.y + player.height * 0.3;
    
    // Triangle collision (simplified to bounding box with some tolerance)
    const spikeLeft = spike.x + 5;
    const spikeRight = spike.x + spike.width - 5;
    const spikeTop = spike.y - spike.height + 10;
    const spikeBottom = spike.y;
    
    return playerRight > spikeLeft && 
           playerLeft < spikeRight && 
           playerBottom > spikeTop && 
           playerTop < spikeBottom;
}

// Update player physics
function updatePlayer(deltaTime) {
    // Frame-rate independent multiplier (normalize to 60 FPS)
    const dtMultiplier = deltaTime * 60;
    
    // Variable jump - cut jump short if spacebar released early
    if (player.isJumping && !isHoldingJump && player.velocityY < -5) {
        player.velocityY = -5; // Cut upward momentum
    }
    
    // Store previous velocity for landing detection
    const prevVelocityY = player.velocityY;
    
    // Apply gravity (frame-rate independent)
    player.velocityY += GRAVITY * dtMultiplier;
    player.y += player.velocityY * dtMultiplier;
    
    // Ground collision
    if (player.y >= GROUND_Y - player.height) {
        player.y = GROUND_Y - player.height;
        
        // Trigger landing squash based on fall speed
        if (prevVelocityY > 5) {
            player.landingSquash = Math.min(0.4, prevVelocityY * 0.03);
        }
        
        player.velocityY = 0;
        player.isOnGround = true;
        player.isJumping = false;
    } else {
        player.isOnGround = false;
    }
    
    // Update squash/stretch animation
    // When jumping up: stretch vertically
    // When falling: stretch vertically  
    // When landing: squash (wide and short)
    // Smoothly return to normal
    
    if (player.landingSquash > 0) {
        // Landing squash - wide and short
        player.scaleX = 1 + player.landingSquash;
        player.scaleY = 1 - player.landingSquash * 0.8;
        player.landingSquash *= 0.8; // Decay the squash
        if (player.landingSquash < 0.01) player.landingSquash = 0;
    } else if (!player.isOnGround) {
        // In air - stretch based on velocity
        const stretchAmount = Math.abs(player.velocityY) * 0.015;
        player.scaleX = 1 - stretchAmount * 0.5;
        player.scaleY = 1 + stretchAmount;
    } else {
        // On ground - return to normal with slight bounce
        player.scaleX += (1 - player.scaleX) * 0.3;
        player.scaleY += (1 - player.scaleY) * 0.3;
    }
    
    // Move player forward
    if (gameMode === GameMode.STANDARD) {
        // In Standard Mode, sync position to music time for perfect drop sync
        // 4 pixels/frame * 60 frames/sec = 240 pixels/sec
        const pixelsPerSecond = SCROLL_SPEED * 60;
        const startX = 150;
        player.x = startX + (music.currentTime * pixelsPerSecond);
    } else {
        // Endless Mode uses frame-rate independent movement
        const scrollSpeed = currentDifficulty ? currentDifficulty.scrollSpeed : SCROLL_SPEED;
        player.x += scrollSpeed * dtMultiplier;
    }
}

// Update camera to follow player
function updateCamera() {
    // Camera follows player with offset
    const targetCameraX = player.x - 150;
    cameraX = targetCameraX;
}



// Main game loop
function gameLoop(timestamp) {
    if (gameState !== 'playing' || !gameLoopRunning) {
        gameLoopRunning = false;
        return;
    }
    
    // Calculate delta time
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // Update game time
    gameTime += deltaTime;
    
    // Endless Mode specific updates
    if (gameMode === GameMode.ENDLESS) {
        survivalTime += deltaTime;
        currentDifficulty = calculateDifficulty(survivalTime);
        
        // Check for difficulty level change
        if (currentDifficulty.level > lastDifficultyLevel) {
            lastDifficultyLevel = currentDifficulty.level;
            difficultyIndicatorTime = ENDLESS_CONFIG.difficultyIndicatorDuration;
        }
        
        // Generate and cleanup obstacles
        generateObstaclesAhead();
        cleanupObstaclesBehind();
    }
    
    // Update game objects (pass deltaTime for frame-rate independent movement)
    updatePlayer(deltaTime);
    updateCamera();
    
    // Check win condition (Standard Mode only - when player reaches the green flag)
    if (gameMode === GameMode.STANDARD && player.x >= levelEndX) {
        winGame();
        return;
    }
    
    // Check spike collisions
    for (const spike of spikes) {
        if (checkCollision(spike)) {
            gameOver();
            return;
        }
    }
    
    // Check if in victory lap (last 10% of level - no obstacles) - Standard Mode only
    const victoryLapStart = levelEndX * 0.9;
    const inVictoryLap = gameMode === GameMode.STANDARD && player.x >= victoryLapStart;
    
    // Launch fireworks during victory lap
    if (inVictoryLap && Math.random() < 0.1) {
        launchFirework();
    }
    
    // Apply screen shake
    ctx.save();
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake * 20;
        const shakeY = (Math.random() - 0.5) * screenShake * 20;
        ctx.translate(shakeX, shakeY);
    }
    
    // Draw everything
    drawBackground();
    
    // Draw BIG DROP extra effects
    if (bigDropIntensity > 0) {
        drawBigDropEffects();
    }
    
    // Draw fireworks behind everything during victory lap
    if (inVictoryLap) {
        updateFireworks();
    }
    
    drawGround();
    
    // Draw spikes
    for (const spike of spikes) {
        drawSpike(spike);
    }
    
    drawPlayer();
    updateParticles();
    
    // Restore from screen shake
    ctx.restore();
    
    // Draw HUD elements
    drawMinimap();
    drawSurvivalTimer();
    showDifficultyIndicator(deltaTime);
    
    // Continue loop
    requestAnimationFrame(gameLoop);
}

// Handle jump input
function jump() {
    if (player.isOnGround && !player.isJumping) {
        player.velocityY = JUMP_FORCE_MAX;
        player.isJumping = true;
        player.isOnGround = false;
        isHoldingJump = true;
        jumpStartTime = performance.now();
        createParticles(player.x + player.width / 2, player.y + player.height, '#790ECB', 10);
    }
}

// Release jump
function releaseJump() {
    isHoldingJump = false;
}

// Track if game loop is already running
let gameLoopRunning = false;

// Format time as MM:SS
function formatTime(seconds) {
    if (seconds < 0 || isNaN(seconds) || seconds === undefined) {
        seconds = 0;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get high score from localStorage
function getHighScore() {
    try {
        const stored = localStorage.getItem(ENDLESS_HIGH_SCORE_KEY);
        return stored ? parseFloat(stored) : 0;
    } catch (e) {
        return 0;
    }
}

// Save high score to localStorage
function saveHighScore(score) {
    try {
        const currentHighScore = getHighScore();
        if (score > currentHighScore) {
            localStorage.setItem(ENDLESS_HIGH_SCORE_KEY, score.toString());
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Start Standard Mode
function startStandardMode() {
    gameMode = GameMode.STANDARD;
    music.loop = false;
    startGame();
}

// Start Endless Mode
function startEndlessMode() {
    gameMode = GameMode.ENDLESS;
    music.loop = true;
    survivalTime = 0;
    currentDifficulty = calculateDifficulty(0);
    lastDifficultyLevel = 1;
    difficultyIndicatorTime = 0;
    endlessHighScore = getHighScore();
    lastGeneratedX = 0;
    startGame();
}

// Start game
function startGame() {
    // Prevent multiple game loops from running
    if (gameLoopRunning) {
        gameLoopRunning = false;
        // Wait a frame for the old loop to stop
        requestAnimationFrame(() => startGame());
        return;
    }
    
    gameState = 'playing';
    gameTime = 0;
    cameraX = 0;
    particles = [];
    fireworks = [];
    fireworkParticles = [];
    
    // Reset beat levels and drop effects
    bassLevel = 0;
    midLevel = 0;
    highLevel = 0;
    beatPulse = 0;
    dropIntensity = 0;
    bigDropIntensity = 0;
    screenShake = 0;
    flashScreen = 0;
    triggeredBigDrops = new Set();
    lastDropTime = -10;
    
    // Reset player
    player.x = 150;
    player.y = GROUND_Y - player.height;
    player.velocityY = 0;
    player.isJumping = false;
    player.isOnGround = true;
    isHoldingJump = false;
    
    // Generate level and background based on mode
    if (gameMode === GameMode.ENDLESS) {
        spikes = [];
        levelEndX = Infinity; // No end in endless mode
        lastGeneratedX = player.x + 200;
        // Reset endless mode state
        survivalTime = 0;
        currentDifficulty = calculateDifficulty(0);
        lastDifficultyLevel = 1;
        difficultyIndicatorTime = 0;
    } else {
        generateLevel();
    }
    generateBackground();
    
    // Start music - simple and reliable
    music.pause();
    music.currentTime = 0;
    music.play();
    
    // Hide overlays
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('winScreen').classList.add('hidden');
    document.getElementById('endlessGameOverScreen').classList.add('hidden');
    
    // Start game loop
    lastTime = performance.now();
    gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
}

// Game over
function gameOver() {
    gameState = 'gameover';
    gameLoopRunning = false;
    music.pause();
    createParticles(player.x, player.y + player.height / 2, '#ff1744', 30);
    
    if (gameMode === GameMode.ENDLESS) {
        // Endless Mode game over
        const isNewHighScore = saveHighScore(survivalTime);
        endlessHighScore = getHighScore();
        
        document.getElementById('endlessSurvivalTime').textContent = formatTime(survivalTime);
        document.getElementById('endlessHighScoreDisplay').textContent = formatTime(endlessHighScore);
        
        const newHighScoreIndicator = document.getElementById('newHighScoreIndicator');
        if (isNewHighScore) {
            newHighScoreIndicator.classList.remove('hidden');
        } else {
            newHighScoreIndicator.classList.add('hidden');
        }
        
        document.getElementById('endlessGameOverScreen').classList.remove('hidden');
    } else {
        // Standard Mode game over
        const percent = Math.floor((player.x / levelEndX) * 100);
        document.getElementById('gameOverPercent').textContent = `${percent}%`;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
}

// Win game
function winGame() {
    gameState = 'win';
    gameLoopRunning = false;
    music.pause();
    fireworks = [];
    fireworkParticles = [];
    winLoop();
}

// Firework colors
const fireworkColors = ['#790ECB', '#ff1744', '#00ff88', '#ffeb3b', '#00bcd4', '#ff9800'];

// Create a firework explosion
function createFirework(x, y) {
    const color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
    const particleCount = 30 + Math.floor(Math.random() * 20);
    
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 2 + Math.random() * 4;
        fireworkParticles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color: color,
            size: 3 + Math.random() * 3
        });
    }
}

// Launch a firework
function launchFirework() {
    fireworks.push({
        x: 100 + Math.random() * (canvas.width - 200),
        y: canvas.height,
        vy: -8 - Math.random() * 4,
        targetY: 80 + Math.random() * 150
    });
}

// Update and draw fireworks
function updateFireworks() {
    // Update rising fireworks
    for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        fw.y += fw.vy;
        
        // Draw trail
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 5;
        ctx.fillRect(fw.x - 2, fw.y, 4, 8);
        ctx.restore();
        
        // Explode when reaching target
        if (fw.y <= fw.targetY) {
            createFirework(fw.x, fw.y);
            fireworks.splice(i, 1);
        }
    }
    
    // Update exploded particles
    for (let i = fireworkParticles.length - 1; i >= 0; i--) {
        const p = fireworkParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.life -= 0.015;
        
        if (p.life <= 0) {
            fireworkParticles.splice(i, 1);
            continue;
        }
        
        // Draw pixelated particle (square instead of circle)
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        const size = Math.floor(p.size * p.life);
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), size, size);
        ctx.restore();
    }
}

// Draw win screen with fireworks
function drawWinScreen() {
    // Dark overlay
    ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update fireworks
    updateFireworks();
    
    // Draw "Congratulations 100%" text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Main text with glow
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#790ECB';
    ctx.font = 'bold 64px "Segoe UI", Arial, sans-serif';
    ctx.fillText('CONGRATULATIONS', canvas.width / 2, canvas.height / 2 - 40);
    
    // 100% text
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 80px "Segoe UI", Arial, sans-serif';
    ctx.fillText('100%', canvas.width / 2, canvas.height / 2 + 50);
    
    // Subtitle
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaa';
    ctx.font = '20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Press SPACE to play again', canvas.width / 2, canvas.height / 2 + 120);
    
    ctx.restore();
}

// Win animation loop
function winLoop() {
    if (gameState !== 'win') return;
    
    // Randomly launch fireworks
    if (Math.random() < 0.08) {
        launchFirework();
    }
    
    // Draw background
    drawBackground();
    drawGround();
    
    // Draw win screen with fireworks
    drawWinScreen();
    
    requestAnimationFrame(winLoop);
}

// Restart game
function restartGame() {
    startGame();
}

// Go to main menu
function goToMainMenu() {
    gameState = 'start';
    gameLoopRunning = false;
    music.pause();
    music.currentTime = 0;
    
    // Hide all overlays
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('winScreen').classList.add('hidden');
    document.getElementById('endlessGameOverScreen').classList.add('hidden');
    
    // Show start screen
    document.getElementById('startScreen').classList.remove('hidden');
    
    // Update skin selector
    updateSkinSelector();
}

// Show credits screen
function showCredits() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('creditsScreen').classList.remove('hidden');
}

// Hide credits screen
function hideCredits() {
    document.getElementById('creditsScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
}

// Input handling
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'playing') {
            jump();
        } else if (gameState === 'start') {
            startGame();
        } else if (gameState === 'gameover' || gameState === 'win') {
            restartGame();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        releaseJump();
    }
});

// Touch support for mobile
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameState === 'playing') {
        jump();
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    releaseJump();
});

// ============================================
// Secret Menu System
// ============================================

// Import cheat code functions (these are defined in game-logic.js but we need local versions for browser)
// Active codes state (session-based, cleared on page refresh)
let activeCodes = new Set();

// Unlocked skins (persists in session, tracks all skins player has unlocked)
let unlockedSkins = new Set();
// Currently selected skin (null = default Kiro logo)
let selectedSkin = null;

// Secret menu animation state
let secretMenuAnimationId = null;
let secretMenuShapes = [];

// Kiro brand colors for secret menu
const SECRET_MENU_COLORS = ['#790ECB', '#ff1744', '#00bcd4'];

// Parallax layer configuration: far (slow), mid, near (fast)
const PARALLAX_LAYERS = [
    { speed: 0.2, alpha: 0.08, sizeMultiplier: 0.6 },  // Far layer - slow, faint, small
    { speed: 0.5, alpha: 0.12, sizeMultiplier: 1.0 },  // Mid layer - medium
    { speed: 0.9, alpha: 0.18, sizeMultiplier: 1.4 }   // Near layer - fast, bright, large
];

// Initialize secret menu background shapes with parallax layers
function initSecretMenuShapes() {
    secretMenuShapes = [];
    const shapesPerLayer = 12;
    
    for (let layer = 0; layer < PARALLAX_LAYERS.length; layer++) {
        const layerConfig = PARALLAX_LAYERS[layer];
        
        for (let i = 0; i < shapesPerLayer; i++) {
            const baseSize = 20 + Math.random() * 50;
            secretMenuShapes.push({
                x: Math.random() * 900,
                y: Math.random() * 500,
                size: baseSize * layerConfig.sizeMultiplier,
                type: Math.floor(Math.random() * 4), // 0: circle, 1: square, 2: triangle, 3: diamond
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.015 * (layer + 1),
                floatOffset: Math.random() * Math.PI * 2,
                floatSpeed: 0.3 + Math.random() * 0.8,
                floatAmount: 8 + Math.random() * 20,
                colorIndex: Math.floor(Math.random() * 3),
                layer: layer,
                // Parallax velocity based on layer
                vx: (Math.random() - 0.5) * layerConfig.speed,
                vy: (Math.random() - 0.5) * layerConfig.speed * 0.5,
                // Individual breathing phase offset
                breatheOffset: Math.random() * Math.PI * 2,
                breatheSpeed: 0.8 + Math.random() * 0.6
            });
        }
    }
}

// Secret menu background animation with pulsing/breathing and parallax
function animateSecretMenuBackground() {
    const secretCanvas = document.getElementById('secretMenuCanvas');
    if (!secretCanvas) return;
    
    const secretCtx = secretCanvas.getContext('2d');
    secretCanvas.width = 900;
    secretCanvas.height = 500;
    
    let time = 0;
    
    function draw() {
        time += 0.016; // ~60fps
        
        // Clear with dark background
        secretCtx.fillStyle = '#0a0a0f';
        secretCtx.fillRect(0, 0, secretCanvas.width, secretCanvas.height);
        
        // Global breathing effect - affects overall scene intensity
        const globalBreath = Math.sin(time * 1.2) * 0.15 + 0.85;
        
        // Draw large pulsing background circles (breathing effect)
        for (let i = 0; i < 4; i++) {
            // Breathing pulse - smooth sine wave
            const breathe = Math.sin(time * 1.5 + i * 1.5) * 0.5 + 0.5;
            const size = 80 + breathe * 120 + i * 50;
            const x = (secretCanvas.width * (i + 1) / 5) + Math.sin(time * 0.4 + i) * 60;
            const y = secretCanvas.height / 2 + Math.cos(time * 0.25 + i * 0.8) * 40;
            
            secretCtx.save();
            // Alpha also breathes
            secretCtx.globalAlpha = (0.06 + breathe * 0.06) * globalBreath;
            secretCtx.fillStyle = SECRET_MENU_COLORS[i % SECRET_MENU_COLORS.length];
            secretCtx.beginPath();
            secretCtx.arc(x, y, size, 0, Math.PI * 2);
            secretCtx.fill();
            secretCtx.restore();
        }
        
        // Draw floating shapes by layer (far to near for proper depth)
        for (let layerIndex = 0; layerIndex < PARALLAX_LAYERS.length; layerIndex++) {
            const layerConfig = PARALLAX_LAYERS[layerIndex];
            
            for (const shape of secretMenuShapes) {
                if (shape.layer !== layerIndex) continue;
                
                // Update position with parallax movement
                shape.x += shape.vx;
                shape.y += shape.vy;
                
                // Wrap around screen
                if (shape.x < -shape.size) shape.x = secretCanvas.width + shape.size;
                if (shape.x > secretCanvas.width + shape.size) shape.x = -shape.size;
                if (shape.y < -shape.size) shape.y = secretCanvas.height + shape.size;
                if (shape.y > secretCanvas.height + shape.size) shape.y = -shape.size;
                
                // Floating animation (vertical bob)
                const floatY = shape.y + Math.sin(time * shape.floatSpeed + shape.floatOffset) * shape.floatAmount;
                
                // Update rotation
                shape.rotation += shape.rotationSpeed;
                
                // Individual breathing/pulsing scale effect
                const breatheScale = 1 + Math.sin(time * shape.breatheSpeed + shape.breatheOffset) * 0.2;
                
                // Alpha also pulses with breathing
                const breatheAlpha = layerConfig.alpha * (0.7 + Math.sin(time * shape.breatheSpeed + shape.breatheOffset) * 0.3);
                
                secretCtx.save();
                secretCtx.translate(shape.x, floatY);
                secretCtx.rotate(shape.rotation);
                secretCtx.scale(breatheScale, breatheScale);
                secretCtx.globalAlpha = breatheAlpha * globalBreath;
                secretCtx.fillStyle = SECRET_MENU_COLORS[shape.colorIndex];
                
                // Draw shape based on type
                switch (shape.type) {
                    case 0: // Circle
                        secretCtx.beginPath();
                        secretCtx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
                        secretCtx.fill();
                        break;
                    case 1: // Square
                        secretCtx.fillRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
                        break;
                    case 2: // Triangle
                        secretCtx.beginPath();
                        secretCtx.moveTo(0, -shape.size / 2);
                        secretCtx.lineTo(shape.size / 2, shape.size / 2);
                        secretCtx.lineTo(-shape.size / 2, shape.size / 2);
                        secretCtx.closePath();
                        secretCtx.fill();
                        break;
                    case 3: // Diamond
                        secretCtx.beginPath();
                        secretCtx.moveTo(0, -shape.size / 2);
                        secretCtx.lineTo(shape.size / 2, 0);
                        secretCtx.lineTo(0, shape.size / 2);
                        secretCtx.lineTo(-shape.size / 2, 0);
                        secretCtx.closePath();
                        secretCtx.fill();
                        break;
                }
                
                secretCtx.restore();
            }
        }
        
        // Add subtle glow rings that pulse outward
        const ringCount = 3;
        for (let i = 0; i < ringCount; i++) {
            const ringPhase = (time * 0.5 + i * 0.33) % 1;
            const ringSize = ringPhase * 300;
            const ringAlpha = (1 - ringPhase) * 0.08 * globalBreath;
            
            secretCtx.save();
            secretCtx.strokeStyle = SECRET_MENU_COLORS[i % SECRET_MENU_COLORS.length];
            secretCtx.lineWidth = 2;
            secretCtx.globalAlpha = ringAlpha;
            secretCtx.beginPath();
            secretCtx.arc(secretCanvas.width / 2, secretCanvas.height / 2, ringSize, 0, Math.PI * 2);
            secretCtx.stroke();
            secretCtx.restore();
        }
        
        secretMenuAnimationId = requestAnimationFrame(draw);
    }
    
    draw();
}

// Stop secret menu background animation
function stopSecretMenuAnimation() {
    if (secretMenuAnimationId) {
        cancelAnimationFrame(secretMenuAnimationId);
        secretMenuAnimationId = null;
    }
}

// Show secret menu
function showSecretMenu() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('secretMenuScreen').classList.remove('hidden');
    
    // Initialize and start background animation
    initSecretMenuShapes();
    animateSecretMenuBackground();
    
    // Focus the input field
    const input = document.getElementById('secretCodeInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    
    // Update active codes display
    updateActiveCodesDisplay();
}

// Hide secret menu
function hideSecretMenu() {
    document.getElementById('secretMenuScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    
    // Stop background animation
    stopSecretMenuAnimation();
    
    // Update skin selector on start screen
    updateSkinSelector();
}

// Update the active codes display (shows unlocked skins)
function updateActiveCodesDisplay() {
    const listElement = document.getElementById('activeCodesList');
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    if (unlockedSkins.size === 0) {
        listElement.innerHTML = '<span style="color: #666; font-size: 12px;">No skins unlocked</span>';
        return;
    }
    
    for (const code of unlockedSkins) {
        const codeInfo = CHEAT_CODES[code];
        if (codeInfo) {
            const tag = document.createElement('span');
            tag.className = 'active-code-tag';
            tag.textContent = codeInfo.name;
            listElement.appendChild(tag);
        }
    }
}

// Handle code entry
function handleCodeEntry(inputValue) {
    const feedbackElement = document.getElementById('secretCodeFeedback');
    const inputElement = document.getElementById('secretCodeInput');
    
    if (!inputValue || inputValue.trim() === '') {
        feedbackElement.textContent = 'Please enter a code';
        feedbackElement.className = 'error';
        return;
    }
    
    const normalizedCode = inputValue.toLowerCase().trim();
    
    if (!isValidCheatCode(normalizedCode)) {
        feedbackElement.textContent = 'Invalid code';
        feedbackElement.className = 'error';
        // Shake animation on input
        inputElement.style.animation = 'none';
        inputElement.offsetHeight; // Trigger reflow
        inputElement.style.animation = 'shake 0.3s ease';
    } else {
        const codeInfo = CHEAT_CODES[normalizedCode];
        
        // Check if already unlocked
        if (unlockedSkins.has(normalizedCode)) {
            feedbackElement.textContent = `${codeInfo.name} already unlocked!`;
            feedbackElement.className = 'error';
        } else {
            // Unlock the skin
            unlockedSkins.add(normalizedCode);
            // Also set it as the selected skin
            selectedSkin = codeInfo.effect;
            feedbackElement.textContent = `${codeInfo.name} unlocked!`;
            feedbackElement.className = 'success';
            // Update the skin selector on start screen
            updateSkinSelector();
        }
    }
    
    // Clear input
    inputElement.value = '';
    
    // Update active codes display
    updateActiveCodesDisplay();
}

// Local versions of cheat code functions (for browser use)
const CHEAT_CODES = {
    '12x5v2': { name: 'Lion', effect: 'skin_lion', type: 'skin' },
    'ts2': { name: 'T-Rex', effect: 'skin_trex', type: 'skin' },
    'pillow': { name: 'Gray Cat', effect: 'skin_graycat', type: 'skin' },
    'moony': { name: 'Black Cat', effect: 'skin_blackcat', type: 'skin' },
    'elbow': { name: 'Orange Cat', effect: 'skin_orangecat', type: 'skin' },
    '772517': { name: 'Dog', effect: 'skin_dog', type: 'skin' },
    '39213': { name: 'Penguin', effect: 'skin_penguin', type: 'skin' }
};

function isValidCheatCode(code) {
    if (typeof code !== 'string') return false;
    const normalizedCode = code.toLowerCase().trim();
    return normalizedCode in CHEAT_CODES;
}

function toggleCheatCode(code, activeCodesSet) {
    const normalizedCode = typeof code === 'string' ? code.toLowerCase().trim() : '';
    
    if (!isValidCheatCode(normalizedCode)) {
        return { activeCodes: new Set(activeCodesSet), activated: false, valid: false };
    }
    
    const newActiveCodes = new Set(activeCodesSet);
    const codeInfo = CHEAT_CODES[normalizedCode];
    
    if (newActiveCodes.has(normalizedCode)) {
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
    
    newActiveCodes.add(normalizedCode);
    return { activeCodes: newActiveCodes, activated: true, valid: true };
}

function getActiveSkin() {
    return selectedSkin;
}

// Skin drawing functions map for selector
const SKIN_DRAW_FUNCTIONS = {
    'skin_lion': drawLionSkin,
    'skin_trex': drawTRexSkin,
    'skin_graycat': drawGrayCatSkin,
    'skin_blackcat': drawBlackCatSkin,
    'skin_orangecat': drawOrangeCatSkin,
    'skin_dog': drawDogSkin,
    'skin_penguin': drawPenguinSkin
};

// Update the skin selector on the start screen
function updateSkinSelector() {
    const selectorContainer = document.getElementById('skinSelector');
    const optionsContainer = document.getElementById('skinOptions');
    
    if (!selectorContainer || !optionsContainer) return;
    
    // Only show if more than 1 skin is unlocked (so player has a choice)
    if (unlockedSkins.size < 1) {
        selectorContainer.classList.add('hidden');
        return;
    }
    
    selectorContainer.classList.remove('hidden');
    optionsContainer.innerHTML = '';
    
    // Add default Kiro option
    const defaultOption = createSkinOption(null, 'Kiro');
    optionsContainer.appendChild(defaultOption);
    
    // Add unlocked skins
    for (const code of unlockedSkins) {
        const codeInfo = CHEAT_CODES[code];
        if (codeInfo) {
            const option = createSkinOption(codeInfo.effect, codeInfo.name);
            optionsContainer.appendChild(option);
        }
    }
}

// Create a skin option element
function createSkinOption(skinEffect, name) {
    const option = document.createElement('div');
    option.className = 'skin-option';
    if (selectedSkin === skinEffect) {
        option.classList.add('selected');
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    
    if (skinEffect === null) {
        // Draw Kiro logo
        const kiroImg = new Image();
        kiroImg.src = 'kiro-logo.png';
        kiroImg.onload = () => {
            ctx.drawImage(kiroImg, 0, 0, 50, 50);
        };
        // Draw placeholder while loading
        ctx.fillStyle = '#790ECB';
        ctx.beginPath();
        ctx.arc(25, 25, 20, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Draw the skin
        const drawFn = SKIN_DRAW_FUNCTIONS[skinEffect];
        if (drawFn) {
            drawFn(ctx, 0, 0, 50, 50, 1, 1);
        }
    }
    
    option.appendChild(canvas);
    
    const nameLabel = document.createElement('span');
    nameLabel.className = 'skin-option-name';
    nameLabel.textContent = name;
    option.appendChild(nameLabel);
    
    option.addEventListener('click', () => {
        selectedSkin = skinEffect;
        updateSkinSelector();
    });
    
    return option;
}

// Set up secret menu event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Click handler for "beat" trigger
    const secretTrigger = document.getElementById('secretTrigger');
    if (secretTrigger) {
        secretTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            showSecretMenu();
        });
    }
    
    // Back button handler
    const backButton = document.getElementById('secretMenuBack');
    if (backButton) {
        backButton.addEventListener('click', () => {
            hideSecretMenu();
        });
    }
    
    // Code input handler
    const codeInput = document.getElementById('secretCodeInput');
    if (codeInput) {
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCodeEntry(codeInput.value);
            }
        });
    }
});

// ESC key handler for secret menu (add to existing keydown listener)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        const secretMenu = document.getElementById('secretMenuScreen');
        if (secretMenu && !secretMenu.classList.contains('hidden')) {
            hideSecretMenu();
        }
    }
});

// Initial draw
drawBackground();
drawGround();
