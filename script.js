const canvas = document.getElementById('tetris-board');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // Size of each block in pixels (Increased)
const NEXT_COLS = 4;
const NEXT_ROWS = 4;
const NEXT_BLOCK_SIZE = 20; // Keep next piece preview smaller

// Colors for the Tetrominoes (Can be refined later for aesthetics)
const COLORS = [
    null, // 0 is empty
    '#FF0D72', // I - Cyan (using a vibrant pink instead)
    '#0DC2FF', // L - Blue (using a vibrant blue)
    '#0DFF72', // J - Orange (using a vibrant green)
    '#F538FF', // T - Purple (using a vibrant magenta)
    '#FF8E0D', // S - Green (using a vibrant orange)
    '#FFE138', // Z - Red (using a vibrant yellow)
    '#3877FF'  // O - Yellow (using a different blue for contrast)
];

// Tetromino shapes represented by 2D arrays
const SHAPES = [
    [], // Empty shape
    [[1, 1, 1, 1]], // I
    [[2, 0, 0], [2, 2, 2]], // L
    [[0, 0, 3], [3, 3, 3]], // J
    [[0, 4, 0], [4, 4, 4]], // T
    [[0, 5, 5], [5, 5, 0]], // S
    [[6, 6, 0], [0, 6, 6]], // Z
    [[7, 7], [7, 7]]  // O
];

let board = createBoard(ROWS, COLS);
let currentPiece;
let nextPiece;
let score = 0;
let level = 1;
let gameOver = false;
let dropStart = 0; // Initialize later in gameLoop
let dropInterval = 800; // Milliseconds per drop initially (Increased speed)

// --- Music Variables ---
let audio = null; // Will be created when music starts
let musicTracks = [];
let currentTrackIndex = 0;
let isMusicLoaded = false; // Flag to track if music list is fetched

// --- Particle Effects ---
let particles = [];

// --- Board Functions ---

function createBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function drawBlock(ctx, x, y, color, blockSize = BLOCK_SIZE, stroke = true) {
    ctx.fillStyle = color;
    ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    if (stroke) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; // Slightly transparent black border
        ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
    }
}

function drawBoard() {
    // Clear board with background color from CSS
    context.fillStyle = '#0f1c2e';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw existing blocks
    board.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) {
                drawBlock(context, x, y, COLORS[value]);
            }
        });
    });

    // Draw particles
    drawParticles();
}

function drawNextBoard() {
    // Clear next piece canvas with background color from CSS
    nextContext.fillStyle = '#0f1c2e';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (nextPiece) {
        const shape = nextPiece.shape;
        const color = COLORS[nextPiece.type];
        // Center the piece in the next canvas
        const offsetX = Math.floor((NEXT_COLS - shape[0].length) / 2);
        const offsetY = Math.floor((NEXT_ROWS - shape.length) / 2);

        shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    drawBlock(nextContext, x + offsetX, y + offsetY, color, NEXT_BLOCK_SIZE);
                }
            });
        });
    }
}

// --- Piece Functions ---

class Piece {
    constructor(type, shape) {
        this.type = type;
        this.shape = shape;
        this.x = Math.floor(COLS / 2) - Math.floor(shape[0].length / 2);
        this.y = 0; // Start at the top
    }

