// Just Shapes and Kiro - Game Engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const GAME_DURATION = 72; // Song length in seconds
const SCROLL_SPEED = 4;
const GRAVITY = 0.4;
const JUMP_FORCE_MIN = -10; // Short hop
const JUMP_FORCE_MAX = -17; // Full jump
const JUMP_HOLD_TIME = 150; // ms to reach full jump
const GROUND_Y = canvas.height - 80;
const PLAYER_SIZE = 50;

// Audio system
const music = new Audio('music.mp3');
music.loop = false;

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
    isOnGround: true
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
    const obstacleEndX = startX + (levelEndX - startX) * 0.7; // Obstacles cover 70% of course
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

// Draw player (Kiro logo)
function drawPlayer() {
    const screenX = player.x - cameraX;
    
    ctx.save();
    
    // Glow effect around player
    ctx.shadowColor = '#790ECB';
    ctx.shadowBlur = 20;
    
    if (logoLoaded) {
        ctx.drawImage(kiroLogo, screenX, player.y, player.width, player.height);
    } else {
        // Fallback: draw a purple square
        ctx.fillStyle = '#790ECB';
        ctx.fillRect(screenX, player.y, player.width, player.height);
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
    const palette = getCurrentPalette();
    const bgColor = lerpColor(palette.current.bg, palette.next.bg, palette.blend);
    
    // Fill background with transitioning color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw vertical stripes (darker bands)
    for (const stripe of bgStripes) {
        const pulseAmount = Math.sin(gameTime * stripe.speed + stripe.offset) * 0.1;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + pulseAmount})`;
        ctx.fillRect(stripe.x, 0, stripe.width, canvas.height);
    }
    
    // Draw floating shapes by layer (far to near)
    for (let layer = 0; layer < 3; layer++) {
        const parallaxSpeed = 0.3 + layer * 0.25;
        const alpha = 0.15 + layer * 0.1;
        
        for (const shape of bgShapes) {
            if (shape.layer !== layer) continue;
            
            const screenX = shape.x - cameraX * parallaxSpeed;
            
            // Skip if off screen
            if (screenX < -shape.size * 2 || screenX > canvas.width + shape.size * 2) continue;
            
            // Floating animation
            const floatY = shape.y + Math.sin(gameTime * shape.floatSpeed + shape.floatOffset) * shape.floatAmount;
            
            // Update rotation
            shape.rotation += shape.rotationSpeed;
            
            // Get color from current palette
            const shapeColor = palette.current.shapes[shape.colorIndex];
            
            ctx.save();
            ctx.translate(screenX, floatY);
            ctx.rotate(shape.rotation);
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
    
    // Add some pulsing circles in the background (like in JSAB)
    const pulseTime = gameTime * 2;
    const accentColor = lerpColor(palette.current.accent, palette.next.accent, palette.blend);
    for (let i = 0; i < 3; i++) {
        const pulse = Math.sin(pulseTime + i * 2) * 0.5 + 0.5;
        const size = 100 + pulse * 150 + i * 80;
        const x = (canvas.width * (i + 1) / 4) + Math.sin(gameTime * 0.5 + i) * 50;
        const y = GROUND_Y - 150 + Math.cos(gameTime * 0.3 + i) * 30;
        
        ctx.save();
        ctx.globalAlpha = 0.08 - i * 0.02;
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Draw minimap at top of screen
function drawMinimap() {
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
function updatePlayer() {
    // Variable jump - cut jump short if spacebar released early
    if (player.isJumping && !isHoldingJump && player.velocityY < -5) {
        player.velocityY = -5; // Cut upward momentum
    }
    
    // Apply gravity
    player.velocityY += GRAVITY;
    player.y += player.velocityY;
    
    // Ground collision
    if (player.y >= GROUND_Y - player.height) {
        player.y = GROUND_Y - player.height;
        player.velocityY = 0;
        player.isOnGround = true;
        player.isJumping = false;
    } else {
        player.isOnGround = false;
    }
    
    // Move player forward with camera
    player.x += SCROLL_SPEED;
}

// Update camera to follow player
function updateCamera() {
    // Camera follows player with offset
    const targetCameraX = player.x - 150;
    cameraX = targetCameraX;
}



// Main game loop
function gameLoop(timestamp) {
    if (gameState !== 'playing') return;
    
    // Calculate delta time
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // Update game time
    gameTime += deltaTime;
    
    // Update game objects
    updatePlayer();
    updateCamera();
    
    // Check win condition (position-based - when player reaches the green flag)
    if (player.x >= levelEndX) {
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
    
    // Check if in victory lap (last 30% of level - no obstacles)
    const victoryLapStart = levelEndX * 0.7;
    const inVictoryLap = player.x >= victoryLapStart;
    
    // Launch fireworks during victory lap
    if (inVictoryLap && Math.random() < 0.1) {
        launchFirework();
    }
    
    // Draw everything
    drawBackground();
    
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
    drawMinimap();
    
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

// Start game
function startGame() {
    gameState = 'playing';
    gameTime = 0;
    cameraX = 0;
    particles = [];
    fireworks = [];
    fireworkParticles = [];
    
    // Reset player
    player.x = 150;
    player.y = GROUND_Y - player.height;
    player.velocityY = 0;
    player.isJumping = false;
    player.isOnGround = true;
    
    // Generate level and background
    generateLevel();
    generateBackground();
    
    // Start music
    music.currentTime = 0;
    music.play().catch(e => console.log('Audio play failed:', e));
    
    // Hide overlays
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('winScreen').classList.add('hidden');
    
    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Game over
function gameOver() {
    gameState = 'gameover';
    music.pause();
    createParticles(player.x, player.y + player.height / 2, '#ff1744', 30);
    const percent = Math.floor((player.x / levelEndX) * 100);
    document.getElementById('gameOverPercent').textContent = `${percent}%`;
    document.getElementById('gameOverScreen').classList.remove('hidden');
}

// Win game
function winGame() {
    gameState = 'win';
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

// Initial draw
drawBackground();
drawGround();
