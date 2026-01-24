// Define proxyList globally, as it's a constant list
const proxyList = [
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
// --- fetchWithRetry function (moved to global scope) ---
async function fetchWithRetry(url, options = {}, retries = 4, delay = 6000) {
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
    // Declare fullOptionId here, outside of the try block
    let fullOptionId = ''; 
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
            let maxLen = 50; 
            // 1. Find the first colon and start the title AFTER it
            if (title.includes(":")) {
                // Slice starting from the index of the first colon + 1 (to skip the colon itself)
                title = title.substring(title.indexOf(":") + 1).trim();
            }
            // 2. Now apply your "Move Forward" trimming logic to the cleaned title
            if (title.length > maxLen) {
                // Find the first space starting from maxLen
                let nextSpace = title.indexOf(" ", maxLen);
                if (nextSpace !== -1) {
                    title = title.substring(0, nextSpace) + "...";
                } 
                else if (title.length > (maxLen + 20)) { 
                         title = title.substring(0, maxLen) + "...";
                }
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
            if (date) {
                sectionHtml += `${date.toLocaleDateString()} `;
            } else {
                // If no date is provided, use today's date
                const today = new Date();
                sectionHtml += `${today.toLocaleDateString()} `;
            }
            sectionHtml += `<strong>${sourceText}</strong>: `;
            sectionHtml += `${title}`;
            if (optionId) {
                // The issue is here: this is where fullOptionId is used.
                // However, it's only defined in autoLoad() or manualLoad().
                // You need to pass it into this function and make it accessible.
                sectionHtml += ` ${optionId}`;
            }
            sectionHtml += `</li>`;
        });
        sectionHtml += '</ul>';
        displayContainer.innerHTML += sectionHtml;
    } catch (error) {
        console.error(`Error loading feed for ${sourceText}:`, error);
        // The error here is that fullOptionId is not defined in this scope.
        // It's a local variable to the autoLoadAllFeeds or manualLoad function.
        // To fix this, you need to pass it as an argument to fetchAndDisplayFeed.
        const errorMessage = error.message.substring(0, 100);
        if (isSingleFeed) {
            document.getElementById('rss-feed-message').style.display = 'none';
            displayContainer.innerHTML = `<p style="color: red;">Failed to load '${sourceText}' feed from URL:<br> ${feedUrl}<br>Reason: ${error.message}</p>`;
        } else {
            // This part is for the autoLoadAllFeeds case
            // The original code tried to use a variable called fullOptionId here.
            // But it's not defined, causing the error.
            // You should use the 'optionId' variable that is passed into the function.
            displayContainer.innerHTML += `<p style="color: orange;">Could not load '${sourceText}' feed. Error: ${errorMessage}... URL: &lt;option id="${optionId}" value="${feedUrl}"&gt;&lt;/option&gt;</p>`;
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
// --- MODIFIED: autoLoadAllFeeds function to change favicon ---
async function autoLoadAllFeeds() {
    const selectElement = document.getElementById('Choice');
    const container = document.getElementById('rss-feed-container');
    const loadingDiv = document.getElementById('rss-feed-message');
    loadingDiv.textContent = 'Loading all RSS feeds concurrently...';
    loadingDiv.style.display = 'block';
    container.innerHTML = '';
    const feedPromises = [];
    const feedDetails = [];
    for (let i = 1; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        const feedUrl = option.value;
        const sourceText = option.textContent;
        const fullOptionId = option.id;
        feedPromises.push(
            fetchAndDisplayFeed(feedUrl, sourceText, container, false, fullOptionId)
        );
        feedDetails.push({ sourceText: sourceText, index: i });
    }
    console.log(`Starting to fetch ${feedPromises.length} feeds concurrently.`);
    const results = await Promise.allSettled(feedPromises);
    console.log('All feed promises have settled:', results);
    let allSucceeded = true;
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            allSucceeded = false;
            console.error(`Feed ${feedDetails[index].sourceText} failed:`, result.reason);
        } else {
            console.log(`Feed ${feedDetails[index].sourceText} succeeded.`);
        }
    });
    // --- NEW LOGIC STARTS HERE ---
    if (allSucceeded) {
        loadingDiv.textContent = 'All feeds loaded successfully! ✓';
        loadingDiv.style.color = 'green';
        changeFavicon('success'); // Call function to change favicon
    } else {
        loadingDiv.textContent = 'Some feeds could not be loaded. Please check the console for details.';
        loadingDiv.style.color = 'orange';
    }
    // Set a timeout to display the final "processed" message before hiding the div
    setTimeout(() => {
        // This is the message that displays when all feeds are completed
        loadingDiv.textContent = 'All feeds have been processed.';
        // Now hide the div after another short delay
        setTimeout(() => {
            loadingDiv.style.display = 'none';
            loadingDiv.style.color = '';
        }, 1500); // A brief pause to let the user see the final message
    }, 2500); // Display the success/failure message for 2.5 seconds first

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
