import { Device } from 'mediasoup-client';
import { Socket } from 'socket.io-client';

export class MediasoupClient {
    private device: Device | null = null;
    private socket: Socket;
    public roomId: string;

    constructor(socket: Socket, roomId: string) {
        this.socket = socket;
        this.roomId = roomId;
    }

    async init() {
        try {
            // 1. Get router capabilities from server
            const data = await this.getRouterRtpCapabilities();

            // 2. Create device
            this.device = new Device();

            // 3. Load device
            await this.device.load({
                routerRtpCapabilities: data.rtpCapabilities
            });

            console.log('Mediasoup device loaded');
            return true;
        } catch (error) {
            console.error('Failed to init mediasoup device:', error);
            return false;
        }
    }

    private getRouterRtpCapabilities(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.socket.emit('getRouterRtpCapabilities', { roomId: this.roomId }, (res: any) => {
                if (res.error) {
                    reject(res.error);
                } else {
                    resolve(res);
                }
            });
        });
    }

    getDevice() {
        return this.device;
    }

    isLoaded() {
        return this.device?.loaded || false;
    }

    async createSendTransport() {
        if (!this.device) throw new Error('Device not initialized');

        // 1. Ask server to create a WebRtcTransport
        const params = await new Promise<any>((resolve, reject) => {
            this.socket.emit('createWebRtcTransport', { roomId: this.roomId }, (res: any) => {
                if (res.error) reject(res.error);
                else resolve(res);
            });
        });

        // 2. Create client-side transport
        const transport = this.device.createSendTransport(params);

        // 3. Handle 'connect' event (signal to server)
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await new Promise((resolve, reject) => {
                    this.socket.emit('connectWebRtcTransport', {
                        roomId: this.roomId,
                        transportId: transport.id,
                        dtlsParameters,
                    }, (res: any) => {
                        if (res.error) reject(res.error);
                        else resolve(res);
                    });
                });
                callback();
            } catch (error: any) {
                errback(error);
            }
        });

        // 4. Handle 'produce' event (signal to server)
        transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
                const { id } = await new Promise<any>((resolve, reject) => {
                    this.socket.emit('produce', {
                        roomId: this.roomId,
                        transportId: transport.id,
                        kind,
                        rtpParameters,
                        isPrivate: appData.isPrivate || false,
                        privatePartnerSocketId: appData.privatePartnerSocketId || null,
                    }, (res: any) => {
                        if (res.error) reject(res.error);
                        else resolve(res);
                    });
                });
                callback({ id });
            } catch (error: any) {
                errback(error);
            }
        });

        return transport;
    }

    async produceVideo(transport: any, stream: MediaStream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track found');

        const producer = await transport.produce({ track: videoTrack });
        return producer;
    }

    async produceAudio(transport: any, stream: MediaStream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('No audio track found');

        const producer = await transport.produce({ track: audioTrack });
        return producer;
    }

    async createRecvTransport() {
        if (!this.device) throw new Error('Device not initialized');

        const params = await new Promise<any>((resolve, reject) => {
            this.socket.emit('createWebRtcTransport', { roomId: this.roomId }, (res: any) => {
                if (res.error) reject(res.error);
                else resolve(res);
            });
        });

        const transport = this.device.createRecvTransport(params);

        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await new Promise((resolve, reject) => {
                    this.socket.emit('connectWebRtcTransport', {
                        roomId: this.roomId,
                        transportId: transport.id,
                        dtlsParameters,
                    }, (res: any) => {
                        if (res.error) reject(res.error);
                        else resolve(res);
                    });
                });
                callback();
            } catch (error: any) {
                errback(error);
            }
        });

        return transport;
    }

    async consume(transport: any, producerId: string) {
        if (!this.device) throw new Error('Device not initialized');

        const data = await new Promise<any>((resolve, reject) => {
            this.socket.emit('consume', {
                roomId: this.roomId,
                transportId: transport.id,
                producerId,
                rtpCapabilities: this.device!.rtpCapabilities,
            }, (res: any) => {
                if (res.error) reject(res.error);
                else resolve(res);
            });
        });

        const consumer = await transport.consume(data);

        // Resume consumer on server
        await new Promise((resolve) => {
            this.socket.emit('resume_consumer', {
                roomId: this.roomId,
                consumerId: consumer.id
            }, resolve);
        });

        return consumer;
    }

    async getProducers() {
        return new Promise<any[]>((resolve, reject) => {
            this.socket.emit('get_producers', { roomId: this.roomId }, (res: any) => {
                if (res.error) reject(res.error);
                else resolve(res);
            });
        });
    }

    close() {
        this.device = null;
        // In a real scenario, you'd also close transports and producers here
        // but since we refresh/unmount, the garbage collector and 
        // socket disconnect handle most of it.
    }
}
