// --- Setup ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const stageDisplay = document.getElementById('stage');

// --- Menu References ---
const mainMenu = document.getElementById('main-menu');
const startButton = document.getElementById('start-button');
const exitSuiteButton = document.getElementById('exit-suite-button');
const gameInfoDisplay = document.getElementById('game-info');
const gameOverMenu = document.getElementById('game-over-menu');
const finalScoreDisplay = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const gameOverExitButton = document.getElementById('game-over-exit-button');
const pauseMenu = document.getElementById('pause-menu');
const pauseResumeButton = document.getElementById('pause-resume-button');
const pauseExitButton = document.getElementById('pause-exit-button');

const width = 1200;
const height = 800;
canvas.width = width;
canvas.height = height;

const GRID_SIZE = 20; // Size of snake/food/grid squares

// --- Game State ---
let score = 0;
let stage = 1;
let gameSpeed = 10; // Updates per second
let lastTimestamp = 0;
let timeSinceLastUpdate = 0;
let gameOver = false;
let paused = false; // Add paused state
let gameStarted = false; // New flag
let gameObjects = []; // Array to hold snake, food, enemies

// --- Asset Loading ---
const assets = {
    background: new Image(),
    food: new Image(),
    menuBackground: new Image() // Add menu background asset
};
let assetsLoaded = 0;
const totalAssets = Object.keys(assets).length;
let allAssetsLoaded = false;

assets.background.onload = assetLoaded;
assets.food.onload = assetLoaded;
assets.menuBackground.onload = assetLoaded; // Add onload handler

assets.background.src = 'background.png';
assets.food.src = 'food.png';
assets.menuBackground.src = 'menu_background.png'; // Add src

// --- Audio Loading ---
const menuMusic = new Audio('menu_music.mp3');
menuMusic.loop = true;
menuMusic.volume = 0.5;

const gameMusic = new Audio('8bit_goodness.mp3');
gameMusic.loop = true;
gameMusic.volume = 0.5;

let canPlayAudio = false; // Needs user interaction

function enableAudio() {
    if (!canPlayAudio) {
        canPlayAudio = true;
        console.log("Audio interaction detected. canPlayAudio set to true.");
        // If menu should be playing, start it
        if (!gameStarted) {
            console.log("Attempting to play menu music from enableAudio.");
            playMenuMusic();
        }
    }
    document.removeEventListener('click', enableAudio);
    document.removeEventListener('keydown', enableAudio);
}
document.addEventListener('click', enableAudio);
document.addEventListener('keydown', enableAudio);

// --- Audio Control Functions ---
function playMenuMusic() {
    console.log("playMenuMusic called. canPlayAudio:", canPlayAudio);
    if (!canPlayAudio) return;
    gameMusic.pause();
    gameMusic.currentTime = 0;
    menuMusic.play().catch(e => console.warn("Menu music failed:", e));
}

function playGameMusic() {
    if (!canPlayAudio) return;
    menuMusic.pause();
    menuMusic.currentTime = 0;
    gameMusic.play().catch(e => console.warn("Game music failed:", e));
}

function pauseAllMusic() {
    if (menuMusic && !menuMusic.paused) menuMusic.pause();
    if (gameMusic && !gameMusic.paused) gameMusic.pause();
}

function resumeCurrentMusic() {
    if (!canPlayAudio) return;
    if (gameStarted && !gameOver && gameMusic && gameMusic.paused) {
        gameMusic.play().catch(e => console.warn("Resume game music failed:", e));
    } else if (!gameStarted && menuMusic && menuMusic.paused) {
        menuMusic.play().catch(e => console.warn("Resume menu music failed:", e));
    }
}

function stopAllMusic() {
    if (menuMusic) { menuMusic.pause(); menuMusic.currentTime = 0; }
    if (gameMusic) { gameMusic.pause(); gameMusic.currentTime = 0; }
}

// --- Snake Class ---
class Snake {
    constructor(startX = 100, startY = 100, color = '#0f0') {
        this.body = [
            { x: startX, y: startY },
            { x: startX - GRID_SIZE, y: startY },
            { x: startX - (GRID_SIZE * 2), y: startY },
        ];
        this.direction = "RIGHT";
        this.pendingDirection = "RIGHT";
        this.color = color;
        this.justAte = false; // Flag to handle growth
    }

    changeDir(newDirection) {
        if (newDirection === "UP" && this.direction !== "DOWN") this.pendingDirection = newDirection;
        else if (newDirection === "DOWN" && this.direction !== "UP") this.pendingDirection = newDirection;
        else if (newDirection === "LEFT" && this.direction !== "RIGHT") this.pendingDirection = newDirection;
        else if (newDirection === "RIGHT" && this.direction !== "LEFT") this.pendingDirection = newDirection;
    }

