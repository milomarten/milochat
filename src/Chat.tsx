import { useEffect, useState } from "react";
import { createDummyClient } from "./Dummy";
import { Client, realChat } from "./Client";

import "./Chat.css"

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

type EmoteBank = { [key: string]: string[] };

class ChatMessage {
    tags: any;
    raw: string;
    message: string;
}

function parseFFZResponse(data) : EmoteBank {
    let sets = data.sets;
    let emote_lookup: EmoteBank = {};
    for (let set_key in sets) {
        for (let emote of sets[set_key].emoticons) {
            let url = emote.urls["4"] || emote.urls["2"] || emote.urls["1"];
            emote_lookup[emote.name] = ["https:" + url];
        }
    }
    return emote_lookup;
}

function Chat(props) {
    let [ffz, setFfz] = useState(new AsyncLoad<EmoteBank>());
    let [globalFfz, setGlobalFfz] = useState(new AsyncLoad<EmoteBank>());
    
    useEffect(() => {
        if (props.ffz && props.channel) {
            console.log("Fetching channel emotes from FFZ...");
            fetch("https://api.frankerfacez.com/v1/room/" + props.channel)
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
    }, [props.ffz, props.channel]);

    useEffect(() => {
        if (props.ffz) {
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
    }, [props.ffz]);

    if (ffz.loaded && globalFfz.loaded) {
        let bank: EmoteBank = {
            ...ffz.getData({}),
            ...globalFfz.getData({})
        }
        return (
            <ChatBox channel={props.channel} emotes={bank} />
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

function ChatBox(props) {
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
                message: htmlifyMessage(message, tags.emote, emote_bank) }]);
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
            // todo: <img>
            html += "[[EMOTE " + emoteName + "]]";
            idx = emote.end + 1;
        } else {
            let char = raw[idx];
            // todo: Cleanse
            html += char;
            idx++;
        }
    }

    for (let emote in otherEmotes) {
        let regex = new RegExp("\b" + emote + "\b", "g");
        // todo: replace all with <img>
    }

    return html;
}

// function Message(props) {
//     let message = props.output;
//     let tokens = [];

//     // Initial parsing - Distinguish between twitch emotes and regular text
//     let emotesFromTwitch = parseTwitchEmoteObj(props.tags.emotes);
//     let idx = 0;

//     while (idx < message.length) {
//         if (emotesFromTwitch[idx]) {
//             let emote = emotesFromTwitch[idx];
//             tokens.push({
//                 type: "emote",
//                 url: emote.url
//             });
//             idx = emote.end + 1;
//         } else {
//             let char = message[idx];
//             if (tokens.length === 0 || tokens[tokens.length - 1].type === "emote") {
//                 tokens.push({
//                     type: "text",
//                     value: ""
//                 });
//             }
//             tokens[tokens.length - 1].value += char;
//             idx++;
//         }
//     }

//     // Secondary parsing - Distinguishing between regular text and FFZ emotes
//     let emotesFromOther = props.emotes;
//     if (Object.keys(emotesFromOther).length) {
//         let tokens2 = [];

//         for (let t of tokens) {
//             if (t.type === "emote") {
//                 tokens2.push(t);
//             } else {
//                 let words = t.value.split(" ");
//                 for (let word of words) {
//                     if (emotesFromOther[word]) {
//                         // On a text -> emote border, re-add our missing space
//                         if (tokens2.length && tokens2[tokens2.length - 1].type === "text") {
//                             tokens2[tokens2.length - 1].raw.push("");
//                         }
//                         tokens2.push({
//                             type: "emote",
//                             url: emotesFromOther[word] 
//                         });
//                     } else {
//                         if (tokens2.length === 0 || tokens2[tokens2.length - 1].type === "emote") {
//                             tokens2.push({
//                                 type: "text",
//                                 raw: tokens2.length === 0 ? [] : [""], // On an emote -> text border, re-add our missing space
//                                 get value() {
//                                     return this.raw.join(" ");
//                                 }
//                             });
//                         }
//                         tokens2[tokens2.length - 1].raw.push(word);
//                     }
//                 }
//             }
//         }

//         tokens = tokens2;
//     }

//     return (
//         <span className="chat-row">
//             { 
//                 tokens.map(function(token, idx) {
//                     if (token.type == "emote") {
//                         return <img className="emote" src={token.url} />
//                     } else {
//                         return <>{token.value}</>
//                     }
//                 })
//             }
//         </span>
//     )
// }

type TwitchMap = {[key: number]: {url: string, end: number}};

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