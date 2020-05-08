import "./mediasoup.js";
import EventEmitter from './ee.js';
import {Peer} from './peer.js'
// import { WebSocketTransport, Peer } from "protoo-client";

export default class Room extends EventEmitter {
    constructor() {
        super();

        this.peer = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.join();
    }

    async start() {
        var exampleSocket = new WebSocket("wss://meething.hepic.tel:2345/", "protoo");

        exampleSocket.onopen = function (event) {
        };

        var capa = { "request": true, "id": 133437, "method": "getRouterRtpCapabilities", "data": {} }
        exampleSocket.send(JSON.stringify(capa));

        exampleSocket.onmessage = function (event) {
            console.log(event.data);
        }
    }

    join() {
        console.warn("room.join()");
        const wsTransport = new WebSocket("wss://meething.hepic.tel:2345/", "protoo");

        this.peer = new Peer(wsTransport);
        this.peer.on("open", this.onPeerOpen.bind(this));
        this.peer.on("request", this.onPeerRequest.bind(this));
        this.peer.on("notification", this.onPeerNotification.bind(this));
        this.peer.on("failed", console.error);
        this.peer.on("disconnected", console.error);
        this.peer.on("close", console.error);
    }

    async sendAudio(track) {
        console.warn("room.sendAudio()");
        const audioProducer = await this.sendTransport.produce({
            track
        });
        audioProducer.on("trackended", async () => {
            console.warn("producer.close() by trackended");
            await this._closeProducer(audioProducer);
        });
        return audioProducer;
    }

    async sendVideo(track) {
        console.warn("room.sendVideo()");
        const videoProducer = await this.sendTransport.produce({
            track
        });
        videoProducer.on("trackended", async () => {
            console.warn("producer.close() by trackended");
            await this._closeProducer(videoProducer);
        });
        return videoProducer;
    }

    async onPeerOpen() {
        console.warn("room.peer:open");
        const device = new mediasoupClient.Device();

        const routerRtpCapabilities = await this.peer
            .request("getRouterRtpCapabilities")
            .catch(console.error);
        await device.load({ routerRtpCapabilities });

        await this._prepareSendTransport(device).catch(console.error);
        await this._prepareRecvTransport(device).catch(console.error);

        const res = await this.peer.request("join", {
            rtpCapabilities: device.rtpCapabilities
        });

        this.emit("@open", res);
    }

    async _prepareSendTransport(device) {
        const transportInfo = await this.peer
            .request("createWebRtcTransport", {
                producing: true,
                consuming: false
            })
            .catch(console.error);

        // transportInfo.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
        this.sendTransport = device.createSendTransport(transportInfo);
        this.sendTransport.on(
            "connect",
            ({ dtlsParameters }, callback, errback) => {
                console.warn("room.sendTransport:connect");
                this.peer
                    .request("connectWebRtcTransport", {
                        transportId: this.sendTransport.id,
                        dtlsParameters
                    })
                    .then(callback)
                    .catch(errback);
            }
        );
        this.sendTransport.on(
            "produce",
            async ({ kind, rtpParameters, appData }, callback, errback) => {
                console.warn("room.sendTransport:produce");
                try {
                    const { id } = await this.peer.request("produce", {
                        transportId: this.sendTransport.id,
                        kind,
                        rtpParameters,
                        appData
                    });

                    callback({ id });
                } catch (error) {
                    errback(error);
                }
            }
        );
    }

    async _prepareRecvTransport(device) {
        const transportInfo = await this.peer
            .request("createWebRtcTransport", {
                producing: false,
                consuming: true
            })
            .catch(console.error);

        // transportInfo.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
        this.recvTransport = device.createRecvTransport(transportInfo);
        this.recvTransport.on(
            "connect",
            ({ dtlsParameters }, callback, errback) => {
                console.warn("room.recvTransport:connect");
                this.peer
                    .request("connectWebRtcTransport", {
                        transportId: this.recvTransport.id,
                        dtlsParameters
                    })
                    .then(callback)
                    .catch(errback);
            }
        );
    }

    async _closeProducer(producer) {
        producer.close();
        await this.peer
            .request("closeProducer", { producerId: producer.id })
            .catch(console.error);
        this.emit("@producerClosed", { producerId: producer.id });
    }