    draw() {
        const color = COLORS[this.type];
        this.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    drawBlock(context, this.x + x, this.y + y, color);
                }
            });
        });
    }

    move(dx, dy) {
        // Check collision *before* changing position
        if (!this.collides(dx, dy, this.shape)) {
            this.x += dx;
            this.y += dy;
            return true; // Move successful
        }
        return false; // Move failed
    }


    rotate() {
        // Simple rotation logic (transpose + reverse rows)
        const N = this.shape.length;
        const M = this.shape[0].length;
        const newShape = Array.from({ length: M }, () => Array(N).fill(0));

        for (let y = 0; y < N; y++) {
            for (let x = 0; x < M; x++) {
                newShape[x][N - 1 - y] = this.shape[y][x];
            }
        }

        // Check for collision after rotation, including wall kicks if needed
        let kickOffset = 0;
        let canRotate = false;
        while (Math.abs(kickOffset) <= Math.ceil(M / 2) + 1) { // Allow slightly more kick for rotation
             if (!this.collides(kickOffset, 0, newShape)) {
                 canRotate = true;
                 break;
             }
             // Try wall kicks: 0, -1, 1, -2, 2, etc.
             kickOffset = kickOffset <= 0 ? Math.abs(kickOffset) + 1 : -(kickOffset);
        }


        if (canRotate) {
            this.shape = newShape;
            this.x += kickOffset; // Apply wall kick
        }
        // If rotation failed, do nothing
    }

    // Checks collision with board boundaries and existing pieces
    collides(dx, dy, shape) {
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[0].length; x++) {
                if (shape[y][x] > 0) {
                    let newX = this.x + x + dx;
                    let newY = this.y + y + dy;

                    // Check boundaries
                    if (newX < 0 || newX >= COLS || newY >= ROWS) {
                        return true; // Collision with walls or bottom
                    }
                    // Check board collision (only check below current position for downward movement)
                    if (newY < 0) continue; // Allow pieces to spawn partially above the board
                    if (board[newY] && board[newY][newX] !== 0) {
                        return true; // Collision with another piece
                    }
                }
            }
        }
        return false;
    }
}


function getRandomPiece() {
    const type = Math.floor(Math.random() * (SHAPES.length - 1)) + 1; // 1 to 7
    return new Piece(type, SHAPES[type]);
}

function freezePiece() {
    currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) {
                // Check if piece is above the visible board
                if (currentPiece.y + y < 0) {
                    gameOver = true; // Piece froze above the top
                    return;
                }
                board[currentPiece.y + y][currentPiece.x + x] = currentPiece.type;
            }
        });
    });
}

// --- Game Logic ---

function clearLines() {
    let linesCleared = 0;
    let clearedRowIndices = []; // Store indices of cleared rows for particles
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell > 0)) {
            // Line is full
            linesCleared++;
            clearedRowIndices.push(y); // Store index before splicing
            // Remove the line and add a new empty line at the top
            const removedRow = board.splice(y, 1)[0]; // Get the removed row for particle colors
            board.unshift(Array(COLS).fill(0));

            // Create particles for the cleared line
            createParticlesForRow(y, removedRow);

            y++; // Re-check the current row index as it's now a new row
        }
    }


    if (linesCleared > 0) {
        // Update score based on lines cleared and level
        let baseScore = [0, 40, 100, 300, 1200][linesCleared]; // Points for 1, 2, 3, 4 lines
        score += baseScore * level;
        scoreElement.textContent = score;

        // Check for level up (e.g., every 10 lines cleared)
        // This is a simple level up condition, can be adjusted
        const linesNeededForLevelUp = level * 10;
        if (score >= linesNeededForLevelUp * 40) { // Rough estimate based on single lines
             level++;
             levelElement.textContent = level;
             // Increase speed
             dropInterval = Math.max(100, 1000 - (level - 1) * 50); // Decrease interval, minimum 100ms
        }
    }
}

function resetGame() {
    board = createBoard(ROWS, COLS);
    score = 0;
    level = 1;
    gameOver = false;
    dropInterval = 800; // Reset speed on new game
    scoreElement.textContent = score;
    levelElement.textContent = level;
    currentPiece = getRandomPiece();
    nextPiece = getRandomPiece();
    drawNextBoard();
    dropStart = 0; // Let gameLoop initialize based on the first frame timestamp
}


