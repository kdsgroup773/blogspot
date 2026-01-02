var rssFeedUrl;

function manualLoad() {
    const select = document.getElementById('Choice');
    rssFeedUrl = select.value;
    getRssFeed();
}

function autoLoad() {
    var wlh = window.location.href;
    if (wlh.search("#") > 0) {
        var ixo = wlh.indexOf("#");
        console.log("ixo ", ixo);
        selectedIndex = wlh.substr(ixo + 1, 25);
        rssFeedUrl = document.getElementById(selectedIndex).value;
        getRssFeed();
    }
}

function getRssFeed() {
    console.log("Attempting to get RSS feed from:", rssFeedUrl);

    const proxyList = [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://cors.lol/?url=',
        'https://cors.x2u.in/?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-proxy.htmldriven.com/?url=',
    ];

    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    loadingDiv.textContent = 'Loading RSS feed...';
    container.innerHTML = ''; // Clear previous content
//-----------------------------------------------------------------------
    // --- fetchWithRetry function (No changes needed here) ---
async function fetchWithRetry(url, options = {}, retries = 4, delay = 6000) {
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
        let lastError = null;
        for (let i = 0; i < proxies.length; i++) {
            const proxyBaseUrl = proxies[i];
            
            // CORSProxy.io and most others need the URL encoded
            let proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            
            // Special handling for AllOrigins which returns a JSON wrapper
            if (proxyBaseUrl.includes('allorigins')) {
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl) + `&_=${Date.now()}`;
            }

            try {
                const response = await fetchWithRetry(proxiedUrl);
                let xmlString;

                if (proxyBaseUrl.includes('allorigins')) {
                    const json = await response.json();
                    xmlString = json.contents;
                } else {
                    xmlString = await response.text();
                }

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
                
                if (xmlDoc.querySelector("parsererror")) throw new Error("XML Parse Error");
                
                const items = xmlDoc.querySelectorAll('item');
                if (items.length === 0) throw new Error("No items found");

                return xmlDoc; 
            } catch (error) {
                lastError = error;
                console.warn(`Proxy ${i+1} failed, trying next...`);
            }
        }
        throw new Error(`All proxies failed. Last error: ${lastError.message}`);
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

                // Image logic
                let imageUrl = '';
                const media = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content');
                if (media.length > 0) imageUrl = media[0].getAttribute('url');
                
                const cleanDescription = description.replace(/(<([^>]+)>)/gi, "").substring(0, 200) + '...';

                htmlContent += `
                    <li style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
                        <h3 style="margin: 0 0 5px 0;"><a href="${link}" target="_blank">${title}</a></h3>
                        ${imageUrl ? `<img src="${imageUrl}" style="max-width: 100%; border-radius: 5px; margin: 10px 0;">` : ''}
                        <p style="font-size: 0.8em; color: #666;">${pubDate ? new Date(pubDate).toLocaleDateString() : ''}</p>
                        <p style="font-size: 0.9em;">${cleanDescription}</p>
                    </li>`;
            });

            htmlContent += '</ul>';
            container.innerHTML = htmlContent;
        })
        .catch(error => {
            container.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        });
}

