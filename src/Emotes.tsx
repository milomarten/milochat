export type EmoteBank = { [key: string]: string[] };

export async function getAllFFZ(channel?: string | null): Promise<EmoteBank> {
    let promises = [getGlobalFFZ(), channel ? getChannelFFZ(channel) : Promise.resolve({})];

    let banks = await Promise.all(promises);
    let merged = {};
    for (let bank of banks) {
        merged = {
            ...merged,
            ...bank
        }
    }
    return merged;
}

async function getGlobalFFZ(): Promise<EmoteBank> {
    console.log("Fetching global emotes from FFZ...");
    const data = await callFFZ("https://api.frankerfacez.com/v1/set/global");
    console.log("Loaded %d global emotes from FFZ", Object.keys(data).length);
    return data;
}

async function getChannelFFZ(channel: string): Promise<EmoteBank> {
    console.log("Fetching channel emotes from FFZ...");
    const data = await callFFZ("https://api.frankerfacez.com/v1/room/" + channel);
    console.log("Loaded %d channel emotes from FFZ", Object.keys(data).length);
    return data;
}

function callFFZ(url: string): Promise<EmoteBank> {
    return fetch(url)
        .then(response => response.json())
        .then(data => {
            return parseFFZResponse(data);
        })
        .catch(err => {
            console.error(err);
            return {};
        })
}

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