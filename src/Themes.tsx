export interface Theme {
    name: string,
    template: string
}

const THEMES: {[key: string]: string} = {
    default: `
        ({{channel}})
        {{> badgelist}}
        <span class="time">{{date timestamp "H:mm"}}</span>
        <span class="name" style="color:{{color}};">{{name}}: </span>
        <span class="message">{{message}}</span>
    `,
    minimal: `{{name}}: {{message}}`,
    'minimal-color': `<span style="color:{{color}};">{{name}}: </span>{{message}}`
};

export function getTheme(id: string): Theme | undefined {
    if (THEMES[id]) {
        return {
            name: id,
            template: THEMES[id]
        }
    } else {
        return undefined;
    }
}

export function getDefaultTheme(): Theme {
    return {
        name: "default",
        template: THEMES.default
    }
}