    update() {
        this.direction = this.pendingDirection;
        const head = { ...this.body[0] }; // New head position based on current head

        switch (this.direction) {
            case "UP":    head.y -= GRID_SIZE; break;
            case "DOWN":  head.y += GRID_SIZE; break;
            case "LEFT":  head.x -= GRID_SIZE; break;
            case "RIGHT": head.x += GRID_SIZE; break;
        }

        // Boundary Wrapping
        if (head.x < 0) head.x = width - GRID_SIZE;
        else if (head.x >= width) head.x = 0;
        if (head.y < 0) head.y = height - GRID_SIZE;
        else if (head.y >= height) head.y = 0;

        this.body.unshift(head); // Add new head

        if (this.justAte) {
            this.justAte = false; // Reset flag, don't remove tail
        } else {
            this.body.pop(); // Remove tail if not growing
        }
    }

    grow() {
        this.justAte = true; // Set flag, tail won't be popped on next update
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        this.body.forEach(segment => {
            ctx.fillRect(segment.x, segment.y, GRID_SIZE, GRID_SIZE);
        });
    }

    checkSelfCollision() {
        const head = this.body[0];
        for (let i = 1; i < this.body.length; i++) {
            if (this.body[i].x === head.x && this.body[i].y === head.y) {
                return true;
            }
        }
        return false;
    }
}

// --- Food Class ---
class Food {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.sprite = assets.food;
        this.size = GRID_SIZE; // Match grid size
        this.spawn(); // Initial spawn
    }

    spawn(snakeBody = []) { // Accept snake body to avoid overlap
        let overlaps;
        do {
            overlaps = false;
            this.x = Math.floor(Math.random() * (width / GRID_SIZE)) * GRID_SIZE;
            this.y = Math.floor(Math.random() * (height / GRID_SIZE)) * GRID_SIZE;
            // Check against snake body
            for (const segment of snakeBody) {
                if (segment.x === this.x && segment.y === this.y) {
                    overlaps = true;
                    break;
                }
            }
        } while (overlaps);
    }

    draw(ctx) {
        if (this.sprite.complete && this.sprite.naturalWidth > 0) {
            ctx.drawImage(this.sprite, this.x, this.y, this.size, this.size);
        } else {
            ctx.fillStyle = 'red'; // Fallback color
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
    }

    // Food doesn't update itself, its state changes on spawn
    update() {}
}

