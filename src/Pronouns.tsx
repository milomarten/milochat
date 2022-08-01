export type Pronoun = {id: string, display: string};
const NO_PRONOUN: Pronoun = { id: "none", display: "" };

const displayMap: {[key: string]: string} = {};
const pronounCache: {[key: string]: Pronoun} = {};

export function populatePronounDisplayMap(): Promise<void> {
    return fetch("https://pronouns.alejo.io/api/pronouns")
        .then(r => r.json())
        .then(mapping => {
            for (let map of mapping) {
                displayMap[map.name] = map.display;
            }
        })
        .catch(err => {
            console.error(err)
        });
}

export function getPronouns(username: string): Promise<Pronoun | undefined> {
    if (pronounCache[username]) {
        let p = pronounCache[username];
        return Promise.resolve(p.id === NO_PRONOUN.id ? undefined : p);
    }
    return fetch(`https://pronouns.alejo.io/api/users/${username}`)
        .then(response => response.json())
        .then(json => {
            let arr = json as any[];
            if (arr.length == 0) {
                pronounCache[username] = NO_PRONOUN;
                return undefined;
            } else {
                pronounCache[username] = {
                    id: arr[0].pronoun_id,
                    display: displayMap[arr[0].pronoun_id]
                };
                return pronounCache[username];
            }
        })
        .catch(err => {
            console.error(err)
            return undefined;
        });
}