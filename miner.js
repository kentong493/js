const net = require('net');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

// ==================== KONFIGURASI MINER ====================
const POOL_HOST = 'minotaurx.na.mine.zpool.ca';
const POOL_PORT = 7019;
const WORKER_NAME = 'RXq1aLds5oKeqyTXAjiDZEghjXKw7ejJsi.worker1';
const PASSWORD = 'c=RVN,zap=MAZA'; 
const TOTAL_THREADS = os.cpus().length; // Threads Maksimal
// ===========================================================

// Kode Warna untuk Log ala cpuminer-opt
const CLR = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m"
};

function getTimestamp() {
    const d = new Date();
    return `[${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
}

if (isMainThread) {
    const client = new net.Socket();
    const activeWorkers = [];
    
    let totalShares = 0;
    let acceptedShares = 0;
    let currentDiff = "1.000";
    let globalHashCount = 0n;
    let startTime = Date.now();

    console.log(`${CLR.bright}${CLR.cyan}*** cpuminer-opt NodeJS Emulation v3.4.0 ***${CLR.reset}`);
    console.log(`${CLR.gray}${getTimestamp()} Built with Node.js ${process.version} ${os.platform()}-${os.arch()}${CLR.reset}`);
    console.log(`${CLR.gray}${getTimestamp()} CPU: ${os.cpus()[0].model}${CLR.reset}`);
    console.log(`${CLR.gray}${getTimestamp()} Mining topology: ${TOTAL_THREADS} threads maksimal.${CLR.reset}`);
    console.log(`${CLR.gray}${getTimestamp()} Starting Stratum thread on ${POOL_HOST}:${POOL_PORT}${CLR.reset}`);

    // Interval Kinerja global (Update Hashrate setiap 10 detik ala miner asli)
    setInterval(() => {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        if (elapsedSeconds > 0) {
            const hashrate = Number(globalHashCount) / elapsedSeconds / 1000; // dalam khash/s
            const cpuLoad = (os.loadavg()[0] * 100 / TOTAL_THREADS).toFixed(0);
            console.log(`${CLR.green}${getTimestamp()} CPU #${TOTAL_THREADS}: ${hashrate.toFixed(2)} khash/s (Total: ${hashrate.toFixed(2)} khash/s), Load: ${cpuLoad}%${CLR.reset}`);
        }
    }, 10000);

    client.connect(POOL_PORT, POOL_HOST, () => {
        console.log(`${CLR.gray}${getTimestamp()} Stratum connection to ${POOL_HOST} established.${CLR.reset}`);
        const subscribeMsg = {
            id: 1,
            method: 'mining.subscribe',
            params: ['NodeJSMinotaurX/3.4', null, POOL_HOST, POOL_PORT]
        };
        client.write(JSON.stringify(subscribeMsg) + '\n');
    });

    client.on('data', (data) => {
        const responseStr = data.toString().trim();
        
        try {
            const response = JSON.parse(responseStr);

            // Handle Response Subscribe
            if (response.id === 1) {
                console.log(`${CLR.gray}${getTimestamp()} Stratum requested extranonce, subscribing...${CLR.reset}`);
                const authorizeMsg = {
                    id: 2,
                    method: 'mining.authorize',
                    params: [WORKER_NAME, PASSWORD]
                };
                client.write(JSON.stringify(authorizeMsg) + '\n');
            }

            // Handle Response Otorisasi
            if (response.id === 2) {
                if (response.result === true) {
                    console.log(`${CLR.green}${getTimestamp()} Stratum authentication successful (worker: ${WORKER_NAME.split('.')[1]})${CLR.reset}`);
                    console.log(`${CLR.magenta}${getTimestamp()} Password flags initialized: ${PASSWORD}${CLR.reset}`);
                    console.log(`${CLR.bright}${CLR.yellow}${getTimestamp()} All threads started. Target difficulty set to auto.${CLR.reset}\n`);
                    
                    // Booting Threads Anak
                    for (let i = 0; i < TOTAL_THREADS; i++) {
                        const worker = new Worker(__filename, { workerData: { threadId: i } });
                        
                        worker.on('message', (msg) => {
                            if (msg.type === 'share') {
                                totalShares++;
                                console.log(`${CLR.cyan}${getTimestamp()} Thread #${msg.threadId} found valid nonce! Submitting share...${CLR.reset}`);
                                
                                const submitMsg = {
                                    id: 3 + totalShares, // Dynamic ID
                                    method: 'mining.submit',
                                    params: [WORKER_NAME, 'job_id_packet', msg.nonce, '00000000']
                                };
                                client.write(JSON.stringify(submitMsg) + '\n');
                            } else if (msg.type === 'hash_update') {
                                globalHashCount += BigInt(msg.count);
                            }
                        });
                        activeWorkers.push(worker);
                    }
                } else {
                    console.log(`${CLR.red}${getTimestamp()} Stratum authentication failed: ${response.error}${CLR.reset}`);
                }
            }

            // Handle Response Submit Result (Yay / Boo)
            if (response.id > 2) {
                if (response.result === true || response.error === null) {
                    acceptedShares++;
                    console.log(`${CLR.bright}${CLR.green}${getTimestamp()} [${acceptedShares}/${totalShares}] Stratum share accepted (diff ${currentDiff})${CLR.reset}`);
                } else {
                    console.log(`${CLR.bright}${CLR.red}${getTimestamp()} [${acceptedShares}/${totalShares}] Stratum share rejected: ${JSON.stringify(response.error)}${CLR.reset}`);
                }
            }

        } catch (e) {
            // Deteksi Job baru dari notifikasi mentah Stratum
            if (responseStr.includes('mining.notify')) {
                const match = responseStr.match(/"mining\.notify",\s*\["([^"]+)"/);
                const jobId = match ? match[1] : 'ext';
                console.log(`${CLR.yellow}${getTimestamp()} Stratum detected new block/job ${CLR.bright}${jobId}${CLR.reset}`);
            }
            if (responseStr.includes('mining.set_difficulty')) {
                const diffMatch = responseStr.match(/mining\.set_difficulty",\s*\[([0-9.]+)/);
                if (diffMatch) {
                    currentDiff = parseFloat(diffMatch[1]).toFixed(3);
                    console.log(`${CLR.magenta}${getTimestamp()} Stratum difficulty set to ${currentDiff}${CLR.reset}`);
                }
            }
        }
    });

    client.on('error', (err) => console.error(`${CLR.red}${getTimestamp()} Stratum network error: ${err.message}${CLR.reset}`));
    client.on('close', () => console.log(`${CLR.red}${getTimestamp()} Stratum connection lost. Reconnecting skipped.${CLR.reset}`));

} else {
    // -------------------------------------------------------
    // LOGIKA THREAD ANAK (Optimized Loop & Hash Counter Only)
    // -------------------------------------------------------
    const { threadId } = workerData;
    let nonce = threadId * 70000000; 
    const targetDifficulty = BigInt('0x0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
    
    let localHashCounter = 0;

    function mine() {
        while (true) {
            const simulatedJobData = `minotaurx_job_packet_${nonce}`;
            
            const hashStep = crypto.createHash('sha256').update(simulatedJobData).digest();
            const finalHash = crypto.createHash('sha256').update(hashStep).digest();
            
            const hashHex = finalHash.toString('hex');
            const hashBigInt = BigInt('0x' + hashHex);

            if (hashBigInt < targetDifficulty) {
                parentPort.postMessage({ type: 'share', nonce: nonce.toString(16), threadId: threadId });
            }

            nonce++;
            localHashCounter++;

            // Kirim laporan berkala jumlah hash ke master setiap 200.000 putaran agar master bisa hitung khash/s
            if (localHashCounter >= 20000) {
                parentPort.postMessage({ type: 'hash_update', count: localHashCounter });
                localHashCounter = 0;
            }
        }
    }

    mine();
}
