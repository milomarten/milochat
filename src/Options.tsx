import _, { trimEnd } from "lodash";
import { NextRouter } from "next/router"
import { ParsedUrlQuery } from "querystring";
import { ImageBank } from "./Emotes";
import { getTheme, Theme } from "./Themes";

/** Contains an assortment of data loaded in before chat is started */
export interface Preload {
    emotes: ImageBank;
    badges: ImageBank;
}

/** The options that can be used to configure Milochat */
export interface MilochatOptions {
    /** Toggles whether FFZ emotes are supported */
    ffz?: boolean,
    /** Toggles whether Pronouns are supported, via pronouns.alejo.io */
    pronouns?: boolean,
    blacklist?: {
        /** If a message is from this user, do not display */
        users?: (string | RegExp)[]
        /** If a message includes any of these words, do not display */
        includes?: string[]
        /** If a message starts with any of these words, do not display */
        prefixes?: string[]
        /** If a message matches any of these regexes, do not display */
        matches?: RegExp[]
    },
    /** Describes any size limits to the chat */
    limit?: {
        /** The type of limit */
        flavor: Limit,
        /** 
         * A fade timer 
         * If present, the chat will wait <fade> ms before deleting completely.
         * During this time, the row will have the "deleting" class.
         * 
         * If absent, or zero, the node is deleted immediately.
         * */
        fade?: number
    },
    /** 
     * The direction to scroll. 
     * If "up", messages go from bottom up, with the earliest message at the bottom
     * If "down", messages go from top down, with the earliest message at the top
     * */
    direction?: "up" | "down",
    /**
     * Whether chat commands should be enabled
     * If true, chat commands are enabled, using prefix "!"
     * If false, chat commands are disabled
     * If a string, chat commands are enabled, using the passed string as a prefix
     */
    commands?: boolean | string
}

type Limit = ChatSizeLimit | ChatTimeLimit;
/** A limit where chat is constrainted to a fixed number of lines */
export type ChatSizeLimit = { type: 'count', count: number };
/** A limit where chat will only show for a fixed number of milliseconds */
export type ChatTimeLimit = { type: 'time', ms: number };

export function optionsFromRouter(router: NextRouter): [string[], MilochatOptions, Theme] {
    let query = router.query;

    const ffz = asBool(query.ffz);
    const count = asNumber(query.count);
    const ms = asNumber(query.time);
    const direction = asString(query.direction);
    const pronouns = asBool(query.pronouns);
    const commands = asBoolOrString(query.commands);

    let flavor: Limit | undefined;
    if (count) {
        flavor = { type: "count", count };
    } else if (ms) {
        flavor = { type: "time", ms }
    }

    let limit;
    if (flavor) {
        limit = {
            flavor,
            fade: asNumber(query.fade)
        }
    }

    const opts: MilochatOptions = {
        ffz,
        limit,
        direction: direction == "up" ? "up" : "down",
        pronouns,
        commands: commands === undefined ? true : commands
    }

    return [asStringArray(query.channel), opts, parseTheme(query)];
}

function asBool(val: string | string[] | undefined): boolean {
    if(_.isArray(val)) {
        return _.last(val) === "true";
    } else if (val === undefined) {
        return false;
    } else {
        return val === "true";
    }
}

function asString(val: string | string[] | undefined): string | undefined {
    if(_.isArray(val)) {
        return val[0];
    } else if (val === undefined) {
        return undefined;
    } else {
        return val;
    }
}

function asStringArray(val: string | string[] | undefined): string[] {
    if(_.isArray(val)) {
        return val;
    } else if (val === undefined) {
        return [];
    } else {
        return [val];
    }
}

function asNumber(val: string | string[] | undefined): number | undefined {
    if(_.isArray(val)) {
        const last = _.last(val);
        return last ? parseInt(last) : undefined;
    } else if (val === undefined) {
        return undefined;
    } else {
        return parseInt(val);
    }
}

function asBoolOrString(val: string | string[] | undefined): boolean | string | undefined {
    let norm: string;
    if(_.isArray(val)) {
        if (val.length) {
            norm =_.last(val) as string;
        } else {
            return undefined;
        }
    } else if (val === undefined) {
        return undefined;
    } else {
        norm = val;
    }

    if (norm === "true") return true;
    else if (norm === "false") return false;
    else return norm;
}

function parseTheme(query: ParsedUrlQuery): Theme {
    let customTemplate = asString(query.template);
    if (customTemplate) {
        return {
            name: "custom",
            template: customTemplate
        };
    }
    let theme = asString(query.theme);
    return getTheme(theme);
}