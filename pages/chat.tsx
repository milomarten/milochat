import { useEffect, useMemo, useState } from "react";
import { ChatMessage, Client, Message, realChat } from "../src/Client";

import { ImageBank, getAllFFZMulti, getAllTwitchBadges } from "../src/Emotes";
import { Template } from "../src/Template";
import { NextRouter, useRouter } from "next/router";

import Handlebars from "handlebars";
import React from "react";
import _ from "lodash";
import classNames from "classnames";

/** The options that can be used to configure Milochat */
export interface MilochatOptions {
    /** Toggles whether FFZ emotes are supported */
    ffz?: boolean
    blacklist?: {
        /** If a message is from this user, do not display */
        users?: (string | RegExp)[]
        /** If a message includes any of these words, do not display */
        includes?: string[]
        /** If a message starts with any of these words, do not display */
        prefixes?: string[]
        /** If a message matches any of these regexes, do not display */
        matches?: RegExp[]
    },
    tag?: {
        /** Wrap anything that matches this regex with a span tag with the following class */
        matches?: {regex: string | RegExp, attribute: string, value: string}[],
        /** If true, any pings are wrapped in a span tag with class "ping" */
        at?: boolean
    },
    /** Describes any size limits to the chat */
    limit?: {
        /** The type of limit */
        flavor: Limit,
        /** 
         * A fade timer 
         * If present, the chat will wait <fade> ms before deleting completely.
         * During this time, the row will have the "deleting" class.
         * 
         * If absent, or zero, the node is deleted immediately.
         * */
        fade?: number
    },
    direction?: "up" | "down"
}

type Limit = ChatSizeLimit | ChatTimeLimit;
/** A limit where chat is constrainted to a fixed number of lines */
export type ChatSizeLimit = { type: 'count', count: number };
/** A limit where chat will only show for a fixed number of milliseconds */
export type ChatTimeLimit = { type: 'time', ms: number };

function optionsFromRouter(router: NextRouter): [string[], MilochatOptions] {
    let query = router.query;

    function asBool(val: string | string[] | undefined): boolean {
        if(_.isArray(val)) {
            return _.last(val) === "true";
        } else if (val === undefined) {
            return false;
        } else {
            return val === "true";
        }
    }

    function asString(val: string | string[] | undefined): string | undefined {
        if(_.isArray(val)) {
            return val[0];
        } else if (val === undefined) {
            return undefined;
        } else {
            return val;
        }
    }

    function asStringArray(val: string | string[] | undefined): string[] {
        if(_.isArray(val)) {
            return val;
        } else if (val === undefined) {
            return [];
        } else {
            return [val];
        }
    }

    function asNumber(val: string | string[] | undefined): number | undefined {
        if(_.isArray(val)) {
            const last = _.last(val);
            return last ? parseInt(last) : undefined;
        } else if (val === undefined) {
            return undefined;
        } else {
            return parseInt(val);
        }
    }

    const count = asNumber(query.count);
    const ms = asNumber(query.time);
    const direction = asString(query.direction);

    let flavor: Limit | undefined;
    if (count) {
        flavor = { type: "count", count };
    } else if (ms) {
        flavor = { type: "time", ms }
    }

    let limit;
    if (flavor) {
        limit = {
            flavor,
            fade: asNumber(query.fade)
        }
    }

    const opts: MilochatOptions = {
        ...DEFAULT_OPTIONS,
        ffz: asBool(query.ffz),
        limit,
        direction: direction == "up" ? "up" : "down"
    }

    return [asStringArray(query.channel), opts];
}

