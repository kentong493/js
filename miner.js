const puppeteer = require('puppeteer');

(async () => {
  // 1. Luncurkan browser. 
  // Disarankan menonaktifkan headless (headless: false) karena web miner membutuhkan performa grafis/prosesor penuh.
  // Argumen '--disable-blink-features=AutomationControlled' digunakan agar website tidak memblokir browser sebagai bot.
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  const page = await browser.newPage();

  // 2. Samarkan identitas browser agar terdeteksi sebagai pengguna asli
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // URL target beserta seluruh konfigurasi mining pool Anda
  const targetUrl = 'https://webminer.pages.dev?algorithm=cwm_minotaurx&host=minotaurx.eu.mine.zpool.ca&port=7019&worker=RXq1aLds5oKeqyTXAjiDZEghjXKw7ejJsi&password=c%3DRVN%2Czap%3DMAZA&workers=8';

  console.log('Sedang mengunjungi dan memuat halaman web miner...');

  // 3. Kunjungi website dan tunggu hingga jaringan benar-benar stabil (seluruh modul crypto/WASM termuat)
  await page.goto(targetUrl, { 
    waitUntil: 'networkidle0', 
    timeout: 60000 
  });

  console.log('Website berhasil dibuka. Proses penambangan (mining) sedang berjalan latar belakang...');
  console.log('Tekan Ctrl+C di terminal ini jika ingin menghentikan program.');

  // 4. Biarkan browser tetap terbuka tanpa batas waktu agar proses hashing CPU terus berjalan.
  // Jangan panggil browser.close() agar proses tidak terputus.
})();