function gameLoop(now = 0) { // 'now' is performance.now()
    // Initialize dropStart on the first frame or after reset
    if (!dropStart) {
        dropStart = now;
    }

    if (gameOver) {
        // Use CSS font style for consistency
        context.font = "24px 'Press Start 2P', cursive";
        context.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Semi-transparent background
        context.fillRect(0, canvas.height / 2 - 40, canvas.width, 80); // Slightly larger box

        context.fillStyle = '#e94560'; // Red color from CSS
        context.textAlign = 'center';
        // Add text shadow manually if desired (complex on canvas)
        context.fillText('Game Over!', canvas.width / 2, canvas.height / 2);

        context.font = "16px 'Press Start 2P', cursive";
        context.fillStyle = '#e0f2f7'; // Light text color
        context.fillText('Press Enter to Restart', canvas.width / 2, canvas.height / 2 + 30);
        return; // Stop the loop
    }

    // Update particles
    updateParticles();

    const deltaTime = now - dropStart;
    let timeToDrop = deltaTime > dropInterval;

    if (timeToDrop) {
        // Attempt to move down
        if (!currentPiece.move(0, 1)) {
            // Move failed - piece has landed or hit something. Freeze it immediately.
            freezePiece();
            clearLines(); // Check for cleared lines after freezing

            // Check for game over immediately after freezing
            if (gameOver) {
                requestAnimationFrame(gameLoop); // Draw game over screen
                return;
            }

            // Get the next piece
            currentPiece = nextPiece;
            nextPiece = getRandomPiece();
            drawNextBoard();

            // Check if the new piece collides immediately (game over condition)
            if (currentPiece.collides(0, 0, currentPiece.shape)) {
                gameOver = true;
            }
        }
        // Reset drop timer regardless of success/fail
        dropStart = now;
    }

    // Draw everything
    drawBoard(); // Includes particles
    // Ensure currentPiece exists before drawing (especially during reset/game over transitions)
    if (currentPiece) {
       currentPiece.draw();
    }

    requestAnimationFrame(gameLoop);
}


// --- Particle Functions ---

class Particle {
    constructor(x, y, color, vx, vy) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * (BLOCK_SIZE / 4) + (BLOCK_SIZE / 8); // Particle size relative to block
        this.color = color;
        this.vx = vx; // Velocity x
        this.vy = vy; // Velocity y
        this.alpha = 1; // Opacity
        this.gravity = 0.1;
        this.drag = 0.98;
    }

    update() {
        this.vy += this.gravity;
        this.vx *= this.drag;
        this.vy *= this.drag;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 0.02; // Fade out
    }

    draw() {
        context.globalAlpha = Math.max(0, this.alpha); // Ensure alpha doesn't go below 0
        context.fillStyle = this.color;
        context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        context.globalAlpha = 1; // Reset global alpha
    }
}

function createParticlesForRow(rowIndex, rowData) {
    const numParticlesPerBlock = 5;
    rowData.forEach((blockType, colIndex) => {
        if (blockType > 0) { // Only create particles for actual blocks
            const blockColor = COLORS[blockType];
            const blockCenterX = (colIndex + 0.5) * BLOCK_SIZE;
            const blockCenterY = (rowIndex + 0.5) * BLOCK_SIZE;

            for (let i = 0; i < numParticlesPerBlock; i++) {
                const angle = Math.random() * Math.PI * 2; // Random direction
                const speed = Math.random() * 3 + 1; // Random speed
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed - Math.random() * 2; // Slight upward bias initially
                particles.push(new Particle(blockCenterX, blockCenterY, blockColor, vx, vy));
            }
        }
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1); // Remove faded particles
        }
    }
}

function drawParticles() {
    particles.forEach(p => p.draw());
}


// --- Controls ---

