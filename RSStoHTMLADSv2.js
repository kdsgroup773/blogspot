// Define proxyList globally, as it's a constant list
const proxyList = [
    'https://api.allorigins.win?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/', // Note: this proxy often requires a click-through on its site
    'https://cors.lol/?url=',
    'https://cors.x2u.in/?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-proxy.htmldriven.com/?url=',
    'https://crossorigin.me/', // This one is often down or slow
    'https://yacdn.org/proxy/',
];

// --- fetchWithRetry function (moved to global scope) ---
async function fetchWithRetry(url, options = {}, retries = 4, delay = 7500) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 408 && retries > 0) {
                console.warn(`Proxy 408 timeout for ${url}, retrying in ${delay / 1000}s... (${retries} retries left)`);
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 2);
            }
            throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        }
        return response;
    } catch (error) {
        if (retries > 0 && (error instanceof TypeError || error.message.includes('Failed to fetch') || error.message.includes('Network request failed') || error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
            console.warn(`Fetch failed (network/timeout error for ${url}), retrying in ${delay / 1000}s... (${retries} retries left)`);
            document.getElementById('rss-feed-message').textContent = `Retrying in ${delay / 1000}s... (${retries} retries left)`;
            await new Promise(res => setTimeout(res, delay));
            return fetchWithRetry(url, options, retries - 1, delay);
        } else {
            throw error;
        }
    }
}

// --- fetchWithProxyFallback Function (No changes) ---
async function fetchWithProxyFallback(targetFeedUrl, proxies) {
    const loadingDiv = document.getElementById('rss-feed-message');
    let lastError = null;
    for (let i = 0; i < proxies.length; i++) {
        const proxyBaseUrl = proxies[i];
        let proxiedUrl;

        if (proxyBaseUrl.includes('codetabs.com')) {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        } else if (proxyBaseUrl.includes('crossorigin.me')) {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        } else if (proxyBaseUrl.includes('thingproxy.freeboard.io')) {
            proxiedUrl = proxyBaseUrl + targetFeedUrl;
        } else {
            proxiedUrl = proxyBaseUrl + encodeURIComponent(targetFeedUrl);
        }

        console.log(`Attempting with proxy ${i + 1}/${proxies.length}: ${proxyBaseUrl}`);
        try {
            const response = await fetchWithRetry(proxiedUrl);
            if (!response.ok) {
                lastError = new Error(`Proxy ${proxyBaseUrl} returned non-OK status: ${response.status} ${response.statusText}`);
                console.warn(lastError.message);
                continue;
            }

            const xmlString = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            const errorNode = xmlDoc.querySelector("parsererror");
            if (errorNode) {
                const errorText = errorNode.textContent;
                lastError = new Error(`XML Parsing Error from ${proxyBaseUrl}: ${errorText}`);
                console.error(lastError.message);
                continue;
            }

            const items = xmlDoc.querySelectorAll('item');
            if (items.length === 0) {
                lastError = new Error(`No RSS items found in feed using ${proxyBaseUrl}. Feed might be empty or structured differently.`);
                console.warn(lastError.message);
                continue;
            }

            console.log(`Successfully parsed feed with ${items.length} items using proxy: ${proxyBaseUrl}`);
            return xmlDoc;
        } catch (error) {
            lastError = error;
            console.error(`Failed with proxy ${proxyBaseUrl}:`, error);
        }
    }
    console.log("All proxy attempts failed.");
    throw new Error(`All proxy attempts failed to fetch the feed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
}


// --- fetchAndDisplayFeed function ---
async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    console.log(`fetchAndDisplayFeed called for: ${sourceText}, with optionId: "${optionId}"`);
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = '';
        }

        const items = xmlDoc.querySelectorAll('item');
        let sectionHtml = '';
        sectionHtml += `<h3>${sourceText}</h3>`;
        sectionHtml += '<ul style="list-style: none; padding: 0;">';

        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title';
            const pubDateStr = item.querySelector('pubDate')?.textContent;

            if (title.length > 50) {
                title = title.substring(0, 50);
            }

            let date = null;
            if (pubDateStr) {
                try {
                    date = new Date(pubDateStr);
                    if (isNaN(date.getTime())) {
                        console.warn("Invalid date string for new Date():", pubDateStr);
                        date = null;
                    }
                } catch (e) {
                    console.error("Error parsing date:", pubDateStr, e);
                    date = null;
                }
            }

            sectionHtml += `<li>`;
            sectionHtml += `<p>`;
            if (date) {
                sectionHtml += `${date.toLocaleDateString()} `;
            }
            sectionHtml += `<strong>${sourceText}</strong>: `;
            sectionHtml += `${title}`;

            if (optionId) {
                sectionHtml += ` ${optionId}`;
            }
            sectionHtml += `</p>`;
            sectionHtml += `</li>`;
        });

        sectionHtml += '</ul>';
        displayContainer.innerHTML += sectionHtml;

    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = `<p style="color: red;">Failed to load '${sourceText}' feed: ${error.message}</p>`;
        } else {
            displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}' feed. Error: ${error.message.substring(0, 100)}...</p>`;
        }
    }
}
// --- Helper function to extract the number from the option ID ---
function extractOptionNumberId(fullOptionId) {
    if (fullOptionId) {
        const parts = fullOptionId.split('#');
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
    }
    return '';
}


