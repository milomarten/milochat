import tmi from 'tmi.js';

export type MessageListener = (channel: string, tags: any, message: string) => void;

export interface Client {
    start(): void,
    end(): void,
    onMessage(hook: MessageListener): void
}

export function realChat(channel: string): Client {
    const client = new tmi.Client({
        channels: [ channel ]
    });

    return {
        start: function() {
            console.log("Starting Client");
            client.connect().catch(console.error);
        },
        onMessage: function(f: MessageListener) {
            client.on('message', function(channel: string, tags: any, message: string) {
                f(channel, tags, message)
            });
        },
        end: function() {
            console.log("Disconnecting Client");
            client.disconnect();
        }
    }
}