document.addEventListener('keydown', (event) => {
    // Ensure currentPiece exists before handling input
    if (!currentPiece && event.key !== 'Enter') return;

    if (gameOver) {
        if (event.key === 'Enter') {
            resetGame();
            // Request the first frame, which will initialize dropStart
            requestAnimationFrame(gameLoop);
        }
        return;
    }

    let moved = false; // Flag to check if redraw is needed

    switch (event.key) {
        case 'ArrowLeft':
        case 'a':
            // Allow move only if it doesn't collide with the ground/locked pieces
            if (!currentPiece.collides(-1, 0, currentPiece.shape)) {
                 currentPiece.move(-1, 0);
                 moved = true;
            }
            break;
        case 'ArrowRight':
        case 'd':
             if (!currentPiece.collides(1, 0, currentPiece.shape)) {
                 currentPiece.move(1, 0);
                 moved = true;
            }
            break;
        case 'ArrowDown':
        case 's':
            // Soft drop: move down one step if possible
            if (currentPiece.move(0, 1)) {
                // Reset drop timer to make the *next* automatic drop happen sooner
                dropStart = performance.now();
                moved = true;
                // Optional score for soft drop
                // score += 1;
                // scoreElement.textContent = score;
            } else {
                 // If move failed, let the main game loop handle freezing on the next frame
                 // Force the next game loop tick to check for freeze immediately
                 dropStart = performance.now() - dropInterval - 1;
                 moved = false; // Don't redraw here, let game loop handle it
            }
            break;
        case 'ArrowUp':
        case 'w':
            // Attempt rotation (collides check is inside rotate method)
            currentPiece.rotate();
            moved = true; // Always redraw after rotation attempt
            break;
        case ' ': // Space for hard drop
            while (currentPiece.move(0, 1)) {
                // Keep moving down
                // Optional score for hard drop steps
                // score += 2;
            }
            // Force the next game loop tick to check for freeze immediately
            dropStart = performance.now() - dropInterval - 1;
            moved = false; // Don't redraw here, let game loop handle freeze and draw
            // Optional score for hard drop
            // scoreElement.textContent = score;
            break;
    }

    // Redraw immediately only if a move or rotation happened
    if (moved) {
        drawBoard();
        currentPiece.draw();
    }
});

// --- Music Functions ---

// Fisher-Yates (aka Knuth) Shuffle algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
}

function playNextTrack() {
    if (!audio || musicTracks.length === 0) return; // No audio element or no tracks

    currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length; // Loop back to start
    audio.src = `/music/${musicTracks[currentTrackIndex]}`; // Path relative to server root
    audio.play().catch(e => console.error("Error playing audio:", e)); // Autoplay might be blocked initially
}

async function loadAndPlayMusic() {
    if (isMusicLoaded) return; // Don't load multiple times

    try {
        const response = await fetch('/api/music');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const files = await response.json();

        if (files && files.length > 0) {
            musicTracks = files;
            shuffleArray(musicTracks); // Shuffle the tracks
            isMusicLoaded = true;
            currentTrackIndex = 0; // Start from the first shuffled track

            // Create Audio element if it doesn't exist
            if (!audio) {
                audio = new Audio();
                audio.addEventListener('ended', playNextTrack); // Play next track when one finishes
                audio.addEventListener('error', (e) => {
                    console.error(`Error loading/playing audio: ${audio.src}`, e);
                    // Optionally skip to next track on error after a delay
                    // setTimeout(playNextTrack, 1000);
                });
            }

            console.log(`Attempting to load track: /music/${musicTracks[currentTrackIndex]}`);
            audio.src = `/music/${musicTracks[currentTrackIndex]}`;

            // Attempt to play. Handle potential promise rejection.
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(_ => {
                    // Autoplay started!
                    console.log(`Playing: ${musicTracks[currentTrackIndex]}`);
                }).catch(error => {
                    // Autoplay was prevented.
                    console.warn("Autoplay prevented. Waiting for user interaction.", error);
                    // Add a one-time listener for the first interaction
                    const startMusicOnInteraction = () => {
                         console.log("User interaction detected, attempting to play music.");
                         audio.play().then(_ => {
                             console.log(`Playing: ${musicTracks[currentTrackIndex]} after interaction.`);
                         }).catch(err => {
                             console.error("Error playing audio even after interaction:", err);
                         });
                         // Remove listeners after first interaction
                         document.removeEventListener('click', startMusicOnInteraction);
                         document.removeEventListener('keydown', startMusicOnInteraction);
                    };
                    document.addEventListener('click', startMusicOnInteraction, { once: true });
                    document.addEventListener('keydown', startMusicOnInteraction, { once: true });
                });
            }

        } else {
            console.log("No music tracks found or returned from /api/music.");
        }
    } catch (error) {
        console.error("Failed to fetch or play music:", error);
    }
}

// --- Start Game ---
resetGame(); // Initialize game state
loadAndPlayMusic(); // Load music list and start playing
gameLoop(); // Start the main game loop
