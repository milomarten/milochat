import { useEffect } from "react";

const tmi = require('tmi.js');

function Chat(props) {
    useEffect(() => {
        console.log("Connecting to", props.channel);
        
        const client = new tmi.Client({
            channels: [ props.channel ]
        });

        client.connect().catch(console.error);

        client.on('message', (channel, tags, message, self) => {
            console.log(message);
        });

        return () => { 
            console.log("Disconnecting from Client");
            client.disconnect(); 
        }
    }, [props.channel]);

    return (
        <div>I am the chat.</div>
    )
}

export default Chat;