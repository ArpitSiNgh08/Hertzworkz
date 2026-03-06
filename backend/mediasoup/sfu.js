const mediasoup = require('mediasoup');
const config = require('../config/mediasoup');

let worker;
const rooms = new Map(); // roomId => { router, transports, producers, consumers }

const createWorker = async () => {
    worker = await mediasoup.createWorker({
        logLevel: config.mediasoup.worker.logLevel,
        logTags: config.mediasoup.worker.logTags,
        rtcMinPort: config.mediasoup.worker.rtcMinPort,
        rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
        console.error('mediasoup worker died, exiting in 2 seconds...');
        setTimeout(() => process.exit(1), 2000);
    });

    console.log('Mediasoup worker created');
    return worker;
};

// Start worker
createWorker();

const creatingRouters = new Map(); // roomId => promise

const getRouter = async (roomId) => {
    if (rooms.has(roomId)) {
        return rooms.get(roomId).router;
    }

    if (creatingRouters.has(roomId)) {
        return await creatingRouters.get(roomId);
    }

    const promise = (async () => {
        const router = await worker.createRouter({
            mediaCodecs: config.mediasoup.router.mediaCodecs,
        });

        rooms.set(roomId, {
            router,
            transports: new Map(), // transportId => transport
            producers: new Map(),  // producerId => producer
            consumers: new Map(),  // consumerId => consumer
        });

        console.log(`Router created for room: ${roomId}`);
        return router;
    })();

    creatingRouters.set(roomId, promise);
    const router = await promise;
    creatingRouters.delete(roomId);

    return router;
};

const createWebRtcTransport = async (roomId, socketId) => {
    const router = await getRouter(roomId);
    const transport = await router.createWebRtcTransport(config.mediasoup.webRtcTransport);

    // Store socketId in appData for easier cleanup
    transport.appData.socketId = socketId;

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
            transport.close();
        }
    });

    transport.on('close', () => {
        console.log(`Transport ${transport.id} for socket ${socketId} closed`);
    });

    // Store transport in room
    rooms.get(roomId).transports.set(transport.id, transport);

    return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
    };
};

const closeTransportsBySocketId = (socketId) => {
    for (const [roomId, room] of rooms) {
        for (const [transportId, transport] of room.transports) {
            if (transport.appData.socketId === socketId) {
                transport.close();
                room.transports.delete(transportId);

                // Mediasoup automatically closes producers/consumers 
                // associated with a closed transport, but we should clear our Maps
                for (const [id, producer] of room.producers) {
                    if (producer.appData.socketId === socketId) {
                        room.producers.delete(id);
                    }
                }


                // Notify other clients in the room would happen in index.js
                return roomId;
            }
        }
    }
    return null;
};

module.exports = {
    getRouter,
    createWebRtcTransport,
    closeTransportsBySocketId,
    rooms, // Exporting rooms for index.js to access specific transports
};
