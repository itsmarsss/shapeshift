// www.tryshapeshift.com: sends every request to the same path on the bare
// domain, so there's one address for sign-in cookies and share links.
export default {
    fetch(request: Request) {
        const url = new URL(request.url);
        url.hostname = url.hostname.replace(/^www\./, "");
        return Response.redirect(url.toString(), 301);
    },
};
