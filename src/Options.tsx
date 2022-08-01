import _ from "lodash";
import { NextRouter } from "next/router"
import { ParsedUrlQuery } from "querystring";
import { ImageBank } from "./Emotes";
import { getDefaultTheme, getTheme, Theme } from "./Themes";

/** Contains an assortment of data loaded in before chat is started */
export interface Preload {
    emotes: ImageBank;
    badges: ImageBank;
}

/** The default options */
const DEFAULT_OPTIONS: MilochatOptions = {
    tag: {
        at: true
    }
};

/** The options that can be used to configure Milochat */
export interface MilochatOptions {
    /** Toggles whether FFZ emotes are supported */
    ffz?: boolean
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
    tag?: {
        /** Wrap anything that matches this regex with a span tag with the following class */
        matches?: {regex: string | RegExp, attribute: string, value: string}[],
        /** If true, any pings are wrapped in a span tag with class "ping" */
        at?: boolean
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
    direction?: "up" | "down",
    pronouns?: boolean
}

type Limit = ChatSizeLimit | ChatTimeLimit;
/** A limit where chat is constrainted to a fixed number of lines */
export type ChatSizeLimit = { type: 'count', count: number };
/** A limit where chat will only show for a fixed number of milliseconds */
export type ChatTimeLimit = { type: 'time', ms: number };

export function optionsFromRouter(router: NextRouter): [string[], MilochatOptions, Theme] {
    let query = router.query;

    const count = asNumber(query.count);
    const ms = asNumber(query.time);
    const direction = asString(query.direction);
    const pronouns = asBool(query.pronouns);

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
        ...DEFAULT_OPTIONS,
        ffz: asBool(query.ffz),
        limit,
        direction: direction == "up" ? "up" : "down",
        pronouns
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

function parseTheme(query: ParsedUrlQuery): Theme {
    let customTemplate = asString(query.template);
    if (customTemplate) {
        return {
            name: "custom",
            template: customTemplate
        };
    }
    let theme = asString(query.theme);
    return (theme && getTheme(theme)) || getDefaultTheme();
}