import EventEmitter from './ee.js';

export class Peer extends EventEmitter {
    constructor(transport) {
        super();
        console.log('constructor()');

        // Closed flag.
        // @type {Boolean}
        this._closed = false;

        // Transport.
        // @type {protoo.Transport}
        this._transport = transport;

        // Connected flag.
        // @type {Boolean}
        this._connected = false;

        // Custom data object.
        // @type {Object}
        this._data = {};

        // Map of pending sent request objects indexed by request id.
        // @type {Map<Number, Object>}
        this._sents = new Map();
        this._handleTransport();
    }

    _handleTransport() {
        self = this;
        if (this._transport.closed) {
            this._closed = true;

            setTimeout(() => {
                if (this._closed)
                    return;

                this._connected = false;

                this.emit('close');
            });

            return;
        }

        this._transport.onopen = function (event) {
            if (this._closed)
                return;

            console.log('emit "open"');

            this._connected = true;

            self.emit('open');
        };

        this._transport.close = function (event) {
            if (this._closed)
                return;

            console.log('emit "close"');
            console.log('emit "disconnected"');

            this._connected = false;

            self.emit('disconnected');
        };

        this._transport.onerror = function (event) {
            if (this._closed)
                return;

            console.log('emit "failed" ');

            this._connected = false;

            self.emit('failed', currentAttempt);
        };

        this._transport.onmessage = function (message) {
            if (message.request)
                this._handleRequest(message);
            else if (message.response)
                this._handleResponse(message);
            else if (message.notification)
                this._handleNotification(message);
        };
    }

}