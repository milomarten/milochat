import { useEffect, useState } from "react";
import { createDummyClient } from "./Dummy";

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

function Chat(props) {
    let [ffz, setFfz] = useState({ loaded: false });
    
    useEffect(() => {
        if (props.ffz && props.channel) {
            console.log("Fetching emotes from FFZ...");
            fetch("https://api.frankerfacez.com/v1/room/" + props.channel)
                .then(response => response.json())
                .then(data => {
                    let sets = data.sets;
                    let emote_lookup = {};
                    for (let set_key in sets) {
                        for (let emote of sets[set_key].emoticons) {
                            emote_lookup[emote.name] = "https:" + emote.urls["4"];
                        }
                    }
                    console.log("Loaded %d emotes from FFZ", Object.keys(emote_lookup).length);
                    setFfz({ loaded: true, bank: emote_lookup });
                })
                .catch(err => {
                    console.error(err);
                    setFfz({ error: err });
                })
        } else {
            setFfz({ loaded: true, bank: {}});
        }
    }, [props.ffz, props.channel]);

    if (ffz.error) {
        return (
            <div>Error loading from FFZ</div>
        )
    } else if (ffz.loaded) {
        return (
            <ChatBox channel={props.channel} emotes={ffz.bank} />
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

function ChatBox(props) {
    let [log, setLog] = useState([]);

    useEffect(() => {
        let chat;
        if (props.channel) {
            chat = realChat(props.channel);
        } else {
            chat = createDummyClient();
        }

        chat.onMessage((channel, tags, message, self) => {
            log.push({
                channel, tags, message
            });
            setLog(log);
        });

        chat.start();

        return () => chat.end();
    }, [props.channel]);

    console.log(log);

    return (
        <div>I am the chat.</div>
    )
}

export default Chat;