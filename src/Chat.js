import { useEffect, useState } from "react";
import { createDummyClient } from "./Dummy";

import "./Chat.css"

const tmi = require('tmi.js');

function realChat(channel) {
    const client = new tmi.Client({
        channels: [ channel ]
    });

    return {
        client: client,
        start: function() {
            console.log("Starting Client");
            this.client.connect().catch(console.error);
        },
        onMessage: function(f) {
            this.client.on('message', function(channel, tags, message, self) {
                f(channel, tags, message, self);
            });
        },
        end: function() {
            console.log("Disconnecting Client");
            this.client.disconnect();
        }
    }
}

function parseFFZResponse(data) {
    let sets = data.sets;
    let emote_lookup = {};
    for (let set_key in sets) {
        for (let emote of sets[set_key].emoticons) {
            let url = emote.urls["4"] || emote.urls["2"] || emote.urls["1"];
            emote_lookup[emote.name] = "https:" + url;
        }
    }
    return emote_lookup;
}

function Chat(props) {
    let [ffz, setFfz] = useState({ loaded: false });
    let [globalFfz, setGlobalFfz] = useState({ loaded: false });
    
    useEffect(() => {
        if (props.ffz && props.channel) {
            console.log("Fetching channel emotes from FFZ...");
            fetch("https://api.frankerfacez.com/v1/room/" + props.channel)
                .then(response => response.json())
                .then(data => {
                    let emote_lookup = parseFFZResponse(data);
                    console.log("Loaded %d channel emotes from FFZ", Object.keys(emote_lookup).length);
                    setFfz({ loaded: true, bank: emote_lookup });
                })
                .catch(err => {
                    console.error(err);
                    setFfz({ loaded: true, bank: {}});
                })
        } else {
            setFfz({ loaded: true, bank: {}});
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
                    setGlobalFfz({ loaded: true, bank: emote_lookup });
                })
                .catch(err => {
                    console.error(err);
                    setGlobalFfz({ loaded: true, bank: {}});
                })
        } else {
            setGlobalFfz({ loaded: true, bank: {}});
        }
    }, [props.ffz]);

    if (ffz.loaded && globalFfz.loaded) {
        let bank = {
            ...ffz.bank,
            ...globalFfz.bank
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
    let emote_bank = props.emotes;
    let [log, setLog] = useState([]);

    useEffect(() => {
        let chat;
        if (props.channel) {
            chat = realChat(props.channel);
        } else {
            chat = createDummyClient();
        }

        chat.onMessage((channel, tags, message, self) => {
            setLog([...log, { channel, tags, message }]);
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
                    <Message output={row.message} tags={row.tags} emotes={emote_bank}/>
                </div>
            })
        }
        </>
    )
}

function Message(props) {
    let message = props.output;
    let tokens = [];

    // Initial parsing - Distinguish between twitch emotes and regular text
    let emotesFromTwitch = parseTwitchEmoteObj(props.tags.emotes);
    let idx = 0;

    while (idx < message.length) {
        if (emotesFromTwitch[idx]) {
            let emote = emotesFromTwitch[idx];
            tokens.push({
                type: "emote",
                url: emote.url
            });
            idx = emote.end + 1;
        } else {
            let char = message[idx];
            if (tokens.length === 0 || tokens[tokens.length - 1].type === "emote") {
                tokens.push({
                    type: "text",
                    value: ""
                });
            }
            tokens[tokens.length - 1].value += char;
            idx++;
        }
    }

    // console.log(tokens);

    // Secondary parsing - Distinguishing between regular text and FFZ emotes
    let emotesFromOther = props.emotes;
    if (Object.keys(emotesFromOther).length) {
        let tokens2 = [];

        for (let t of tokens) {
            if (t.type === "emote") {
                tokens2.push(t);
            } else {
                let words = t.value.split(" ");
                for (let word of words) {
                    if (emotesFromOther[word]) {
                        // On a text -> emote border, re-add our missing space
                        if (tokens2.length && tokens2[tokens2.length - 1].type === "text") {
                            tokens2[tokens2.length - 1].raw.push("");
                        }
                        tokens2.push({
                            type: "emote",
                            url: emotesFromOther[word] 
                        });
                    } else {
                        if (tokens2.length === 0 || tokens2[tokens2.length - 1].type === "emote") {
                            tokens2.push({
                                type: "text",
                                raw: tokens2.length === 0 ? [] : [""], // On an emote -> text border, re-add our missing space
                                get value() {
                                    return this.raw.join(" ");
                                }
                            });
                        }
                        tokens2[tokens2.length - 1].raw.push(word);
                    }
                }
            }
        }

        tokens = tokens2;
    }

    return (
        <span className="chat-row">
            { 
                tokens.map(function(token, idx) {
                    if (token.type == "emote") {
                        return <img className="emote" src={token.url} />
                    } else {
                        return <>{token.value}</>
                    }
                })
            }
        </span>
    )
}

function parseTwitchEmoteObj(raw) {
    let map = {};
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