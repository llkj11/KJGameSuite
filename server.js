const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000; // Port the server will listen on

const musicDir = path.join(__dirname, 'games/tetris/music'); // Updated music path
const rootDir = __dirname; // Serve main index.html, style.css, and games/ dir from root

// Ensure music directory exists (important if starting fresh)
if (!fs.existsSync(musicDir)) {
    console.log(`Music directory not found at ${musicDir}, creating it.`);
    // Use recursive true in case parent dirs don't exist
    fs.mkdirSync(musicDir, { recursive: true });
}

// // --- Sound Effects Directory --- (No longer needed with Web Audio)
// const soundsDir = path.join(__dirname, 'sounds');
// if (!fs.existsSync(soundsDir)) {
//     console.log(`Sounds directory not found at ${soundsDir}, creating it.`);
//     fs.mkdirSync(soundsDir, { recursive: true });
// }

// API endpoint to get the list of music files (points to Tetris music)
app.get('/api/music', (req, res) => {
    fs.readdir(musicDir, (err, files) => {
        if (err) {
            console.error("Error reading music directory:", err);
            return res.status(500).json({ error: 'Could not read music directory' });
        }
        // Filter out non-audio files if needed
        const audioFiles = files.filter(file => /\.(mp3|ogg|wav)$/i.test(file));
        res.json(audioFiles); // Send only audio files
    });
});

// Serve static files from the 'games/tetris/music' directory under the '/music' path
app.use('/music', express.static(musicDir));

// // --- Serve Sound Effects --- (No longer needed with Web Audio)
// app.use('/sounds', express.static(soundsDir));

// Serve all other static files (index.html, style.css, games/ folder) from the root directory
app.use(express.static(rootDir));

// Start the server
app.listen(port, () => {
    console.log(`KJ Game Suite server running at http://localhost:${port}`);
    console.log(`Serving Tetris music from: ${musicDir}`);
});