// --- MODIFIED: manualLoad function ---
function manualLoad() {
    const selectElement = document.getElementById('Choice');
    const rssFeedUrl = selectElement.value;
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const selectedOptionText = selectedOption.textContent;
    const fullOptionId = selectedOption.id;

    console.log(`manualLoad called. Selected URL: ${rssFeedUrl}, Full Option ID: "${fullOptionId}"`);

    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    if (selectElement.selectedIndex === 0) {
        container.innerHTML = '<p>Please select an interest to load the feed.</p>';
        loadingDiv.style.display = 'none';
        return;
    }

    loadingDiv.textContent = 'Loading RSS feed...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';
    
    fetchAndDisplayFeed(rssFeedUrl, selectedOptionText, container, true, fullOptionId);
}


async function fetchAndDisplayFeed(feedUrl, sourceText, displayContainer, isSingleFeed = false, optionId = '') {
    console.log(`fetchAndDisplayFeed called for: ${sourceText}, with optionId: "${optionId}"`);
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = '';
        }

        const items = xmlDoc.querySelectorAll('item');
        let sectionHtml = '';
        sectionHtml += `<h3>${sourceText}</h3>`;
        sectionHtml += '<ul style="list-style: none; padding: 0;">';

        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title';
            const pubDateStr = item.querySelector('pubDate')?.textContent;

            if (title.length > 50) {
                title = title.substring(0, 50);
            }

            let date = null;
            if (pubDateStr) {
                try {
                    date = new Date(pubDateStr);
                    if (isNaN(date.getTime())) {
                        console.warn("Invalid date string for new Date():", pubDateStr);
                        date = null;
                    }
                } catch (e) {
                    console.error("Error parsing date:", pubDateStr, e);
                    date = null;
                }
            }

            sectionHtml += `<li>`;
            sectionHtml += `<p>`;
            if (date) {
                sectionHtml += `${date.toLocaleDateString()} `;
            }
            sectionHtml += `<strong>${sourceText}</strong>: `;
            sectionHtml += `${title}`;

            if (optionId) {
                sectionHtml += ` ${optionId}`;
            }
            sectionHtml += `</p>`;
            sectionHtml += `</li>`;
        });

        sectionHtml += '</ul>';
        displayContainer.innerHTML += sectionHtml;

    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        // This is the key change to display the option.value (which is feedUrl)
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = `<p style="color: red;">Failed to load '${sourceText}' feed from URL:<br> ${feedUrl}<br>Reason: ${error.message}</p>`;
        } else {
            displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}' feed from URL: ${feedUrl}. Error: ${error.message.substring(0, 100)}...</p>`;
        }
    }
}
    if (allSucceeded) {
        loadingDiv.textContent = 'All feeds loaded successfully! ✓';
        loadingDiv.style.color = 'green';
        changeFavicon('success');
    } else {
        loadingDiv.textContent = 'Some feeds could not be loaded. Please check the console for details.';
        loadingDiv.style.color = 'orange';
    }

    setTimeout(() => {
        loadingDiv.style.display = 'none';
        loadingDiv.style.color = '';
    }, 3000);

    if (container.innerHTML === '') {
        container.innerHTML = '<p>No feeds could be loaded or displayed.</p>';
    }
}

// ** NEW CODE FOR FAVICON CHANGES **
function changeFavicon(status) {
    if (status === 'success') {
        const favicon = document.getElementById('favicon');
        if (favicon) {
            favicon.href = 'https://kdsgroup773.github.io/blogspot/success.jpeg'; // Path to your success favicon image
        }
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM is fully loaded and parsed');
    autoLoad();
});
