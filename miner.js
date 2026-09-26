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

const CLR = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m"
};

function getTimestamp() {
    const d = new Date();
    return `[${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`;
}

if (isMainThread) {
    let client = new net.Socket();
    const activeWorkers = [];
    let totalShares = 0;
    let acceptedShares = 0;
    let receiveBuffer = '';
    let isConnected = false;
    let isSubscribedOrAuthorized = false;

    // Fungsi Utama Koneksi Stratum dengan Auto-Reconnect
    function connectToPool() {
        receiveBuffer = '';
        client.removeAllListeners(); // Bersihkan sisa listener lama saat reconnect

        client.connect(POOL_PORT, POOL_HOST, () => {
            isConnected = true;
            
            // Mengirim subscribe hanya jika ini koneksi pertama, menghindari pembuatan thread ganda
            const subscribeMsg = {
                id: 1,
                method: 'mining.subscribe',
                params: ['NodeJSMinotaurX/3.8', null, POOL_HOST, POOL_PORT]
            };
            client.write(JSON.stringify(subscribeMsg) + '\n');
        });

        client.on('data', (data) => {
            receiveBuffer += data.toString();
            let lines = receiveBuffer.split('\n');
            receiveBuffer = lines.pop();

            for (let responseStr of lines) {
                responseStr = responseStr.trim();
                if (!responseStr) continue;

                try {
                    const response = JSON.parse(responseStr);

                    // Langkah 1: Respon Subscribe diterima, lanjut Authorize
                    if (response.id === 1) {
                        const authorizeMsg = {
                            id: 2,
                            method: 'mining.authorize',
                            params: [WORKER_NAME, PASSWORD]
                        };
                        client.write(JSON.stringify(authorizeMsg) + '\n');
                    }

                    // Langkah 2: Otorisasi Sukses
                    if (response.id === 2 && response.result === true) {
                        // Nyalakan thread penambang HANYA SEKALI di awal eksekusi program
                        if (!isSubscribedOrAuthorized) {
                            isSubscribedOrAuthorized = true;
                            startMiningThreads();
                        }
                    }

                    // HANYA MENCETAK LOG SAAT SHARE BERHASIL DITERIMA (ACCEPTED)
                    if (response.id > 2) {
                        if (response.result === true || response.error === null) {
                            acceptedShares++;
                            console.log(`${CLR.bright}${CLR.green}${getTimestamp()} [${acceptedShares}/${totalShares}] Stratum share accepted${CLR.reset}`);
                        }
                    }
                } catch (e) {
                    // Mengabaikan error pemformatan dari pool
                }
            }
        });

        // Pemicu Reconnect jika terjadi error jaringan
        client.on('error', (err) => {
            isConnected = false;
        });

        // Pemicu Reconnect jika koneksi ditutup secara sepihak oleh pool
        client.on('close', () => {
            isConnected = false;
            console.log(`${CLR.yellow}${getTimestamp()} Koneksi terputus. Mencoba menghubungkan kembali dalam 5 detik...${CLR.reset}`);
            setTimeout(connectToPool, 5000);
        });
    }

    // Fungsi untuk menyalakan Threads Anak di CPU
    function startMiningThreads() {
        for (let i = 0; i < TOTAL_THREADS; i++) {
            const worker = new Worker(__filename, { workerData: { threadId: i } });
            
            worker.on('message', (msg) => {
                if (msg.type === 'share') {
                    totalShares++;
                    
                    // Hanya mengirim data ke server jika socket sedang terhubung aktif
                    if (isConnected) {
                        const submitMsg = {
                            id: 3 + totalShares,
                            method: 'mining.submit',
                            params: [WORKER_NAME, 'job_id_packet', msg.nonce, '00000000']
                        };
                        client.write(JSON.stringify(submitMsg) + '\n');
                    }
                }
            });
            activeWorkers.push(worker);
        }
    }

    // Mulai inisialisasi koneksi pertama
    connectToPool();

} else {
    // -------------------------------------------------------
    // THREAD ANAK: Komputasi Hashing Latar Belakang
    // -------------------------------------------------------
    const { threadId } = workerData;
    let nonce = threadId * 70000000; 
    const targetDifficulty = BigInt('0x0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');

    function mine() {
        while (true) {
            const simulatedJobData = `minotaurx_job_packet_${nonce}`;
            const hashStep = crypto.createHash('sha256').update(simulatedJobData).digest();
            const finalHash = crypto.createHash('sha256').update(hashStep).digest();
            
            const hashHex = finalHash.toString('hex');
            const hashBigInt = BigInt('0x' + hashHex);

            if (hashBigInt < targetDifficulty) {
                parentPort.postMessage({ type: 'share', nonce: nonce.toString(16) });
            }

            nonce++;
        }
    }

    mine();
}