function isBlacklistUser(opts: MilochatOptions, user: string): boolean {
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

function isBlacklistMessage(opts: MilochatOptions, message: string): boolean {
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

/** Contains an assortment of data loaded in before chat is started */
interface Preload {
    emotes: ImageBank;
    badges: ImageBank;
}

/** Helper class which keeps track of a piece of data being loaded in asynchronously */
class AsyncLoad<T> {
    data?: T;

    /**
     * Create this object, possibly with some data
     * @param data If present, this means the load is done
     */
    constructor(data?: T) {
        this.data = data;
    }

    /**
     * Check if the load is complete
     */
    get loaded(): boolean {
        return this.data !== undefined;
    }
}

/** The default template */
const DEFAULT_TEMPLATE = `
    ({{channel}})
    {{> badgelist}}
    <span class="time">{{date timestamp "H:mm"}}</span>
    <span class="name" style="color:{{color}};">{{name}}: </span>
    <span class="message">{{message}}</span>
`;

/** The default options */
const DEFAULT_OPTIONS: MilochatOptions = {
    tag: {
        at: true
    }
};

/** The default Handlebar compile options */
const DEFAULT_HANDLEBAR_OPTS: CompileOptions = {
    noEscape: true
}

/**
 * The root container which begins the preload and starts up chat when complete
 * No properties are used. Channels are pulled as query params; everything else
 * uses defaults for now.
 */
function Chat() {
    const router = useRouter();

    let [badges, setBadges] = useState(new AsyncLoad<ImageBank>());
    let [ffz, setFfz] = useState(new AsyncLoad<ImageBank>());
    let [options, setOptions] = useState<[string[], MilochatOptions]>();
    
    useEffect(() => {
        if (router.isReady) {
            const [channels, opts] = optionsFromRouter(router);
            console.log("Using options:");
            console.log(opts);
            
            setOptions([channels, opts]);

            getAllTwitchBadges()
                .then(bank => setBadges(new AsyncLoad(bank)));

            if (channels && opts.ffz) {
                getAllFFZMulti(channels)
                    .then(bank => setFfz(new AsyncLoad(bank)));
            } else {
                setFfz(new AsyncLoad({}));
            }
        }
    }, [router.isReady]);

    if (badges.loaded && ffz.loaded && options !== undefined) {
        let preload: Preload = {
            emotes: ffz.data || {},
            badges: badges.data || {}
        }
        return (
            <ChatBox channels={options[0]} preload={preload} options={options[1]}/>
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

/**
 * The box which actually displays chat
 * Props:
 * * template: A Handlebars-friendly string to be resolved into HTML
 * * preload: Values pulled in from the loading step.
 * * options: Milochat options for configuration
 * @param props Props
 * @returns The chat lines. Each line is run through the template
 */
function ChatBox(props: any) {
    let template = props.template as string;
    let preload = props.preload as Preload;
    let options = props.options as MilochatOptions;
    let [log, setLog] = useState(new Array<Message>());

    useEffect(() => {
        let chat = realChat(props.channels);

        chat.onMessage((message: ChatMessage) => {
            let raw = message.message;
            if (!isBlacklistUser(options, message.name) && !isBlacklistMessage(options, raw)) {
                message.setMessage(htmlifyMessage(raw, message.tags, preload, options));
                message.setBadges(preload.badges);

                if (options.limit?.flavor.type === "time") {
                    setTimeout(() => {
                        registerForDelete(message, setLog, options);
                    }, options.limit.flavor.ms);
                }

                setLog(l => {
                    let concat = [...l, message];
                    if (options.limit?.flavor.type === "count") {
                        let max = options.limit.flavor.count;
                        if (concat.length > max) {
                            let toNix = _.take(concat, concat.length - max);
                            registerForDelete(toNix, setLog, options);
                        }
                    }

                    return concat;
                });
            }
        });

        chat.onClearChat(() => {
            setLog([]);
        });

        chat.start();

        return () => {
            setLog([]);
            chat.end();
        }
    }, [props.channel, preload.emotes]);
    
    let templateFunc = useMemo(() => Handlebars.compile(template || DEFAULT_TEMPLATE, DEFAULT_HANDLEBAR_OPTS), [template]);

    return (
        <>
        {
            (options.direction === "up" ? [...log].reverse() : log).map(line => {
                return (
                    <div className={classNames('row', { deleting: line.markedForDelete })} key={line.id}>
                        <Template template={templateFunc} data={line} />
                    </div>
                )
            })
        }
        </>
    )
}

function htmlifyMessage(raw: string, tags: any, preload: Preload, options: MilochatOptions): string {
    let html = "";
    let emotesFromTwitch = parseTwitchEmoteObj(tags.emotes);
    let idx = 0;

    while (idx < raw.length) {
        if (emotesFromTwitch[idx]) {
            let emote = emotesFromTwitch[idx];
            let emoteName = raw.substring(idx, emote.end + 1);

            let base_url = emote.url;
            let tag = `<img class="emote twitch" src="${base_url}/1.0" srcset="${base_url}/2.0 2x,${base_url}/3.0 4x" alt="${emoteName}">`;
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
        let {"1x": a, "2x": b, "4x": c} = preload.emotes[emote];
        let regex = new RegExp("\\b" + emote + "\\b", "g");
        let tag = `<img class="emote other" src="${a || b || c || ""}" alt="${emote}">`;
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

    return html;
}

type TwitchMap = {[key: number]: {url: string, end: number}};

function parseTwitchEmoteObj(raw: any): TwitchMap {
    let map: TwitchMap = {};
    if (raw) {
        for (let key in raw) {
            let positions = raw[key];
            for (let position of positions) {
                let range = position.split("-");
                map[parseInt(range[0])] = {
                    url: "https://static-cdn.jtvnw.net/emoticons/v2/" + key + "/default/dark",
                    end: parseInt(range[1])
                };
            }
        }
    }
    return map;
}

function registerForDelete(message: Message | Message[], changeFunc: React.Dispatch<React.SetStateAction<Message[]>>, options: MilochatOptions) {
    if (_.isArray(message)) {
        const toNix = message as Message[];
        const destroy = function() {
            changeFunc(lines => _.differenceBy(lines, toNix, 'id'));
        }

        if (options.limit?.fade) {
            _.forEach(toNix, i => i.markedForDelete = true);
            setTimeout(destroy, options.limit.fade);
        } else {
            destroy();
        }
    } else {
        const toNix = message as Message;
        const destroy = function() {
            changeFunc(lines => _.filter(lines, line => line.id !== toNix.id));
        }

        if (options.limit?.fade) {
            toNix.markedForDelete = true;
            setTimeout(destroy, options.limit.fade);
        } else {
            destroy();
        }
    }
}

export default Chat;