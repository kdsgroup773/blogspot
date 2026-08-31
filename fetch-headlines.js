  <!-- SCRIPT TO DYNAMICALLY FETCH RANDOM HEADLINES -->
    function initPage(ip) {
      if (typeof autoLoad === 'function') {
        autoLoad();
      }
      fetchRandomTopStories(ip);
    }

    async function fetchRandomTopStories(top) {
      const container = document.getElementById('dynamic-top-stories');
      container.innerHTML = '<li><em>Loading random live stories...</em></li>';

      // Gather valid feeds from select dropdown
      const select = document.getElementById('Choice');
      const options = Array.from(select.options).filter(opt => !opt.disabled && opt.value);

      // Randomize array and pick top 5
      const shuffled = options.sort(() => 0.5 - Math.random());
      const selectedFeeds = shuffled.slice(0, top);

      const corsProxy = 'https://wispy-thunder-5150.the-kds-group.workers.dev/?url=';
      
      const fetchPromises = selectedFeeds.map(async (opt) => {
        try {
          const res = await fetch(corsProxy + encodeURIComponent(opt.value));
          const text = await res.text();
          const xml = new DOMParser().parseFromString(text, 'text/xml');
          
          let title = '';
          const item = xml.querySelector('item') || xml.querySelector('entry');
          if (item) {
            title = item.querySelector('title')?.textContent || '';
          }

          if (title) {
            return {
              feedTitle: opt.text,
              feedUrl: opt.value,
              storyTitle: title.trim()
            };
          }
        } catch (e) {
          // If proxy fails on a single feed, fail gracefully
        }
        return null;
      });

      const results = (await Promise.all(fetchPromises)).filter(Boolean);

      if (results.length === 0) {
        container.innerHTML = '<li>Unable to load live headlines right now. Select a feed below.</li>';
        return;
      }

      container.innerHTML = '';
      results.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <a href="javascript:void(0)" onclick="loadFeedFromHeadline('${item.feedUrl}')">
            ${item.storyTitle}
          </a>
          <span class="source-tag">(${item.feedTitle})</span>
        `;
        container.appendChild(li);
      });
    }

    function loadFeedFromHeadline(url) {
      const select = document.getElementById('Choice');
      select.value = url;
      if (typeof manualLoad === 'function') {
        manualLoad();
      }
    }
  </body>
