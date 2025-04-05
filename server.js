const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000; // Port the server will listen on

const musicDir = path.join(__dirname, 'music');
const publicDir = __dirname; // Serve index.html etc. from the root project directory

// Ensure music directory exists
if (!fs.existsSync(musicDir)) {
    console.log(`Music directory not found at ${musicDir}, creating it.`);
    fs.mkdirSync(musicDir);
}

// API endpoint to get the list of music files
app.get('/api/music', (req, res) => {
    fs.readdir(musicDir, (err, files) => {
        if (err) {
            console.error("Error reading music directory:", err);
            return res.status(500).json({ error: 'Could not read music directory' });
        }
        // Filter out non-audio files if needed (optional, simple version just lists all)
        // Example: const audioFiles = files.filter(file => /\.(mp3|ogg|wav)$/i.test(file));
        res.json(files); // Send the list of all files in the directory
    });
});

// Serve static files from the 'music' directory under the '/music' path
app.use('/music', express.static(musicDir));

// Serve static files from the main project directory (index.html, script.js, style.css)
app.use(express.static(publicDir));

// Start the server
app.listen(port, () => {
    console.log(`Tetris server running at http://localhost:${port}`);
    console.log(`Serving music from: ${musicDir}`);
});
