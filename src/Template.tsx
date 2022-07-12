import Handlebars, { HelperOptions } from "handlebars";

Handlebars.registerHelper("date", require("helper-date"));

export function Template(props: any) {
    let template = props.template as HandlebarsTemplateDelegate;
    let data = props.data;
    
    return (
        <div dangerouslySetInnerHTML={{__html: template(data)}} />
    )
}