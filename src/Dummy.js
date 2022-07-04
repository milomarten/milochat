const USERS = [
    "Milo_Marten",
    "KaliStryf",
    "AndiCD_",
    "Cojo490"
];

const MESSAGES = [
    "Hey everyone!"
]

export function randomUser() {
    let idx = Math.floor(Math.random() * USERS.length);
    return USERS[idx];
}

function randomByte() {
    let b = Math.floor(Math.random() * 0x100);
    return b.toString(16);
}

function randomColor() {
    return "#" + randomByte() + randomByte() + randomByte();
}

function randomTags() {
    let user = randomUser();
    return {
        "display-name": user,
        "username": user.toLowerCase(),
        "color": randomColor(),
        "message-type": "chat",
        "mod": false,
        "subscriber": false,
        "turbo": false,
        "first-msg": false,
        "returning-chatter": false,
        "tmi-sent-ts": Date.now().toString(),
        "user-id": Math.floor(Math.random() * 0x10000)
    }
}

function randomMessage() {
    let tags = randomTags();

    let regex = /<([A-Za-z0-9_]+)>/g;
    let idx = Math.floor(Math.random() * MESSAGES.length);
    let message = MESSAGES[idx];

    let match;
    while ((match = regex.exec(message)) != null) {
        console.log(match);
    }

    return [message, tags];
}

export function createDummyClient() {
    return {
        hooks: [],
        interval: null,
        start: function() {
            this.interval = setInterval(function() {
                let [message, tags] = randomMessage();
                for (let hook in this.hooks) {
                    hook("#" + randomUser(), tags, message);
                }
            }, 2000);
        },
        onMessage: function(f) {
            this.hooks.push(f);
        },
        end: function() {
            clearInterval(this.interval);
        }
    }
}