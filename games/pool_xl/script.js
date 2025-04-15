const poolTableCanvas = document.getElementById('poolTable');
const ctx = poolTableCanvas.getContext('2d');

const indicatorCanvas = document.getElementById('indicatorCanvas');
const indicatorCtx = indicatorCanvas.getContext('2d');

// --- Matter.js Setup ---
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;

// Create an engine
const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 0; // No gravity in top-down pool

// --- Game Constants (Adjusted for Matter.js) ---
const BALL_RADIUS = 10;
const POCKET_RADIUS = 18;
const TABLE_WIDTH = poolTableCanvas.width;
const TABLE_HEIGHT = poolTableCanvas.height;
const CUSHION_THICKNESS = 20; // Thickness of the cushion bodies
const CUE_BALL_COLOR = 'white';
const EIGHT_BALL_COLOR = 'black';
const BALL_COLORS = {
    1: '#FFCC00', // Solid Yellow
    2: '#0000FF', // Solid Blue
    3: '#FF0000', // Solid Red
    4: '#800080', // Solid Purple
    5: '#FFA500', // Solid Orange
    6: '#008000', // Solid Green
    7: '#A52A2A', // Solid Brown/Maroon
    // 8 is black
    9: '#FFCC00', // Stripe Yellow
    10: '#0000FF', // Stripe Blue
    11: '#FF0000', // Stripe Red
    12: '#800080', // Stripe Purple
    13: '#FFA500', // Stripe Orange
    14: '#008000', // Stripe Green
    15: '#A52A2A'  // Stripe Brown/Maroon
};
const BALL_IS_SOLID = {
    1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true,
    8: false, // Consider 8-ball special
    9: false, 10: false, 11: false, 12: false, 13: false, 14: false, 15: false
}
const CUE_STICK_LENGTH = 150;
const CUE_STICK_WIDTH = 5;
const CUE_TIP_RADIUS = 3;
const MAX_POWER = 50;
const POWER_INCREMENT = 0.5;

