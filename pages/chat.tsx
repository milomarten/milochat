import { useEffect, useState } from "react";
import { createDummyClient } from "../src/Dummy";
import { Client, realChat } from "../src/Client";

import { EmoteBank, getAllFFZ } from "../src/Emotes";
import { Template } from "../src/Template";
import { useRouter } from "next/router";

import Handlebars from "handlebars";
import React from "react";

export interface MilochatOptions {
    ffz?: boolean
    emotes?: EmoteBank
}

interface Preload {
    emotes: EmoteBank;
}

class AsyncLoad<T> {
    data?: T;

    constructor(data?: T) {
        this.data = data;
    }

    get loaded(): boolean {
        return this.data !== undefined;
    }

    complete(data: T): AsyncLoad<T> {
        return new AsyncLoad<T>(data);
    }

    getData(def: T): T {
        return this.data || def;
    }
}

class ChatMessage {
    tags: any;
    message: string;
    id: string;
    name: string;
    color: string;
    mod: boolean;
    sub: boolean;
    timestamp: number;
    emoteOnly: boolean;
    isOneEmoteOnly: boolean;

    constructor(tags: any, message: string) {
        this.tags = tags;
        this.message = message;

        this.id = tags.id;
        this.name = tags['display-name'];
        this.color = tags.color;
        this.mod = tags.mod;
        this.sub = tags.subscriber;
        this.timestamp = parseInt(tags['tmi-sent-ts']);
        this.emoteOnly = ChatMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && ChatMessage.isOneEmoteOnly(message);
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

const DEFAULT_TEMPLATE = `
    <span class="time">{{date timestamp "H:mm"}}</span>
    <span class="name" style="color:{{color}};">{{name}}: </span>
    <span class="message">{{message}}</span>
`;

const DEFAULT_OPTIONS: MilochatOptions = {
    ffz: true
};

const DEFAULT_HANDLEBAR_OPTS: CompileOptions = {
    noEscape: true
}

function Chat(props: any) {
    const router = useRouter();

    let options = DEFAULT_OPTIONS;

    let [ffz, setFfz] = useState(new AsyncLoad<EmoteBank>());
    let [channel, setChannel] = useState<string>();
    
    useEffect(() => {
        if (router.isReady) {
            const c = (router.query.channel as string) || "";

            console.log("Listening to channel " + c);
            setChannel(c);

            if (c && options.ffz) {
                getAllFFZ(c)
                    .then(bank => setFfz(f => f.complete(bank)));
            } else {
                setFfz(f => f.complete({}));
            }
        }
    }, [router.isReady, options.ffz]);

    if (ffz.loaded && channel !== undefined) {
        let preload: Preload = {
            emotes: {
                ...(options.emotes || {}),
                ...ffz.getData({})
            }
        }
        return (
            <ChatBox channel={channel} preload={preload} options={options}/>
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

function ChatBox(props: any) {
    let template = props.template as string;
    let preload = props.preload as Preload;
    let [log, setLog] = useState(new Array<ChatMessage>());

    useEffect(() => {
        let chat: Client;
        if (props.channel) {
            chat = realChat(props.channel);
        } else {
            chat = createDummyClient();
        }

        chat.onMessage((_channel: string, tags: any, message: string) => {
            let nextLine = new ChatMessage(tags, htmlifyMessage(message, tags, preload));
            setLog(l => [...l, nextLine]);
        });

        chat.start();

        return () => chat.end();
    }, [props.channel, preload.emotes]);
    
    let templateFunc = Handlebars.compile(template || DEFAULT_TEMPLATE, DEFAULT_HANDLEBAR_OPTS);

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

function htmlifyMessage(raw: string, tags: any, preload: Preload): string {
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