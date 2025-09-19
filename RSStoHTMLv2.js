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
        'https://api.allorigins.win?url=',
        'https://corsproxy.io/?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://cors.lol/?url=',
        'https://cors.x2u.in/?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-proxy.htmldriven.com/?url=',
        'https://crossorigin.me/',
        'https://yacdn.org/proxy/',
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
                    console.warn(`Proxy 408 timeout for ${url}, retrying in ${delay / 1000}s... (${retries} retries left)`);
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(url, options, retries - 1, delay);
                }
                throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
            }
            return response;
        } catch (error) {
            if (retries > 0 && (error instanceof TypeError || error.message.includes('Failed to fetch') || error.message.includes('Network request failed') || error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
                console.warn(`Fetch failed (network/timeout error for ${url}), retrying in ${delay / 1000}s... (${retries} retries left)`);
                loadingDiv.textContent = `Retrying in ${delay / 1000}s... (${retries} retries left)`;
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay);
            } else {
                throw error;
            }
        }
    }
//------------------------------------------------------
    // --- MODIFIED fetchWithProxyFallback Function ---
    // This function now handles fetching, reading, and basic XML validation.
    // It returns the parsed xmlDoc if successful, or throws to try the next proxy.
    async function fetchWithProxyFallback(targetFeedUrl, proxies) {
        let lastError = null;
        for (let i = 0; i < proxies.length; i++) {
            const proxyBaseUrl = proxies[i];
            let proxiedUrl;

            // Handle different parameter names and structures for proxies
            if (proxyBaseUrl.includes('codetabs.com')) {
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            } else if (proxyBaseUrl.includes('crossorigin.me')) {
                proxiedUrl = proxyBaseUrl + targetFeedUrl;
            } else if (proxyBaseUrl.includes('thingproxy.freeboard.io')) {
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            } else {
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            }

            console.log(`Attempting with proxy ${i + 1}/${proxies.length}: ${proxyBaseUrl}`);
            loadingDiv.textContent = `Trying proxy ${i + 1}/${proxies.length}...`;
            console.log(loadingDiv.textContent);

            try {
                const response = await fetchWithRetry(proxiedUrl);

                if (!response.ok) { // This handles non-OK HTTP responses from the proxy
                    lastError = new Error(`Proxy ${proxyBaseUrl} returned non-OK status: ${response.status} ${response.statusText}`);
                    console.warn(lastError.message);
                    continue; // Move to the next proxy
                }

                // Read the response body as text
                const xmlString = await response.text();
                console.log("Raw content received from proxy:", xmlString.substring(0, 500) + '...');

                // Try to parse the XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

                // Check for XML parsing errors
                const errorNode = xmlDoc.querySelector("parsererror");
                if (errorNode) {
                    const errorText = errorNode.textContent;
                    lastError = new Error(`XML Parsing Error from ${proxyBaseUrl}: ${errorText}`);
                    console.error(lastError.message);
                    continue; // This content is not valid XML, try next proxy
                }

                // Check if any RSS items were found
                const items = xmlDoc.querySelectorAll('item');
                if (items.length === 0) {
                    lastError = new Error(`No RSS items found in feed using ${proxyBaseUrl}. Feed might be empty or structured differently.`);
                    console.warn(lastError.message);
                    continue; // No valid items, try next proxy
                }

                console.log(`Successfully parsed feed with ${items.length} items using proxy: ${proxyBaseUrl}`);
                return xmlDoc; // Return the successfully parsed XML document
            } catch (error) {
                lastError = error;
                console.error(`Failed with proxy ${proxyBaseUrl}:`, error);
                // The `continue` statement is implicit here, as the loop moves to the next iteration
            }
        }
        // If the loop finishes, no proxy succeeded
        console.log("All proxy attempts failed.");
        throw new Error(`All proxy attempts failed to fetch or parse the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    }
//-----------------------------------------------------------
    // --- Main Logic: Call the fallback function ---
    fetchWithProxyFallback(rssFeedUrl, proxyList, 1, 1)
        .then(xmlDoc => { // Now receives the *parsed XML document*
            loadingDiv.textContent = ''; // Clear loading message

            const items = xmlDoc.querySelectorAll('item');
            let htmlContent = '<h2>Latest News</h2>';
            htmlContent += '<ul style="list-style: none; padding: 0;">';

            items.forEach(item => {
                const title = item.querySelector('title')?.textContent || 'No Title';
                const link = item.querySelector('link')?.textContent || '#';
                const description = item.querySelector('description')?.textContent || 'No Description';
                const pubDate = item.querySelector('pubDate')?.textContent;

                let imageUrl = '';
                const mediaContent = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content');
                if (mediaContent.length > 0 && mediaContent[0].getAttribute('medium') === 'image') {
                    imageUrl = mediaContent[0].getAttribute('url');
                }
                if (!imageUrl) {
                    const enclosure = item.querySelector('enclosure');
                    if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
                        imageUrl = enclosure.getAttribute('url');
                    }
                }
                if (!imageUrl && description) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = description;
                    const imgTag = tempDiv.querySelector('img');
                    if (imgTag) {
                        imageUrl = imgTag.src;
                    }
                }

                const cleanDescription = description.replace(/(<([^>]+)>)/gi, "").substring(0, 200) + '...';

                htmlContent += `<li style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">`;
                htmlContent += `<h3 style="margin: 0 0 5px 0;"><a href="${link}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: #0056b3;">${title}</a></h3>`;
                if (imageUrl) {
                    htmlContent += `<div style="margin-bottom: 10px;">`;
                    htmlContent += `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; height: auto; display: block; border-radius: 5px;">`;
                    htmlContent += `</div>`;
                }
                if (pubDate) {
                    const date = new Date(pubDate);
                    htmlContent += `<p style="font-size: 0.8em; color: #666; margin: 0 0 5px 0;">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</p>`;
                }
                htmlContent += `<p style="font-size: 0.9em; color: #333; margin: 0;">${cleanDescription}</p>`;
                htmlContent += `<a href="${link}" target="_blank" rel="noopener noreferrer" style="font-size: 0.9em; color: #007bff;">Read more</a>`;
                htmlContent += `</li>`;
            });

            htmlContent += '</ul>';
            htmlContent += '<p style="margin-top: 20px; font-weight: bold; color: green; text-align: center;">DONE PROCESSING!</p>';
            container.innerHTML = htmlContent;
        })
        .catch(error => {
            console.error('FINAL ERROR: Could not fetch or parse RSS feed after all proxy attempts:', error);
            loadingDiv.textContent = ''; // Clear loading message
            container.innerHTML = '<p style="color: red;">Failed to load RSS feed after multiple attempts. Please check your internet connection, verify the RSS feed URL, or try again later. See console for details.</p>';
        });
}
