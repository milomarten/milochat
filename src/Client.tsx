import _ from 'lodash';
import tmi from 'tmi.js';
import {v4 as uuid} from 'uuid';
import Images, { Image, imageToHTML, SuperImageBank } from './Images';
import { MilochatOptions } from './Options';
import Pronouns, { Pronoun } from './Pronouns';

export type MessageListener<T> = (message: T) => void | PromiseLike<void>;
type TwitchMap = {[key: number]: {img: Image, end: number}};

/** Describes a common interface for a chat client */
export interface Client {
    /**
     * Start the client 
     * Perform initial setup and begin receiving messages
     */
    start(): void
    /**
     * Stop the client
     * Shut down all resources and stop receiving messages
     */
    end(): void
    /**
     * Register some logic to perform when a message is received
     * @param hook The code that should be executed on message
     */
    onMessage(hook: MessageListener<ChatMessage>): void
    /**
     * Register some logic to perform when a system message is received
     * @param hook The code that should be executed on message
     */
    onSystemMessage(hook: MessageListener<SystemMessage>): void
    /**
     * Register some logic to perform when a message is deleted
     * @param hook The code that should be executed on message delete
     */
    onMessageDelete(hook: (messageId: string) => void): void
    /**
     * Register some logic to perform when a user is banned
     * @param hook The code that should be executed on ban
     */
    onUserBan(hook: (username: string, channel: string) => void): void
    /**
     * Register some logic to perform when a user subscribes
     * @param hook The code that should be executed on subscription
     */
    onSubscribe(hook: MessageListener<SubMessage>): void
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
 * Different types of Tags that are supported here
 */
export type Tags = tmi.ChatUserstate | tmi.SubUserstate;

/**
 * A basic message, containing common fields.
 * Aside from the message itself, most of these fields are bookkeeping-related.
 */
export abstract class AbstractMessage {
    /** A string which represents the type of message */
    abstract type: string;
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
export abstract class AbstractTwitchMessage extends AbstractMessage {
    /** The raw tags that come from Twitch */
    readonly tags: any;
    /** The chatter's username */
    readonly name: string;
    /** The chatter's user ID */
    readonly userId: string;
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
    /** If true, the sender is Twitch staff */
    readonly staff: boolean;
    /** If true, the sender is a Twitch admin */
    readonly admin: boolean;
    /** If true, the sender is a global moderator */
    readonly globalMod: boolean;

    /**  Badges, if present */
    badges: Image[] = [];
    /** The chatter's pronouns, in human-readable form */
    pronouns: string = "";
    /** The chatter's pronouns, in computer-friendly form */
    pronounId: string = "";