// Pocket positions (still needed for logic)
const pockets = [
    { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
    { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

// --- Static Table Bodies (Cushions) ---
const cushionOptions = {
    isStatic: true,
    restitution: 0.8, // Bounciness of cushions
    friction: 0.1, // Low friction for cushions
    slop: 0.01, // Adjust penetration tolerance
};

// Create cushion bodies slightly outside the visible table area
const wallTop = Bodies.rectangle(TABLE_WIDTH / 2, -CUSHION_THICKNESS / 2, TABLE_WIDTH, CUSHION_THICKNESS, cushionOptions);
const wallBottom = Bodies.rectangle(TABLE_WIDTH / 2, TABLE_HEIGHT + CUSHION_THICKNESS / 2, TABLE_WIDTH, CUSHION_THICKNESS, cushionOptions);
const wallLeft = Bodies.rectangle(-CUSHION_THICKNESS / 2, TABLE_HEIGHT / 2, CUSHION_THICKNESS, TABLE_HEIGHT, cushionOptions);
const wallRight = Bodies.rectangle(TABLE_WIDTH + CUSHION_THICKNESS / 2, TABLE_HEIGHT / 2, CUSHION_THICKNESS, TABLE_HEIGHT, cushionOptions);

World.add(world, [wallTop, wallBottom, wallLeft, wallRight]);

// --- Ball Physics Properties ---
const ballOptions = {
    isStatic: false, // Explicitly set balls as dynamic
    restitution: 0.9, // How bouncy balls are
    friction: 0.01, // Friction between balls (relatively low)
    frictionAir: 0.005, // Decreased frictionAir significantly
    frictionStatic: 0.01, // Static friction
    density: 0.0001, // Decreased density significantly
    slop: 0.01, // Penetration tolerance
    label: 'ball' // Custom label for identifying balls
};

// --- Game State (Refactored) ---
let cueBallBody = null;
let objectBallBodies = []; // Array to hold the Matter.js body objects
// Store our custom ball data separately, mapping body.id to data
let ballDataMap = new Map(); 

let cueStick = {
    angle: 0,
    power: 0,
    visible: true,
    charging: false
};
let aimPoint = { x: 0, y: 0 }; // Still needed for applying spin/force direction
let keyState = {};
let gamePhase = 'aiming'; // 'aiming', 'simulating', 'gameOver'
let pocketedThisTurn = []; // Track bodies pocketed in the current turn

// --- Input Handling (Keep for now) ---
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

function handleKeyDown(event) {
     if (!cueStick.visible) return;
     keyState[event.key] = true;
     // ... (logic for space, wasd, arrows - needs adapting later to apply force/aim) ...
     if (event.key === ' ' && !cueStick.charging) {
        cueStick.charging = true;
        cueStick.power = 0;
        console.log('Charging shot...');
    }
    // WASD Aim Adjust
    const aimAdjustSpeed = 0.05;
    if (keyState['w']) aimPoint.y = Math.max(-1, aimPoint.y - aimAdjustSpeed);
    if (keyState['s']) aimPoint.y = Math.min(1, aimPoint.y + aimAdjustSpeed);
    if (keyState['a']) aimPoint.x = Math.max(-1, aimPoint.x - aimAdjustSpeed);
    if (keyState['d']) aimPoint.x = Math.min(1, aimPoint.x + aimAdjustSpeed);
     // Arrow Key Rotation
     // We'll handle rotation update in the game loop now

    if (event.key === ' ') event.preventDefault();
}

function handleKeyUp(event) {
    keyState[event.key] = false;
    if (event.key === ' ' && cueStick.charging) {
        cueStick.charging = false;
        console.log('Shooting with power:', cueStick.power);
        shoot(); // Will need modification
        cueStick.visible = false;
    }
}

// Force scaling factor (adjust as needed)
const FORCE_SCALING = 5.0; // Increased FORCE_SCALING again

// Store the latest mouse position globally for cue stick drawing
let latestMousePos = null;

poolTableCanvas.addEventListener('mousemove', (e) => {
    if (!cueBallBody) return;
    const mousePos = getMousePos(e);
    latestMousePos = mousePos;
    // Always update cue stick angle to point from cue ball to mouse
    const dx = mousePos.x - cueBallBody.position.x;
    const dy = mousePos.y - cueBallBody.position.y;
    cueStick.angle = Math.atan2(dy, dx);
});

// --- Actions (Implementing shoot with Matter.js) ---
function shoot() {
    console.log("Shoot function called!");
    // Ensure cue ball body and latest mouse position exist
    if (!cueBallBody || !latestMousePos || !cueStick.visible) {
         console.error("Shoot called without cue ball, mouse position, or stick visible.");
         return;
    }

    // Calculate angle directly from cue ball to mouse position at the time of shooting
    const dx = latestMousePos.x - cueBallBody.position.x;
    const dy = latestMousePos.y - cueBallBody.position.y;
    const angle = Math.atan2(dy, dx); // Angle FROM cue ball TO mouse

    const targetSpeed = cueStick.power * 0.25; // Keep reduced power
    
    // Calculate base vector TOWARDS mouse
    const vectorX = Math.cos(angle) * targetSpeed;
    const vectorY = Math.sin(angle) * targetSpeed;

    // Apply the REVERSE vector (AWAY from mouse, in the direction the tip points)
    const velocityVector = {
        x: -vectorX,
        y: -vectorY
    };

    // Debug log
    console.log(`SHOOT: Power=${cueStick.power}, Angle=${angle + Math.PI}, Velocity=(${velocityVector.x}, ${velocityVector.y})`); // Log opposite angle

    Matter.Sleeping.set(cueBallBody, false);
    Body.setStatic(cueBallBody, false);
    Matter.Body.setVelocity(cueBallBody, velocityVector);

    cueStick.power = 0; // Reset power after shooting
}

// --- Setup --- 
function setupRack() {
    console.log("Setting up Matter.js rack...");
    // 1. Clear existing dynamic bodies (balls) from the world
    World.remove(world, objectBallBodies); // Remove old object balls
    if (cueBallBody) {
        World.remove(world, cueBallBody); // Remove old cue ball
    }
    objectBallBodies = [];
    ballDataMap.clear();
    cueBallBody = null;

    // 2. Calculate rack positions (same logic as before)
    const rackStartX = TABLE_WIDTH * 0.75;
    const rackStartY = TABLE_HEIGHT / 2;
    const ballDiameter = BALL_RADIUS * 2;
    const rowSpacing = Math.sqrt(3) * BALL_RADIUS;

    let ballNumbers = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    for (let i = ballNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ballNumbers[i], ballNumbers[j]] = [ballNumbers[j], ballNumbers[i]];
    }
    let currentIndex = 0;
    const cornerSolid = Math.random() < 0.5;

    // 3. Create Matter.js bodies for object balls
    const createObjectBallBody = (num, x, y) => {
        const specificBallOptions = {
            ...ballOptions, // Start with common options
            // You could add specific mass/friction here if needed
        };
        const body = Bodies.circle(x, y, BALL_RADIUS, specificBallOptions);
        // Store our custom data associated with this body's ID
        ballDataMap.set(body.id, {
            number: num,
            color: num === 8 ? EIGHT_BALL_COLOR : BALL_COLORS[num],
            isSolid: num === 8 ? null : BALL_IS_SOLID[num]
        });
        return body;
    };

    let placedBallBody;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
            const x = rackStartX + row * rowSpacing;
            const y = rackStartY + col * ballDiameter - row * BALL_RADIUS;
            let ballNumToPlace = -1;

            if (row === 2 && col === 1) {
                ballNumToPlace = 8;
            } else if (row === 4 && (col === 0 || col === 4)) {
                 const placeSolid = (col === 0) ? cornerSolid : !cornerSolid;
                 let found = false;
                 for (let k = 0; k < ballNumbers.length; k++) { // Search remaining numbers
                     if (BALL_IS_SOLID[ballNumbers[k]] === placeSolid) {
                         ballNumToPlace = ballNumbers.splice(k, 1)[0];
                         found = true; break;
                     }
                 }
                 if (!found) ballNumToPlace = ballNumbers.shift(); // Fallback

            } else {
                ballNumToPlace = ballNumbers.shift(); // Take next shuffled ball
            }

            if (ballNumToPlace > 0) {
                 placedBallBody = createObjectBallBody(ballNumToPlace, x, y);
                 objectBallBodies.push(placedBallBody);
            }
        }
    }

    // Add all object balls to the world at once
    World.add(world, objectBallBodies);

    // 4. Create cue ball body
    const cueBallX = TABLE_WIDTH / 4;
    const cueBallY = TABLE_HEIGHT / 2;
    cueBallBody = Bodies.circle(cueBallX, cueBallY, BALL_RADIUS, {
        ...ballOptions,
        isStatic: false, // Also ensure cueball is dynamic
        label: 'cueBall' // Specific label for cue ball
    });
    // Log cue ball mass
    console.log('Cue ball mass:', cueBallBody.mass);
    ballDataMap.set(cueBallBody.id, {
         number: 0,
         color: CUE_BALL_COLOR,
         isSolid: null
    });
    World.add(world, cueBallBody);

    console.log(`Rack setup complete. ${objectBallBodies.length} object balls, 1 cue ball.`);
}

