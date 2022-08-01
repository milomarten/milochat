import _ from 'lodash';
import tmi from 'tmi.js';
import {v4 as uuid} from 'uuid';
import { Image, imageToHTML } from './Emotes';
import { MilochatOptions, Preload } from './Options';
import { getPronouns, Pronoun } from './Pronouns';

export type MessageListener<T> = (message: T) => void;
type TwitchMap = {[key: number]: {img: Image, end: number}};

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
    onMessage(hook: MessageListener<TwitchMessage>): void,
    /**
     * Register some logic to perform when the clear chat command is received
     * @param hook The code that should be executed on clear
     */
    onClearChat(hook: () => void): void
}

/**
 * Exposed type for all messages Milochat can provide.
 */
export type Message = TwitchMessage | SystemMessage;
/**
 * Exposed type for all messages Twitch can provide.
 */
export type TwitchMessage = ChatMessage | SubMessage;

/**
 * A basic message, containing common fields.
 * Aside from the message itself, most of these fields are bookkeeping-related.
 */
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

/**
 * A basic Twitch message, containing common fields.
 */
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
    /** The chatter's pronouns, in human-readable form */
    pronouns: string = "";
    /** The chatter's pronouns, in computer-friendly form */
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

    /**
     * Resolve the badge-related helper variables.
     * After calling this method, the badges array can be used safely.
     * @param preload The preloaded badge images
     */
    resolveBadges(preload: Preload) : void {
        let finalBadges = [];
        let rawBadges = this.tags["badges-raw"];
        if (_.isString(rawBadges)) {
            let rawIds = rawBadges.split(",");
            for (let id of rawIds) {
                let [badgeId, version] = id.split("/");
                let badge;
                if (badgeId === "subscriber") {
                    // Fallback to the basic Subscriber badge (a star), but add the # months and tier as a class name
                    // to allow for CSS customizing.
                    // All other badges should work out of the box.
                    badge = {
                        ...preload.badges[badgeId + ":0"],
                        name: `subscriber subscriber-${version} subscriber-tier-${this.subMonths?.tier || 0}`
                    };
                } else {
                    // All other badges should have two classes: The badge ID, and the badge ID paired with its version
                    // This allows for more flexibility with selectors
                    badge = {
                        ...preload.badges[badgeId + ":" + version],
                        name: `${badgeId} ${badgeId}-${version}`
                    }
                }
                if (badge) {
                    finalBadges.push(badge);
                } else {
                    console.error("Missing badge", badgeId, version);
                }
            }
            this.badges = finalBadges;
        } else {
            this.badges = [];
        }
    }

    /**
     * Resolve the pronoun-related helper variables.
     * After calling this method, pronouns and pronounId can be used safely.
     * @param pronouns 
     */
    resolvePronouns(pronouns: Pronoun | undefined) : void {
        if (pronouns) {
            this.pronounId = pronouns.id;
            this.pronouns = pronouns.display;
        }
    }

    /**
     * Resolves all the emotes in the message into <img> tags.
     * @param preload The preloaded images (containing custom and FFZ emotes)
     * @param options The options for additional configuration
     */
    resolveEmotes(preload: Preload, options: MilochatOptions) {
        let raw = this.message;
        let tags = this.tags;
        let html = "";
        let emotesFromTwitch = AbstractTwitchMessage.parseTwitchEmoteObj(tags.emotes);
        let idx = 0;
    
        while (idx < raw.length) {
            if (emotesFromTwitch[idx]) {
                let emote = emotesFromTwitch[idx];
                let emoteName = raw.substring(idx, emote.end + 1);

                let tag = imageToHTML({...emote.img, name: emoteName}, "emote twitch")
                html += tag;
                idx = emote.end + 1;
            } else {
                let char = raw[idx];
                if (char === "<") {
                    char = "&lt;";
                } else if (char === ">") {
                    char = "&gt;";
                }
                html += char;
                idx++;
            }
        }
    
        for (let emote in preload.emotes) {
            let regex = new RegExp("\\b" + emote + "\\b", "g");
            let tag = imageToHTML(preload.emotes[emote], "emote other");
            html = html.replaceAll(regex, tag);
        }
    
        if (options.tag?.at) {
            const AT_REGEX = /(@\S+)/g;
            html = html.replaceAll(AT_REGEX, '<span class="ping">$1</span>');
        }
    
        if (options.tag?.matches) {
            for (let test of options.tag.matches) {
                html = html.replaceAll(test.regex, `<span ${test.attribute}="${test.value}">$&</span>`);
            }
        }
    
        this.setMessage(html);
    }
    
    private static parseTwitchEmoteObj(raw: any): TwitchMap {
        let map: TwitchMap = {};
        if (raw) {
            for (let key in raw) {
                let positions = raw[key];
                for (let position of positions) {
                    let range = position.split("-");
                    let baseUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${key}/default/dark`
                    map[parseInt(range[0])] = {
                        img: {
                            name: "",
                            "1x": `${baseUrl}/1.0`,
                            "2x": `${baseUrl}/2.0`,
                            "4x": `${baseUrl}/3.0`
                        },
                        end: parseInt(range[1])
                    };
                }
            }
        }
        return map;
    }

    /**
     * Check if this message is blacklisted with respect to the options
     * @param opts The options to check against
     * @returns True, if this message is blacklisted and should not be displayed.
     */
    isBlacklist(opts: MilochatOptions): boolean {
        return this.isBlacklistUser(opts, this.name) || this.isBlacklistMessage(opts, this.message);
    }

    private isBlacklistUser(opts: MilochatOptions, user: string): boolean {
        if (opts.blacklist?.users) {
            for (let test of opts.blacklist.users) {
                if (typeof test === "string" && user.toUpperCase() === test.toUpperCase()) {
                    return true;
                } else if (user.match(test)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    private isBlacklistMessage(opts: MilochatOptions, message: string): boolean {
        if (opts.blacklist?.prefixes) {
            for (let prefix of opts.blacklist.prefixes) {
                if (message.toUpperCase().startsWith(prefix.toUpperCase())) {
                    return true;
                }
            }
        }
    
        if (opts.blacklist?.includes) {
            for (let word of opts.blacklist.includes) {
                let regex = RegExp(`\\b${word}\\b`, 'gi');
                if (regex.test(word)) {
                    return true;
                }
            }
        }
    
        if (opts.blacklist?.matches) {
            for (let regex of opts.blacklist.matches) {
                if (regex.test(message)) {
                    return true;
                }
            }
        }
    
        return false;
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
        onMessage: function(f: MessageListener<ChatMessage | SubMessage>) {
            client.on('message', function(channel: string, tags: any, message: string) {
                let obj = new ChatMessage(channel, tags, message);
                if (!obj.isBlacklist(options)) {
                    if (options.pronouns) {
                        getPronouns(obj.name)
                            .then(p => {
                                obj.resolvePronouns(p);
                                f(obj);
                            });
                    } else {
                        f(obj);
                    }
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
