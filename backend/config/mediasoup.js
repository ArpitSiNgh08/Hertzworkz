const os = require('os');

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
const finalAnnouncedIp = (announcedIp && announcedIp !== '127.0.0.1') ? announcedIp : getLocalIp();

module.exports = {
    mediasoup: {
        // Worker settings
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'warn',
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
            ],
        },
        // Router settings (Media Codecs)
        router: {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
            ],
        },
        // WebRtcTransport settings
        webRtcTransport: {
            listenIps: [
                {
                    ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
                    announcedIp: finalAnnouncedIp,
                },
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        },
    },
};
