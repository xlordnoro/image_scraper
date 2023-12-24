const puppeteer = require('puppeteer');
const constants = require('./constants');
const fs = require('fs');
const path = require('path');

async function scrapeImages() {
  const browser = await puppeteer.launch({ headless: true }); // Set to true for headless mode
  const page = await browser.newPage();

  // Navigate to the login page
  await page.goto('https://hi10anime.com/wp-login.php', { waitUntil: 'domcontentloaded' });

  console.log('Logging in...');
  // Log in with your credentials
  await page.type('#user_login', constants.username);
  await page.type('#user_pass', constants.password);
  await page.click('#wp-submit');

  console.log('Waiting for login to complete...');
  // Wait for login to complete
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

  // Give the page some time to load after login (adjust the delay as needed)
  await page.waitForTimeout(5000);

  // Start from the first page
  let currentPage = 1;
  let hasNextPage = true;

  // Create an error log file
  const errorLogPath = path.join(__dirname, 'error_log.txt');
  const errorLogStream = fs.createWriteStream(errorLogPath, { flags: 'a' });

  while (hasNextPage) {
    // Navigate to the specified URL containing your posts
    console.log(`Navigating to posts page - Page ${currentPage}...`);
    await page.goto(`https://hi10anime.com/archives/author/j0my/page/${currentPage}`, { waitUntil: 'domcontentloaded' });

    // Wait for the page to load
    console.log('Waiting for posts page to load...');
    await page.waitForSelector('h1.entry-title a');

    // Extract post links using page.evaluate
    console.log('Extracting post links...');
    const postLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('h1.entry-title a').forEach(link => links.push(link.href));
      return links;
    });

    for (const postLink of postLinks) {
      try {
        console.log(`Processing post: ${postLink}`);
        await processPost(browser, postLink, errorLogStream);
      } catch (error) {
        // Log errors related to post processing
        const errorMessage = `Error processing post ${postLink}: ${error.message}\n`;
        console.error(errorMessage);
        errorLogStream.write(errorMessage);
      }
    }

    // Check for the presence of the next page link
    hasNextPage = await page.evaluate(() => {
      const nextLink = document.querySelector('.next.page-numbers');
      return !!nextLink;
    });

    // Move to the next page
    if (hasNextPage) {
      currentPage++;
    }
  }

  // Close the error log stream
  errorLogStream.end();

  // Close the browser
  await browser.close();
  console.log('Scraping completed.');
}

async function processPost(browser, postLink, errorLogStream) {
  // Open a new tab for each post
  const postPage = await browser.newPage();
  await postPage.goto(postLink, { waitUntil: 'domcontentloaded' });

  // Wait for the post page to load
  console.log('Waiting for post page to load...');
  const coverImageSelector = 'p.image img';
  const altCoverImageSelector = 'img.aligncenter';

  // Extract and download cover image
  console.log('Extracting and downloading cover image...');
  const coverImageSrc = await extractImageSource(postPage, coverImageSelector) || await extractImageSource(postPage, altCoverImageSelector);
  if (coverImageSrc) {
    await downloadImageHelper(coverImageSrc, 'cover_images', postPage.url(), 'cover.jpg');
  } else {
    console.error('No cover image found for:', postLink);
  }

  // Extract and download donation images
  console.log('Extracting and downloading donation images...');
  const donationImageSelector = 'p.donation img';
  const altDonationImageSelector = 'a.donateImage img';
  await downloadImages(postPage, donationImageSelector, 'donation_images');
  await downloadImages(postPage, altDonationImageSelector, 'donation_images');

  // Close the tab for the current post
  await postPage.close();
}

async function extractImageSource(page, selector) {
  return await page.$eval(selector, img => img.src).catch(() => null);
}

async function downloadImages(page, selector, folder) {
  const images = await page.$$eval(selector, imgs => imgs.map(img => ({ src: img.src })));
  for (const image of images) {
    await downloadImageHelper(image.src, folder, page.url(), 'donation.jpg');
  }
}

async function downloadImageHelper(src, folder, postLink, fileName) {
  const response = await fetch(src);
  const buffer = Buffer.from(await response.arrayBuffer());
  const postTitleMatch = postLink.match(/\/([^/]+)\/?$/); // Extract post title from the post link
  if (!postTitleMatch) {
    // Skip the post if title extraction fails
    console.warn(`Skipping post ${postLink}: Unable to extract post title`);
    return;
  }
  const postTitle = postTitleMatch[1];
  const postDir = path.join(folder, postTitle);

  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }

  await fs.promises.writeFile(path.join(postDir, fileName), buffer);
}

scrapeImages();