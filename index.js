import http from 'http';
import https from 'https';
import { gzipSync } from 'zlib';
import { URL } from 'url';
import { readFile, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';

const EVENT_SOURCE = '/servbot-listener';
const GZIP_EXTS = ['html', 'css', 'js', 'json', 'xml', 'svg'];
const MIMES = getMimes();

const RELOAD_HTML = `
    <script>
        (() => {
            const source = new EventSource('${EVENT_SOURCE}');
            const reload = () => location.reload(true);
            source.onmessage = reload;
            source.onerror = () => source.onopen = reload;
            console.log('servbot is listening for changes...');
        })();
    </script>
`;

export default ({
    root = '.',
    reload = false,
    fallback = '',
    ignores = [],
    credentials,
    verbose = true
}) => {
    const serverRoot = resolve(root);
    if (!existsSync(serverRoot) || !statSync(serverRoot).isDirectory()) {
        throw Error(`[servbot] Invalid root directory: ${serverRoot}`);
    }

    let internalPort = 8080;
    const protocol = credentials ? 'https://' : 'http://';
    const htmlToAppend = reload ? RELOAD_HTML : '';
    const clients = [];

    process.on('SIGINT', () => {
        clients.map((res) => res.end());
        process.exit();
    });

    const createServer = credentials
        ? (listener) => https.createServer(credentials, listener)
        : (listener) => http.createServer(listener);

    const server = createServer((req, res) => {
        const reqPath = decodeURI(req.url);
        const url = new URL(reqPath, protocol + req.headers.host);

        let { pathname } = url;

        if (reload && pathname == EVENT_SOURCE) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
            });

            res.write('event: connected\ndata: ready\n\n\n');
            clients.push(res);
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');

        const routeHasDot = pathname.split('/').pop().indexOf('.') >= 0;
        const matchesIgnores = ignores.reduce((a, pattern) => a || pattern.test(pathname), false);

        if (
            (fallback && !routeHasDot) ||
            (fallback && routeHasDot && (ignores.length && !matchesIgnores))
        ) {
            // SPA route
            return routeResponse(res, pathname);
        }

        if (!routeHasDot) {
            const isDirectoryRoute = pathname.slice(-1) === '/';
            pathname += (isDirectoryRoute ? 'index.html' : '/index.html');
        }

        const uri = join(serverRoot, pathname);
        const ext = uri.split('.').pop();

        if (!existsSync(uri)) {
            return errorResponse(res, pathname, 404);
        }

        readFile(uri, 'binary', (err, file) => {
            return err
                ? errorResponse(res, pathname, 500)
                : fileResponse(res, pathname, 200, file, ext);
        });
    });

    function routeResponse(res, pathname) {
        const fallbackPath = join(serverRoot, fallback);

        readFile(fallbackPath, 'binary', (err, file) => {
            if (err) return errorResponse(res, pathname, 500);
            const status = pathname === '/' ? 200 : 301;
            fileResponse(res, pathname, status, file, 'html');
        });
    }

    function fileResponse(res, pathname, status, file, ext) {
        let encoding = 'binary';

        if (GZIP_EXTS.includes(ext)) {
            if (ext === 'html' && htmlToAppend) file += htmlToAppend;
            res.setHeader('Content-Encoding', 'gzip');
            file = gzipSync(Buffer.from(file, 'binary').toString('utf8'));
            encoding = 'utf8';
        }

        res.writeHead(status, { 'Content-Type': MIMES[ext] });
        res.write(file, encoding);
        if (verbose) logServer(status, pathname);
        res.end();
    }

    function errorResponse(res, pathname, status) {
        res.writeHead(status);
        res.write(`${status}`);
        if (verbose) logServer(status, pathname);
        res.end();
    }

    return {
        listen: (port) => {
            internalPort = port || internalPort;
            log(`Server started: ${protocol}localhost:${internalPort}`);
            server.listen(internalPort);
        },

        close: (callback) => {
            log(`Server closed: ${protocol}localhost:${internalPort}`);
            server.close(callback);
        },

        reload: () => {
            if (!clients.length) return;
            const res = clients.pop();
            res.write('event: message\ndata: reload\n\n\n');
            res.end();
        }
    };
};

