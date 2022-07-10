import { useEffect, useState } from "react";
import { createDummyClient } from "./Dummy";
import { Client, realChat } from "./Client";

import "./Chat.css"
import { useSearchParams } from "react-router-dom";

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

class ChatMessage {
    tags: any;
    raw: string;
    message: string;

    constructor(tags: any, raw: string, message: string) {
        this.tags = tags;
        this.raw = raw;
        this.message = message;
    }
}

type EmoteBank = { [key: string]: string[] };

type TwitchMap = {[key: number]: {url: string, end: number}};

function parseFFZResponse(data: any) : EmoteBank {
    let sets = data.sets;
    let emote_lookup: EmoteBank = {};
    for (let set_key in sets) {
        for (let emote of sets[set_key].emoticons) {
            let urls = [];
            if (emote.urls["1"]) { urls.push("https:" + emote.urls["1"]); }
            if (emote.urls["2"]) { urls.push("https:" + emote.urls["2"]); }
            if (emote.urls["4"]) { urls.push("https:" + emote.urls["4"]); }

            if (urls.length) {
                emote_lookup[emote.name] = urls;
            }
        }
    }
    return emote_lookup;
}

function Chat(props: any) {
    let [params, setParams] = useSearchParams();
    let channel = params.get("channel");

    console.log("Listening to channel " + channel);

    let options = props.options as MilochatOptions;

    let [ffz, setFfz] = useState(new AsyncLoad<EmoteBank>());
    let [globalFfz, setGlobalFfz] = useState(new AsyncLoad<EmoteBank>());
    
    useEffect(() => {
        if (channel && options.ffz) {
            console.log("Fetching channel emotes from FFZ...");
            fetch("https://api.frankerfacez.com/v1/room/" + channel)
                .then(response => response.json())
                .then(data => {
                    let emote_lookup = parseFFZResponse(data);
                    console.log("Loaded %d channel emotes from FFZ", Object.keys(emote_lookup).length);
                    setFfz(ffz.complete(emote_lookup));
                })
                .catch(err => {
                    console.error(err);
                    setFfz(ffz.complete({}));
                })
        } else {
            setFfz(ffz.complete({}));
        }
    }, []);

    useEffect(() => {
        if (options.ffz) {
            console.log("Fetching global emotes from FFZ...");
            fetch("https://api.frankerfacez.com/v1/set/global")
                .then(response => response.json())
                .then(data => {
                    let emote_lookup = parseFFZResponse(data);
                    console.log("Loaded %d global emotes from FFZ", Object.keys(emote_lookup).length);
                    setGlobalFfz(ffz.complete(emote_lookup));
                })
                .catch(err => {
                    console.error(err);
                    setGlobalFfz(ffz.complete({}));
                })
        } else {
            setGlobalFfz(ffz.complete({}));
        }
    }, []);

    if (ffz.loaded && globalFfz.loaded) {
        let bank: EmoteBank = {
            ...(options.emotes || {}),
            ...ffz.getData({}),
            ...globalFfz.getData({})
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
            setLog([...log, { 
                tags, 
                raw: message, 
                message: htmlifyMessage(message, tags.emotes, emote_bank) }]);
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

            let base_url = "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_a84b58c73f3e446a9e12c96cc6cd0ea3/default/dark";
            let tag = '<img class="emote twitch" src="' + base_url + '/1.0" srcset="' + base_url + '/2.0 2x,' + base_url + '/3.0 4x" alt="' + emoteName + '">';
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
        let urls = otherEmotes[emote];
        let regex = new RegExp("\\b" + emote + "\\b", "g");
        let tag = '<img class="emote other" src="' + urls[0] + '" alt="' + emote + '">';
        html = html.replaceAll(regex, tag);
    }

    return html;
}

function parseTwitchEmoteObj(raw: any): TwitchMap {
    let map: TwitchMap = {};
    if (raw) {
        for (let key in raw) {
            let positions = raw[key];
            for (let position of positions) {
                let range = position.split("-");
                map[parseInt(range[0])] = {
                    url: "https://static-cdn.jtvnw.net/emoticons/v2/" + key + "/default/dark/4.0",
                    end: parseInt(range[1])
                };
            }
        }
    }
    return map;
}

export default Chat;