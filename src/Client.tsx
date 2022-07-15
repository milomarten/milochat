import _ from 'lodash';
import tmi from 'tmi.js';

export type MessageListener = (message: ChatMessage) => void;

/** Describes a common interface for a chat client */
export interface Client {
    /**
     * Start the client 
     * Perform initial setup and begin receiving messages
     */
    start(): void,
    /**
     * Stop the client
     * Shut down all resources and stop receiving messages
     */
    end(): void,
    /**
     * Register some logic to perform when a message is received
     * @param hook The code that should be executed on message
     */
    onMessage(hook: MessageListener): void,
    /**
     * Register some logic to perform when the clear chat command is received
     * @param hook The code that should be executed on clear
     */
    onClearChat(hook: () => void): void
}

/** Represents a chat message */
export class ChatMessage {
    /** The raw tags that come from Twitch */
    tags: any;
    /** The message received from Twitch, HTML formatted */
    message: string;
    /** The channel this message originated from */
    channel: string;
    
    /** The unique ID which represents this message */
    id: string;
    /** The type of message */
    type: "chat" | "action"; // Note: This could also be whisper, but since we are anonymous, there is no chance.
    /** The chatter's username */
    name: string;
    /** 
     * The chatter's color, or some "random" color if none set. 
     * The "random" color is consistent, and depends on the chatter's name.
     * */
    color: string;
    /** If true, the sender is a mod in this channel */
    mod: boolean;
    /** If true, the sender is a sub in this channel */
    sub: boolean;
    /** If present, contains further information about the user's subscription */
    subMonths: { badge: number, total: number, tier: number } | undefined;
    /** If true, the sender has Turbo */
    turbo: boolean;
    /** If true, the sender is a Twitch Partner */
    partner: boolean;
    /** If true, the sender is the broadcaster of this channel */
    broadcaster: boolean;
    /** The unix timestamp this message was sent */
    timestamp: number;
    /** If true, this message contains only emotes */
    emoteOnly: boolean;
    /** If true, this message contains only one emote */
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
            if (badge >= 3000) {
                tier = 3;
                badge -= 3000;
            } else if (badge >= 2000) {
                tier = 2;
                badge -= 2000;
            } else {
                tier = 1;
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

    /**
     * Generate a color for a given name.
     * The input is hashed, and the least significant three bytes are interpreted
     * as an RGB color.
     * @param name The username 
     * @returns A color, prefixed with #
     */
    private static createColor(name: string): string {
        var hash = 0;
        
        for (let i = 0; i < name.length; i++) {
            let char = name.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        let h = hash & 0xFFFFFF;
        return "#" + _.padStart(h.toString(16), 6, '0');
    }
}

export class SubMessage {

}

/**
 * Generate a real chat client, which connects to Twitch
 * @param channels The channels to connect to
 * @returns The created client
 */
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
