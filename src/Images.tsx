import _ from "lodash";

/**
 * An abstraction of an Image, containing its name and URLs to various scaling
 */
export interface Image {
    name: string,
    clazz: string[],
    source: string,
    scale: { [key: number]: string }
}

export function imageToHTML(img: Image): string {
    let srcset: string[] = [];
    _.forEach(img.scale, (value, key) => {
        srcset.push(`${value} ${key}x`);
    });
    return `<img class="${img.clazz.join(" ")} ${img.source}" src="${img.scale[1]}" ${srcset.length ? `srcset="${srcset.join(",")}"` : ""} alt="${img.name}">`;
}

/**
 * Just a regular bank, keyed on a String with an arbitrary value.
 */
export type Bank<T> = { [key: string]: T};
/**
 * A collection of Banks, keyed on Channel and ID
 */
export class SuperBank<T> {
    global: Bank<T>;
    local: Bank<Bank<T>>;

    /**
     * Create a Superbank
     * @param global A bank to serve as a fallback
     * @param local A bank of banks, keyed on Channel name.
     */
    constructor(global?: Bank<T>, local?: Bank<Bank<T>>) {
        this.global = global || {};
        this.local = local || {};
    }

    /**
     * Retrieve an item by its ID and Channel.
     * If the channel doesn't exist, or the ID doesn't exist for that channel, the
     * ID is looked in the fallback bank automatically.
     * @param id The ID to look up
     * @param channel The channel to search in
     * @returns The item, if found, or undefined if not.
     */
    get(id: string, channel: string): T | undefined {
        return this.local[channel]?.[id] || this.global[id];
    }

    /**
     * Get a flattened Bank containing all information.
     * The fallback and channel data are merged into one, with channel data overwriting the fallback.
     * @param channel The channel to retrieve
     * @returns A bank representing all items for that channel
     */
    getAll(channel: string): Bank<T> {
        let local = this.local[channel] || {};
        return {
            ...this.global,
            ...local
        }
    }

    /**
     * Append a new bank to the global fallback.
     * Anything inside of bank will overwrite what was previously present
     * @param bank The bank to add
     */
    addGlobal(bank: Bank<T>): void {
        this.global = {
            ...this.global,
            ...bank
        }
    }

    /**
     * Append a new superbank for the local lookups
     * @param bank The superbank to add
     */
    addLocals(bank: Bank<Bank<T>>): void {
        for (let channel of Object.keys(bank)) {
            let local = this.local[channel] || {};
            this.local[channel] = {
                ...local,
                ...bank[channel]
            };
        }
    }
}
/**
 * A collection of images, keyed on their ID.
 */
export type ImageBank = Bank<Image>;
/**
 * A collection of ImageBanks, keyed on a channel name.
 * Each SuperImageBank also contains a set of global Images, to act as a fallback.
 */
export type SuperImageBank = SuperBank<Image>;

export class ImageService {
    private _emotes: SuperImageBank = new SuperBank<Image>();
    private _badges: SuperImageBank = new SuperBank<Image>();

    /**
     * Populate all images
     * @param channel The channels to retrieve information for
     * @param useFfz If true, FFZ sources are also queried
     * @returns Promise which resolves when all sources have been processed
     */
    async populate(channel: string[], useFfz: boolean): Promise<void> {
        this._badges = await getAllTwitchBadges();
        
        if (useFfz) {
            let globalFfzEmotes = await getGlobalFFZ();
            this._emotes.addGlobal(globalFfzEmotes);

            // Each getChannelFFZ call returns a two-size array: [Emotes, Badges]
            // Calling for each channel returns an 2D array: n elements, each 2 size: [[Emotes, Badges], [Emotes, Badges], [Emotes, Badges]]
            // Unzip "inverts" them, returning a 2D array: 2 elements, each of n size: [[Emotes, Emotes, Emotes], [Badges, Badges, Badges]]
            let [localFfzEmotes, localFfzBadges] = _.unzip(await Promise.all(channel.map(c => getChannelFFZ(c))));
            this._badges.addLocals(_.zipObject(channel, localFfzBadges));
            this._emotes.addLocals(_.zipObject(channel, localFfzEmotes));
        }
    }

