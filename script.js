const canvas = document.getElementById('tetris-board');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 20; // Size of each block in pixels
const NEXT_COLS = 4;
const NEXT_ROWS = 4;
const NEXT_BLOCK_SIZE = 20;

// Colors for the Tetrominoes
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
let dropStart = Date.now();
let dropInterval = 1000; // Milliseconds per drop initially

// --- Board Functions ---

function createBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function drawBlock(ctx, x, y, color, blockSize = BLOCK_SIZE, stroke = true) {
    ctx.fillStyle = color;
    ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    if (stroke) {
        ctx.strokeStyle = '#333'; // Darker border for blocks
        ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
    }
}

function drawBoard() {
    // Clear board
    context.fillStyle = '#fff'; // Background color
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw existing blocks
    board.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) {
                drawBlock(context, x, y, COLORS[value]);
            }
        });
    });
}

function drawNextBoard() {
    // Clear next piece canvas
    nextContext.fillStyle = '#fff'; // Background color
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
        if (!this.collides(dx, dy, this.shape)) {
            this.x += dx;
            this.y += dy;
            return true;
        }
        return false;
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
        while (this.collides(kickOffset, 0, newShape)) {
            kickOffset = -(kickOffset + (kickOffset > 0 ? 1 : -1)); // Try -1, 1, -2, 2 etc.
            if (Math.abs(kickOffset) > Math.ceil(M / 2)) { // Limit kick distance
                return; // Cannot rotate
            }
        }

        this.shape = newShape;
        this.x += kickOffset; // Apply wall kick
    }

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
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell > 0)) {
            // Line is full
            linesCleared++;
            // Remove the line and add a new empty line at the top
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
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
    dropInterval = 1000;
    scoreElement.textContent = score;
    levelElement.textContent = level;
    currentPiece = getRandomPiece();
    nextPiece = getRandomPiece();
    drawNextBoard();
    dropStart = Date.now();
}

function gameLoop(now = 0) {
    if (gameOver) {
        context.fillStyle = 'rgba(0, 0, 0, 0.75)';
        context.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText('Game Over!', canvas.width / 2, canvas.height / 2);
        context.font = '16px Arial';
        context.fillText('Press Enter to Restart', canvas.width / 2, canvas.height / 2 + 25);
        return; // Stop the loop
    }

    const deltaTime = now - dropStart;

    if (deltaTime > dropInterval) {
        // Attempt to move the piece down
        if (!currentPiece.move(0, 1)) {
            // Piece couldn't move down, freeze it
            freezePiece();
            clearLines(); // Check for cleared lines after freezing

            // Check for game over immediately after freezing
            if (gameOver) {
                requestAnimationFrame(gameLoop); // Call loop one more time to draw game over screen
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
        dropStart = now; // Reset drop timer
    }

    // Draw everything
    drawBoard();
    currentPiece.draw();

    requestAnimationFrame(gameLoop);
}

// --- Controls ---

document.addEventListener('keydown', (event) => {
    if (gameOver) {
        if (event.key === 'Enter') {
            resetGame();
            requestAnimationFrame(gameLoop);
        }
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
        case 'a': // Add WASD support
            currentPiece.move(-1, 0);
            break;
        case 'ArrowRight':
        case 'd':
            currentPiece.move(1, 0);
            break;
        case 'ArrowDown':
        case 's':
            // Move down faster
            if (currentPiece.move(0, 1)) {
                 // Reset drop timer slightly to avoid double drop if key held
                 dropStart = Date.now();
                 // Optional: Add score for manual drop
                 // score += 1;
                 // scoreElement.textContent = score;
            } else {
                // If it can't move down, freeze immediately (optional, feels more responsive)
                freezePiece();
                clearLines();
                 if (gameOver) break; // Check game over after freeze
                currentPiece = nextPiece;
                nextPiece = getRandomPiece();
                drawNextBoard();
                if (currentPiece.collides(0, 0, currentPiece.shape)) gameOver = true;
                dropStart = Date.now(); // Reset timer for new piece
            }
            break;
        case 'ArrowUp':
        case 'w':
            currentPiece.rotate();
            break;
        case ' ': // Space for hard drop (optional)
            while (currentPiece.move(0, 1)) {
                // Keep moving down until collision
                // Optional: Add score for hard drop
                // score += 2;
            }
            // Freeze immediately after hard drop
            freezePiece();
            clearLines();
            if (gameOver) break; // Check game over after freeze
            currentPiece = nextPiece;
            nextPiece = getRandomPiece();
            drawNextBoard();
            if (currentPiece.collides(0, 0, currentPiece.shape)) gameOver = true;
            dropStart = Date.now(); // Reset timer for new piece
            // scoreElement.textContent = score; // Update score if points added
            break;
    }

    // Redraw immediately after input for responsiveness
    drawBoard();
    currentPiece.draw();
});

// --- Start Game ---
resetGame(); // Initialize game state
gameLoop(); // Start the main game loop
