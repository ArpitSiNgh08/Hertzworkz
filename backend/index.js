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

    // Mediasoup Signaling
    const { getRouter, createWebRtcTransport, rooms } = require('./mediasoup/sfu');

    socket.on('getRouterRtpCapabilities', async (data, callback) => {
        try {
            const roomId = data.roomId || 'default';
            const router = await getRouter(roomId);
            callback({ rtpCapabilities: router.rtpCapabilities });
        } catch (error) {
            console.error('getRouterRtpCapabilities error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('createWebRtcTransport', async (data, callback) => {
        try {
            const roomId = data.roomId || 'default';
            // Pass socket.id to associate the transport with this user
            const transportParams = await createWebRtcTransport(roomId, socket.id);
            callback(transportParams);
        } catch (error) {
            console.error('createWebRtcTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('connectWebRtcTransport', async (data, callback) => {
        try {
            const { roomId, transportId, dtlsParameters } = data;
            const room = rooms.get(roomId || 'default');
            const transport = room?.transports.get(transportId);

            if (!transport) throw new Error(`Transport ${transportId} not found`);

            await transport.connect({ dtlsParameters });
            callback({ success: true });
        } catch (error) {
            console.error('connectWebRtcTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('produce', async (data, callback) => {
        try {
            const { roomId, transportId, kind, rtpParameters } = data;
            const room = rooms.get(roomId || 'default');
            const transport = room?.transports.get(transportId);

            if (!transport) throw new Error(`Transport ${transportId} not found`);

            const producer = await transport.produce({ kind, rtpParameters });

            // Store producer with reference to socket id
            producer.appData.socketId = socket.id;
            room.producers.set(producer.id, producer);

            callback({ id: producer.id });

            // BROADCAST: Notify other clients in the room about this new producer
            socket.to(roomId).emit('new_producer', {
                producerId: producer.id,
                socketId: socket.id
            });

        } catch (error) {
            console.error('produce error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('consume', async (data, callback) => {
        try {
            const { roomId, transportId, producerId, rtpCapabilities } = data;
            const room = rooms.get(roomId || 'default');
            const router = room.router;
            const transport = room.transports.get(transportId);

            if (!router.canConsume({ producerId, rtpCapabilities })) {
                throw new Error('Cannot consume this producer');
            }

            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: true, // Start paused, let client resume
            });

            // Store consumer
            room.consumers.set(consumer.id, consumer);

            callback({
                id: consumer.id,
                producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            });
        } catch (error) {
            console.error('consume error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('resume_consumer', async (data, callback) => {
        const { roomId, consumerId } = data;
        const room = rooms.get(roomId || 'default');
        const consumer = room.consumers.get(consumerId);
        if (consumer) {
            await consumer.resume();
            callback({ success: true });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // 1. Clean up Mediasoup resources (Transports, Producers, etc.)
        const { closeTransportsBySocketId } = require('./mediasoup/sfu');
        const roomId = closeTransportsBySocketId(socket.id);

        // 2. Notify other participants in the room
        if (roomId) {
            console.log(`Notifying room ${roomId} about participant ${socket.id} leaving`);
            socket.to(roomId).emit('participant_left', { socketId: socket.id });
        }
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
