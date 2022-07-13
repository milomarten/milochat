import _ from 'lodash';
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
    channel: string;
    
    id: string;
    type: string;
    name: string;
    color: string;
    mod: boolean;
    sub: boolean;
    subMonths: { badge: number, total: number, tier: number } | undefined;
    turbo: boolean;
    partner: boolean;
    broadcaster: boolean;
    timestamp: number;
    emoteOnly: boolean;
    isOneEmoteOnly: boolean;

    constructor(channel: string, tags: any, message: string) {
        this.tags = tags;
        this.message = message;

        this.id = tags.id;
        this.channel = _.trimStart(channel, '#');
        this.type = tags['message-type'];
        this.name = tags['display-name'];
        this.color = tags.color || ChatMessage.createColor(this.name);
        this.mod = tags.mod;
        this.sub = tags.subscriber;
        this.turbo = tags.turbo;
        this.partner = tags.badges && tags.badges.partner !== undefined;
        this.broadcaster = tags.badges && tags.badges.broadcaster !== undefined;
        this.timestamp = parseInt(tags['tmi-sent-ts']);
        this.emoteOnly = ChatMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && ChatMessage.isOneEmoteOnly(message);

        if (this.sub) {
            let badge = parseInt(tags.badges.subscriber);
            let tier;
            if (badge < 1000) {
                tier = 1;
            } else if (badge < 3000) {
                tier = 2;
                badge -= 2000;
            } else {
                tier = 3;
                badge -= 3000;
            }
            this.subMonths = {
                badge,
                tier,
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

    private static createColor(name: string): string {
        let h = hash(name) & 0xFFFFFF;
        return "#" + h.toString(16);
    }
}

export class SubMessage {

}

function hash(value: string): number {
    var hash = 0;
        
    for (let i = 0; i < value.length; i++) {
        let char = value.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
        
    return hash;
}

export function realChat(channels: string[]): Client {
    const client = new tmi.Client({
        channels
    });

    return {
        start: function() {
            console.log("Starting Client");
            client.connect().catch(console.error);
        },
        onMessage: function(f: MessageListener) {
            client.on('message', function(channel: string, tags: any, message: string) {
                f(new ChatMessage(channel, tags, message));
            });

            client.on("subscription", function(channel, username, method, message, userstate) {
                console.log("Subcrib");
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
