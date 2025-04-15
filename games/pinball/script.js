const canvas = document.getElementById('pinballCanvas');
const ctx = canvas.getContext('2d');

// --- Matter.js Setup ---
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Events = Matter.Events;
const Render = Matter.Render; // Might use for debugging

// --- Game Constants ---
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const WALL_THICKNESS = 20;
const WALL_COLOR = '#555'; // Dark grey for walls
const BALL_RADIUS = 12;
const BALL_COLOR = '#ddd'; // Light grey/silver for pinball
const FLIPPER_WIDTH = 180;
const FLIPPER_HEIGHT = 15;
const FLIPPER_COLOR = '#ff8c00'; // Dark Orange
const FLIPPER_PADDING = 100; // Increased padding to move inwards
const FLIPPER_Y_POSITION = CANVAS_HEIGHT - 120; // Moved up slightly
const FLIPPER_ANGLE_LIMIT = Math.PI / 4; // Max angle (45 degrees)
const FLIPPER_REST_ANGLE_OFFSET = 0.1; // Small offset for resting angle
const FLIPPER_STIFFNESS = 0.1; // Constraint stiffness
const FLIPPER_DAMPING = 0.05; // Constraint damping
const FLIPPER_ANGULAR_VELOCITY = 0.5; // Speed of flipper rotation
const BUMPER_RADIUS = 20;
const BUMPER_COLOR = '#ff0000'; // Red
const BUMPER_RESTITUTION = 1.5; // Make them very bouncy!
const BUMPER_KICK_FORCE = 0.1; // Force applied on bumper hit (Increased significantly)
const LAUNCHER_LANE_WIDTH = 40;
const LAUNCHER_WALL_COLOR = '#444';
const PLUNGER_WIDTH = LAUNCHER_LANE_WIDTH * 0.8;
const PLUNGER_HEIGHT = 30;
const PLUNGER_COLOR = '#ccc';
const PLUNGER_MAX_PULL = 80;
const PLUNGER_STIFFNESS = 0.01; // Reduced stiffness significantly
const PLUNGER_DAMPING = 0.1; // Increased damping slightly
const PLUNGER_PULL_FORCE = 0.005; // Small force to pull down against constraint
const GUIDE_WALL_COLOR = '#6a0dad'; // Purple for guide walls

// Set canvas dimensions
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Create an engine
const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1; // Standard gravity for pinball

console.log("Pinball script loaded. Matter.js engine created.");

// --- Game Elements ---
let pinball = null; // Variable to hold the pinball body
let leftFlipper = null;
let rightFlipper = null;
let leftFlipperConstraint = null;
let rightFlipperConstraint = null;
const staticBodies = []; // Array to hold walls, bumpers etc.
const dynamicBodies = []; // Array for moving bodies (ball, flippers, plunger)
let plunger = null;
let plungerConstraint = null;
let isPullingPlunger = false;

// Wall properties
const wallOptions = {
    isStatic: true,
    restitution: 0.5, // Some bounce
    friction: 0.1,
    render: { // Basic rendering properties (optional, good for debug)
        fillStyle: WALL_COLOR
    }
};

// Create Walls (Adjusted for Launcher Lane)
// --- Main Play Area Walls ---
const wallLeft = Bodies.rectangle(
    WALL_THICKNESS / 2,
    CANVAS_HEIGHT / 2,
    WALL_THICKNESS,
    CANVAS_HEIGHT,
    wallOptions
);
// Bottom wall (shorter, leaves gap for plunger area & drain later)
const mainBottomWallWidth = CANVAS_WIDTH - LAUNCHER_LANE_WIDTH - WALL_THICKNESS * 1.5; // Width minus lane and separator
const mainBottomWallX = WALL_THICKNESS / 2 + mainBottomWallWidth / 2;
const wallBottom = Bodies.rectangle(
    mainBottomWallX,
    CANVAS_HEIGHT - WALL_THICKNESS / 2,
    mainBottomWallWidth,
    WALL_THICKNESS,
    { ...wallOptions, label: 'bottomWall' }
);
const wallTop = Bodies.rectangle(
    CANVAS_WIDTH / 2,
    WALL_THICKNESS / 2,
    CANVAS_WIDTH, // Still full width at the top
    WALL_THICKNESS,
    wallOptions
);

