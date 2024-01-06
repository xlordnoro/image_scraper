# This repo contains all the necessary files required to scrape cover, button, and donation images from posts using puppeteer (automation software).

# Link to [Hi10 repo](https://github.com/xlordnoro/xlordnoro.github.io)

December 18, 2023 - v1.0 + v1.1 - Added all the initial files for scraping posts on the site that follow my format. **Added the Zeust variants of the scripts later in the same day.**

December 24, 2023 - v1.2 + 1.2.1 - Add Image_scraper_J0my_version, Imager_scraper_all.js & mass_add_all.js to the repo which expands the functionality of the original versions by including every selector I could find in use by posts.

December 26, 2023 - v1.3 - Upgraded the Image_scraper_all.js to include more button image selectors for Playcool's posts. It also accounts for more than one cover image now by appending a number if the same coverImage class is detected within a given post. Mainly Playcool's posts have that vs mine or other staff members.

January 06, 2024 - v1.4 - Upgraded the Image_scraper_all.js to include more cover and donation image selectors from older posts on the site. Modified how the script determines whether it needs to index cover images or not since v1.3 can run into issues with older posts even if the correct classes are present in the post.