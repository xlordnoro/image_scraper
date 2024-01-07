const puppeteer = require('puppeteer');
const constants = require('./constants');

const wordpressURL = 'https://hi10anime.com/wp-login.php';
const authorURL = 'https://hi10anime.com/archives/author/zash'; // Replace with the actual author URL

async function processPost(page, postLink) {
  const newPage = await page.browser().newPage(); // Open a new tab
  await newPage.goto(postLink);
  console.log(`Navigated to post: ${postLink}`);

  const editLinkSelector = 'a.ab-item[href*="post.php?post="]';
  await newPage.waitForSelector(editLinkSelector);

  const editLink = await newPage.$(editLinkSelector);
  if (editLink) {
    await editLink.click();
    await newPage.waitForSelector('textarea#post-content-0.editor-post-text-editor', { visible: true, timeout: 5000 });

    const customCode = '<script type="text/javascript" src="https://xlordnoro.github.io/dynamic_loading_all.js"></script>';
    const textAreaSelector = 'textarea#post-content-0.editor-post-text-editor';

    const customCodeExists = await newPage.evaluate((selector, code) => {
      const textarea = document.querySelector(selector);
      return textarea && textarea.value.includes(code);
    }, textAreaSelector, customCode);

    if (customCodeExists) {
      console.log('Custom code is already present in the post. Skipping...');
    } else {
      const donateImageExists = await newPage.evaluate((selector) => {
        const textarea = document.querySelector(selector);
        return textarea && textarea.value.includes('<a class="donateImage">, <p class="donation">, <a class="pleaseImage">, <a class="postMakerADonate">');
      }, textAreaSelector);

      if (donateImageExists) {
        await newPage.evaluate((selector) => {
          const textarea = document.querySelector(selector);
          const currentContent = textarea.value;
          const indexOfDonateImage = currentContent.indexOf('<a class="donateImage">, <p class="donation">, <a class="pleaseImage">, <a class="postMakerADonate">');
          const updatedContent = currentContent.slice(0, indexOfDonateImage + 21) + '\n\n' + currentContent.slice(indexOfDonateImage + 21);
          textarea.value = updatedContent;
        }, textAreaSelector);
      }

      await newPage.focus(textAreaSelector);
      await newPage.evaluate((selector) => {
        const textarea = document.querySelector(selector);
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        }
      }, textAreaSelector);

      await newPage.keyboard.type('\n\n' + customCode);
      console.log('Custom code appended below <a class="donateImage"> in the post content.');

      await newPage.waitForSelector('button.editor-post-publish-button');
      await newPage.click('button.editor-post-publish-button');
      console.log('Saved changes.');

      await newPage.waitForTimeout(3000); // 3 seconds.
      console.log('Post updated successfully.');
    }
  } else {
    console.log('No "Edit" links found for the specified post.');
  }

  // Close the tab after processing
  await newPage.close();
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });

  // Login to WordPress using constants from the external file
  const page = await browser.newPage();
  await page.goto(wordpressURL);
  console.log('Logging in...');
  await page.type('#user_login', constants.username);
  await page.type('#user_pass', constants.password);
  await page.click('#wp-submit');
  await page.waitForNavigation();
  console.log('Logged in successfully.');

  // Go to the author's page
  await page.goto(authorURL);
  console.log(`Navigated to author's page: ${authorURL}`);

  let currentPage = 1; // Change this to the starting page number
  let hasNextPage = true;

  while (hasNextPage) {
    console.log(`Navigating to posts page - Page ${currentPage}...`);
    await page.goto(`${authorURL}/page/${currentPage}`, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for posts page to load...');
    await page.waitForSelector('h1.entry-title a');

    const postLinks = await page.$$eval('h1.entry-title a', (links) => links.map((link) => link.href));

    if (postLinks.length > 0) {
      for (const postLink of postLinks) {
        await processPost(page, postLink);
      }

      hasNextPage = await page.evaluate(() => {
        const nextLink = document.querySelector('.next.page-numbers');
        return !!nextLink;
      });

      if (hasNextPage) {
        // Directly navigate to the next page
        await page.goto(`${authorURL}/page/${++currentPage}`, { waitUntil: 'domcontentloaded' });
      }
    } else {
      console.log('No posts found for the specified author.');
      hasNextPage = false;
    }
  }

  // End the process
  await browser.close();
})();