// --- Drawing (Needs adapting) ---
function drawBall(body) { // Now takes a Matter.js body
    const ballData = ballDataMap.get(body.id);
    if (!ballData) return; // Should not happen

    const pos = body.position;
    const angle = body.angle; // Matter.js provides body angle

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.translate(-pos.x, -pos.y); // Translate back to draw at correct global pos

    // Draw main circle centered at body position
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = ballData.color;
    ctx.shadowColor = '#222';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;

    // Draw details (number/stripe/8-ball) - adapted for Matter.js body pos
    if (ballData.number > 0) {
        if (ballData.number === 8) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('8', pos.x, pos.y);
        } else if (!ballData.isSolid) { // Stripe balls
            ctx.fillStyle = 'white';
            ctx.fillRect(pos.x - BALL_RADIUS * 0.7, pos.y - BALL_RADIUS * 0.4, BALL_RADIUS * 1.4, BALL_RADIUS * 0.8);
            ctx.fillStyle = 'black';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ballData.number.toString(), pos.x, pos.y);
            // Optional outline for stripe ball clarity
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.closePath();
        } else { // Solid balls
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, BALL_RADIUS * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            ctx.fillStyle = 'black';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ballData.number.toString(), pos.x, pos.y);
        }
    } else { // Cue ball outline
         ctx.beginPath();
         ctx.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2);
         ctx.strokeStyle = '#aaaaaa';
         ctx.lineWidth = 1;
         ctx.stroke();
         ctx.closePath();
    }

    ctx.restore();
}

