/* Node data */
TRUNCATE _backup;
TRUNCATE _backupCache;
TRUNCATE AuditTrade;
TRUNCATE BuyOrder;
TRUNCATE VaultTransactions;
TRUNCATE PriceHistory;
TRUNCATE RequestLog;
TRUNCATE SellOrder;
TRUNCATE UserBalance;
TRUNCATE UserSession;
TRUNCATE TransferTransactions;
TRUNCATE TradeTransactions;

/* Blockchain data */
TRUNCATE LastTx;
TRUNCATE NodeList;
DELETE FROM AssetList;