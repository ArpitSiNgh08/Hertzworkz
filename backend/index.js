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
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
}));
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

// Group Routes
const groupRoutes = require('./routes/groupRoutes');
app.use('/api/groups', groupRoutes);

const Group = require('./models/Group');

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', async (data) => {
        const userId = typeof data === 'object' ? data.userId : data;
        const email = typeof data === 'object' ? data.email : null;
        
        socket.join(userId);
        if (email) socket.email = email;
        
        console.log(`User ${userId} joined their room ${email ? '(' + email + ')' : ''}`);

        // Also join all group rooms the user is a member of
        try {
            const groups = await Group.find({ members: userId });
            groups.forEach(group => {
                socket.join(group._id.toString());
                console.log(`User ${userId} joined group room: ${group._id}`);
            });
        } catch (error) {
            console.error('Error joining group rooms:', error);
        }
    });

    socket.on('join_group', (groupId) => {
        socket.join(groupId);
        console.log(`Socket ${socket.id} joined group room: ${groupId}`);
    });

    socket.on('new_group', (data) => {
        // data: { groupId, members }
        data.members.forEach(memberId => {
            io.to(memberId).emit('group_created', { groupId: data.groupId });
        });
    });

    socket.on('send_message', (data) => {
        if (data.groupId) {
            // Group message
            console.log(`Group message from ${data.sender} to group ${data.groupId}`);
            io.to(data.groupId).emit('receive_message', data);
        } else if (data.receiver) {
            // Individual message
            console.log(`Direct message from ${data.sender} to ${data.receiver}`);
            io.to(data.receiver).emit('receive_message', data);
        }
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

    socket.on('initiate_group_call', (data) => {
        // data: { callerId, callerEmail, groupId, groupName }
        console.log(`Group call initiated from ${data.callerId} in group ${data.groupId}`);
        // Broadcast to the group room except the caller
        socket.to(data.groupId).emit('incoming_group_call', {
            callerId: data.callerId,
            callerEmail: data.callerEmail,
            groupId: data.groupId,
            groupName: data.groupName
        });
    });

    socket.on('accept_call', (data) => {
        // data: { callerId, receiverId }
        console.log(`Call accepted by ${data.receiverId}`);

        // Emit to the caller BEFORE the receiver joins the room
        io.to(data.callerId).emit('call_accepted', {
            receiverId: data.receiverId
        });

        // Ensure the receiver joins the caller's room for SFU signaling
        socket.join(data.callerId);
    });

    socket.on('accept_group_call', (data) => {
        // data: { userId, groupId }
        console.log(`Group call accepted by ${data.userId} in group ${data.groupId}`);
        
        // Explicitly join the group room just in case
        socket.join(data.groupId);
        
        // Notify others in the group that someone joined the call
        io.to(data.groupId).emit('group_participant_joined', {
            userId: data.userId,
            socketId: socket.id,
            email: socket.email
        });
    });

    socket.on('decline_call', (data) => {
        // data: { callerId, receiverId }
        console.log(`Call declined by ${data.receiverId}`);
        io.to(data.callerId).emit('call_declined', {
            receiverId: data.receiverId
        });
    });

    socket.on('end_call', (data) => {
        // data: { toId, fromId, groupId }
        console.log(`Call ended by ${data.fromId} in ${data.groupId ? 'group ' + data.groupId : 'direct call'}`);
        if (data.groupId) {
            // For group calls, notifying others that someone left
            socket.to(data.groupId).emit('participant_left_call', {
                fromId: data.fromId,
                groupId: data.groupId
            });
        } else {
            // For 1-on-1 calls, the whole call ends
            io.to(data.toId).emit('call_ended', {
                fromId: data.fromId
            });
        }
    });

    // Mediasoup Signaling
    const { getRouter, createWebRtcTransport, rooms } = require('./mediasoup/sfu');
    const privateAudioSessions = new Map();
    // Map key: socketId of one party → value: { partnerSocketId, roomId }
    // Stored for BOTH parties so lookup works from either side

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
            const { roomId, transportId, kind, rtpParameters, isPrivate, privatePartnerSocketId } = data;
            const room = rooms.get(roomId || 'default');
            const transport = room?.transports.get(transportId);

            if (!transport) throw new Error(`Transport ${transportId} not found`);

            const producer = await transport.produce({ kind, rtpParameters });

            // Store producer with reference to socket id
            producer.appData.socketId = socket.id;
            producer.appData.email = socket.email;
            producer.appData.isPrivate = isPrivate || false;
            producer.appData.privatePartnerSocketId = privatePartnerSocketId || null;
            room.producers.set(producer.id, producer);

            callback({ id: producer.id });

            // BROADCAST: Notify other clients in the room about this new producer
            if (!producer.appData.isPrivate) {
                socket.to(roomId).emit('new_producer', {
                    producerId: producer.id,
                    socketId: socket.id,
                    email: socket.email
                });
            } else {
                // Only notify the private partner
                io.to(privatePartnerSocketId).emit('new_private_producer', {
                    producerId: producer.id,
                    socketId: socket.id,
                    email: socket.email
                });
            }

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

            if (!transport) throw new Error(`Transport ${transportId} not found`);

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

    socket.on('get_producers', (data, callback) => {
        try {
            const { roomId } = data;
            const room = rooms.get(roomId || 'default');
            if (!room) return callback([]);

            const producers = [];
            for (const [id, producer] of room.producers) {
                if (producer.appData.isPrivate) continue;
                producers.push({
                    producerId: id,
                    socketId: producer.appData.socketId,
                    email: producer.appData.email,
                    kind: producer.kind
                });
            }
            callback(producers);
        } catch (error) {
            console.error('get_producers error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('get_call_participants', async (data, callback) => {
        try {
            const { roomId } = data;
            const room = rooms.get(roomId || 'default');
            if (!room) return callback([]);

            // We can get participants from the active transports in the room
            const participantsMap = new Map();
            
            // Add self to the list if in room? No, client knows self.
            
            for (const [id, transport] of room.transports) {
                const sId = transport.appData.socketId;
                if (sId && sId !== socket.id) {
                    // Try to find the email from any producer this socket has
                    let email = 'Unknown';
                    for (const [pId, producer] of room.producers) {
                        if (producer.appData.socketId === sId) {
                            email = producer.appData.email;
                            break;
                        }
                    }
                    // If no email found in producers, we might need another way to store it.
                    // For now, let's just use what we have.
                    participantsMap.set(sId, { socketId: sId, email: email });
                }
            }
            callback(Array.from(participantsMap.values()));
        } catch (error) {
            console.error('get_call_participants error:', error);
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

    socket.on('mute_participant', (data) => {
        // data: { roomId, targetSocketId }
        console.log(`Host ${socket.id} muting participant ${data.targetSocketId} in room ${data.roomId}`);
        io.to(data.targetSocketId).emit('mute_local_audio');
    });

    socket.on('mute_all', (data) => {
        // data: { roomId }
        console.log(`Host ${socket.id} muting everyone in room ${data.roomId}`);
        socket.to(data.roomId).emit('mute_local_audio');
    });

    socket.on('request_private_audio', (data) => {
        // Received data: { targetSocketId, requesterEmail, roomId }
        const { targetSocketId, requesterEmail, roomId } = data;
        io.to(targetSocketId).emit('incoming_private_audio_request', {
            requesterSocketId: socket.id,
            requesterEmail,
            roomId
        });
    });

    socket.on('accept_private_audio', (data) => {
        // Received data: { requesterSocketId, roomId }
        const { requesterSocketId, roomId } = data;
        privateAudioSessions.set(socket.id, { partnerSocketId: requesterSocketId, roomId });
        privateAudioSessions.set(requesterSocketId, { partnerSocketId: socket.id, roomId });

        io.to(socket.id).emit('private_audio_accepted', { partnerSocketId: requesterSocketId, partnerEmail: socket.email });
        io.to(requesterSocketId).emit('private_audio_accepted', { partnerSocketId: socket.id, partnerEmail: socket.email });
    });

    socket.on('decline_private_audio', (data) => {
        // Received data: { requesterSocketId }
        const { requesterSocketId } = data;
        io.to(requesterSocketId).emit('private_audio_declined', { declinerEmail: socket.email });
    });

    socket.on('end_private_audio', (data) => {
        // Received data: { roomId }
        const { roomId } = data;
        const session = privateAudioSessions.get(socket.id);
        if (session) {
            privateAudioSessions.delete(socket.id);
            privateAudioSessions.delete(session.partnerSocketId);
            io.to(session.partnerSocketId).emit('private_audio_ended', { endedBySocketId: socket.id });
            io.to(socket.id).emit('private_audio_ended', { endedBySocketId: socket.id });

            const room = rooms.get(roomId || 'default');
            if (room) {
                for (const [id, producer] of room.producers) {
                    if (producer.appData.isPrivate === true && (producer.appData.socketId === socket.id || producer.appData.socketId === session.partnerSocketId)) {
                        producer.close();
                        room.producers.delete(id);
                    }
                }
            }
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

        // Clean up any active private audio session
        const privateSession = privateAudioSessions.get(socket.id);
        if (privateSession) {
            privateAudioSessions.delete(socket.id);
            privateAudioSessions.delete(privateSession.partnerSocketId);
            io.to(privateSession.partnerSocketId).emit('private_audio_ended', { 
                endedBySocketId: socket.id 
            });
        }
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
