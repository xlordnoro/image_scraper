const puppeteer = require('puppeteer');
const constants = require('./constants');
const fs = require('fs');
const path = require('path');

async function scrapeAllPosts() {
  const browser = await puppeteer.launch({ headless: true });
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
    await page.goto(`https://hi10anime.com/archives/author/kami-samacrosser/page/${currentPage}`, { waitUntil: 'domcontentloaded' });

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
        await processPost(browser, page, postLink, errorLogStream);
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

  // Close the browser
  await browser.close();
  console.log('Scraping completed.');
}

async function processPost(browser, page, postLink, errorLogStream) {
  const postPage = await browser.newPage();
  await postPage.goto(postLink, { waitUntil: 'domcontentloaded' });

  console.log('Waiting for post page to load...');

  const selectors = [
    { selector: 'a.coverImage img, a.coverImage1 img, img.aligncenter, p.image img', folder: 'cover_images', fileName: 'cover.jpg' },
    { selector: 'div.button_code img', folder: 'button_images', fileName: 'button.jpg' },
    { selector: 'a.donateImage img, p.donation img', folder: 'donation_images', fileName: 'donation.jpg' }
  ];

  for (const { selector, folder, fileName } of selectors) {
    const images = await postPage.$$eval(selector, imgs => imgs.map(img => ({ src: img.src, id: img.parentElement.id })));

    if (images.length > 0) {
      try {
        console.log(`Extracting and downloading images using selector: ${selector}`);
        for (const image of images) {
          const imageName = getButtonFileName(image.id) || fileName;
          await downloadImageHelper(page, image.src, folder, postPage.url(), imageName);
        }
      } catch (error) {
        const errorMessage = `Error processing images for post ${postLink}, selector: ${selector}: ${error.message}\n`;
        console.error(errorMessage);
        errorLogStream.write(errorMessage);
      }
    } else {
      console.warn(`No images found for post ${postLink}, selector: ${selector}`);
    }
  }

  // Handle spoilerContainer images separately
  await downloadSpoilerImages(page, postPage, 'button_images');

  await postPage.close();
}

async function downloadImage(page, postPage, selector, folder) {
  const coverImageSrc = await postPage.$eval(selector, img => img.src).catch(() => null);
  if (coverImageSrc) {
    await downloadImageHelper(page, coverImageSrc, folder, postPage.url(), 'cover.jpg');
  }
}

async function downloadImages(page, postPage, selector, folder) {
  const images = await postPage.$$eval(selector, imgs => imgs.map(img => ({ src: img.src, id: img.parentElement.id })));
  for (const image of images) {
    const fileName = getButtonFileName(image.id);
    await downloadImageHelper(page, image.src, folder, postPage.url(), fileName);
  }
}

async function downloadDonationImages(page, postPage, selector, folder) {
  const donationImages = await postPage.$$eval(selector, imgs => imgs.map(img => img.src));
  for (const donationImageSrc of donationImages) {
    const fileName = getDonationFileName();
    await downloadImageHelper(page, donationImageSrc, folder, postPage.url(), fileName);
  }
}

async function downloadSpoilerImages(page, postPage, folder) {
  const spoilerImages = await postPage.$$eval('.spoilerContainer img', imgs => imgs.map(img => ({ src: img.src, id: img.parentElement.id })));

  if (spoilerImages.length > 0) {
    try {
      console.log('Extracting and downloading spoilerContainer images...');
      for (const image of spoilerImages) {
        const imageName = getSpoilerFileName(image.id) || 'unknown.jpg';
        await downloadImageHelper(page, image.src, folder, postPage.url(), imageName);
      }
    } catch (error) {
      const errorMessage = `Error processing spoilerContainer images for post: ${error.message}\n`;
      console.error(errorMessage);
      errorLogStream.write(errorMessage);
    }
  } else {
    console.warn('No spoilerContainer images found for post.');
  }
}

function getButtonFileName(buttonId) {
  switch (buttonId) {
    case 'bd1080':
      return 'bd1080.jpg';
    case 'bd720':
      return 'bd720.jpg';
    case 'movie':
      return 'movie.jpg';
    default:
      return null;
  }
}

function getSpoilerFileName(spoilerId) {
  switch (spoilerId) {
    case 'btnS1':
      return 'bd1080.jpg';
    case 'btnS2':
      return 'bd720.jpg';
    default:
      return null;
  }
}

function getDonationFileName() {
  return 'donation.jpg';
}

async function downloadImageHelper(page, src, folder, postLink, fileName) {
  const response = await page.goto(src);
  const buffer = await response.buffer();
  const postTitleMatch = postLink.match(/\/([^/]+)\/?$/);
  if (!postTitleMatch) {
    console.warn(`Skipping post ${postLink}: Unable to extract post title`);
    return;
  }
  const postTitle = postTitleMatch[1];
  const postDir = path.join(folder, postTitle);

  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }

  const finalFileName = fileName || 'unknown.jpg';
  const filePath = path.join(postDir, finalFileName);

  // Check if the file already exists and rename if necessary
  let index = 1;
  while (fs.existsSync(filePath)) {
    const [name, ext] = finalFileName.split('.');
    finalFileName = `${name}_${index}.${ext}`;
    index++;
  }

  await fs.promises.writeFile(filePath, buffer);
}

// Run the script for all posts
scrapeAllPosts();