// --- Drawing Functions ---
function drawBackground() {
    if (!assets.background.complete || assets.background.naturalWidth === 0) return;
    // Draw tiled background
    const pattern = ctx.createPattern(assets.background, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
}

function drawGameObjects() {
    gameObjects.forEach(obj => obj.draw(ctx));
}

function updateUI() {
    scoreDisplay.textContent = score;
    stageDisplay.textContent = stage;
}

// --- Game Logic Functions ---
function updateGameObjects() {
    gameObjects.forEach(obj => obj.update());
}

// Modify setupGame
function setupGame() {
    console.log("Setting up game...");
    score = 0;
    stage = 1;
    gameSpeed = 10; // Reset speed
    gameOver = false;
    paused = false;
    gameStarted = true; // Set flag
    gameObjects = [];

    const snake = new Snake();
    gameObjects.push(snake);

    const food = new Food();
    food.spawn(snake.body);
    gameObjects.push(food);

    updateUI();

    // Show game info, hide main menu
    gameInfoDisplay.classList.remove('hidden');
    mainMenu.classList.add('hidden');

    // Reset timers for game loop
    lastTimestamp = performance.now();
    timeSinceLastUpdate = 0;

    playGameMusic(); // Start game music
}

// --- Game Loop ---
function gameLoop(timestamp) {
    if (!allAssetsLoaded) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Only run game logic/drawing if game has started
    if (!gameStarted) {
        // Potentially draw a static menu background if desired, but HTML handles menu
        requestAnimationFrame(gameLoop);
        return;
    }

    // Skip update and drawing if paused
    if (paused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    timeSinceLastUpdate += deltaTime;

    const updateInterval = 1000 / gameSpeed; // Time between updates in ms

    if (timeSinceLastUpdate >= updateInterval) {
        // --- Update Logic ---
        if (!gameOver) {
            updateGameObjects();
            checkCollisions(); // Check collisions after updates
        }
        timeSinceLastUpdate -= updateInterval;
    }

    // --- Drawing ---
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    drawGameObjects();
    updateUI();

    requestAnimationFrame(gameLoop);
}

// --- Check Collisions Function ---
function checkCollisions() {
    const snake = gameObjects.find(obj => obj instanceof Snake);
    const food = gameObjects.find(obj => obj instanceof Food);

    if (!snake || !food) return; // Should not happen

    const head = snake.body[0];

    // Snake eating Food
    if (head.x === food.x && head.y === food.y) {
        snake.grow();
        food.spawn(snake.body);
        score++;
        // Stage progression (simple)
        if (score > 0 && score % 5 === 0) {
            stage++;
            gameSpeed += 1; // Increase speed slightly per stage
        }
        updateUI();
    }

    // Snake hitting Self
    if (snake.checkSelfCollision()) {
        gameOver = true;
        stopAllMusic(); // Stop music on game over
        showGameOverMenu(); // Show the game over menu
        console.log("Game Over! Score:", score); // Keep log for confirmation
    }

    // Snake hitting Enemy (later)
}

// --- Input Handling ---
function handleKeyDown(event) {
    console.log("Key pressed:", event.key);
    if (event.key === 'Escape') {
        if (gameStarted && !gameOver) {
            paused = !paused;
            console.log(paused ? "Game Paused" : "Game Resumed");
            if (paused) {
                pauseAllMusic();
                // Show pause menu (using direct class manipulation)
                pauseMenu.classList.remove('hidden');
                gameInfoDisplay.classList.add('hidden'); // Hide score overlay
            } else {
                // Hide pause menu
                pauseMenu.classList.add('hidden');
                gameInfoDisplay.classList.remove('hidden'); // Show score overlay
                resumeCurrentMusic();
                lastTimestamp = performance.now();
                requestAnimationFrame(gameLoop);
            }
        }
        return;
    }

    const snake = gameObjects.find(obj => obj instanceof Snake);
    if (!snake || gameOver || paused) return; // Ignore movement if paused

    // Handle direction changes
    switch (event.key) {
        case 'ArrowUp':
        case 'w':
            snake.changeDir('UP');
            break;
        case 'ArrowDown':
        case 's':
            snake.changeDir('DOWN');
            break;
        case 'ArrowLeft':
        case 'a':
            snake.changeDir('LEFT');
            break;
        case 'ArrowRight':
        case 'd':
            snake.changeDir('RIGHT');
            break;
    }
}

document.addEventListener('keydown', handleKeyDown);

// --- Initialization & Menu Buttons ---
function assetLoaded() {
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        allAssetsLoaded = true;
        console.log("Snake assets loaded.");
        requestAnimationFrame(gameLoop);
    }
}

startButton.addEventListener('click', setupGame);

exitSuiteButton.addEventListener('click', () => {
    stopAllMusic(); // Stop music before leaving
    window.location.href = '../../index.html';
});

// --- Menu/UI Functions ---
function showGameOverMenu() {
    finalScoreDisplay.textContent = score;
    gameInfoDisplay.classList.add('hidden'); // Hide score overlay
    gameOverMenu.classList.remove('hidden');
    // No need to call showMenu here, as we handle visibility directly
}

// Add this function if it doesn't exist from previous attempts
function showMenu(menuId) {
    // Basic helper to show one menu and hide others (can be expanded)
    mainMenu.classList.add('hidden');
    gameOverMenu.classList.add('hidden');
    // ... hide other future menus
    gameInfoDisplay.classList.add('hidden');

    const menuToShow = document.getElementById(menuId);
    if (menuToShow) {
        menuToShow.classList.remove('hidden');
    }
}

// Add listeners for Game Over menu buttons
restartButton.addEventListener('click', () => {
    gameOverMenu.classList.add('hidden'); // Hide game over menu
    setupGame(); // Restart
});

gameOverExitButton.addEventListener('click', () => {
    gameOver = false; // Reset flag
    gameStarted = false;
    gameOverMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden'); // Show main menu
    playMenuMusic(); // Play menu music
});

// Add listeners for Pause Menu Buttons
pauseResumeButton.addEventListener('click', () => {
    paused = false;
    pauseMenu.classList.add('hidden');
    gameInfoDisplay.classList.remove('hidden');
    resumeCurrentMusic();
    lastTimestamp = performance.now();
    requestAnimationFrame(gameLoop); // Re-enter active loop
});

pauseExitButton.addEventListener('click', () => {
    paused = false; // Ensure unpaused
    gameStarted = false; // Go back to menu state
    stopAllMusic();
    pauseMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    playMenuMusic();
});

console.log("Initializing Snake v2...");
// Loop starts after assets load 