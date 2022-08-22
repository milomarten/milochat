import { useEffect, useMemo, useRef, useState } from "react";
import { AbstractTwitchMessage, ChatMessage, Message, realChat, SubMessage, SystemMessage, TwitchMessage } from "../src/Client";

import Images from "../src/Images";
import { Template } from "../src/Template";
import { useRouter } from "next/router";

import Pronouns from "../src/Pronouns";
import { MilochatOptions, optionsFromRouter } from "../src/Options";

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
 * A wrapper around the Chat element which pulls configuration from query parameters.
 */
function ChatWrapper() {
    const router = useRouter();

    let [config, setConfig] = useState<[string[], MilochatOptions, Theme]>();
    
    useEffect(() => {
        if (router.isReady) { setConfig(optionsFromRouter(router)); }
    }, [router.isReady]);

    if (config) {
        let [channels, options, theme] = config;
        console.log("Using options:", options);
        return (
            <Chat channels={channels} options={options} theme={theme}/>
        )
    } else {
        return (
            <div>Loading...</div>
        )
    }
}

/**
 * A wrapper around the Chatbox element which performs initial loading of assets.
 * Props:
 * * channels: A list of channels to connect to
 * * theme: A theme (potentially custom) to use for display into HTML
 * * options: Milochat options for configuration
 */
export function Chat(props: any) {
    const channels = props.channels as string[];
    const options = props.options as MilochatOptions;
    const theme = props.theme as Theme;

    let [preload, setPreload] = useState(false);
    
    useEffect(() => {
        Promise.allSettled([
            Images.populate(channels, options.ffz || false),
            options.pronouns ? Pronouns.populatePronounDisplayMap() : Promise.resolve()
        ]).then(() => setPreload(true));
    }, [options.ffz, options.pronouns, channels]);

    if (preload) {
        
        return (
            <div className={"theme-" + theme.name} id="chatbox">
                <ChatBox channels={channels} options={options} template={theme.template}/>
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
 * * channels: A list of channels to connect to
 * * template: A Handlebars-friendly string to be resolved into HTML
 * * preload: Values pulled in from the loading step.
 * * options: Milochat options for configuration
 * @param props Props
 * @returns The chat lines. Each line is run through the template
 */
function ChatBox(props: any) {
    const template = props.template as string;
    const options = props.options as MilochatOptions;

    const [log, setLog] = useState(new Array<Message>());

    const endEl = useRef<HTMLDivElement>(null);

    function addMessageToLog(message: Message): void {
        if (options.limit?.flavor.type === "time") {
            setTimeout(() => {
                registerForDelete(message, setLog, options);
            }, options.limit.flavor.ms);
        }

        setLog(l => {
            let concat = [...l, message];
            let max = options.limit?.flavor.type === "count" ? options.limit.flavor.count : 50;

            if (concat.length > max) {
                let toNix = _.take(concat, concat.length - max);
                registerForDelete(toNix, setLog, options);
            }

            return concat;
        });
    }

    useEffect(() => {
        let chat = realChat(props.channels, options);

        chat.onMessage((message: ChatMessage) => {
            message.resolveEmotes(Images.emotes);
            message.resolveBadges(Images.badges);

            addMessageToLog(message);
        });

        chat.onSystemMessage((message: SystemMessage) => {
            addMessageToLog(message);
        });

        chat.onSubscribe((message: SubMessage) => {
            message.resolveEmotes(Images.emotes);
            message.resolveBadges(Images.badges);

            addMessageToLog(message);
        })

        chat.onMessageDelete((id: string) => {
            setLog(lines => _.filter(lines, (line) => line.id !== id));
        });

        chat.onUserBan((username: string, channel: string) => {
            setLog(lines => _.filter(lines, (line) => {
                if (line instanceof AbstractTwitchMessage) {
                    return line.tags.username !== username && line.channel !== channel
                } else {
                    return true;
                }
            }))
        })

        chat.start();

        return () => {
            chat.end();
        }
    }, [props.channel]);

    useEffect(() => {
        if (options.direction === "down") {
            endEl.current?.scrollIntoView({ behavior: "smooth" })
        }
    }, [log]);
    
    let templateFunc = useMemo(() => Handlebars.compile(template, DEFAULT_HANDLEBAR_OPTS), [template]);

    return (
        <div className="container">
        {
            (options.direction === "up" ? [...log].reverse() : log).map(line => {
                return (
                    <div className={classNames('row', { deleting: line.markedForDelete })} key={line.id}>
                        <Template template={templateFunc} data={line} />
                    </div>
                )
            })
        }
        <div ref={endEl} id="end"/>
        </div>
    )
}

/**
 * Delete a message, taking options into consideration.
 * If a fade option is present, the messages will be marked for deletion, and then removed once the alloted time is passed
 * If no fade option is present, the messages are deleted instantly
 * @param message The message, or messages, to delete
 * @param changeFunc The React Function to use to perform the actual deletion
 * @param options The Milochat options to use
 */
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

export default ChatWrapper;