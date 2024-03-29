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

  // Start from the specified page
  let currentPage = 1;

  // Create an error log file
  const errorLogPath = path.join(__dirname, 'error_log.txt');
  const errorLogStream = fs.createWriteStream(errorLogPath, { flags: 'a' });

  let hasMorePages = true;

  while (hasMorePages) {
    // Navigate to the specified URL containing your posts
    console.log(`Navigating to posts page - Page ${currentPage}...`);
    await page.goto(`https://hi10anime.com/archives/author/a-kuma/page/${currentPage}`, { waitUntil: 'domcontentloaded' });
  
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
  
    if (postLinks.length === 0) {
      // If no more posts are detected, exit the loop
      hasMorePages = false;
    }
  
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
  
    if (hasMorePages) {
      // Click on the next page link using a more general selector
      console.log('Clicking on the next page button...');
      const nextPageButton = await page.$('a.next');
      if (!nextPageButton) {
        // If no element with class 'next' is found, exit the loop
        hasMorePages = false;
      } else {
        await nextPageButton.click();
        await page.waitForTimeout(2000); // Adding a delay to ensure the next page is loaded
        currentPage++;
      }
    }
  }
  
  // Close the browser only when no more pages are detected
  await browser.close();
  console.log('Scraping completed.');
}

async function processPost(browser, page, postLink, errorLogStream) {
  const postPage = await browser.newPage();
  await postPage.goto(postLink, { waitUntil: 'domcontentloaded' });

  console.log('Waiting for post page to load...');

  const coverImageSelector = 'a.coverImage img, a.coverImage1 img, img.aligncenter, p.image img, img.animeImage, img.coverImage, img.mainImage, a.postMakerAShowMovie img';
  const coverImageFolder = 'cover_images';

  // Extract cover images using page.evaluate
  console.log('Extracting cover images...');
  const coverImages = await postPage.$$eval(coverImageSelector, imgs => imgs.map(img => img.src));

  if (coverImages.length === 1) {
    // If only one cover image is present, use the existing downloadImageHelper function
    const coverImageSrc = coverImages[0];
    try {
      console.log('Extracting and downloading cover image...');
      await downloadImageHelper(page, coverImageSrc, coverImageFolder, postPage.url(), 'cover.jpg');
    } catch (error) {
      const errorMessage = `Error processing cover image for post ${postLink}: ${error.message}\n`;
      console.error(errorMessage);
      errorLogStream.write(errorMessage);
    }
  } else if (coverImages.length > 1) {
    // If more than one cover image is present, use the new function downloadMultipleCovers
    try {
      console.log(`Extracting and downloading ${coverImages.length} cover images...`);
      await downloadMultipleCovers(page, coverImages, coverImageFolder, postPage.url());
    } catch (error) {
      const errorMessage = `Error processing cover images for post ${postLink}: ${error.message}\n`;
      console.error(errorMessage);
      errorLogStream.write(errorMessage);
    }
  }

  // Handle other images or elements as needed
  await downloadImages(page, postPage, 'div.button_code img, div[style="margin-left: auto; margin-right: auto;"] img', 'button_images');
  await downloadDonationImages(page, postPage, 'a.donateImage img, p.donation img, a.pleaseImage img, a.postMakerADonate img', 'donation_images');
  await downloadSpoilerImages(page, postPage, 'button_images');

  await postPage.close();
}

async function downloadMultipleCovers(page, coverImages, folder, postLink) {
  for (let i = 0; i < coverImages.length; i++) {
    const coverImageSrc = coverImages[i];
    try {
      console.log(`Extracting and downloading cover image ${i + 1}...`);
      const imageName = i === 0 ? 'cover.jpg' : `cover${i}.jpg`;
      await downloadImageHelper(page, coverImageSrc, folder, postLink, imageName);
    } catch (error) {
      throw new Error(`Error processing cover image ${i + 1}: ${error.message}`);
    }
  }
}

async function downloadImage(page, postPage, selector, folder) {
  const coverImageSrc = await postPage.$eval(selector, img => img.src).catch(() => null);
  if (coverImageSrc) {
    await downloadImageHelper(page, coverImageSrc, folder, postPage.url(), 'cover.jpg');
  }
}

async function downloadImages(page, postPage, selector, folder) {
  const images = await postPage.$$eval(selector, imgs => imgs.map(img => ({ src: img.src, id: img.parentElement.id })));
  console.log('Extracting and downloading button images...');
  for (const image of images) {
    const fileName = getButtonFileName(image.id);
    await downloadImageHelper(page, image.src, folder, postPage.url(), fileName);
  }
}

async function downloadDonationImages(page, postPage, selector, folder) {
  const donationImages = await postPage.$$eval(selector, imgs => imgs.map(img => img.src));
  for (const donationImageSrc of donationImages) {
    console.log('Extracting and downloading donation images...');
    
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
    case 'S1':
      return 'S1.jpg';
    case 'S2':
      return 'S2.jpg';
    case 'S3':
      return 'S3.jpg';
    case 'S4':
      return 'S4.jpg';
    case 'S5':
      return 'S5.jpg';
    case '1080':
      return 'bd1080.jpg';
    case '720':
      return 'bd720.jpg';
    case 'first_season_bd1080':
      return 'first_season_bd1080.jpg';
    case 'first_season_bd720':
      return 'first_season_bd720.jpg';
    case 'second_season_bd1080':
      return 'second_season_bd1080.jpg';
    case 'second_season_bd720':
      return 'second_season_bd720.jpg';
    case 'third_season_bd1080':
      return 'third_season_bd1080.jpg';
    case 'third_season_bd720':
      return 'third_season_bd720.jpg';
    case 'fourth_season_bd1080':
      return 'fourth_season_bd1080.jpg';
    case 'fourth_season_bd720':
      return 'fourth_season_bd720.jpg';
    case 'fifth_season_bd1080':
      return 'fifth_season_bd1080.jpg';
    case 'fifth_season_bd720':
      return 'fifth_season_bd720.jpg';
    case 'sixth_season_bd1080':
      return 'sixth_season_bd1080.jpg';
    case 'sixth_season_bd720':
      return 'sixth_season_bd720.jpg';
    // Add more cases for new IDs as needed
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

// Run the script for all posts starting from page 1
scrapeAllPosts();