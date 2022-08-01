export type ImageBank = { [key: string]: Image };
export interface Image {
    name: string,
    '1x': string | undefined,
    '2x': string | undefined,
    '4x': string | undefined
}

/**
 * Asynchronously retrieve global and channel FFZ emotes
 * @param channel The channels to pull from. If absent, only global are pulled
 * @returns An emote bank containing all the emotes
 */
export async function getAllFFZMulti(channel?: string[]): Promise<ImageBank> {
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
async function getGlobalFFZ(): Promise<ImageBank> {
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
async function getChannelFFZ(channel: string): Promise<ImageBank> {
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
function callFFZ(url: string): Promise<ImageBank> {
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

function parseFFZResponse(data: any) : ImageBank {
    let sets = data.sets;
    let emote_lookup: ImageBank = {};
    for (let set_key in sets) {
        for (let emote of sets[set_key].emoticons) {

            let urls: Image = {
                name: emote.name,
                "1x": emote.urls["1"],
                "2x": emote.urls["2"],
                "4x": emote.urls["4"]
            }

            emote_lookup[emote.name] = urls;
        }
    }
    return emote_lookup;
}

export function getAllTwitchBadges(): Promise<ImageBank> {
    return fetch("https://badges.twitch.tv/v1/badges/global/display")
        .then(response => response.json())
        .then(data => {
            let set = data.badge_sets;
            let bank: ImageBank = {};
            for (let key of Object.keys(set)) {
                let emoteData = set[key];
                for (let version of Object.keys(emoteData.versions)) {
                    let emoteDataForVersion = emoteData.versions[version];
                    let image: Image = {
                        name: key,
                        "1x": emoteDataForVersion.image_url_1x,
                        "2x": emoteDataForVersion.image_url_2x,
                        "4x": emoteDataForVersion.image_url_4x
                    };
                    let bankKey = `${key}:${version}`;
                    bank[bankKey] = image;
                }
            }
            console.log(bank);
            return bank;
        })
        .catch(err => {
            console.error(err);
            return {}
        })
}