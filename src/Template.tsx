import Handlebars from "handlebars";

export function Template(props: any) {
    let template = props.template as string;
    let data = props.data;

    console.log(data);

    let func = Handlebars.compile(template, {
        noEscape: true
    });
    return (
        <div dangerouslySetInnerHTML={{__html: func(data)}} />
    )
}