// --- Launcher Lane Walls ---
// Right wall of main area (shorter)
const mainWallRightHeight = CANVAS_HEIGHT - LAUNCHER_LANE_WIDTH * 1.5; // Stops above lane opening
const mainWallRight = Bodies.rectangle(
    CANVAS_WIDTH - LAUNCHER_LANE_WIDTH - WALL_THICKNESS / 2, // Shifted left
    mainWallRightHeight / 2, // Centered vertically
    WALL_THICKNESS,
    mainWallRightHeight,
    { ...wallOptions, render: { fillStyle: LAUNCHER_WALL_COLOR } }
);
// Right wall of the launcher lane
const launcherWallRight = Bodies.rectangle(
    CANVAS_WIDTH - WALL_THICKNESS / 2,
    CANVAS_HEIGHT / 2,
    WALL_THICKNESS,
    CANVAS_HEIGHT, // Full height
    { ...wallOptions, render: { fillStyle: LAUNCHER_WALL_COLOR } }
);

// --- Flipper Guide Walls ---
const guideWallOptions = {
    isStatic: true,
    restitution: 0.3,
    friction: 0.1,
    render: { fillStyle: GUIDE_WALL_COLOR }
};

// Left Guide Wall (Trapezoid shape)
const leftGuideTopY = FLIPPER_Y_POSITION - 80; // Start above flipper Y
const leftGuideBottomY = FLIPPER_Y_POSITION + FLIPPER_HEIGHT;
const leftGuideInnerX = FLIPPER_PADDING; // Aligns with inner edge of flipper area
const leftGuideOuterX = WALL_THICKNESS; // Aligns with outer wall
const leftGuideVertices = [
    { x: leftGuideOuterX, y: leftGuideTopY }, 
    { x: leftGuideInnerX + 30, y: leftGuideBottomY - 50 }, // Top-inner point (angled)
    { x: leftGuideInnerX, y: leftGuideBottomY },        // Bottom-inner point
    { x: leftGuideOuterX, y: leftGuideBottomY }         // Bottom-outer point
];
const leftGuideWall = Bodies.fromVertices( (leftGuideInnerX + leftGuideOuterX)/2, (leftGuideTopY + leftGuideBottomY)/2 , [leftGuideVertices], guideWallOptions);

// Right Guide Wall (Trapezoid shape)
const rightGuideTopY = FLIPPER_Y_POSITION - 80;
const rightGuideBottomY = FLIPPER_Y_POSITION + FLIPPER_HEIGHT;
const rightGuideInnerX = CANVAS_WIDTH - FLIPPER_PADDING; // Aligns with inner edge of flipper area
const rightGuideOuterX = CANVAS_WIDTH - LAUNCHER_LANE_WIDTH - WALL_THICKNESS; // Aligns with the launcher lane separator
const rightGuideVertices = [
    { x: rightGuideOuterX, y: rightGuideTopY },
    { x: rightGuideInnerX - 30, y: rightGuideBottomY - 50 }, // Top-inner point (angled)
    { x: rightGuideInnerX, y: rightGuideBottomY },        // Bottom-inner point
    { x: rightGuideOuterX, y: rightGuideBottomY }         // Bottom-outer point
];
const rightGuideWall = Bodies.fromVertices( (rightGuideInnerX + rightGuideOuterX)/2, (rightGuideTopY + rightGuideBottomY)/2, [rightGuideVertices], guideWallOptions);

// Add walls to the static bodies array and the world
staticBodies.push(wallLeft, wallBottom, wallTop, mainWallRight, launcherWallRight, leftGuideWall, rightGuideWall); // Added guide walls
World.add(world, [wallLeft, wallBottom, wallTop, mainWallRight, launcherWallRight, leftGuideWall, rightGuideWall]); // Added guide walls

console.log("Walls created and added to the world.");

// Create Pinball (Moved to Launcher Lane)
const ballOptions = {
    isStatic: false,
    restitution: 0.4, // Moderate bounce
    friction: 0.05,
    frictionAir: 0.01, // Slight air resistance
    density: 0.0015, // Adjust mass
    render: { // Basic rendering properties
        fillStyle: BALL_COLOR,
        strokeStyle: 'black',
        lineWidth: 1
    },
    label: 'pinball' // Label for identification
};

