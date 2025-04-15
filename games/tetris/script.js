document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    console.log("Tetris script loaded.");

    const canvas = document.getElementById('tetris-board');
    const context = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next-piece');
    const nextContext = nextCanvas.getContext('2d');
    const holdCanvas = document.getElementById('hold-piece');
    const holdContext = holdCanvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines-cleared');

    // Add log to check if elements are found
    console.log("Canvas elements:", { canvas, nextCanvas, holdCanvas });
    console.log("UI elements:", { scoreElement, levelElement, linesElement });

    // --- Pause Menu Elements ---
    const pauseMenu = document.getElementById('pause-menu');
    const resumeButton = document.getElementById('resume-button');
    const volumeButton = document.getElementById('volume-button');
    const exitButton = document.getElementById('exit-button');

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
        '#3877FF',  // O - Yellow (using a different blue for contrast)
        null, // 8 is empty
        '#FFA500'  // 9 is orange
    ];

    const BOMB_TYPE = 8; // Assign a new type index
    const BOMB_SHAPE = [[8]]; // Simple 1x1 block for the bomb
    const BOMB_COLOR = '#FFA500'; // Orange, distinct from others

    // Add bomb color to COLORS array (ensure index matches BOMB_TYPE)
    if (COLORS.length <= BOMB_TYPE) {
        while (COLORS.length < BOMB_TYPE) COLORS.push(null);
        COLORS.push(BOMB_COLOR);
    }

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
    let heldPiece = null;
    let canHold = true;
    let score = 0;
    let level = 1;
    let totalLinesCleared = 0;
    let gameOver = false;
    let paused = false;
    let dropStart = 0; // Initialize later in gameLoop
    let dropInterval = 800; // Milliseconds per drop initially (Increased speed)

    // --- Power-up State ---
    let nextPieceIsBomb = false;
    let columnLaserReady = false;
    let linesUntilLaser = 5; // Lines needed for the next laser

    // --- Music Variables ---
    let audio = null; // Will be created when music starts
    let musicTracks = [];
    let currentTrackIndex = 0;
    let isMusicLoaded = false; // Flag to track if music list is fetched

    // --- Particle Effects ---
    let particles = [];

    // --- Sound Effects (Web Audio API) ---
    let audioCtx = null;
    let soundsEnabled = false; // Flag to track if context is running

    // Function to initialize Audio Context (requires user interaction)
    function initAudioContext() {
        if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // Check if context is running (needed for some browsers after interaction)
            if (audioCtx.state === 'running') {
                soundsEnabled = true;
            } else {
                // Resume context on first interaction if needed
                const resumeAudio = () => {
                    if (audioCtx && audioCtx.state === 'suspended') {
                         audioCtx.resume().then(() => {
                            console.log("AudioContext resumed successfully.");
                            soundsEnabled = true;
                        });
                    }
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                };
                document.addEventListener('click', resumeAudio, { once: true });
                document.addEventListener('keydown', resumeAudio, { once: true });
            }
            console.log("AudioContext initialized.");
        } else {
            console.warn("Web Audio API is not supported in this browser.");
        }
    }

    // Function to play a synthesized sound effect
    function playSound(soundName) {
        if (!audioCtx || !soundsEnabled) return; // Don't play if context isn't running

        const now = audioCtx.currentTime;
        let oscillator, gainNode, noiseBuffer, noiseSource;

        switch (soundName) {
            case 'laserReady':
                oscillator = audioCtx.createOscillator();
                gainNode = audioCtx.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(600, now);
                oscillator.frequency.linearRampToValueAtTime(1200, now + 0.1);
                gainNode.gain.setValueAtTime(0.3, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.start(now);
                oscillator.stop(now + 0.15);
                break;

            case 'laserFire':
                 // Simple descending tone for laser fire
                 oscillator = audioCtx.createOscillator();
                 gainNode = audioCtx.createGain();
                 oscillator.type = 'triangle';
                 oscillator.frequency.setValueAtTime(1000, now);
                 oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);
                 gainNode.gain.setValueAtTime(0.4, now);
                 gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                 oscillator.connect(gainNode);
                 gainNode.connect(audioCtx.destination);
                 oscillator.start(now);
                 oscillator.stop(now + 0.2);
                 break;

            case 'bombReady':
                oscillator = audioCtx.createOscillator();
                gainNode = audioCtx.createGain();
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(100, now);
                gainNode.gain.setValueAtTime(0.3, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.start(now);
                oscillator.stop(now + 0.1);
                break;

            case 'bombExplode':
                // White noise burst for explosion
                const bufferSize = audioCtx.sampleRate * 0.3; // 0.3 seconds of noise
                noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }
                noiseSource = audioCtx.createBufferSource();
                noiseSource.buffer = noiseBuffer;
                gainNode = audioCtx.createGain();
                gainNode.gain.setValueAtTime(0.5, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                noiseSource.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                noiseSource.start(now);
                noiseSource.stop(now + 0.3);
                break;

            case 'lineClear':
                oscillator = audioCtx.createOscillator();
                gainNode = audioCtx.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, now); // A5 note
                gainNode.gain.setValueAtTime(0.4, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.start(now);
                oscillator.stop(now + 0.1);
                break;

             // Add cases for other sounds like piece rotate, move, land?
        }
    }

    // --- Pause Menu Functions ---
    function showPauseMenu() {
        paused = true;
        pauseMenu.classList.remove('hidden');
        // Pause music if playing
        if (audio && !audio.paused) {
            audio.pause();
        }
        // Update volume button text
        updateVolumeButton();
    }

    function hidePauseMenu() {
        paused = false;
        pauseMenu.classList.add('hidden');
        // Resume music if it was playing and not manually muted
        if (audio && audio.paused && !audio.muted) {
            audio.play().catch(e => console.warn("Could not resume audio:", e));
        }
        // Resume game loop (reset drop timer)
        dropStart = performance.now();
        requestAnimationFrame(gameLoop);
    }

    function updateVolumeButton() {
        if (audio) {
            volumeButton.textContent = audio.muted ? "Unmute" : "Mute";
        }
    }

    // --- Board Functions ---
    function createBoard(rows, cols) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    function drawBlock(ctx, x, y, color, blockSize = BLOCK_SIZE, stroke = true) {
        const blockX = x * blockSize;
        const blockY = y * blockSize;

        // Base color fill
        ctx.fillStyle = color;
        ctx.fillRect(blockX, blockY, blockSize, blockSize);

        // Lighter highlight (top and left)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(blockX, blockY, blockSize, 2); // Top edge
        ctx.fillRect(blockX, blockY + 2, 2, blockSize - 2); // Left edge

        // Darker shadow (bottom and right)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(blockX + 2, blockY + blockSize - 2, blockSize - 2, 2); // Bottom edge
        ctx.fillRect(blockX + blockSize - 2, blockY, 2, blockSize - 2); // Right edge

        if (stroke) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.strokeRect(blockX, blockY, blockSize, blockSize);
        }

        // Add special styling for bomb blocks
        if (color === BOMB_COLOR) {
            const innerSize = blockSize / 3;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Dark inner square
            ctx.fillRect(
                blockX + (blockSize - innerSize) / 2,
                blockY + (blockSize - innerSize) / 2,
                innerSize,
                innerSize
            );
        }
    }

    function drawBoard() {
        context.fillStyle = '#0f1c2e';
        context.fillRect(0, 0, canvas.width, canvas.height);
        board.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    drawBlock(context, x, y, COLORS[value]);
                }
            });
        });
        drawParticles();
    }

    function drawNextBoard() {
        nextContext.fillStyle = '#0f1c2e';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        if (nextPiece) {
            const shape = nextPiece.shape;
            const color = COLORS[nextPiece.type];
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

    function drawHoldBoard() {
        holdContext.fillStyle = '#0f1c2e';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
        if (heldPiece) {
            const shape = heldPiece.shape;
            const color = COLORS[heldPiece.type];
            const offsetX = Math.floor((NEXT_COLS - shape[0].length) / 2);
            const offsetY = Math.floor((NEXT_ROWS - shape.length) / 2);
            shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        drawBlock(holdContext, x + offsetX, y + offsetY, color, NEXT_BLOCK_SIZE, false);
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
            this.y = 0;
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
            const N = this.shape.length;
            const M = this.shape[0].length;
            const newShape = Array.from({ length: M }, () => Array(N).fill(0));
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < M; x++) {
                    newShape[x][N - 1 - y] = this.shape[y][x];
                }
            }
            let kickOffset = 0;
            let canRotate = false;
            while (Math.abs(kickOffset) <= Math.ceil(M / 2) + 1) {
                 if (!this.collides(kickOffset, 0, newShape)) {
                     canRotate = true;
                     break;
                 }
                 kickOffset = kickOffset <= 0 ? Math.abs(kickOffset) + 1 : -(kickOffset);
            }
            if (canRotate) {
                this.shape = newShape;
                this.x += kickOffset;
            }
        }

        collides(dx, dy, shape) {
            for (let y = 0; y < shape.length; y++) {
                for (let x = 0; x < shape[0].length; x++) {
                    if (shape[y][x] > 0) {
                        let newX = this.x + x + dx;
                        let newY = this.y + y + dy;
                        if (newX < 0 || newX >= COLS || newY >= ROWS) {
                            return true;
                        }
                        if (newY < 0) continue;
                        if (board[newY] && board[newY][newX] !== 0) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
    }

    function getRandomPiece() {
        const type = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
        return new Piece(type, SHAPES[type]);
    }

    function freezePiece() {
        // --- Handle Row Bomb Explosion ---
        if (currentPiece.type === BOMB_TYPE) {
            console.log("Bomb landed! Detonating...");
            const landingY = Math.floor(currentPiece.y);
            const startY = Math.max(0, landingY - 1); // Row above (or 0)
            const endY = Math.min(ROWS - 1, landingY + 1); // Row below (or max row)

            for (let y = startY; y <= endY; y++) {
                if (y >= 0 && y < ROWS) {
                    // Create particles before clearing
                    createParticlesForRow(y, board[y].map((cell, x) => cell > 0 ? 99 : 0)); // Use a temporary type for explosion color?
                    board[y] = Array(COLS).fill(0); // Clear the row
                }
            }
            // Trigger line clear checks *after* explosion to handle potential score/level/laser updates
            clearLines();
            playSound('bombExplode'); // Play bomb explode sound
        } else {
            // --- Standard Piece Freezing ---
            currentPiece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        // Check game over condition
                        if (currentPiece.y + y < 0) {
                            gameOver = true;
                            return; // Exit if game over
                        }
                        // Freeze block onto board
                        if (currentPiece.y + y < ROWS) {
                             board[currentPiece.y + y][currentPiece.x + x] = currentPiece.type;
                        }
                    }
                });
                if (gameOver) return; // Exit outer loop if game over
            });
        }

        if (!gameOver) {
            canHold = true; // Allow holding only if not game over
            // Trigger standard line clear check only if it wasn't a bomb
            if (currentPiece.type !== BOMB_TYPE) {
                 clearLines();
            }
            levelElement.parentElement.classList.remove('laser-ready-indicator');
            playSound('laserFire'); // Play laser fire sound
        }
    }

    // --- Game Logic ---
    function clearLines() {
        let linesClearedThisTurn = 0;
        let clearedRowIndices = [];
        let triggerBombNext = false; // Flag for this turn

        for (let y = ROWS - 1; y >= 0; y--) {
            if (board[y].every(cell => cell > 0)) {
                linesClearedThisTurn++;
                clearedRowIndices.push(y);
                const removedRow = board.splice(y, 1)[0];

                // Check for same-color row
                const firstColor = removedRow.find(cell => cell > 0); // Find the first block's color
                if (firstColor && removedRow.every(cell => cell === 0 || cell === firstColor)) {
                    console.log("Same color row cleared! Bomb activated for next piece.");
                    triggerBombNext = true; // Activate bomb for the *next* piece cycle
                }

                board.unshift(Array(COLS).fill(0));
                createParticlesForRow(y, removedRow);
                y++; // Re-check the current index y since we shifted rows down
            }
        }
        if (linesClearedThisTurn > 0) {
            totalLinesCleared += linesClearedThisTurn;
            linesElement.textContent = totalLinesCleared;

            // Update Column Laser readiness
            linesUntilLaser -= linesClearedThisTurn;
            if (linesUntilLaser <= 0 && !columnLaserReady) {
                console.log("Column Laser Ready!");
                columnLaserReady = true;
                linesUntilLaser = 5 + linesUntilLaser; // Reset counter, accounting for overshoot
                scoreElement.parentElement.classList.add('laser-ready-indicator');
                levelElement.parentElement.classList.add('laser-ready-indicator');
                playSound('laserReady'); // Play laser ready sound
            }

            // Play line clear sound (consider different sounds for multi-line clears)
            playSound('lineClear');

            let baseScore = [0, 40, 100, 300, 1200][linesClearedThisTurn];
            score += baseScore * level;
            scoreElement.textContent = score;
            const linesNeededForLevelUp = level * 10;
            if (score >= linesNeededForLevelUp * 40) { // Simple level up based on score
                 level++;
                 levelElement.textContent = level;
                 dropInterval = Math.max(100, 1000 - (level - 1) * 50);
            }
        }

        // Set the flag for the next piece generation cycle
        if (triggerBombNext) {
            nextPieceIsBomb = true;
            // Add visual indicator for next piece bomb
            nextCanvas.classList.add('bomb-indicator');
            playSound('bombReady'); // Play bomb ready sound
        }
    }

    function resetGame() {
        console.log("Resetting game...");
        board = createBoard(ROWS, COLS);
        score = 0;
        level = 1;
        totalLinesCleared = 0;
        gameOver = false;
        paused = false;
        heldPiece = null;
        canHold = true;
        dropInterval = 800;
        scoreElement.textContent = score;
        levelElement.textContent = level;
        linesElement.textContent = totalLinesCleared;
        currentPiece = getRandomPiece();
        nextPiece = getRandomPiece();
        drawNextBoard();
        drawHoldBoard();
        dropStart = 0;
        nextPieceIsBomb = false; // Reset power-ups
        columnLaserReady = false;
        linesUntilLaser = 5;
        // Ensure indicators are off
        scoreElement.parentElement.classList.remove('laser-ready-indicator');
        levelElement.parentElement.classList.remove('laser-ready-indicator');
        nextCanvas.classList.remove('bomb-indicator'); // Reset bomb indicator too
        console.log("Game reset complete. Initial pieces:", { currentPiece, nextPiece });
    }

    function gameLoop(now = 0) {
        if (!dropStart) {
            dropStart = now;
        }

        // --- Handle Paused State ---
        if (paused) {
            // Menu is visible, game logic is paused
            requestAnimationFrame(gameLoop);
            return;
        }

        if (gameOver) {
            context.font = "24px 'Press Start 2P', cursive";
            context.fillStyle = 'rgba(0, 0, 0, 0.75)';
            context.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
            context.fillStyle = '#e94560';
            context.textAlign = 'center';
            context.fillText('Game Over!', canvas.width / 2, canvas.height / 2);
            context.font = "16px 'Press Start 2P', cursive";
            context.fillStyle = '#e0f2f7';
            context.fillText('Press Enter to Restart', canvas.width / 2, canvas.height / 2 + 30);
            return;
        }

        updateParticles();

        const deltaTime = now - dropStart;
        let timeToDrop = deltaTime > dropInterval;

        if (timeToDrop) {
            if (!currentPiece.move(0, 1)) {
                freezePiece();
                clearLines();
                if (gameOver) {
                    requestAnimationFrame(gameLoop);
                    return;
                }

                // --- Assign next piece, potentially a bomb ---
                currentPiece = nextPiece;
                if (nextPieceIsBomb) {
                    console.log("Assigning bomb piece!");
                    nextPiece = new Piece(BOMB_TYPE, BOMB_SHAPE);
                    nextPieceIsBomb = false; // Consume the flag
                    // Remove visual indicator
                    nextCanvas.classList.remove('bomb-indicator');
                } else {
                    nextPiece = getRandomPiece();
                }

                drawNextBoard();
                if (currentPiece.collides(0, 0, currentPiece.shape)) {
                    gameOver = true;
                }
            }
            dropStart = now;
        }

        drawBoard();
        if (currentPiece) {
            const ghostY = calculateGhostY(currentPiece);
            drawGhostPiece(currentPiece, ghostY);
            currentPiece.draw();
        }

        requestAnimationFrame(gameLoop);
    }

    // --- Particle Functions ---
    class Particle {
        constructor(x, y, color, vx, vy) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * (BLOCK_SIZE / 4) + (BLOCK_SIZE / 8);
            this.color = color;
            this.vx = vx;
            this.vy = vy;
            this.alpha = 1;
            this.gravity = 0.1;
            this.drag = 0.98;
        }
        update() {
            this.vy += this.gravity;
            this.vx *= this.drag;
            this.vy *= this.drag;
            this.x += this.vx;
            this.y += this.vy;
            this.alpha -= 0.02;
        }
        draw() {
            context.globalAlpha = Math.max(0, this.alpha);
            context.fillStyle = this.color;
            context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
            context.globalAlpha = 1;
        }
    }

    function createParticlesForRow(rowIndex, rowData) {
        const numParticlesPerBlock = 5;
        rowData.forEach((blockType, colIndex) => {
            if (blockType > 0) {
                const blockColor = COLORS[blockType];
                const blockCenterX = (colIndex + 0.5) * BLOCK_SIZE;
                const blockCenterY = (rowIndex + 0.5) * BLOCK_SIZE;
                for (let i = 0; i < numParticlesPerBlock; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 3 + 1;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed - Math.random() * 2;
                    particles.push(new Particle(blockCenterX, blockCenterY, blockColor, vx, vy));
                }
            }
        });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            if (particles[i].alpha <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function drawParticles() {
        particles.forEach(p => p.draw());
    }

    // --- Controls ---
    document.addEventListener('keydown', (event) => {
        // Allow Reset and Music controls anytime
        if (event.key === 'r' || event.key === 'R') {
            resetGame();
            requestAnimationFrame(gameLoop);
            return;
        }
        if (event.key === '.' || event.key === ';') { // Allow both . and ;
            playNextTrack();
            return;
        }
        if (event.key === ',') {
            playPreviousTrack();
            return;
        }

        // --- Pause Functionality ---
        if (event.key === 'Escape') {
            if (gameOver) return;
            if (paused) {
                hidePauseMenu();
            } else {
                showPauseMenu();
            }
            return;
        }

        // --- Column Laser Activation ---
        if ((event.key === 'e' || event.key === 'E') && columnLaserReady && !paused && !gameOver && currentPiece) {
            triggerColumnLaser();
            return; // Consume the key press
        }

        // Prevent game actions while paused or game over
        if (paused || gameOver) {
            // Allow Enter to restart when game over
            if (gameOver && event.key === 'Enter') {
                 resetGame();
                 requestAnimationFrame(gameLoop);
            }
            return;
        }

        // Ensure currentPiece exists before handling movement/rotation
        if (!currentPiece) return;

        // --- Hold Key ---
        if (event.key === 'c' || event.key === 'C') {
            if (!gameOver) { // Check gameOver here as well
                handleHold();
            }
            return; // Consume the key press for hold regardless of success
        }

        let moved = false;
        let triggerDrop = false;

        switch (event.key) {
            case 'ArrowLeft':
            case 'a':
            // case 'A': // Consider if Shift+key should also work
                 if (currentPiece.move(-1, 0)) {
                      moved = true;
                 }
                break;
            case 'ArrowRight':
            case 'd':
            // case 'D':
                 if (currentPiece.move(1, 0)) {
                     moved = true;
                 }
                break;
            case 'ArrowDown':
            case 's':
            // case 'S':
                if (currentPiece.move(0, 1)) {
                    // Soft drop score could be added here
                    dropStart = performance.now(); // Reset drop timer on manual down move
                    moved = true;
                } else {
                    // If move failed, it means piece landed, trigger freeze/clear
                    triggerDrop = true;
                }
                break;
            case 'ArrowUp':
            case 'w':
            // case 'W':
                currentPiece.rotate();
                moved = true; // Rotation always counts as a move for redraw
                break;
            case ' ': // Space for hard drop
                while (currentPiece.move(0, 1)) {}
                triggerDrop = true; // Trigger freeze/clear after hard drop
                moved = false; // Hard drop itself doesn't redraw, the freeze does
                break;
        }

        // --- Post-Move Updates ---
        if (moved) {
            drawBoard(); // Redraw board to clear previous ghost/piece
            const ghostY = calculateGhostY(currentPiece);
            drawGhostPiece(currentPiece, ghostY);
            currentPiece.draw(); // Draw piece in new position
        }

        if (triggerDrop) {
            // Force the game loop to process the drop immediately
            dropStart = performance.now() - dropInterval - 1;
        }
    });

    // --- Column Laser Logic ---
    function triggerColumnLaser() {
        if (!columnLaserReady || !currentPiece) return;
        console.log("Firing Column Laser!");

        const pieceX = currentPiece.x;
        const pieceWidth = currentPiece.shape[0].length;
        const targetColumn = Math.floor(pieceX + pieceWidth / 2); // Target center column

        if (targetColumn >= 0 && targetColumn < COLS) {
            for (let y = 0; y < ROWS; y++) {
                if (board[y][targetColumn] > 0) {
                    // Create particle effect for the cleared block
                    const blockCenterX = (targetColumn + 0.5) * BLOCK_SIZE;
                    const blockCenterY = (y + 0.5) * BLOCK_SIZE;
                    const color = COLORS[board[y][targetColumn]];
                    for(let i=0; i< 3; i++) { // Fewer particles than row clear
                        particles.push(new Particle(blockCenterX, blockCenterY, color, (Math.random() - 0.5) * 4, Math.random() * -5));
                    }
                    board[y][targetColumn] = 0; // Clear the block
                }
            }
        }

        columnLaserReady = false;
        linesUntilLaser = 5; // Reset counter
        // Remove visual indicator
        scoreElement.parentElement.classList.remove('laser-ready-indicator');
        levelElement.parentElement.classList.remove('laser-ready-indicator');
        // TODO: Play laser fire sound

        // Redraw the board immediately to show the cleared column
        drawBoard();
        if (currentPiece) {
             const ghostY = calculateGhostY(currentPiece);
             drawGhostPiece(currentPiece, ghostY);
             currentPiece.draw();
        }
    }

    // --- Music Functions ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function playNextTrack() {
        if (!audio || musicTracks.length === 0) return;
        currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
        audio.src = `/music/${musicTracks[currentTrackIndex]}`;
        audio.play().catch(e => console.error("Error playing audio:", e));
    }

    function playPreviousTrack() {
        if (!audio || musicTracks.length === 0) return;
        currentTrackIndex = (currentTrackIndex - 1 + musicTracks.length) % musicTracks.length;
        audio.src = `/music/${musicTracks[currentTrackIndex]}`; // Path relative to server root
        audio.play().catch(e => console.error("Error playing audio:", e));
        console.log(`Playing previous: ${musicTracks[currentTrackIndex]}`);
    }

    async function loadAndPlayMusic() {
        if (isMusicLoaded) return;
        try {
            const response = await fetch('/api/music');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const files = await response.json();
            if (files && files.length > 0) {
                musicTracks = files;
                shuffleArray(musicTracks);
                isMusicLoaded = true;
                currentTrackIndex = 0;
                if (!audio) {
                    audio = new Audio();
                    audio.addEventListener('ended', playNextTrack);
                    audio.addEventListener('error', (e) => {
                        console.error(`Error loading/playing audio: ${audio.src}`, e);
                    });
                }
                console.log(`Attempting to load track: /music/${musicTracks[currentTrackIndex]}`);
                audio.src = `/music/${musicTracks[currentTrackIndex]}`;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(_ => {
                        console.log(`Playing: ${musicTracks[currentTrackIndex]}`);
                    }).catch(error => {
                        console.warn("Autoplay prevented. Waiting for user interaction.", error);
                        const startMusicOnInteraction = () => {
                             console.log("User interaction detected, attempting to play music.");
                             audio.play().then(_ => {
                                 console.log(`Playing: ${musicTracks[currentTrackIndex]} after interaction.`);
                             }).catch(err => console.error("Error playing audio after interaction:", err));
                             document.removeEventListener('click', startMusicOnInteraction);
                             document.removeEventListener('keydown', startMusicOnInteraction);
                        };
                        document.addEventListener('click', startMusicOnInteraction, { once: true });
                        document.addEventListener('keydown', startMusicOnInteraction, { once: true });
                    });
                }
            } else {
                console.log("No music tracks found.");
            }
        } catch (error) {
            console.error("Failed to fetch or play music:", error);
        }
    }

    // --- Ghost Piece Functions ---
    function calculateGhostY(piece) {
        if (!piece) return 0;
        let testY = piece.y;
        while (!piece.collides(0, (testY - piece.y) + 1, piece.shape)) {
            testY++;
        }
        return testY;
    }

    function drawGhostPiece(piece, ghostY) {
        if (!piece) return;
        const color = COLORS[piece.type];
        let r = 0, g = 0, b = 0;
        if (color.length === 7) {
            r = parseInt(color.substring(1, 3), 16);
            g = parseInt(color.substring(3, 5), 16);
            b = parseInt(color.substring(5, 7), 16);
        }
        context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    context.fillRect((piece.x + x) * BLOCK_SIZE, (ghostY + y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            });
        });
    }

    // --- Hold Piece Logic ---
    function handleHold() {
        if (!canHold) return;
        if (heldPiece === null) {
            heldPiece = currentPiece;
            currentPiece = nextPiece;
            nextPiece = getRandomPiece();
            drawNextBoard();
        } else {
            [currentPiece, heldPiece] = [heldPiece, currentPiece];
        }
        currentPiece.x = Math.floor(COLS / 2) - Math.floor(currentPiece.shape[0].length / 2);
        currentPiece.y = 0;
        if (currentPiece.collides(0, 0, currentPiece.shape)) {
            gameOver = true;
        }
        canHold = false;
        drawHoldBoard();
    }

    // --- Add Pause Menu Event Listeners ---
    resumeButton.addEventListener('click', hidePauseMenu);

    volumeButton.addEventListener('click', () => {
        if (audio) {
            audio.muted = !audio.muted;
            updateVolumeButton();
        }
    });

    exitButton.addEventListener('click', () => {
        window.location.href = '../../index.html';
    });

    // --- Start Game ---
    // Initialize Audio Context on DOM load (might require interaction later)
    initAudioContext();

    resetGame();
    loadAndPlayMusic();
    gameLoop();
});
