import tmi from 'tmi.js';

export type MessageListener = (message: ChatMessage) => void;

export interface Client {
    start(): void,
    end(): void,
    onMessage(hook: MessageListener): void,
    onClearChat(hook: () => void): void
}

export class ChatMessage {
    tags: any;
    message: string;
    
    id: string;
    type: string;
    name: string;
    color: string;
    mod: boolean;
    sub: boolean;
    subMonths: { badge: number, total: number } | undefined;
    turbo: boolean;
    partner: boolean;
    timestamp: number;
    emoteOnly: boolean;
    isOneEmoteOnly: boolean;

    constructor(tags: any, message: string) {
        this.tags = tags;
        this.message = message;

        this.id = tags.id;
        this.type = tags['message-type'];
        this.name = tags['display-name'];
        this.color = tags.color;
        this.mod = tags.mod;
        this.sub = tags.subscriber;
        this.turbo = tags.turbo;
        this.partner = tags.badges && tags.badges.partner !== undefined;
        this.timestamp = parseInt(tags['tmi-sent-ts']);
        this.emoteOnly = ChatMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && ChatMessage.isOneEmoteOnly(message);

        if (this.sub) {
            this.subMonths = {
                badge: parseInt(tags.badges.subscriber),
                total: parseInt(tags['badge-info'].subscriber)
            }
        }
    }

    private static isEmoteOnly(msg: string): boolean {
        const IMG_TAG = /<img.*?>/g;
        return msg.replaceAll(IMG_TAG, "").trim().length === 0;
    }

    private static isOneEmoteOnly(msg: string): boolean {
        const ONLY_IMG_TAG =/^<img.*?>$/;
        return ONLY_IMG_TAG.test(msg);
    }
}

export class SubMessage {

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
                f(new ChatMessage(tags, message));
            });

            client.on("subscription", function(channel, username, method, message, userstate) {
                console.log(arguments);
            });
        },
        onClearChat: function(f: () => void) {
            client.on('clearchat', function() {
                f();
            });
        },
        end: function() {
            console.log("Disconnecting Client");
            client.disconnect();
        }
    }
}