    onPeerRequest(req, resolve, reject) {
        console.warn("room.peer:request", req.method);
        switch (req.method) {
            // if you decline this offer, will not request `newConsumer`
            case "newConsumerOffer": {
                if (
                    confirm(`Do you consume ${req.data.kind} from ${req.data.peerId}?`)
                ) {
                    resolve({ accept: true });
                    return;
                }
                resolve({ accept: false });
                break;
            }
            case "newConsumer": {
                this.recvTransport
                    .consume(req.data)
                    .then(consumer => {
                        this.emit("@consumer", consumer);
                        resolve();
                    })
                    .catch(reject);
                break;
            }
            default:
                resolve();
        }
    }

    onPeerNotification(notification) {
        console.warn("room.peer:notification", notification);
        this.emit("@" + notification.method, notification.data);
    }
}

const supportedRtpCapabilities =
{
    codecs:
        [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/PCMU',
                preferredPayloadType: 0,
                clockRate: 8000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/PCMA',
                preferredPayloadType: 8,
                clockRate: 8000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/ISAC',
                clockRate: 32000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/ISAC',
                clockRate: 16000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/G722',
                preferredPayloadType: 9,
                clockRate: 8000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/iLBC',
                clockRate: 8000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/SILK',
                clockRate: 24000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/SILK',
                clockRate: 16000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/SILK',
                clockRate: 12000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/SILK',
                clockRate: 8000,
                rtcpFeedback:
                    [
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'audio',
                mimeType: 'audio/CN',
                preferredPayloadType: 13,
                clockRate: 32000
            },
            {
                kind: 'audio',
                mimeType: 'audio/CN',
                preferredPayloadType: 13,
                clockRate: 16000
            },
            {
                kind: 'audio',
                mimeType: 'audio/CN',
                preferredPayloadType: 13,
                clockRate: 8000
            },
            {
                kind: 'audio',
                mimeType: 'audio/telephone-event',
                clockRate: 48000
            },
            {
                kind: 'audio',
                mimeType: 'audio/telephone-event',
                clockRate: 32000
            },

            {
                kind: 'audio',
                mimeType: 'audio/telephone-event',
                clockRate: 16000
            },
            {
                kind: 'audio',
                mimeType: 'audio/telephone-event',
                clockRate: 8000
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'video',
                mimeType: 'video/VP9',
                clockRate: 90000,
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'video',
                mimeType: 'video/H264',
                clockRate: 90000,
                parameters:
                {
                    'packetization-mode': 1,
                    'level-asymmetry-allowed': 1
                },
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'video',
                mimeType: 'video/H264',
                clockRate: 90000,
                parameters:
                {
                    'packetization-mode': 0,
                    'level-asymmetry-allowed': 1
                },
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'video',
                mimeType: 'video/H265',
                clockRate: 90000,
                parameters:
                {
                    'packetization-mode': 1,
                    'level-asymmetry-allowed': 1
                },
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            },
            {
                kind: 'video',
                mimeType: 'video/H265',
                clockRate: 90000,
                parameters:
                {
                    'packetization-mode': 0,
                    'level-asymmetry-allowed': 1
                },
                rtcpFeedback:
                    [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' },
                        { type: 'transport-cc' }
                    ]
            }
        ],
    headerExtensions:
        [
            {
                kind: 'audio',
                uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
                preferredId: 1,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
                preferredId: 1,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
                preferredId: 2,
                preferredEncrypt: false,
                direction: 'recvonly'
            },
            {
                kind: 'video',
                uri: 'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id',
                preferredId: 3,
                preferredEncrypt: false,
                direction: 'recvonly'
            },
            {
                kind: 'audio',
                uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
                preferredId: 4,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
                preferredId: 4,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            // NOTE: For audio we just enable transport-wide-cc-01 when receiving media.
            {
                kind: 'audio',
                uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
                preferredId: 5,
                preferredEncrypt: false,
                direction: 'recvonly'
            },
            {
                kind: 'video',
                uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
                preferredId: 5,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            // NOTE: Remove this once framemarking draft becomes RFC.
            {
                kind: 'video',
                uri: 'http://tools.ietf.org/html/draft-ietf-avtext-framemarking-07',
                preferredId: 6,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'urn:ietf:params:rtp-hdrext:framemarking',
                preferredId: 7,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'audio',
                uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
                preferredId: 10,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'urn:3gpp:video-orientation',
                preferredId: 11,
                preferredEncrypt: false,
                direction: 'sendrecv'
            },
            {
                kind: 'video',
                uri: 'urn:ietf:params:rtp-hdrext:toffset',
                preferredId: 12,
                preferredEncrypt: false,
                direction: 'sendrecv'
            }
        ]
};

