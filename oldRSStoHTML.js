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
         console.log("ixo ",ixo);
     selectedIndex = wlh.substr(ixo+1, 25);
     rssFeedUrl = document.getElementBy5Id(selectedIndex).value;
     getRssFeed();
     }
   }
function getRssFeed() {
    console.log("Attempting to get RSS feed from:", rssFeedUrl);
    // --- List of CORS Proxies to Try ---
    // You can add or remove proxies from this list.
    // Ensure they are designed to add the Access-Control-Allow-Origin header.
    // Use encodeURIComponent for the target URL when appending to these proxies.
    const proxyList = [
        'https://api.allorigins.win?url=', // Your current proxy
        'https://corsproxy.io/?url=',       // Alternative 1
        'https://api.codetabs.com/v1/proxy?quest=', // Alternative 2 (uses 'quest' parameter)
        // Add more public proxies here, or your own self-hosted proxy
        // 'https://your-own-proxy.com/proxy?url=',
    ];
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message'); // Assuming this element exists
    // Initial message
    loadingDiv.textContent = 'Loading RSS feed...';
    container.innerHTML = ''; // Clear previous content
    // --- New: fetchWithProxyFallback Function ---
    // This function tries each proxy in the list until one succeeds.
    // It *uses* your existing fetchWithRetry logic for each individual proxy attempt.
    async function fetchWithProxyFallback(targetFeedUrl, proxies) {
        let lastError = null;
        for (let i = 0; i < proxies.length; i++) {
            const proxyBaseUrl = proxies[i];
            let proxiedUrl;
            // Handle different parameter names for proxies (e.g., 'url' vs 'quest')
            if (proxyBaseUrl.includes('codetabs.com')) {
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            } else { // Default to 'url='
                proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
            }
            console.log(`Attempting with proxy ${i + 1}/${proxies.length}: ${proxyBaseUrl}`);
            loadingDiv.textContent = `Trying proxy ${i + 1}/${proxies.length}...`;
            console.log(loadingDiv.textContent);
            try {
                // Use your existing fetchWithRetry logic for the current proxy attempt
                const response = await fetchWithRetry(proxiedUrl);

                if (response.ok) {
                    console.log(`Successfully fetched using proxy: ${proxyBaseUrl}`);
                    return response; // Return the successful response
                } else {
                    // This else block might be redundant if fetchWithRetry throws, but good for clarity
                    lastError = new Error(`Proxy ${proxyBaseUrl} returned non-OK status: ${response.status} ${response.statusText}`);
                    console.warn(lastError.message);
                }
            } catch (error) {
                lastError = error;
                console.error(`Failed with proxy ${proxyBaseUrl}:`, error);
            }
        }
        console.log("out of loop");
        // If we reach here, all proxies failed
        throw new Error(`All proxy attempts failed to fetch the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    }
    // --- Your existing fetchWithRetry function, slightly adjusted ---
    // (Ensure this function is accessible in the scope, or moved outside getRssFeed if preferred)
    async function fetchWithRetry(url, options = {}, retries = 500, delay = 2000) { // Reduced retries/delay for faster proxy switching
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                // If response is not OK, we'll try to re-fetch if it's a transient error
                // The `response.status === 408` check specifically handles a 408 from the proxy itself.
                if (response.status === 408 && retries > 0) { // Proxy timeout
                    console.warn(`Proxy 408 timeout for ${url}, retrying in ${delay / 1000}s... (${retries} retries left)`);
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(url, options, retries - 1, delay * 2);
                }
                // For other non-OK statuses, we throw immediately, so the outer loop tries next proxy
                throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
            }
            return response;
        } catch (error) {
            // Only retry on network errors or if the error message suggests a network problem
            if (retries > 0 && (error instanceof TypeError || error.message.includes('Failed to fetch') || error.message.includes('Network request failed') || error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
                console.warn(`Fetch failed (network/timeout error for ${url}), retrying in ${delay / 1000}s... (${retries} retries left)`);
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 2); // Exponential backoff
            } else {
                throw error; // Re-throw if no more retries or it's a non-retriable error for this specific proxy
            }
        }
    }
    // --- Main Logic: Call the new fallback function ---
    fetchWithProxyFallback(rssFeedUrl, proxyList)
        .then(response => {
            // At this point, `response` is guaranteed to be `ok` from one of the proxies
            loadingDiv.textContent = ''; // Clear loading message
            return response.text();
        })
        .then(xmlString => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            const items = xmlDoc.querySelectorAll('item');
            let htmlContent = '<h2>Latest News</h2>';
            htmlContent += '<ul style="list-style: none; padding: 0;">';
            items.forEach(item => {
                const title = item.querySelector('title')?.textContent || 'No Title';
                const link = item.querySelector('link')?.textContent || '#';
                const description = item.querySelector('description')?.textContent || 'No Description';
                const pubDate = item.querySelector('pubDate')?.textContent;
                // --- Image Extraction Logic ---
                let imageUrl = '';
                // 1. Try to get image from <media:content>
                //    Note: querySelector for namespaced elements can be tricky.
                //    We'll use getElementsByTagNameNS for more robust handling.
                const mediaContent = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content');
                if (mediaContent.length > 0 && mediaContent[0].getAttribute('medium') === 'image') {
                    imageUrl = mediaContent[0].getAttribute('url');
                }
                // 2. If no image from media:content, try <enclosure>
                if (!imageUrl) {
                    const enclosure = item.querySelector('enclosure');
                    if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
                        imageUrl = enclosure.getAttribute('url');
                    }
                }
                // 3. If no image yet, try to parse from description (if it contains HTML)
                if (!imageUrl && description) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = description;
                    const imgTag = tempDiv.querySelector('img');
                    if (imgTag) {
                        imageUrl = imgTag.src;
                    }
                }
                // --- End Image Extraction Logic ---
                const cleanDescription = description.replace(/(<([^>]+)>)/gi, "").substring(0, 200) + '...';
                htmlContent += `<li style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">`;
                htmlContent += `<h3 style="margin: 0 0 5px 0;"><a href="${link}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: #0056b3;">${title}</a></h3>`;
                // Add image if found
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
            container.innerHTML = htmlContent;
        })
        .catch(error => {
            console.error('FINAL ERROR: Could not fetch or parse RSS feed after all proxy attempts:', error);
            loadingDiv.textContent = ''; // Clear loading message
            container.innerHTML = '<p style="color: red;">Failed to load RSS feed after multiple attempts. Please check your internet connection or try again later.</p>';
        });
}
