export type EmoteBank = { [key: string]: string[] };

/**
 * Asynchronously retrieve global and channel FFZ emotes
 * @param channel The channels to pull from. If absent, only global are pulled
 * @returns An emote bank containing all the emotes
 */
export async function getAllFFZMulti(channel?: string[]): Promise<EmoteBank> {
    let localPromises = channel ? channel.map(c => getChannelFFZ(c)) : [];
    let promises = [getGlobalFFZ(), ...localPromises];

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

/**
 * Asynchrnously retrieves the global FFZ emotes 
 * @returns An emote bank containing the global FFZ emotes
 */
async function getGlobalFFZ(): Promise<EmoteBank> {
    console.log("Fetching global emotes from FFZ...");
    const data = await callFFZ("https://api.frankerfacez.com/v1/set/global");
    console.log("Loaded %d global emotes from FFZ", Object.keys(data).length);
    return data;
}

/**
 * Asynchronously retrieves the FFZ emotes of a channel
 * @param channel The channel name
 * @returns An emote bank containing the FFZ emotes for that channel
 */
async function getChannelFFZ(channel: string): Promise<EmoteBank> {
    console.log(`Fetching emotes for channel ${channel} from FFZ...`);
    const data = await callFFZ("https://api.frankerfacez.com/v1/room/" + channel);
    console.log(`Loaded ${Object.keys(data).length} emotes for channel ${channel}`);
    return data;
}

/**
 * Asynchrously call a URL and parse the result as an Emote Bank
 * @param url The URL to call
 * @returns The Emote Bank returned from the url
 */
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