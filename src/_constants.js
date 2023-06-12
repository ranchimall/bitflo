module.exports = {
    app: {
        BLOCKCHAIN_REFRESH_INTERVAL: 1 * 60 * 60 * 1000, //1 hr
    },
    request: {
        SIGN_EXPIRE_TIME: 5 * 60 * 1000, //5 mins
        MAX_SESSION_TIMEOUT: 30 * 24 * 60 * 60 * 1000, //30 days
    },
    background: {
        PERIOD_INTERVAL: 5 * 60 * 1000, //5 min,
        WAIT_TIME: 2 * 60 * 1000, //2 mins,
        REQUEST_TIMEOUT: 24 * 60 * 60 * 1000, //1 day
    },
    keys: {
        SHARES_PER_NODE: 8,
        SHARE_THRESHOLD: 50 / 100, //50%
        DISCARD_COOLDOWN: 24 * 60 * 60 * 1000, //1 day
        SHUFFLE_INTERVAL: 12 * 60 * 60 * 1000, //12 hrs
    },
    market: {
        TRADE_HASH_PREFIX: "f1",
        TRANSFER_HASH_PREFIX: "f0"
    },
    backup: {
        HASH_N_ROW: 100,
        BACKUP_INTERVAL: 5 * 60 * 1000, //5 min
        BACKUP_SYNC_TIMEOUT: 10 * 60 * 1000, //10 mins
        CHECKSUM_INTERVAL: 10, //times of BACKUP_INTERVAL
    }
}