const pinballStartX = CANVAS_WIDTH - LAUNCHER_LANE_WIDTH / 2 - WALL_THICKNESS / 2;
// Corrected Y position: Just above the plunger's resting top edge
const plungerRestTopY = (CANVAS_HEIGHT - WALL_THICKNESS - PLUNGER_HEIGHT / 2) - PLUNGER_HEIGHT / 2;
const pinballStartY = plungerRestTopY - BALL_RADIUS - 1; // Place ball center 1px above plunger top
pinball = Bodies.circle(pinballStartX, pinballStartY, BALL_RADIUS, ballOptions);
World.add(world, pinball);
dynamicBodies.push(pinball); // Add ball to dynamic bodies array

console.log(`Pinball created at (${pinballStartX.toFixed(1)}, ${pinballStartY.toFixed(1)})`);

// --- Flipper Setup ---
const flipperOptions = {
    isStatic: false, // Flippers move
    restitution: 0.5,
    friction: 0.5,
    density: 0.005, // Make them relatively heavy
    render: { fillStyle: FLIPPER_COLOR },
    label: 'flipper',
    // Collision filter to prevent flippers colliding with each other (optional)
    // collisionFilter: { group: -1 } // Needs Matter.Body.nextGroup(true)
};

// Left Flipper
const leftFlipperX = FLIPPER_PADDING + FLIPPER_WIDTH / 2;
const leftFlipperPivotX = FLIPPER_PADDING + FLIPPER_HEIGHT / 2;
leftFlipper = Bodies.rectangle(leftFlipperX, FLIPPER_Y_POSITION, FLIPPER_WIDTH, FLIPPER_HEIGHT, flipperOptions);
leftFlipperConstraint = Matter.Constraint.create({
    bodyA: leftFlipper,
    pointA: { x: -FLIPPER_WIDTH / 2 + FLIPPER_HEIGHT / 2, y: 0 },
    pointB: { x: leftFlipperPivotX, y: FLIPPER_Y_POSITION },
    stiffness: FLIPPER_STIFFNESS,
    damping: FLIPPER_DAMPING,
    length: 0
});
// Set initial resting angle (slightly down)
Body.setAngle(leftFlipper, FLIPPER_REST_ANGLE_OFFSET);

// Right Flipper
const rightFlipperX = CANVAS_WIDTH - FLIPPER_PADDING - FLIPPER_WIDTH / 2;
const rightFlipperPivotX = CANVAS_WIDTH - FLIPPER_PADDING - FLIPPER_HEIGHT / 2;
rightFlipper = Bodies.rectangle(rightFlipperX, FLIPPER_Y_POSITION, FLIPPER_WIDTH, FLIPPER_HEIGHT, flipperOptions);
rightFlipperConstraint = Matter.Constraint.create({
    bodyA: rightFlipper,
    pointA: { x: FLIPPER_WIDTH / 2 - FLIPPER_HEIGHT / 2, y: 0 },
    pointB: { x: rightFlipperPivotX, y: FLIPPER_Y_POSITION },
    stiffness: FLIPPER_STIFFNESS,
    damping: FLIPPER_DAMPING,
    length: 0
});
// Set initial resting angle (slightly down)
Body.setAngle(rightFlipper, -FLIPPER_REST_ANGLE_OFFSET);

// Add flippers and constraints to the world
World.add(world, [leftFlipper, rightFlipper, leftFlipperConstraint, rightFlipperConstraint]);
dynamicBodies.push(leftFlipper, rightFlipper); // Flippers are dynamic

console.log("Flippers and constraints created and added.");

// --- Bumper Setup ---
const bumperOptions = {
    isStatic: true,
    restitution: BUMPER_RESTITUTION,
    friction: 0,
    render: { fillStyle: BUMPER_COLOR },
    label: 'bumper',
    isSensor: false // Make sure they are not sensors for collision events
};

