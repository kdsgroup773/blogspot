var rssFeedUrl;
function manualLoad() {
    const select = document.getElementById('Choice');
    rssFeedUrl = select.value;
    getRssFeed();
}
function autoLoad() {
    var wlh = window.location.href;
    if (wlh.indexOf("#") > 0) {
        var ixo = wlh.indexOf("#");
        // Use slice to get everything after the # accurately
        var anchorId = wlh.slice(ixo + 1); 
        var element = document.getElementById(anchorId);
        if (element) {
            rssFeedUrl = element.value;
            getRssFeed();
        }
    }
}
function getRssFeed() {
    console.log("Attempting to get RSS feed from:", rssFeedUrl);
    const proxyList = [
        'https://script.google.com/macros/s/AKfycbwkJ1pJt2PNPGKVMO5s-IllRnhIg0bejIXbkXah3vuJnTJBaUFDb1Jb6CaXFhk_elGtCg/exec?url=',
        'https://corsproxy.io/?url=',
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/get?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-proxy.htmldriven.com/?url=',
        'https://cors.lol/?url=',
        'https://api.allorigins.io/get?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&url=',
        'https://b-cors-proxy.herokuapp.com/',
        'https://cors-anywhere.azm.workers.dev/'
    ];
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');
    loadingDiv.textContent = 'Loading RSS feed...';
    container.innerHTML = '';
    async function fetchWithRetry(url, options = {}, retries = 2, delay = 2000) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.status === 408 && retries > 0) {
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(url, options, retries - 1, delay);
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return response;
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay);
            }
            throw error;
        }
    }
    async function fetchWithProxyFallback(targetFeedUrl, proxies) {
        let lastError = new Error("Initialization failed"); 
        
        for (let i = 0; i < proxies.length; i++) {
            const proxyBaseUrl = proxies[i];
            let proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);

            if (proxyBaseUrl.includes('allorigins')) {
                proxiedUrl += `&_=${Date.now()}`;
            }
            console.log(`Trying Proxy ${i + 1}/${proxies.length}`);
            loadingDiv.textContent = `Trying source ${i + 1}/${proxies.length}...`;
            try {
                // Fetch with shorter timeout per proxy to keep UX fast
                const response = await fetchWithRetry(proxiedUrl, {}, 1, 1000);

                let xmlString;
                // Check if we need to extract from JSON (AllOrigins)
                if (proxyBaseUrl.includes('allorigins')) {
                    const json = await response.json();
                    xmlString = json.contents;
                } else {
                    xmlString = await response.text();
                }
                // Parse XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
                
                if (xmlDoc.querySelector("parsererror")) {
                    throw new Error("Invalid XML received");
                }
                const items = xmlDoc.querySelectorAll('item');
                if (items.length === 0) {
                    throw new Error("Empty feed");
                }
                return xmlDoc; 
            } catch (error) {
                lastError = error;
                console.warn(`Proxy ${i + 1} failed: ${error.message}`);
                // Immediate skip to next proxy
                continue; 
            }
        }
        throw lastError;
    }
    fetchWithProxyFallback(rssFeedUrl, proxyList)
        .then(xmlDoc => {
            loadingDiv.textContent = '';
            const items = xmlDoc.querySelectorAll('item');
            let htmlContent = '<h2>Latest News</h2><ul style="list-style: none; padding: 0;">';
            items.forEach(item => {
                const title = item.querySelector('title')?.textContent || 'No Title';
                const link = item.querySelector('link')?.textContent || '#';
                const description = item.querySelector('description')?.textContent || '';
                const pubDate = item.querySelector('pubDate')?.textContent;
                let imageUrl = '';
                const media = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content');
                if (media.length > 0) imageUrl = media[0].getAttribute('url');
                const cleanDescription = description.replace(/(<([^>]+)>)/gi, "").substring(0, 200) + '...';
                htmlContent += `
                    <li style="margin-bottom: 25px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0;"><a href="${link}" target="_blank" style="color:#0056b3; text-decoration:none;">${title}</a></h3>
                        ${imageUrl ? `<img src="${imageUrl}" style="max-width: 100%; border-radius: 8px; margin: 10px 0; display:block;">` : ''}
                        <p style="font-size: 0.85em; color: #777; margin-bottom:10px;">${pubDate ? new Date(pubDate).toLocaleString() : ''}</p>
                        <p style="font-size: 0.95em; line-height:1.5;">${cleanDescription}</p>
                    </li>`;
            });
            htmlContent += '</ul>';
            container.innerHTML = htmlContent;
        })
        .catch(error => {
            loadingDiv.textContent = '';
            container.innerHTML = `<p style="color: red; padding: 20px; border: 1px solid red;"><b>Error:</b> ${error.message}. Please try selecting a different source.</p>`;
        });
}


