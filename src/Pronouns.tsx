import _ from "lodash";

export type Pronoun = {id: string, display: string};
const NO_PRONOUN: Pronoun = { id: "none", display: "" };

export class PronounService {
    displayMap: {[key: string]: string} = {};
    pronounCache: {[key: string]: Pronoun} = {};

    populatePronounDisplayMap(): Promise<void> {
        return fetch("https://pronouns.alejo.io/api/pronouns")
            .then(r => r.json())
            .then(mapping => {
                for (let map of mapping) {
                    this.displayMap[map.name] = map.display;
                }
            })
            .catch(err => {
                console.error(err)
            });
    }
    
    getPronouns(username: string): Promise<Pronoun | undefined> {
        if (this.pronounCache[username]) {
            let p = this.pronounCache[username];
            return Promise.resolve(p.id === NO_PRONOUN.id ? undefined : p);
        }
        if (_.isEmpty(this.displayMap)) {
            return Promise.resolve(undefined);
        }
        return fetch(`https://pronouns.alejo.io/api/users/${username}`)
            .then(response => response.json())
            .then(json => {
                let arr = json as any[];
                if (arr.length == 0) {
                    this.pronounCache[username] = NO_PRONOUN;
                    return undefined;
                } else {
                    this.pronounCache[username] = {
                        id: arr[0].pronoun_id,
                        display: this.displayMap[arr[0].pronoun_id]
                    };
                    return this.pronounCache[username];
                }
            })
            .catch(err => {
                console.error(err)
                return undefined;
            });
    }
}

export default new PronounService();