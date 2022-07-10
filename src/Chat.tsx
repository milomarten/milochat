import { useEffect, useState } from "react";
import { createDummyClient } from "./Dummy";
import { Client, realChat } from "./Client";

import "./Chat.css"
import { useSearchParams } from "react-router-dom";
import { EmoteBank, getAllFFZ } from "./Emotes";

export interface MilochatOptions {
    ffz?: boolean
    emotes?: EmoteBank
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

const IMG_TAG = /<img.*?>/g;
class ChatMessage {
    tags: any;
    message: string;
    
    emoteOnly: boolean;
    isOneEmoteOnly: boolean;

    constructor(tags: any, message: string) {
        this.tags = tags;
        this.message = message;
        this.emoteOnly = ChatMessage.isEmoteOnly(message);
        this.isOneEmoteOnly = this.emoteOnly && ChatMessage.isOneEmoteOnly(message);
    }

    private static isEmoteOnly(msg: string): boolean {
        return msg.replaceAll(IMG_TAG, "").trim().length === 0;
    }

    private static isOneEmoteOnly(msg: string): boolean {
        return msg.match(IMG_TAG)?.length === 1;
    }

    get name(): string { return this.tags['display-name']; }
    get color(): string { return this.tags.color; }
    get mod(): boolean { return this.tags.mod; }
    get sub(): boolean { return this.tags.subscriber; }
}

function Chat(props: any) {
    let [params, setParams] = useSearchParams();
    let channel = params.get("channel");

    console.log("Listening to channel " + channel);

    let options = props.options as MilochatOptions;

    let [ffz, setFfz] = useState(new AsyncLoad<EmoteBank>());
    
    useEffect(() => {
        if (options.ffz) {
            getAllFFZ(channel)
                .then(bank => setFfz(ffz.complete(bank)));
        } else {
            setFfz(ffz.complete({}));
        }
    }, []);

    if (ffz.loaded) {
        let bank: EmoteBank = {
            ...(options.emotes || {}),
            ...ffz.getData({})
        }
        return (
            <ChatBox channel={channel} emotes={bank} options={options}/>
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

function ChatBox(props: any) {
    let options = props.options as MilochatOptions;
    let emote_bank = props.emotes as EmoteBank;
    let [log, setLog] = useState(new Array<ChatMessage>());

    useEffect(() => {
        let chat: Client;
        if (props.channel) {
            chat = realChat(props.channel);
        } else {
            chat = createDummyClient();
        }

        chat.onMessage((_channel: string, tags: any, message: string) => {
            let nextLine = new ChatMessage(tags, htmlifyMessage(message, tags.emotes, emote_bank));
            console.log(nextLine);
            setLog(l => [...l, nextLine]);
        });

        chat.start();

        return () => chat.end();
    }, [props.channel]);
    
    return (
        <>
        {
            log.map(function(row) {
                return <div key={row.tags.id}>
                    <span className="name">{row.tags["display-name"]}: </span>
                    <span dangerouslySetInnerHTML={{__html: row.message}}></span>
                </div>
            })
        }
        </>
    )
}

function htmlifyMessage(raw: string, twitchEmoteTags: any, otherEmotes: EmoteBank): string {
    let html = "";
    let emotesFromTwitch = parseTwitchEmoteObj(twitchEmoteTags);
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

    for (let emote in otherEmotes) {
        let [prime, ...alts] = otherEmotes[emote];
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