// Create bumpers in a triangle formation
const bumperY = CANVAS_HEIGHT * 0.35;
const bumperSpacing = CANVAS_WIDTH * 0.28; // Slightly increased spacing
const bumper1 = Bodies.circle(CANVAS_WIDTH / 2, bumperY, BUMPER_RADIUS, bumperOptions);
const bumper2 = Bodies.circle(CANVAS_WIDTH / 2 - bumperSpacing, bumperY + BUMPER_RADIUS * 3, BUMPER_RADIUS, bumperOptions);
const bumper3 = Bodies.circle(CANVAS_WIDTH / 2 + bumperSpacing, bumperY + BUMPER_RADIUS * 3, BUMPER_RADIUS, bumperOptions);

// Add bumpers to static bodies and world
staticBodies.push(bumper1, bumper2, bumper3);
World.add(world, [bumper1, bumper2, bumper3]);

console.log("Bumpers created and added.");

// --- Plunger Setup ---
const plungerX = CANVAS_WIDTH - LAUNCHER_LANE_WIDTH / 2 - WALL_THICKNESS / 2;
const plungerStartY = CANVAS_HEIGHT - WALL_THICKNESS - PLUNGER_HEIGHT / 2; // This remains the center Y
plunger = Bodies.rectangle(plungerX, plungerStartY, PLUNGER_WIDTH, PLUNGER_HEIGHT, {
    isStatic: false, // It moves
    density: 0.01,
    restitution: 0.1,
    friction: 0.8,
    render: { fillStyle: PLUNGER_COLOR },
    label: 'plunger'
});

// Constrain the plunger to only move vertically
plungerConstraint = Matter.Constraint.create({
    bodyA: plunger,
    pointB: { x: plungerX, y: plungerStartY }, // Anchor point (resting position)
    stiffness: PLUNGER_STIFFNESS, // Use updated constant
    damping: PLUNGER_DAMPING,     // Use updated constant
    render: { visible: false } // Don't draw the constraint line
});

World.add(world, [plunger, plungerConstraint]);
dynamicBodies.push(plunger);
console.log("Plunger created and added.");

// --- Drawing Functions ---
function drawStaticBodies() {
    // Draw all static bodies (walls, bumpers)
    staticBodies.forEach(body => {
        const color = body.render.fillStyle || '#555'; // Use render color or default
        ctx.fillStyle = color;
        ctx.beginPath();
        if (body.circleRadius) { // Check if it's a circle
            ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
        } else { // Assume rectangle/polygon
             body.vertices.forEach((vertex, index) => {
                if (index === 0) {
                    ctx.moveTo(vertex.x, vertex.y);
                } else {
                    ctx.lineTo(vertex.x, vertex.y);
                }
            });
            ctx.closePath();
        }
        ctx.fill();
    });
}

function drawBall() {
    if (!pinball) return;

    const pos = pinball.position;
    const angle = pinball.angle; // We might use angle later for effects

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Simple circle drawing for now
    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = BALL_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#333'; // Darker outline
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
}

function drawFlippers() {
    [leftFlipper, rightFlipper].forEach(flipper => {
        if (!flipper) return;
        const pos = flipper.position;
        const angle = flipper.angle;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);

        // Draw rectangle centered at (0,0)
        ctx.fillStyle = FLIPPER_COLOR;
        ctx.fillRect(-FLIPPER_WIDTH / 2, -FLIPPER_HEIGHT / 2, FLIPPER_WIDTH, FLIPPER_HEIGHT);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(-FLIPPER_WIDTH / 2, -FLIPPER_HEIGHT / 2, FLIPPER_WIDTH, FLIPPER_HEIGHT);

        // Draw pivot point (for debugging)
        // const pivot = flipper === leftFlipper ? leftFlipperConstraint.pointA : rightFlipperConstraint.pointA;
        // ctx.fillStyle = 'red';
        // ctx.beginPath();
        // ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
        // ctx.fill();

        ctx.restore();
    });
}

