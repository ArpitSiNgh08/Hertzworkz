const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

mongoose.set('debug', true);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const mongodbUri = process.env.MONGODB_URI;
console.log('Connecting to:', mongodbUri);

mongoose.connect(mongodbUri, {
    family: 4
})
    .then(() => {
        console.log('Successfully connected to MongoDB.');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error.message);
    });

// Basic Route
app.get('/', (req, res) => {
    res.send('Backend server is running');
});

// Auth Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