    constructor(channel: string, tags: Tags, message: string) {
        super(message || "", tags.id, tags['tmi-sent-ts'] ? parseInt(tags['tmi-sent-ts']) : undefined);
        this.userId = tags['user-id'] || "";
        this.tags = tags;
        this.channel = _.trimStart(channel, "#");
        this.name = tags['display-name'] || tags.username;
        this.color = tags.color || AbstractTwitchMessage.createColor(this.name);
        this.mod = tags.mod || false;
        this.sub = tags.subscriber || false;
        this.turbo = tags.turbo || false;
        this.partner = tags.badges?.partner !== undefined;
        this.broadcaster = tags.badges?.broadcaster !== undefined;
        this.staff = tags['user-type'] === "staff";
        this.admin = tags['user-type'] === "admin";
        this.globalMod = tags['user-type'] === "global_mod";

        if (this.sub && tags.badges?.subscriber !== undefined) {
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
                total: parseInt(tags['badge-info']?.subscriber || "0")
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
    resolveBadges(badges: SuperImageBank) : void {
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
                    let v0Badge = badges.get(badgeId + ":0", this.channel);
                    if (v0Badge) {
                        badge = {
                            ...v0Badge,
                            name: `subscriber subscriber-${version} subscriber-tier-${this.subMonths?.tier || 0}`
                        };
                    }
                } else {
                    // All other badges should have two classes: The badge ID, and the badge ID paired with its version
                    // This allows for more flexibility with selectors
                    let vBadge = badges.get(badgeId + ":" + version, this.channel);
                    if (vBadge) {
                        badge = {
                            ...vBadge,
                            name: `${badgeId} ${badgeId}-${version}`
                        }
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

        let customBadge = Images.getCustomBadge(this.name);
        if (customBadge) {
            this.badges.unshift(customBadge);
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
    resolveEmotes(emotes: SuperImageBank) {
        let raw = this.message;
        let tags = this.tags;
        let html = "";
        let emotesFromTwitch = AbstractTwitchMessage.parseTwitchEmoteObj(tags.emotes);
        let idx = 0;
    
        while (idx < raw.length) {
            if (emotesFromTwitch[idx]) {
                let emote = emotesFromTwitch[idx];
                let emoteName = raw.substring(idx, emote.end + 1);
                emote.img.name = emoteName;
                let tag = imageToHTML(emote.img)
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
    
        let emotesForChannel = emotes.getAll(this.channel);
        for (let emote in emotesForChannel) {
            let regex = new RegExp("\\b" + emote + "\\b", "g");
            let tag = imageToHTML(emotesForChannel[emote]);
            html = html.replaceAll(regex, tag);
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
                            source: "twitch",
                            clazz: ["emote"],
                            scale: {
                                1: `${baseUrl}/1.0`,
                                2: `${baseUrl}/2.0`,
                                4: `${baseUrl}/3.0`
                            }
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
    /** If true, this is a highlighted message */
    readonly highlighted: boolean;
    /** If present, this is a reply */
    readonly reply: undefined | {
        id: string,
        name: string,
        body: string
    }

    constructor(channel: string, tags: tmi.ChatUserstate, message: string) {
        super(channel, tags, message);
        this.type = tags['message-type'] === "action" ? "action" : "chat";
        this.highlighted = tags['msg-id'] === "highlighted-message";

        if (tags['reply-parent-msg-id']) {
            this.reply = {
                id: tags['reply-parent-msg-id'],
                name: tags['reply-parent-display-name'] || tags['reply-parent-user-login'],
                body: tags['reply-parent-msg-body']
            }
        }
    }
}

/** Represents a sub message */
export class SubMessage extends AbstractTwitchMessage {
    /**
     * The type of message this is
     */
    readonly type: "sub" | "resub";
    /** 
     * A string that describes the subscription
     * In most cases, this is a well-formatted string describing the subscription,
     * and should be used in templates for subscriptions. 
     * For a first-time sub:
     * For a resub: <name> subscribed <with Prime | at Tier 1|2|3>. They've subscribed for <streak> months!
     */
    readonly subText: string;
    /**
     * If true, this is a prime subscription
     */
    readonly prime: boolean;
    /**
     * The tier level of subscription: 1, 2, or 3
     */
    readonly level: "prime" | 1 | 2 | 3;
    /**
     * If true, this is a resub
     */
    readonly resub: boolean;
    /**
     * The total number of months subscribed for
     */
    readonly cumulative: number | undefined;

    constructor(channel: string, tags: tmi.SubUserstate, message: string) {
        super(channel, tags, message);

        this.type = tags['message-type'] || "sub";
        this.subText = tags['system-msg'] || "";

        switch (tags['msg-param-sub-plan']) {
            case "Prime": this.prime = true; this.level = "prime"; break;
            case "2000": this.prime = false; this.level = 2; break;
            case "3000": this.prime = false; this.level = 3; break;
            default: this.prime = false; this.level = 1; break;
        }

        if (tags['msg-param-cumulative-months']) {
            this.resub = true
            this.cumulative = parseInt(tags['msg-param-cumulative-months'] as string)
        } else {
            this.resub = false;
        }
    }
}

/** Represents a system message */
export class SystemMessage extends AbstractMessage {
    readonly type = "system";

    constructor(message: string) {
        super(message);
    }
}

class RealChat implements Client {
    static MAX_CHANNELS = 5;

    readonly client: tmi.Client;
    readonly options: MilochatOptions;
    readonly bot: Bot | undefined;

    private messageHooks: MessageListener<ChatMessage>[] = [];
    private subMessageHooks: MessageListener<SubMessage>[] = [];
    private systemMessageHooks: MessageListener<SystemMessage>[] = [];
    
    constructor(channels: string[], options: MilochatOptions) {
        channels = _.take(channels, 5);
        console.log(`Joining channels [${channels.join(", ")}]`);

        this.client = new tmi.Client({
            channels
        });
        this.options = options;

        if (options.commands) {
            let prefix = _.isString(options.commands) ? options.commands : "!";
            this.bot = new Bot(prefix, this);
            this.messageHooks.push(cm => this.bot?.onMessage(cm));
        }
    }

    start(): void {
        console.log("Starting Client");
        this.registerSystemHooks();
        this.client.connect()
            .catch(console.error);
    }

    end(): void {
        console.log("Disconnecting Client");
        this.client.removeAllListeners();
        this.client.disconnect();
    }

    join(channel: string): void {
        if (this.client.getChannels().length < RealChat.MAX_CHANNELS) {
            console.log(`Attempting to join ${channel}'s chat...`);
            this.client.join(channel)
                .then(c => console.log("Join successful"))
                .catch(e => console.error(e));
        } else {
            console.log(`Unable to join more than ${RealChat.MAX_CHANNELS} channel(s) at once`);
        }
    }

    leave(channel: string): void {
        console.log(`Attempting to leave ${channel}'s chat...`);
        this.client.part(channel)
            .then(c => {
                console.log("Leave successful");
                if (this.client.getChannels().length === 0) {
                    console.log("No more channels to listen to...")
                }
            })
            .catch(e => console.error(e));
    }

    onMessage(hook: MessageListener<ChatMessage>): void {
        let callback = this.augment(hook);
        this.messageHooks.push(callback);
    }

    onSystemMessage(hook: MessageListener<SystemMessage>): void {
        this.systemMessageHooks.push(hook);
    }

    onSubscribe(hook: MessageListener<SubMessage>): void {
        let callback = this.augment(hook);
        this.subMessageHooks.push(callback);
    }

    onMessageDelete(hook: (messageId: string) => void): void {
        this.client.on('messagedeleted', (channel: string, username: string, deletedMessage: string, state: tmi.DeleteUserstate) => {
            if (state['target-msg-id']) {
                hook(state['target-msg-id']);
            }
        });
    }

    onUserBan(hook: (username: string, channel: string) => void): void {
        this.client.on("ban", (channel: string, username: string) => {
            hook(username, channel);
        });

        this.client.on("timeout", (channel: string, username: string) => {
            hook(username, channel);
        });
    }

    private registerSystemHooks(): void {
        this.client.on('message', (channel: string, tags: tmi.ChatUserstate, message: string) => {                
            let obj = new ChatMessage(channel, tags, message);
            
            for (let hook of this.messageHooks) {
                hook(obj);
            }
        });

        // First subscription to a channel
        this.client.on("subscription", (channel: string, username: string, methods: tmi.SubMethods, message: string, userstate: tmi.SubUserstate) => {
            let m = new SubMessage(channel, userstate, message || "");
            console.log("sub", m);

            for (let hook of this.subMessageHooks) {
                hook(m);
            }
        });

        // Resubscribe to a channel
        this.client.on("resub", (channel: string, username: string, months: number, message: string, userstate: tmi.SubUserstate, methods: tmi.SubMethods) => {
            let m = new SubMessage(channel, userstate, message || "");
            console.log("resub", m);
            
            for (let hook of this.subMessageHooks) {
                hook(m);
            }
        });

        // Still not sure the best way to handle the below four, since they are messages, but only ever static text.
        // As such, they may interfere with a clean template.

        // Someone gifts a sub to random community members
        // Note that this corresponds to the "<name> is giving <number> subs to the community!" message.
        // Each individual sub will follow, as a subgift type
        this.client.on("submysterygift", (channel: string, username: string, numbOfSubs: number, methods: tmi.SubMethods, userstate: tmi.SubMysteryGiftUserstate) => {
            console.log("anonsub", channel, username, numbOfSubs, methods, userstate);
        });

        // Gifted a sub from a concrete person
        this.client.on("subgift", (channel: string, username: string, streakMonths: number, recipient: string, methods: tmi.SubMethods, userstate: tmi.SubGiftUserstate) => {
            console.log("subgift", channel, username, streakMonths, recipient, methods, userstate);
        });

        // Subscribed, having previously been gifted a sub from a concrete person
        this.client.on("giftpaidupgrade", (channel: string, username: string, sender: string, userstate: tmi.SubGiftUpgradeUserstate) => {
            console.log("upgrade", channel, username, sender, userstate);
        }); 

        // Subscribed, having previously been gifted an anonymous sub
        this.client.on("anongiftpaidupgrade", (channel: string, username: string, userstate: tmi.AnonSubGiftUpgradeUserstate) => {
            console.log("anonupgrade", channel, username, userstate);
        });
    }   

    private triggerSystemMessage(msg: string): void {
        let toTrigger = new SystemMessage(msg);
        this.systemMessageHooks.forEach(hook => hook(toTrigger));
    }

    private augment<T extends TwitchMessage>(func: MessageListener<T>): MessageListener<T> {
        return async (message) => {
            if (this.options.pronouns) {
                let p = await Pronouns.getPronouns(message.name);
                message.resolvePronouns(p);
            }
            return func(message);
        }
    }
}

/**
 * Generate a real chat client, which connects to Twitch
 * @param channels The channels to connect to
 * @returns The created client
 */
export function realChat(channels: string[], options: MilochatOptions): Client {
    return new RealChat(channels, options);
}

class Bot {
    constructor(private prefix: string, private client: RealChat) { }

    onMessage(msg: ChatMessage): void {
        if (msg.message.startsWith(this.prefix) && this.canUse(msg)) {
            let [command, ...args] = msg.message.substring(1).split(/\s+/);
            switch(command) {
                case "join": this.join(args); break;
                case "leave": this.client.leave(args[0] || msg.channel); break;
            }
        }
    }

    canUse(msg: ChatMessage): boolean {
        return msg.broadcaster || msg.mod;
    }

    join(args: string[]) {
        if (args[0]) {
            this.client.join(args[0]);
        }
    }
}