    get emotes(): SuperImageBank {
        return this._emotes;
    }

    get badges(): SuperImageBank {
        return this._badges;
    }
}

export default new ImageService();

/**
 * Asynchrnously retrieves the global FFZ emotes 
 * @returns A bank of images containing the global FFZ emotes
 */
async function getGlobalFFZ(): Promise<ImageBank> {
    console.log("Fetching global emotes from FFZ...");
    const data = await callFFZ("https://api.frankerfacez.com/v1/set/global", "global");
    console.log("Loaded %d global emotes from FFZ", Object.keys(data).length);
    return data;
}

/**
 * Asynchrously call a URL and parse the result as an Emote Bank
 * @param url The URL to call
 * @returns The bank of images for use
 */
 function callFFZ(url: string, type: string): Promise<ImageBank> {
    return fetch(url)
        .then(response => response.json())
        .then(data => {
            return parseFFZResponse(data, type);
        })
        .catch(err => {
            console.error(err);
            return {};
        })
}

/**
 * Asynchronously retrieves the FFZ emotes of a channel
 * @param channel The channel name
 * @returns Two emote banks containing the FFZ emotes for that channel and the FFZ badges for that channel
 */
async function getChannelFFZ(channel: string): Promise<[ImageBank, ImageBank]> {
    console.log(`Fetching emotes for channel ${channel} from FFZ...`);
    const [emotes, badges] = await fetch("https://api.frankerfacez.com/v1/room/" + channel)
        .then(response => response.json())
        .then(d => {
            let badgeBank: ImageBank = {};
            if (d.room.mod_urls) {
                let modBadgeUrl: Image = {
                    name: "moderator",
                    clazz: ["badge", "channel", channel],
                    source: "ffz",
                    scale: {}
                };
                _.forEach([1, 2, 4], (idx) => {
                    if (d.room.mod_urls[idx]) {
                        modBadgeUrl.scale[idx] = "https:" + d.room.mod_urls[idx]
                    }
                })
                badgeBank["moderator:1"] = modBadgeUrl;
            }

            return [parseFFZResponse(d, `channel ${channel}`), badgeBank];
        })
        .catch(err => {
            console.error(err);
            return [{}, {}];
        });
        
    console.log(`Loaded ${Object.keys(emotes).length} emotes for channel ${channel}`);
    return [emotes, badges];
}

function parseFFZResponse(data: any, type: string) : ImageBank {
    let sets = data.sets;
    let emote_lookup: ImageBank = {};
    for (let set_key in sets) {
        for (let emote of sets[set_key].emoticons) {

            let urls: Image = {
                name: emote.name,
                source: "ffz",
                clazz: ["emote", type],
                scale: {
                    1: emote.urls["1"],
                    2: emote.urls["2"],
                    4: emote.urls["4"]
                }
            }

            emote_lookup[emote.name] = urls;
        }
    }
    return emote_lookup;
}

/**
 * Asynchronously retrieve all global Twitch badges
 * @returns The bank of Twitch badge images for use
 */
function getAllTwitchBadges(): Promise<SuperImageBank> {
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
                        source: "twitch",
                        clazz: ["badge", key, `${key}-${version}`],
                        scale: {
                            1: emoteDataForVersion.image_url_1x,
                            2: emoteDataForVersion.image_url_2x,
                            4: emoteDataForVersion.image_url_4x
                        }
                    };
                    let bankKey = `${key}:${version}`;
                    bank[bankKey] = image;
                }
            }
            return new SuperBank<Image>(bank);
        })
        .catch(err => {
            console.error(err);
            return new SuperBank<Image>();
        })
}