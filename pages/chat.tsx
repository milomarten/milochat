import { useEffect, useMemo, useState } from "react";
import { ChatMessage, Client, realChat } from "../src/Client";

import { EmoteBank, getAllFFZMulti } from "../src/Emotes";
import { Template } from "../src/Template";
import { useRouter } from "next/router";

import Handlebars from "handlebars";
import React from "react";
import _ from "lodash";

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
    }
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
    emotes: EmoteBank;
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

    /**
     * Get the inside data, or a suitable default if not complete
     * @param def The default
     * @returns The finished data, or the default
     */
    getData(def: T): T {
        return this.data || def;
    }
}

/** The default template */
const DEFAULT_TEMPLATE = `
    ({{channel}})
    <span class="time">{{date timestamp "H:mm"}}</span>
    <span class="name" style="color:{{color}};">{{name}}: </span>
    <span class="message">{{message}}</span>
`;

/** The default options */
const DEFAULT_OPTIONS: MilochatOptions = {
    ffz: true,
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

    let options = DEFAULT_OPTIONS;

    let [ffz, setFfz] = useState(new AsyncLoad<EmoteBank>());
    let [channels, setChannels] = useState<string[]>();
    
    useEffect(() => {
        if (router.isReady) {
            const c = _.castArray(router.query.channel || "");
            const channel_array = c[0] === "" ? [] : c;
            
            setChannels(channel_array);

            if (c && options.ffz) {
                getAllFFZMulti(c)
                    .then(bank => setFfz(f => new AsyncLoad(bank)));
            } else {
                setFfz(f => new AsyncLoad({}));
            }
        }
    }, [router.isReady, options.ffz]);

    if (ffz.loaded && channels !== undefined) {
        let preload: Preload = {
            emotes: ffz.getData({})
        }
        return (
            <ChatBox channels={channels} preload={preload} options={options}/>
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
    let [log, setLog] = useState(new Array<ChatMessage>());

    useEffect(() => {
        let chat = realChat(props.channels);

        chat.onMessage((message: ChatMessage) => {
            let raw = message.message;
            if (!isBlacklistUser(options, message.name) && !isBlacklistMessage(options, raw)) {
                message.message = htmlifyMessage(raw, message.tags, preload, options);
                console.log(message);
                setLog(l => [...l, message]);
            }
        });

        chat.onClearChat(() => {
            setLog([]);
        });

        chat.start();

        return () => chat.end();
    }, [props.channel, preload.emotes]);
    
    let templateFunc = useMemo(() => Handlebars.compile(template || DEFAULT_TEMPLATE, DEFAULT_HANDLEBAR_OPTS), [template]);

    return (
        <>
        {
            log.map(line => {
                return (
                    <div className="row" key={line.id}>
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
        let [prime] = preload.emotes[emote];
        let regex = new RegExp("\\b" + emote + "\\b", "g");
        let tag = `<img class="emote other" src="${prime}" alt="${emote}">`;
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

export default Chat;