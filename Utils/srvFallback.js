const https = require('https');
const dns = require('dns');

/**
 * Turns a `mongodb+srv://` URI into a direct `mongodb://` one when the local
 * resolver cannot do SRV lookups.
 *
 * `mongodb+srv://` needs two DNS record types that a plain A-record lookup
 * cannot provide: SRV for the shard hostnames, and TXT for the replica-set
 * name. Some sandboxed and corporate networks allow ordinary name resolution
 * and HTTPS while refusing those queries outright — the driver then fails with
 * `querySrv ECONNREFUSED` and there is no way round it from inside the driver.
 *
 * Since HTTPS still works in exactly those environments, the same records can
 * be fetched over DNS-over-HTTPS and assembled into the direct connection
 * string the driver would have built itself.
 *
 * Only used as a FALLBACK. Where SRV works — which is everywhere normal — the
 * original URI is returned untouched, because the driver re-resolves SRV
 * periodically to discover topology changes and a pinned host list does not.
 */

function doh(name, type) {
    return new Promise((resolve, reject) => {
        const url =
            `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
        https
            .get(url, { timeout: 15000 }, (res) => {
                let body = '';
                res.on('data', (d) => (body += d));
                res.on('end', () => {
                    try {
                        const j = JSON.parse(body);
                        resolve((j.Answer || []).map((a) => a.data));
                    } catch (err) {
                        reject(new Error(`DoH parse failed for ${name}: ${err.message}`));
                    }
                });
            })
            .on('error', reject)
            .on('timeout', function () {
                this.destroy();
                reject(new Error('DoH timed out'));
            });
    });
}

/** True when this resolver can do SRV at all. */
async function srvWorks(host) {
    return new Promise((resolve) => {
        dns.resolveSrv(`_mongodb._tcp.${host}`, (err) => resolve(!err));
    });
}

/**
 * @param {string} uri  a mongodb+srv:// or mongodb:// connection string
 * @returns {Promise<{uri: string, viaFallback: boolean}>}
 */
async function resolveMongoUri(uri) {
    if (!uri || !uri.startsWith('mongodb+srv://')) {
        return { uri, viaFallback: false };
    }

    const u = new URL(uri);
    const host = u.hostname;

    if (await srvWorks(host)) return { uri, viaFallback: false };

    const [srv, txt] = await Promise.all([
        doh(`_mongodb._tcp.${host}`, 'SRV'),
        doh(host, 'TXT'),
    ]);

    if (!srv.length) {
        throw new Error(
            `SRV lookup is blocked locally and DNS-over-HTTPS returned no records for ${host}`
        );
    }

    // "0 0 27017 shard-00-00.example.mongodb.net." -> host:port
    const hosts = srv
        .map((r) => {
            const parts = r.trim().split(/\s+/);
            const port = parts[2];
            const target = parts[3].replace(/\.$/, '');
            return `${target}:${port}`;
        })
        .sort();

    // TXT carries the driver options, e.g. authSource=admin&replicaSet=...
    const txtOpts = txt
        .map((t) => t.replace(/^"|"$/g, '').replace(/\\u0026/g, '&'))
        .join('&');

    const params = new URLSearchParams(txtOpts);
    // srv implies TLS; the direct form has to say so explicitly.
    params.set('ssl', 'true');
    for (const [k, v] of u.searchParams) params.set(k, v);

    const auth = u.username
        ? `${u.username}${u.password ? ':' + u.password : ''}@`
        : '';
    const db = u.pathname && u.pathname !== '/' ? u.pathname : '';

    return {
        uri: `mongodb://${auth}${hosts.join(',')}${db}?${params.toString()}`,
        viaFallback: true,
        hosts,
    };
}

module.exports = { resolveMongoUri };