function drawDynamicBodies() {
     // Consolidated drawing for dynamic bodies (ball, flippers, plunger)
     dynamicBodies.forEach(body => {
        if (!body) return;
        const pos = body.position;
        const angle = body.angle;
        const color = body.render.fillStyle;
        const label = body.label;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;

        if (label === 'pinball') {
            ctx.beginPath();
            ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.closePath();
        } else if (label === 'flipper') {
            const width = body === leftFlipper || body === rightFlipper ? FLIPPER_WIDTH : 0; // Get correct width
            const height = body === leftFlipper || body === rightFlipper ? FLIPPER_HEIGHT : 0;
            ctx.fillRect(-width / 2, -height / 2, width, height);
            ctx.strokeRect(-width / 2, -height / 2, width, height);
        } else if (label === 'plunger') {
             ctx.fillRect(-PLUNGER_WIDTH / 2, -PLUNGER_HEIGHT / 2, PLUNGER_WIDTH, PLUNGER_HEIGHT);
             ctx.strokeRect(-PLUNGER_WIDTH / 2, -PLUNGER_HEIGHT / 2, PLUNGER_WIDTH, PLUNGER_HEIGHT);
        }

        ctx.restore();
     });
}

// --- Game Loop ---
function gameLoop() {
    // 1. Update Engine
    Engine.update(engine);

    // --- Flipper Control Logic ---
    // Left Flipper (Key: 'a')
    if (leftFlipper) {
        if (keyState['a'] && leftFlipper.angle > -FLIPPER_ANGLE_LIMIT) {
            // Key pressed and flipper below limit: apply upward velocity
            Body.setAngularVelocity(leftFlipper, -FLIPPER_ANGULAR_VELOCITY);
        } else if (!keyState['a'] && leftFlipper.angle < FLIPPER_REST_ANGLE_OFFSET) {
            // Key released and flipper above resting: apply gentle downward velocity or let gravity work
             Body.setAngularVelocity(leftFlipper, FLIPPER_ANGULAR_VELOCITY * 0.3); // Gentle return
        } else {
             // Clamp angle if needed or stop velocity if at rest/limit
            if (leftFlipper.angle <= -FLIPPER_ANGLE_LIMIT) Body.setAngularVelocity(leftFlipper, 0);
            //if (leftFlipper.angle >= FLIPPER_REST_ANGLE_OFFSET && !keyState['a']) Body.setAngularVelocity(leftFlipper, 0);
            // Let constraint handle the resting angle slightly better
        }
        // Clamp angle strictly
        if (leftFlipper.angle < -FLIPPER_ANGLE_LIMIT) Body.setAngle(leftFlipper, -FLIPPER_ANGLE_LIMIT);
        if (leftFlipper.angle > FLIPPER_REST_ANGLE_OFFSET && !keyState['a']) Body.setAngle(leftFlipper, FLIPPER_REST_ANGLE_OFFSET);

    }

    // Right Flipper (Key: 'd')
     if (rightFlipper) {
        if (keyState['d'] && rightFlipper.angle < FLIPPER_ANGLE_LIMIT) {
            // Key pressed and flipper below limit: apply upward velocity
            Body.setAngularVelocity(rightFlipper, FLIPPER_ANGULAR_VELOCITY);
        } else if (!keyState['d'] && rightFlipper.angle > -FLIPPER_REST_ANGLE_OFFSET) {
             // Key released and flipper above resting: apply gentle downward velocity or let gravity work
             Body.setAngularVelocity(rightFlipper, -FLIPPER_ANGULAR_VELOCITY * 0.3); // Gentle return
        } else {
             // Clamp angle if needed or stop velocity if at rest/limit
             if (rightFlipper.angle >= FLIPPER_ANGLE_LIMIT) Body.setAngularVelocity(rightFlipper, 0);
             //if (rightFlipper.angle <= -FLIPPER_REST_ANGLE_OFFSET && !keyState['d']) Body.setAngularVelocity(rightFlipper, 0);
             // Let constraint handle the resting angle slightly better
        }
         // Clamp angle strictly
        if (rightFlipper.angle > FLIPPER_ANGLE_LIMIT) Body.setAngle(rightFlipper, FLIPPER_ANGLE_LIMIT);
        if (rightFlipper.angle < -FLIPPER_REST_ANGLE_OFFSET && !keyState['d']) Body.setAngle(rightFlipper, -FLIPPER_REST_ANGLE_OFFSET);
    }

    // --- Plunger Control Logic (Pull-back and Release) ---
    if (plunger) {
        // LOGGING: Check state at start of logic block
        // console.log(`Plunger Logic: isPulling=${isPullingPlunger}, currentY=${plunger.position.y.toFixed(1)}`); 

        const restingY = plungerConstraint.pointB.y; // Plunger wants to return here
        const currentY = plunger.position.y;
        const maxPullY = restingY + PLUNGER_MAX_PULL;

        if (isPullingPlunger) {
            // While space is held, apply downward force if not at max pull
            if (currentY < maxPullY) {
                 console.log("Pulling plunger down..."); // LOGGING
                 Body.applyForce(plunger, plunger.position, { x: 0, y: PLUNGER_PULL_FORCE });
            } else {
                 // Already at max pull, keep it there
                 Body.setPosition(plunger, {x: plunger.position.x, y: maxPullY});
                 Body.setVelocity(plunger, {x:0, y:0});
            }
        } 
        // When space is released (isPullingPlunger is false), the constraint
        // automatically pulls the plunger back towards restingY.
        // No explicit upward force needed here, unless the spring is too weak.
        
        // Optional: Clamp position just in case physics glitches
        if (currentY > maxPullY + 5) { // Allow some overshoot
            Body.setPosition(plunger, { x: plunger.position.x, y: maxPullY });
            Body.setVelocity(plunger, { x: 0, y: 0 });
        }
    }

    // 2. Clear Canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 3. Draw Game Elements
    drawStaticBodies();
    drawDynamicBodies(); // Draw all dynamic elements

    // 4. Request Next Frame
    requestAnimationFrame(gameLoop);
}