function log(message, error = false) {
    console.log(`\x1b[1${ error ? ';31' : '' }m[servbot] ${error ? 'ERROR: ' : ''}${message}\x1b[0m`);
}

function logServer(status, pathname) {
    const color = status >= 400 ? '31' : '32';
    console.log(`-> \x1b[1;${color}m${status}\x1b[0m - ${pathname}`);
}

function getMimes(){return{ez:"application/andrew-inset",aw:"application/applixware",atom:"application/atom+xml",atomcat:"application/atomcat+xml",atomdeleted:"application/atomdeleted+xml",atomsvc:"application/atomsvc+xml",dwd:"application/atsc-dwd+xml",held:"application/atsc-held+xml",rsat:"application/atsc-rsat+xml",bdoc:"application/bdoc",xcs:"application/calendar+xml",ccxml:"application/ccxml+xml",cdfx:"application/cdfx+xml",cdmia:"application/cdmi-capability",cdmic:"application/cdmi-container",cdmid:"application/cdmi-domain",cdmio:"application/cdmi-object",cdmiq:"application/cdmi-queue",cu:"application/cu-seeme",mpd:"application/dash+xml",davmount:"application/davmount+xml",dbk:"application/docbook+xml",dssc:"application/dssc+der",xdssc:"application/dssc+xml",es:"application/ecmascript",ecma:"application/ecmascript",emma:"application/emma+xml",emotionml:"application/emotionml+xml",epub:"application/epub+zip",exi:"application/exi",fdt:"application/fdt+xml",pfr:"application/font-tdpfr",geojson:"application/geo+json",gml:"application/gml+xml",gpx:"application/gpx+xml",gxf:"application/gxf",gz:"application/gzip",hjson:"application/hjson",stk:"application/hyperstudio",ink:"application/inkml+xml",inkml:"application/inkml+xml",ipfix:"application/ipfix",its:"application/its+xml",jar:"application/java-archive",war:"application/java-archive",ear:"application/java-archive",ser:"application/java-serialized-object",class:"application/java-vm",js:"application/javascript",mjs:"application/javascript",json:"application/json",map:"application/json",json5:"application/json5",jsonml:"application/jsonml+json",jsonld:"application/ld+json",lgr:"application/lgr+xml",lostxml:"application/lost+xml",hqx:"application/mac-binhex40",cpt:"application/mac-compactpro",mads:"application/mads+xml",webmanifest:"application/manifest+json",mrc:"application/marc",mrcx:"application/marcxml+xml",ma:"application/mathematica",nb:"application/mathematica",mb:"application/mathematica",mathml:"application/mathml+xml",mbox:"application/mbox",mscml:"application/mediaservercontrol+xml",metalink:"application/metalink+xml",meta4:"application/metalink4+xml",mets:"application/mets+xml",maei:"application/mmt-aei+xml",musd:"application/mmt-usd+xml",mods:"application/mods+xml",m21:"application/mp21",mp21:"application/mp21",mp4s:"application/mp4",m4p:"application/mp4",doc:"application/msword",dot:"application/msword",mxf:"application/mxf",nq:"application/n-quads",nt:"application/n-triples",cjs:"application/node",bin:"application/octet-stream",dms:"application/octet-stream",lrf:"application/octet-stream",mar:"application/octet-stream",so:"application/octet-stream",dist:"application/octet-stream",distz:"application/octet-stream",pkg:"application/octet-stream",bpk:"application/octet-stream",dump:"application/octet-stream",elc:"application/octet-stream",deploy:"application/octet-stream",exe:"application/octet-stream",dll:"application/octet-stream",deb:"application/octet-stream",dmg:"application/octet-stream",iso:"application/octet-stream",img:"application/octet-stream",msi:"application/octet-stream",msp:"application/octet-stream",msm:"application/octet-stream",buffer:"application/octet-stream",oda:"application/oda",opf:"application/oebps-package+xml",ogx:"application/ogg",omdoc:"application/omdoc+xml",onetoc:"application/onenote",onetoc2:"application/onenote",onetmp:"application/onenote",onepkg:"application/onenote",oxps:"application/oxps",relo:"application/p2p-overlay+xml",xer:"application/patch-ops-error+xml",pdf:"application/pdf",pgp:"application/pgp-encrypted",asc:"application/pgp-signature",sig:"application/pgp-signature",prf:"application/pics-rules",p10:"application/pkcs10",p7m:"application/pkcs7-mime",p7c:"application/pkcs7-mime",p7s:"application/pkcs7-signature",p8:"application/pkcs8",ac:"application/pkix-attr-cert",cer:"application/pkix-cert",crl:"application/pkix-crl",pkipath:"application/pkix-pkipath",pki:"application/pkixcmp",pls:"application/pls+xml",ai:"application/postscript",eps:"application/postscript",ps:"application/postscript",provx:"application/provenance+xml",cww:"application/prs.cww",pskcxml:"application/pskc+xml",raml:"application/raml+yaml",rdf:"application/rdf+xml",owl:"application/rdf+xml",rif:"application/reginfo+xml",rnc:"application/relax-ng-compact-syntax",rl:"application/resource-lists+xml",rld:"application/resource-lists-diff+xml",rs:"application/rls-services+xml",rapd:"application/route-apd+xml",sls:"application/route-s-tsid+xml",rusd:"application/route-usd+xml",gbr:"application/rpki-ghostbusters",mft:"application/rpki-manifest",roa:"application/rpki-roa",rsd:"application/rsd+xml",rss:"application/rss+xml",rtf:"application/rtf",sbml:"application/sbml+xml",scq:"application/scvp-cv-request",scs:"application/scvp-cv-response",spq:"application/scvp-vp-request",spp:"application/scvp-vp-response",sdp:"application/sdp",senmlx:"application/senml+xml",sensmlx:"application/sensml+xml",setpay:"application/set-payment-initiation",setreg:"application/set-registration-initiation",shf:"application/shf+xml",siv:"application/sieve",sieve:"application/sieve",smi:"application/smil+xml",smil:"application/smil+xml",rq:"application/sparql-query",srx:"application/sparql-results+xml",gram:"application/srgs",grxml:"application/srgs+xml",sru:"application/sru+xml",ssdl:"application/ssdl+xml",ssml:"application/ssml+xml",swidtag:"application/swid+xml",tei:"application/tei+xml",teicorpus:"application/tei+xml",tfi:"application/thraud+xml",tsd:"application/timestamped-data",toml:"application/toml",trig:"application/trig",ttml:"application/ttml+xml",ubj:"application/ubjson",rsheet:"application/urc-ressheet+xml",td:"application/urc-targetdesc+xml",vxml:"application/voicexml+xml",wasm:"application/wasm",wgt:"application/widget",hlp:"application/winhlp",wsdl:"application/wsdl+xml",wspolicy:"application/wspolicy+xml",xaml:"application/xaml+xml",xav:"application/xcap-att+xml",xca:"application/xcap-caps+xml",xdf:"application/xcap-diff+xml",xel:"application/xcap-el+xml",xns:"application/xcap-ns+xml",xenc:"application/xenc+xml",xhtml:"application/xhtml+xml",xht:"application/xhtml+xml",xlf:"application/xliff+xml",xml:"application/xml",xsl:"application/xml",xsd:"application/xml",rng:"application/xml",dtd:"application/xml-dtd",xop:"application/xop+xml",xpl:"application/xproc+xml",xslt:"application/xml",xspf:"application/xspf+xml",mxml:"application/xv+xml",xhvml:"application/xv+xml",xvml:"application/xv+xml",xvm:"application/xv+xml",yang:"application/yang",yin:"application/yin+xml",zip:"application/zip","3gpp":"video/3gpp",adp:"audio/adpcm",amr:"audio/amr",au:"audio/basic",snd:"audio/basic",mid:"audio/midi",midi:"audio/midi",kar:"audio/midi",rmi:"audio/midi",mxmf:"audio/mobile-xmf",mp3:"audio/mpeg",m4a:"audio/mp4",mp4a:"audio/mp4",mpga:"audio/mpeg",mp2:"audio/mpeg",mp2a:"audio/mpeg",m2a:"audio/mpeg",m3a:"audio/mpeg",oga:"audio/ogg",ogg:"audio/ogg",spx:"audio/ogg",opus:"audio/ogg",s3m:"audio/s3m",sil:"audio/silk",wav:"audio/wav",weba:"audio/webm",xm:"audio/xm",ttc:"font/collection",otf:"font/otf",ttf:"font/ttf",woff:"font/woff",woff2:"font/woff2",exr:"image/aces",apng:"image/apng",avif:"image/avif",bmp:"image/bmp",cgm:"image/cgm",drle:"image/dicom-rle",emf:"image/emf",fits:"image/fits",g3:"image/g3fax",gif:"image/gif",heic:"image/heic",heics:"image/heic-sequence",heif:"image/heif",heifs:"image/heif-sequence",hej2:"image/hej2k",hsj2:"image/hsj2",ief:"image/ief",jls:"image/jls",jp2:"image/jp2",jpg2:"image/jp2",jpeg:"image/jpeg",jpg:"image/jpeg",jpe:"image/jpeg",jph:"image/jph",jhc:"image/jphc",jpm:"image/jpm",jpx:"image/jpx",jpf:"image/jpx",jxr:"image/jxr",jxra:"image/jxra",jxrs:"image/jxrs",jxs:"image/jxs",jxsc:"image/jxsc",jxsi:"image/jxsi",jxss:"image/jxss",ktx:"image/ktx",ktx2:"image/ktx2",png:"image/png",btif:"image/prs.btif",pti:"image/prs.pti",sgi:"image/sgi",svg:"image/svg+xml",svgz:"image/svg+xml",t38:"image/t38",tif:"image/tiff",tiff:"image/tiff",tfx:"image/tiff-fx",webp:"image/webp",wmf:"image/wmf","disposition-notification":"message/disposition-notification",u8msg:"message/global",u8dsn:"message/global-delivery-status",u8mdn:"message/global-disposition-notification",u8hdr:"message/global-headers",eml:"message/rfc822",mime:"message/rfc822","3mf":"model/3mf",gltf:"model/gltf+json",glb:"model/gltf-binary",igs:"model/iges",iges:"model/iges",msh:"model/mesh",mesh:"model/mesh",silo:"model/mesh",mtl:"model/mtl",obj:"model/obj",stpz:"model/step+zip",stpxz:"model/step-xml+zip",stl:"model/stl",wrl:"model/vrml",vrml:"model/vrml",x3db:"model/x3d+fastinfoset",x3dbz:"model/x3d+binary",x3dv:"model/x3d-vrml",x3dvz:"model/x3d+vrml",x3d:"model/x3d+xml",x3dz:"model/x3d+xml",appcache:"text/cache-manifest",manifest:"text/cache-manifest",ics:"text/calendar",ifb:"text/calendar",coffee:"text/coffeescript",litcoffee:"text/coffeescript",css:"text/css",csv:"text/csv",html:"text/html",htm:"text/html",shtml:"text/html",jade:"text/jade",jsx:"text/jsx",less:"text/less",markdown:"text/markdown",md:"text/markdown",mml:"text/mathml",mdx:"text/mdx",n3:"text/n3",txt:"text/plain",text:"text/plain",conf:"text/plain",def:"text/plain",list:"text/plain",log:"text/plain",in:"text/plain",ini:"text/plain",dsc:"text/prs.lines.tag",rtx:"text/richtext",sgml:"text/sgml",sgm:"text/sgml",shex:"text/shex",slim:"text/slim",slm:"text/slim",spdx:"text/spdx",stylus:"text/stylus",styl:"text/stylus",tsv:"text/tab-separated-values",t:"text/troff",tr:"text/troff",roff:"text/troff",man:"text/troff",me:"text/troff",ms:"text/troff",ttl:"text/turtle",uri:"text/uri-list",uris:"text/uri-list",urls:"text/uri-list",vcard:"text/vcard",vtt:"text/vtt",yaml:"text/yaml",yml:"text/yaml","3gp":"video/3gpp","3g2":"video/3gpp2",h261:"video/h261",h263:"video/h263",h264:"video/h264",m4s:"video/iso.segment",jpgv:"video/jpeg",jpgm:"image/jpm",mj2:"video/mj2",mjp2:"video/mj2",ts:"video/mp2t",mp4:"video/mp4",mp4v:"video/mp4",mpg4:"video/mp4",mpeg:"video/mpeg",mpg:"video/mpeg",mpe:"video/mpeg",m1v:"video/mpeg",m2v:"video/mpeg",ogv:"video/ogg",qt:"video/quicktime",mov:"video/quicktime",webm:"video/webm"}}
