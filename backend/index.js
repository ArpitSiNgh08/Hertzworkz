const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

mongoose.set('debug', true);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
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

// Chat Routes
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined their room`);
    });

    socket.on('send_message', (data) => {
        // Broadcast to the specific receiver's room
        io.to(data.receiver).emit('receive_message', data);
    });

    // Call Signaling
    socket.on('initiate_call', (data) => {
        // data: { callerId, callerEmail, receiverId }
        console.log(`Call initiated from ${data.callerId} to ${data.receiverId}`);
        // Emit incoming call to the receiver's room
        io.to(data.receiverId).emit('incoming_call', {
            callerId: data.callerId,
            callerEmail: data.callerEmail
        });
    });

    socket.on('accept_call', (data) => {
        // data: { callerId, receiverId }
        console.log(`Call accepted by ${data.receiverId}`);
        io.to(data.callerId).emit('call_accepted', {
            receiverId: data.receiverId
        });
    });

    socket.on('decline_call', (data) => {
        // data: { callerId, receiverId }
        console.log(`Call declined by ${data.receiverId}`);
        io.to(data.callerId).emit('call_declined', {
            receiverId: data.receiverId
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