// --- Input Handling ---
const keyState = {};

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    // LOGGING: Check if keydown is detected for space
    if (key === ' ') {
        console.log("Space keydown detected!"); 
        if (!isPullingPlunger) {
            console.log("Setting isPullingPlunger = true"); // LOGGING
            isPullingPlunger = true;
        }
    } else {
         // Log other keys for debugging if needed
         // console.log(`Keydown: ${key}`);
    }
    keyState[key] = true;

    // Prevent default browser action for keys used
    if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key)) {
        event.preventDefault();
    }
    // TODO: Trigger flipper action
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keyState[key] = false;
    if (key === ' ') {
        if (isPullingPlunger) {
            console.log("Space up - Release plunger!"); // LOGGING
            isPullingPlunger = false;
            // Constraint will now take over and spring it back up
        }
    }
    // No explicit stop action needed here, handled in game loop
});

// --- Collision Handling ---
Events.on(engine, 'collisionStart', (event) => {
    console.log("CollisionStart event fired"); // LOGGING
    const pairs = event.pairs;

    pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        let bumper = null;
        let ball = null;

        // Log the labels of colliding pairs
        // console.log(`Collision pair: ${bodyA.label} / ${bodyB.label}`);

        // Check if one body is the pinball and the other is a bumper
        if (bodyA.label === 'pinball' && bodyB.label === 'bumper') {
            ball = bodyA;
            bumper = bodyB;
        } else if (bodyB.label === 'pinball' && bodyA.label === 'bumper') {
            ball = bodyB;
            bumper = bodyA;
        }

        if (ball && bumper) {
            console.log(`Collision detected: ${ball.label} with ${bumper.label}`); // LOGGING
            // Calculate direction vector from bumper center to ball center
            const dx = ball.position.x - bumper.position.x;
            const dy = ball.position.y - bumper.position.y;
            // Ensure distance is not zero to avoid division by zero
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const normalX = dx / distance;
            const normalY = dy / distance;

            // Apply force in the calculated direction
            const forceMagnitude = BUMPER_KICK_FORCE; // Use the increased force
            const force = {
                x: normalX * forceMagnitude,
                y: normalY * forceMagnitude
            };

            // Apply force TO the ball AT the ball's current position
            // (Applying at the bumper position might not work as intended)
            console.log(`Applying force (${force.x.toFixed(3)}, ${force.y.toFixed(3)}) to ${ball.label}`); // LOGGING
            Body.applyForce(ball, ball.position, force);

            // Optional: Add a small visual flash on hit
            bumper.render.fillStyle = '#ffffff'; // Flash white
            setTimeout(() => { bumper.render.fillStyle = BUMPER_COLOR; }, 50); // Revert color

            // TODO: Add score, sound effect etc.
        }
    });
});

// --- Initial Setup ---
// (Bodies are created above)

// Start the game loop
requestAnimationFrame(gameLoop); 