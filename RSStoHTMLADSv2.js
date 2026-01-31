// Define proxyList globally, as it's a constant list 
const proxyList = [
        'https://script.google.com/macros/s/AKfycbwkJ1pJt2PNPGKVMO5s-IllRnhIg0bejIXbkXah3vuJnTJBaUFDb1Jb6CaXFhk_elGtCg/exec?url=',
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/get?url=',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-proxy.htmldriven.com/?url=',
        'https://cors.lol/?url=',
        'https://api.allorigins.io/get?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&url=',
        'https://b-cors-proxy.herokuapp.com/',
        'https://yacdn.org/proxy/',
        'https://cors-anywhere.azm.workers.dev/'
];
// --- fetchWithRetry function (moved to global scope) ---
async function fetchWithRetry(url, options = {}, retries = 2, delay = 2000) {
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
    // FIX: If sourceText is empty/whitespace, use the ID or a placeholder
    let displayName = (sourceText && sourceText.trim().length > 0) ? sourceText.trim() : `Source ${optionId.split('#').pop() || 'Unknown'}`;
    
    console.log(`fetchAndDisplayFeed called for: ${displayName}, with optionId: "${optionId}"`);
    
    try {
        const xmlDoc = await fetchWithProxyFallback(feedUrl, proxyList);
        
        if (isSingleFeed) {
            const msgElement = document.getElementById('rss-feed-message');
            if (msgElement) msgElement.style.display = 'none';
            displayContainer.innerHTML = '';
        }

        const items = xmlDoc.querySelectorAll('item');
        // Use the cleaned displayName in the header
        let sectionHtml = `<div class="feed-section"><h3>${displayName}</h3><ul style="list-style: none; padding: 0;">`;

        items.forEach(item => {
            let title = item.querySelector('title')?.textContent || 'No Title';
            const pubDateStr = item.querySelector('pubDate')?.textContent;
            const link = item.querySelector('link')?.textContent || '#';
            let maxLen = 65; 

            if (title.includes(":")) {
                title = title.substring(title.indexOf(":") + 1).trim();
            }

            if (title.length > maxLen) {
                title = title.substring(0, maxLen) + "...";
            }

            let dateStr = "";
            if (pubDateStr) {
                const dateObj = new Date(pubDateStr);
                dateStr = isNaN(dateObj.getTime()) ? new Date().toLocaleDateString() : dateObj.toLocaleDateString();
            } else {
                dateStr = new Date().toLocaleDateString();
            }

            sectionHtml += `<li style="margin-bottom: 5px;">
                <span style="color: #666; font-size: 0.85em;">${dateStr}</span> 
                <strong>${displayName}</strong>: 
                <a href="${link}" target="_blank" style="text-decoration: none; color: #0066cc;">${title}</a>`;
            
            if (optionId) {
                sectionHtml += ` <span style="font-size: 0.75em; color: #999;">(${optionId.split('#').pop()})</span>`;
            }
            sectionHtml += `</li>`;
        });

        sectionHtml += '</ul></div>';
        displayContainer.innerHTML += sectionHtml;

    } catch (error) {
        console.error(`Error loading feed for ${displayName}:`, error);
        const errorSummary = error.message.includes("XML Parsing") ? "Format Error" : "Connection Failed";
        
        displayContainer.innerHTML += `
            <div style="border-left: 3px solid orange; padding: 5px 10px; margin: 10px 0; background: #fff4e5;">
                <strong style="color: #d97706;">! ${displayName}</strong>: ${errorSummary}
                <br><small style="color: #666;">ID: ${optionId}</small>
            </div>`;
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
// --- MODIFIED: autoLoadAllFeeds function to change favicon ---
async function autoLoadAllFeeds() {
    const selectElement = document.getElementById('Choice');
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');

    loadingDiv.textContent = 'Preparing to load feeds sequentially...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';

    let allSucceeded = true;
    const totalFeeds = selectElement.options.length - 1;

    // We use a standard for-loop to ensure we can AWAIT each call
    for (let i = 1; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        const feedUrl = option.value;
        const sourceText = option.textContent;
        const fullOptionId = option.id;

        // Update the message so you can see it working one-by-one
        loadingDiv.textContent = `Loading (${i}/${totalFeeds}): ${sourceText}...`;
        loadingDiv.style.color = 'blue';

        try {
            // Execution STOPS here until this specific feed is finished
            await fetchAndDisplayFeed(feedUrl, sourceText, container, false, fullOptionId);
            console.log(`Successfully loaded: ${sourceText}`);
        } catch (error) {
            allSucceeded = false;
            console.error(`Failed to load ${sourceText}:`, error);
            // Even if one fails, the loop will continue to the next one
        }
        
        // OPTIONAL: Add a tiny "breather" delay (500ms) to help your CPU/Chrome tabs
        await new Promise(res => setTimeout(res, 500));
    }

    // --- Final Status Logic ---
    if (allSucceeded) {
        loadingDiv.textContent = 'All feeds loaded successfully! ✓';
        loadingDiv.style.color = 'green';
        changeFavicon('success');
    } else {
        loadingDiv.textContent = 'Processing complete. Some feeds failed to load.';
        loadingDiv.style.color = 'orange';
    }

    setTimeout(() => {
        loadingDiv.textContent = 'All feeds have been processed.';
        setTimeout(() => {
            loadingDiv.style.display = 'none';
            loadingDiv.style.color = '';
        }, 1500);
    }, 2500);

    if (container.innerHTML === '') {
        container.innerHTML = '<p>No feeds could be loaded or displayed.</p>';
    }
}
// --- MODIFIED: autoLoad function ---
function autoLoad() {
    var wlh = window.location.href;
    if (wlh.search("#") > 0) {
        var ixo = wlh.indexOf("#");
        var selectedHashId = wlh.substring(ixo + 1);

        console.log("autoLoad: Hash detected:", selectedHashId);

        const selectElement = document.getElementById('Choice');
        let optionElement = null;

        for (let i = 1; i < selectElement.options.length; i++) {
            const option = selectElement.options[i];
            const extractedIdFromOption = extractOptionNumberId(option.id);
            if (extractedIdFromOption === selectedHashId) {
                optionElement = option;
                break;
            }
        }
        if (optionElement && optionElement.tagName === 'OPTION') {
            const fullOptionIdToDisplay = optionElement.id;
            console.log(`autoLoad (hash): Found option element for hash "${selectedHashId}", Full ID to display: "${fullOptionIdToDisplay}"`);

            selectElement.value = optionElement.value;
            const selectedOptionText = optionElement.textContent;

            const container = document.getElementById('rss-feed-container');
            const loadingDiv = document.getElementById('rss-feed-message');
            loadingDiv.textContent = `Loading feed for ${selectedOptionText}...`;
            loadingDiv.style.display = 'block';
            container.innerHTML = '';
            fetchAndDisplayFeed(optionElement.value, selectedOptionText, container, true, fullOptionIdToDisplay);
        } else {
            console.warn("AutoLoad: Could not find option element for hash:", selectedHashId);
            autoLoadAllFeeds();
        }
    } else {
        console.log("AutoLoad: No hash in URL, loading all feeds concurrently.");
        autoLoadAllFeeds();
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
let isAutoLoadActive = false;
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM is fully loaded and parsed');
    autoLoad();
});
