import { useEffect, useMemo, useState } from "react";
import { Message, realChat, TwitchMessage } from "../src/Client";

import { getAllFFZMulti, getAllTwitchBadges } from "../src/Emotes";
import { Template } from "../src/Template";
import { useRouter } from "next/router";

import { populatePronounDisplayMap } from "../src/Pronouns";
import { MilochatOptions, optionsFromRouter, Preload } from "../src/Options";

import Handlebars from "handlebars";
import React from "react";
import _ from "lodash";
import classNames from "classnames";
import { Theme } from "../src/Themes";

/** The default Handlebar compile options */
const DEFAULT_HANDLEBAR_OPTS: CompileOptions = {
    noEscape: true
}

/**
 * The root container which begins the preload and starts up chat when complete
 * No properties are used. Channels are pulled as query params; everything else
 * uses defaults for now.
 */
function Chat() {
    const router = useRouter();

    let [preload, setPreload] = useState<Preload>();
    let [config, setConfig] = useState<[string[], MilochatOptions, Theme]>();
    
    useEffect(() => {
        if (router.isReady) {
            const [channels, opts, template] = optionsFromRouter(router);
            console.log("Using options:", opts);
            
            setConfig([channels, opts, template]);

            Promise.all([
                getAllTwitchBadges(),
                opts.ffz ? getAllFFZMulti(channels) : Promise.resolve({}),
                opts.pronouns ? populatePronounDisplayMap() : Promise.resolve()
            ]).then(a => {
                setPreload({
                    badges: a[0],
                    emotes: a[1]
                });
            });
        }
    }, [router.isReady]);

    if (preload && config) {
        let [channels, options, theme] = config;
        return (
            <div className={"theme-" + theme.name}>
                <ChatBox channels={channels} preload={preload} options={options} template={theme.template}/>
            </div>
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

/**
 * The box which actually displays chat
 * Props:
 * * template: A Handlebars-friendly string to be resolved into HTML
 * * preload: Values pulled in from the loading step.
 * * options: Milochat options for configuration
 * @param props Props
 * @returns The chat lines. Each line is run through the template
 */
function ChatBox(props: any) {
    let template = props.template as string;
    let preload = props.preload as Preload;
    let options = props.options as MilochatOptions;
    let [log, setLog] = useState(new Array<Message>());

    useEffect(() => {
        let chat = realChat(props.channels, options);

        chat.onMessage((message: TwitchMessage) => {
            message.resolveEmotes(preload, options);
            message.resolveBadges(preload);

            if (options.limit?.flavor.type === "time") {
                setTimeout(() => {
                    registerForDelete(message, setLog, options);
                }, options.limit.flavor.ms);
            }

            setLog(l => {
                let concat = [...l, message];
                if (options.limit?.flavor.type === "count") {
                    let max = options.limit.flavor.count;
                    if (concat.length > max) {
                        let toNix = _.take(concat, concat.length - max);
                        registerForDelete(toNix, setLog, options);
                    }
                }

                return concat;
            });
        });

        chat.onClearChat(() => {
            setLog([]);
        });

        chat.start();

        return () => {
            chat.end();
        }
    }, [props.channel, preload.emotes]);
    
    let templateFunc = useMemo(() => Handlebars.compile(template, DEFAULT_HANDLEBAR_OPTS), [template]);

    return (
        <>
        {
            (options.direction === "up" ? [...log].reverse() : log).map(line => {
                return (
                    <div className={classNames('row', { deleting: line.markedForDelete })} key={line.id}>
                        <Template template={templateFunc} data={line} />
                    </div>
                )
            })
        }
        </>
    )
}

function registerForDelete(message: Message | Message[], changeFunc: React.Dispatch<React.SetStateAction<Message[]>>, options: MilochatOptions) {
    if (_.isArray(message)) {
        const toNix = message as Message[];
        const destroy = function() {
            changeFunc(lines => _.differenceBy(lines, toNix, 'id'));
        }

        if (options.limit?.fade) {
            _.forEach(toNix, i => i.markedForDelete = true);
            setTimeout(destroy, options.limit.fade);
        } else {
            destroy();
        }
    } else {
        const toNix = message as Message;
        const destroy = function() {
            changeFunc(lines => _.filter(lines, line => line.id !== toNix.id));
        }

        if (options.limit?.fade) {
            toNix.markedForDelete = true;
            setTimeout(destroy, options.limit.fade);
        } else {
            destroy();
        }
    }
}

export default Chat;