function drawCueStick() {
    if (!cueStick.visible || !cueBallBody || !latestMousePos) return;
    const cueBallPos = cueBallBody.position;
    const mouse = latestMousePos;
    // Direction from mouse to cue ball
    const dx = cueBallPos.x - mouse.x;
    const dy = cueBallPos.y - mouse.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return; // Avoid division by zero
    // The tip is always just outside the cue ball, pointing at its center
    const gap = 5;
    const tipX = cueBallPos.x - (dx / length) * (BALL_RADIUS + gap);
    const tipY = cueBallPos.y - (dy / length) * (BALL_RADIUS + gap);
    // The butt is at the mouse position
    const buttX = mouse.x;
    const buttY = mouse.y;
    // Cue stick gradient
    const grad = ctx.createLinearGradient(buttX, buttY, tipX, tipY);
    grad.addColorStop(0, '#a0522d');
    grad.addColorStop(0.7, '#deb887');
    grad.addColorStop(1, '#e0e0e0');
    ctx.beginPath();
    ctx.lineWidth = CUE_STICK_WIDTH;
    ctx.strokeStyle = grad;
    ctx.moveTo(buttX, buttY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.closePath();
    // Tip marker
    ctx.beginPath();
    ctx.arc(tipX, tipY, CUE_TIP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'blue';
    ctx.fill();
    ctx.closePath();
}

function drawIndicator() {
    // Restore drawing logic for the aim indicator
    const centerX = indicatorCanvas.width / 2;
    const centerY = indicatorCanvas.height / 2;
    const displayRadius = indicatorCanvas.width / 2 - 10;

    // Clear indicator canvas
    indicatorCtx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);

    // Draw cue ball representation
    indicatorCtx.beginPath();
    indicatorCtx.arc(centerX, centerY, displayRadius, 0, Math.PI * 2);
    indicatorCtx.fillStyle = CUE_BALL_COLOR;
    indicatorCtx.fill();
    indicatorCtx.strokeStyle = '#888';
    indicatorCtx.stroke();
    indicatorCtx.closePath();

    // Draw aim point (red target)
    const targetX = centerX + aimPoint.x * displayRadius;
    const targetY = centerY + aimPoint.y * displayRadius;
    indicatorCtx.beginPath();
    indicatorCtx.arc(targetX, targetY, 3, 0, Math.PI * 2);
    indicatorCtx.fillStyle = 'red';
    indicatorCtx.fill();
    indicatorCtx.closePath();
}

function drawPockets() {
    // This function remains the same (draws visual representation)
    ctx.fillStyle = 'black';
    pockets.forEach(pocket => {
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    });
}

function drawPowerBar() {
     // Restore drawing logic for the power bar
     if (cueStick.charging) {
        const barWidth = 150;
        const barHeight = 15;
        const barX = (TABLE_WIDTH - barWidth) / 2; // Use TABLE_WIDTH constant
        const barY = TABLE_HEIGHT - barHeight - 10; // Use TABLE_HEIGHT constant

        ctx.fillStyle = '#555';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        const powerWidth = (cueStick.power / MAX_POWER) * barWidth;
        const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        gradient.addColorStop(0, '#00FF00');
        gradient.addColorStop(0.7, '#FFFF00');
        gradient.addColorStop(1, '#FF0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, barY, powerWidth, barHeight);

        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
}

function drawGuideLine() {
     // TODO: Reimplement if needed, potentially using raycasting
     console.log("Placeholder: drawGuideLine might need raycasting");
}

// --- Game Loop (Implementing Pocketing and Settling) ---
let lastTime = 0;
let simulationRunning = false; // Track if physics simulation is active

function gameLoop(timestamp) {
    //console.log("Game loop running..."); 
    const now = timestamp || performance.now();
    const dt = (now - (lastTime || now)) / 1000; // Delta time in seconds
    lastTime = now;
    // Log delta time
    //console.log(`Delta time (dt): ${dt}`);

    // 1. Handle Input (Only when aiming)
    if (gamePhase === 'aiming') {
        cueStick.visible = true;
        simulationRunning = false;
        // Keyboard aiming (unchanged)
        const rotateSpeed = 0.05;
        if (keyState['ArrowLeft']) cueStick.angle -= rotateSpeed;
        if (keyState['ArrowRight']) cueStick.angle += rotateSpeed;
        cueStick.angle = (cueStick.angle + Math.PI * 2) % (Math.PI * 2);
        // WASD Aim Adjust is handled in keyDown

        // Mouse charging
        if (mouseDown && cueStick.charging) {
            cueStick.power = Math.min(MAX_POWER, cueStick.power + POWER_INCREMENT);
        }
        // Keyboard charging (unchanged)
        if (keyState[' '] && !cueStick.charging) {
            cueStick.charging = true;
            cueStick.power = 0;
        }
        if (cueStick.charging && !mouseDown) {
            // If charging by keyboard, power up
            if (keyState[' ']) {
                cueStick.power = Math.min(MAX_POWER, cueStick.power + POWER_INCREMENT);
            } else if (!mouseDown) { // Released space
                shoot();
                gamePhase = 'simulating';
                cueStick.visible = false;
                cueStick.charging = false;
                simulationRunning = true;
                pocketedThisTurn = [];
            }
        }
    }

    // 2. Update Matter.js Engine (Only if simulating)
    if (simulationRunning) {
         console.log("Engine updating...");
         const updateDt = Math.min(dt * 1000, 16.67 * 3); // Use capped delta for update
         //console.log(`Engine update dt (ms): ${updateDt}`); // Log update dt
         Engine.update(engine, updateDt); 
    }

    // 3. Check for Pocketed Balls (During simulation)
    if (simulationRunning) {
        const bodiesToRemove = [];
        const currentBallBodies = Matter.Composite.allBodies(world).filter(b => b.label === 'ball' || b.label === 'cueBall');

        currentBallBodies.forEach(body => {
            for (const pocket of pockets) {
                const dx = body.position.x - pocket.x;
                const dy = body.position.y - pocket.y;
                if (dx * dx + dy * dy < POCKET_RADIUS * POCKET_RADIUS) {
                    console.log(`Pocketed: ${body.label === 'cueBall' ? 'CUE BALL' : 'Object Ball'} ID: ${body.id}`);
                    pocketedThisTurn.push(body); // Add to list for this turn
                    bodiesToRemove.push(body);
                    break; // Ball can only go in one pocket
                }
            }
        });

        // Remove bodies from world and map
        bodiesToRemove.forEach(body => {
             World.remove(world, body);
             ballDataMap.delete(body.id);
             // Update objectBallBodies array if needed (though iterating World.allBodies is often safer)
             if(body.label === 'ball') {
                 objectBallBodies = objectBallBodies.filter(b => b.id !== body.id);
             }
        });
    }

    // 4. Check if simulation has settled (During simulation)
    let allStopped = false;
    if (simulationRunning) {
        const motionThreshold = 0.05; // Speed below which a ball is considered stopped
        const angularThreshold = 0.05;
        allStopped = true; // Assume stopped until proven otherwise

        const currentBallBodies = Matter.Composite.allBodies(world).filter(b => b.label === 'ball' || b.label === 'cueBall');

        if (currentBallBodies.length === 0 && cueBallBody && !World.get(world, cueBallBody.id)) {
             // Special case: Only cue ball was on table and it got pocketed
             allStopped = true;
        } else {
            for (const body of currentBallBodies) {
                if (!body.isSleeping && (body.speed > motionThreshold || Math.abs(body.angularSpeed) > angularThreshold)) {
                    allStopped = false;
                    break; // Found a moving ball
                }
            }
        }

        // Alternative: Use engine events (less reliable for exact stop)
        // Matter.js sleeping is helpful but might trigger too early/late for game logic

        if (allStopped) {
            console.log("Simulation settled.");
            simulationRunning = false;
            // --- Handle Turn End --- 
            let foul = false;
            let cueBallPocketed = false;
            pocketedThisTurn.forEach(body => {
                if(body.label === 'cueBall') cueBallPocketed = true;
            });

            if(cueBallPocketed) {
                 console.log("SCRATCH!");
                 foul = true;
                 // Respawn Cue Ball
                 respawnCueBall();
            }

            // TODO: Add other foul checks (e.g., no ball hit cushion/pocket)
            // TODO: Add game logic (assign stripes/solids, check for win/loss)

            if (!foul) {
                 console.log("Turn ended normally.");
                 // Check if any legal ball was pocketed, if not, switch player (later)
            }

             // Reset aim point for next shot
             aimPoint.x = 0;
             aimPoint.y = 0;
            
             gamePhase = 'aiming'; // Return control to player
        }
    }

    // 5. Drawing
    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    drawTable();
    drawPockets();

    const allBodies = Matter.Composite.allBodies(world);
    allBodies.forEach(body => {
        if (body.label === 'ball' || body.label === 'cueBall') {
            drawBall(body);
        }
    });

    if (gamePhase === 'aiming') {
        drawCueStick();
        drawPowerBar();
        drawIndicator();
        drawGuideLine();
    }

    requestAnimationFrame(gameLoop);
}

function respawnCueBall() {
     console.log("Respawning cue ball...");
     // Ensure old body is fully removed if somehow still tracked
     if (cueBallBody && World.get(world, cueBallBody.id)) {
         World.remove(world, cueBallBody);
     }

     const cueBallX = TABLE_WIDTH / 4; // Head spot X
     const cueBallY = TABLE_HEIGHT / 2; // Head spot Y
     cueBallBody = Bodies.circle(cueBallX, cueBallY, BALL_RADIUS, {
         ...ballOptions,
         label: 'cueBall'
     });
      // Re-add cue ball data to map
     ballDataMap.set(cueBallBody.id, {
         number: 0,
         color: CUE_BALL_COLOR,
         isSolid: null
     });
     World.add(world, cueBallBody);
}

// --- Mouse Controls ---
let mouseDown = false;

poolTableCanvas.addEventListener('mousedown', (e) => {
    if (gamePhase !== 'aiming' || !cueBallBody) return;
    mouseDown = true;
    cueStick.charging = true;
    cueStick.power = 0;
});

poolTableCanvas.addEventListener('mouseup', (e) => {
    if (!cueBallBody || !cueStick.charging) return;
    console.log("Mouse up event triggered! Attempting to shoot.");
    mouseDown = false;
    cueStick.charging = false;
    // Shoot with the current power
    shoot();
    gamePhase = 'simulating';
    simulationRunning = true;
    cueStick.visible = false;
    pocketedThisTurn = [];
});

function getMousePos(evt) {
    const rect = poolTableCanvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (poolTableCanvas.width / rect.width),
        y: (evt.clientY - rect.top) * (poolTableCanvas.height / rect.height)
    };
}

// --- Visual Improvements ---
// Table gradient
function drawTable() {
    const grad = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
    grad.addColorStop(0, '#357a38');
    grad.addColorStop(1, '#1b5e20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    // Table border
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#8d5524';
    ctx.strokeRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
}

// --- Initial Setup ---
setupRack();
requestAnimationFrame(gameLoop);

console.log("Pool XL script updated with Matter.js shooting and basic loop logic."); 