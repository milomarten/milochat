import Handlebars, { HelperOptions } from "handlebars";
import _ from "lodash";
import utils from 'handlebars-utils';
import { ChatMessage } from "./Client";
import { imageToHTML } from "./Images";

//Allows usage of the date helper, which can format chat message timestamps
Handlebars.registerHelper("date", require("helper-date"));
// Renders a list of badges
Handlebars.registerPartial("badgelist", function(context: ChatMessage) {
    return context.badges.map(badge => {
        let url = badge.scale[1];
        if (url) {
            return imageToHTML(badge);
        } else {
            return "";
        }
    }).join("");
})

/**
 * Template tag. When provided a template function and data, this resolves
 * to a div containing the resolved HTML
 * Properties:
 * * template: The output of a Handlebars.compile call
 * * data: Any object, which will be used to resolve the templates
 * @param props Template properties
 * @returns A div containing the template, which is resolved into HTML
 */
export function Template(props: any) {
    let template = props.template as HandlebarsTemplateDelegate;
    let data = props.data;
    
    return (
        <div dangerouslySetInnerHTML={{__html: template(data)}} />
    )
}