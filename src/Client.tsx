import _ from 'lodash';
import tmi from 'tmi.js';
import {v4 as uuid} from 'uuid';
import { Image, ImageBank } from './Emotes';
import { MilochatOptions } from './Options';
import { getPronouns, Pronoun } from './Pronouns';

export type MessageListener<T> = (message: T) => void;

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
    onMessage(hook: MessageListener<ChatMessage>): void,
    /**
     * Register some logic to perform when the clear chat command is received
     * @param hook The code that should be executed on clear
     */
    onClearChat(hook: () => void): void
}

export type Message = ChatMessage | SubMessage | SystemMessage;

abstract class AbstractMessage {
    /** The unique ID which represents this message */
    id: string;
    /** The message received from Twitch, HTML formatted */
    message: string;
    /** The unix timestamp this message was sent */
    timestamp: number;
    /** If true, this message contains only emotes */
    emoteOnly: boolean;
    /** If true, this message contains only one emote */
    isOneEmoteOnly: boolean;
    /** This message is marked for deletion. Bookkeeping. */
    markedForDelete: boolean;

    constructor(message: string, id?: string, timestamp?: number) {
        this.id = id || uuid();
        this.message = message;
        this.emoteOnly = AbstractMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && AbstractMessage.isOneEmoteOnly(message);
        this.timestamp = timestamp || Date.now();
        this.markedForDelete = false;
    }

    private static isEmoteOnly(msg: string): boolean {
        const IMG_TAG = /<img.*?>/g;
        return msg.replaceAll(IMG_TAG, "").trim().length === 0;
    }

    private static isOneEmoteOnly(msg: string): boolean {
        const ONLY_IMG_TAG =/^<img.*?>$/;
        return ONLY_IMG_TAG.test(msg);
    }

    setMessage(message: string): void {
        this.message = message;
        this.emoteOnly = AbstractMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && AbstractMessage.isOneEmoteOnly(message);
    }
}

abstract class AbstractTwitchMessage extends AbstractMessage {
    /** The raw tags that come from Twitch */
    readonly tags: any;
    /** The chatter's username */
    readonly name: string;
    /** The channel this message originated from */
    readonly channel: string;
    /** 
     * The chatter's color, or some "random" color if none set. 
     * The "random" color is consistent, and depends on the chatter's name.
     * */
    readonly color: string;
    /** If true, the sender is a mod in this channel */
    readonly mod: boolean;
    /** If true, the sender is a sub in this channel */
    readonly sub: boolean;
    /** If present, contains further information about the user's subscription */
    readonly subMonths: Readonly<{ badge: number, total: number, tier: number }> | undefined;
    /** If true, the sender has Turbo */
    readonly turbo: boolean;
    /** If true, the sender is a Twitch Partner */
    readonly partner: boolean;
    /** If true, the sender is the broadcaster of this channel */
    readonly broadcaster: boolean;
     /**  Badges, if present */
    badges: Image[] = [];

    pronouns: string = "";
    pronounId: string = "";

    constructor(channel: string, tags: any, message: string) {
        super(message, tags.id, parseInt(tags['tmi-sent-ts']));
        this.tags = tags;
        this.channel = _.trimStart(channel, "#");
        this.name = tags['display-name'];
        this.color = tags.color || AbstractTwitchMessage.createColor(this.name);
        this.mod = tags.mod;
        this.sub = tags.subscriber;
        this.turbo = tags.turbo;
        this.partner = tags.badges && tags.badges.partner !== undefined;
        this.broadcaster = tags.badges && tags.badges.broadcaster !== undefined;

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

    setBadges(bank: ImageBank) : void {
        let finalBadges = [];
        let rawBadges = this.tags["badges-raw"];
        if (_.isString(rawBadges)) {
            let rawIds = rawBadges.split(",");
            for (let id of rawIds) {
                let [badgeId, version] = id.split("/");
                let badge = bank[badgeId + ":" + version];
                if (badge) {
                    finalBadges.push(badge);
                }
            }
            this.badges = finalBadges;
        } else {
            this.badges = [];
        }
    }

    setPronouns(pronouns: Pronoun | undefined) : void {
        if (pronouns) {
            this.pronounId = pronouns.id;
            this.pronouns = pronouns.display;
        }
    }
}

/** Represents a chat message */
export class ChatMessage extends AbstractTwitchMessage {
    /** The type of message */
    readonly type: "chat" | "action"; // Note: This could also be whisper, but since we are anonymous, there is no chance.

    constructor(channel: string, tags: any, message: string) {
        super(channel, tags, message);
        this.type = tags['message-type'];
    }
}

/** Represents a sub message */
export class SubMessage extends AbstractTwitchMessage {
    readonly type = "sub";

    constructor(channel: string, tags: any, message: string) {
        super(channel, tags, message);
    }
}

/** Represents a system message */0
export class SystemMessage extends AbstractMessage {
    readonly type = "system";

    constructor(message: string) {
        super(message);
    }
}

/**
 * Generate a real chat client, which connects to Twitch
 * @param channels The channels to connect to
 * @returns The created client
 */
export function realChat(channels: string[], options: MilochatOptions): Client {
    const client = new tmi.Client({
        channels
    });

    return {
        start: function() {
            console.log("Starting Client");
            client.connect().catch(console.error);
        },
        onMessage: function(f: MessageListener<ChatMessage>) {
            client.on('message', function(channel: string, tags: any, message: string) {
                let obj = new ChatMessage(channel, tags, message);
                if (options.pronouns) {
                    getPronouns(obj.name)
                        .then(p => {
                            obj.setPronouns(p);
                            f(obj);
                        });
                } else {
                    f(obj);
                }
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
            client.removeAllListeners();
        }
    }
}
