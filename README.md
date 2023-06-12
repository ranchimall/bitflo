# FLO Standard Operations
RanchiMall is releasing FLO Standard Operations in order to make it easier for  everyone in community to access common functions that any developer would need in a standardized way for JavaScript based development around FLO Blockchain ecosystem. 

The methods enable developers to read and write into FLO Blockchain directly without any wallet or Chrome extension dependencies. They also enable developers to create digital signatures for any message out of any FLO ID, and functions verify them as well. In additional, standard methods are being provided for data encryption using recipient FLO ID and private key splitting using Shamir Secret Sharing algorithm.

We are also provding access to a common data infrastructure called the FLO Blockchain Data Cloud which can provide place for host data that will be too expensive to put inside the blockchain.

We are offering methods simplifying access to inbuilt browser database IndexedDB or IDB.

Last but not the least, we are also providing methods for simplying common operations for FLO based Distributed Application Development. 

# IMPORTANT
We have two versions of cloud: old cloud version is 2.0.x in floCloudAPI, and new cloud version is >2.1.0 in floCloudAPI. Please check that the version in floCloudAPI is >2.1.0 whenever you use floCloudAPI as we are deprecating version 2.0.x

# Background on FLO Distributed Applications

FLO distibuted applications use the FLO Blockchain to store core data, and FLO Blockchain Cloud for other data. The data is accessed directly by browser based clients. No other component or servers are needed typically.

Every application has a role called the Master Admin. The clients trust anything that the Master Admin declares in the FLO Blockchain. Usually Master Admin will only declare the FLO IDs that will have operational roles in the application. These FLO IDs are called SubAdmins. The browser based clients trust actions only and only from subAdmins and no one else. That creates the trust model. First trust the Master Admin. Then find out who the master admin has authorized to act as SubAdmins in the FLO blockchain. Then trust the data and actions signed by approved SubAdmins. Since the entire chain of trust is blockchain based, it enables a blockchain driven trust model. As the blockchain data is immutable and permanent, so long as users can trust the Master Admin, blockchain will ensure that the trust is efficiently transmitted.

This approach decentralizes the trust process totally and extends the capacity of the blockchain to model almost any server based IT application. 

## RanchiMall recommended approach to create a FLO Distributed Application

1. Create Master Admin FLO ID and private key
2. Role Modeling: Create SubAdmins by having Master Admin declare it in the FLO Blockchain, and decide what roles will different kind of SubAdmins play
3. Data Modeling:  Create Blockchain cloud data formats for your application. Do it twice: One for system trusted users like SubAdmins using Object Data. And again for normal untrusted users using General Data 
4. Define core business functionalities of the app, and create Javascript methods to model it
5. Secure the user Private Key (and other sensitive data, if any)
6. Create UI for the application, and create Javascript methods invoking them
7. Define initial startup routines using onLoadStartUp function to act when the initial load of page is done, and when refresh of the page is required for in response to any user action

## Basic Concepts of RanchiMall Blockchain Cloud for developers

* RanchiMall blockchain cloud is a service to provide a set of decentralized servers that will provide data storage to users. These decentralized servers are listed in the FLO Blockchain under an authorized FLO address. This gives the assurance to the users that those data servers can be trusted.

* The user can store his data in these servers freely. RanchiMall cloud service also provides facilities to store Javascript Objects directly. Storage in JavaScript object form makes it easier for JavaScript based applications to process the data.

* The cloud servers provide automatic backup and restoration for each other.

* Using the blockchain based data cloud, users will not need any database to store their data. The cloud will provide data storage, backup and restoration facilites.

* RanchiMall Blockchain Cloud is a password less system. Every sender has to digitally sign his data with the private key associated with its FLO ID. The cloud verifies the digital signature of the sender before storing sender data.

* Since the blockchain cloud is an ensemble of servers, we need a method to pick the right server to store the data. For this purpose, we find the a server closest to receipient of the data according to an artificial distance measure. 

* Every client of the cloud can automatically compute the correct server where the data needs to be stored, and sends the message directly to that server.

* Every client of the cloud is the consumer of the data. It can ask the cloud for data sorted by a recipient, or by various options we provide like name of application, type of data, or by specific comments. The client can can also ask for all data  after or before a certain point of time using a concept called Vector Clock.

* The cloud attaches the exact epoch time to any message given by a sender, and using the combination of epoch time, and sender FLO ID, the vector clock is constructed.

* The two basic forms in which users can submit data to the cloud are `General Data` and `Object Data`. `General Data` is freely flowing data, and `Object Data` is stored directly as pure Javascript Object.

* Both `General Data` and `Object Data` have been derived from `Application Data` which is the basic system data type in the cloud. Normal users will never need to use Application Data. But for documentation purposes, we are providing the technical details for Application Data as well.

   - `General Data` = `Application Data` + User level Vector Clock filtering facilities

   - `Object Data` = `Application Data` + Message field modified to handle Javascript Object + User level Vector Clock filtering facilities

* Consistent with blockchain data principles, RanchiMall blockchain cloud will also provide data to everyone who asks for it. So sensitive data should be encrypted using the receiver's public key using Crypto functions of FLO Standard Operations.

* Consumers of data can ask for data by receiver ID, or filter it by application, type, or comment. They can also ask for data for a given type before and after a certain vector clock.

## Common examples in usage of Standard Operations

* Sends "Hello World" message to the cloud as General Data with type1 as `type` with `myFloID` as default sender and `floGlobals.adminID` as receiver. This has vectorClock support, our the client side will automatically synchronise all the relevant data stored in cloud. 
```
floCloudAPI.sendGeneralData("Hello World", "type1") 
```

* Request general data of type1 type, but filtered by senderIDs being floGlobals.subAdmins
```
floCloudAPI.requestGeneralData("type1", { senderIDs: floGlobals.subAdmins })
```

* Usage of sendGeneralData from RIBC dApp
```
  //take name and comments as function parameters, and sendGeneralData of InternRequests type 
  applyForIntern: function (name, comments = '') {
                return floCloudAPI.sendGeneralData([name, comments], "InternRequests")
            },
  
  //take updates as function parameter, and return a promise that sends general data of type "InternUpdates"
  postInternUpdate: function (updates) {
                return new Promise((resolve, reject) => {
                    floCloudAPI.sendGeneralData(updates, "InternUpdates")
                        .then(results => resolve(results))
                        .catch(error => reject(error))
                })
  
  applyForTask: function (projectCode, branch, task, comments = '') {
                return floCloudAPI.sendGeneralData([projectCode, branch, task, comments], "TaskRequests")
            },

  setRequestStatus: function (vectorClock, status) {
                    return floCloudAPI.sendGeneralData({ vectorClock, status }, "RequestStatus")
                },
```
* Object Data handling is automated in Standard operations unlike General data. Define, update and reset, these are only object data operations possible, yet they are very powerful in data capabilities. 
```
//Initiates "myFirstObject" with {a:1,b:2}, and sends to cloud with myFloID 
as default sender and floGlobals.adminID as receiver

floGlobals.appObjects["myFirstObject"] = {a:1,b:2}
floCloudAPI.resetObjectData("myFirstObject") 

//Updates the old value of "myFirstObject" with {a:1,b:2}, and sends to cloud with myFloID as default sender 
and floGlobals.adminID as receiver. In case of update, only the object diff will be sent

floGlobals.appObjects["myFirstObject"] = {a:1,c:3,d:4}
floCloudAPI.updateObjectData("myFirstObject") 

```

* floGlobals usage from RIBC dApp
```

floGlobals.vectorClock 
= {RIBC: '1637841611864_FCja6sLv58e3RMy41T5AmWyvXEWesqBCkX'}

floGlobals.generalVC["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"]
= '1640106537305_FSdjJCJdU43a1dyWY6dRES1ekoupEjFPqQ'

floGlobals.vectorClock.RIBC
= '1637841611864_FCja6sLv58e3RMy41T5AmWyvXEWesqBCkX'

floGlobals.generalVC["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"] 
= '1640106537305_FSdjJCJdU43a1dyWY6dRES1ekoupEjFPqQ'

floGlobals.generalData["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"][2] 
= {sender: 'FPFeL5PXzW9bGosUjQYCxTHSMHidnygvvd', 
vectorClock: '1580815876258_FPFeL5PXzW9bGosUjQYCxTHSMHidnygvvd', message: {…}}

floGlobals.generalData["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"][2]["vectorClock"] 
= '1580815876258_FPFeL5PXzW9bGosUjQYCxTHSMHidnygvvd'

floGlobals.generalData["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"][2]["message"]["sender"] 
= 'FPFeL5PXzW9bGosUjQYCxTHSMHidnygvvd'

floGlobals.generalData["{\"application\":\"RIBC\",\"type\":\"InternUpdates\"}"][808]["message"]["description"] 
= 'Working on the flow and structure of Pearl Harbor topic'

floGlobals.appObjects.RIBC.internList.F7HVKrF68Y6YKE9XXpHhAcxt6MwRLcUD67 
= 'Salomi Sarkar'
  
```

# Technical Details of standard operations 

This template contains standard operations that can be used for the following:
| index |
| --- |
| [FLO Globals](#flo-globals) |
| [FLO Crypto Operations](#flo-crypto-operations) |
| [FLO Blockchain API Operations](#flo-blockchain-api-operations) |
| [Compact IndexedDB Operations](#compact-indexeddb-operations) | 
| [FLO Cloud API Operations](#flo-cloud-api-operations) | 
| [FLO Decentralized app (Dapp) Operations](#flo-decentralised-applications-dapps) |

## FLO Globals 
`floGlobals` object contains the global variables and constants required for the operations.  Make sure to add this object before any other scripts.

`floGlobals` contains the following properties :
1. `blockchain` : Indicates the blockchain (`"FLO"` or `"FLO_TEST"`).
2. `apiURL` : Indicates the URL for blockchain API calls. 
3. `adminID` : Indicates the master admin FLO ID for the project/application.
4. `application`: Name of the project/application.
5. `sendAmt` :  Indicates the default flo amount to be sent while sending transactions into the blockchain.
6. `fee` : Indicates the default fee amount to be deduced while sending transactions into the blockchain.
7. `SNStorageID`* : SuperNode Storage adminID.
8.  `supernodes`⁺ : List of supernodes.
9. `subAdmins`⁺ : subAdmins of the application.
10. `appObjects`⁺ : Object Data for the app (data sent by subAdmins).
11. `generalData`⁺: General Data for the app (data sent by any user).
12. `vectorClock`⁺ and `generalVC`⁺ : vectorclocks for application data and general data respectively.

\* Values that should NOT be edited.
⁺ Values that updates in runtime.
1-8 : Required for all applications.
9-12: Required for applications based on floClouldAPI and floDapps module.

In addition, we have these system variables outside FLO Globals but used globally
1. `myFloID` : FLO ID with which user has logged in
2. `myPubKey` : Public Key attached to the user FLO ID
3. `myPrivKey` : Private Key corresponding to the user FLO ID


## FLO Crypto Operations
`floCrypto` operations can be used to perform blockchain-cryptography methods. `floCrypto` operations are synchronized and return a value. Contains the following Operations.

#### Important: FLO Crypto operations are all functions. They have not been promisified 

#### Generate New FLO ID pair
	floCrypto.generateNewID()
 `generateNewID`  generates a new flo ID and returns private-key, public-key and floID 
 * Returns :  Object { privKey , pubKey, floID }

#### 	Calculate Public Key Hex
	floCrypto.getPubKeyHex(privateKey)
`getPubKeyHex` returns public-key from given private-key
1. privateKey - private key in WIF format (Hex) 
 * Returns : pubKey (string)

#### 	Calculate FLO ID
	 floCrypto.getFloID(publickey_or_privateKey)
`getFloID` returns flo-ID from given public-key (or) private-key
1. publickey_or_privateKey - public key or private key hex value 
* Returns : floID (string)

#### 	Calculate Address
	 floCrypto.getAddress(privateKey, *strict)
`getAddress` returns respective address from given private-key
1. privateKey - private key in WIF format
2. strict - boolean value (optional, default=false) (false: return flo-id if no prefix match is found)
* Returns : address (string)

#### 	Verify Private Key
	 floCrypto.verifyPrivKey(privateKey, pubKey_floID, *isfloID)
`verifyPrivKey` verify the private-key for the given public-key or flo-ID
1. privateKey - private key in WIF format (Hex) 
2. pubKey_floID - public Key or flo ID
3. isfloID - boolean value (true: compare as flo ID, false: compare as public key) (optional, default is true)
* Returns : boolen (true or false)

#### 	Validate Address
	 floCrypto.validateAddr(address, *std, *bech)
`validateAddr` check if the given Address (any blockchain) is valid or not
1. address - address to validate 
2. std - checks for legacy version (optional, default=true) (true: allow any, array: list of versions, value: one version only, false: allow none)
3. bech - checks for bech version (optional, default=true) (true: allow any, array: list of versions, value: one version only, false: allow none)
* Returns : boolen (true or false)

#### 	Validate FLO ID
	 floCrypto.validateFloID(floID)
`validateFloID` check if the given floID is valid or not
1. floID - flo ID to validate 
* Returns : boolen (true or false)

#### 	Verify Public Key
	 floCrypto.verifyPubKey(publicKey, address)
`verifyPubKey` verify the public key for the given address (any blockchain)
1. publicKey - public key
2. address - address to verify 
* Returns : boolen (true or false)

#### 	Data Encryption
	 floCrypto.encryptData(data, publicKey)
`encryptData` encrypts the given data using public-key
1. data - data to encrypt (String)
2. publicKey - public key of the recipient
* Returns : Encrypted data (Object)

#### 	Data Decryption
	 floCrypto.decryptData(data, privateKey)
`decryptData` decrypts the given data using private-key
1. data - encrypted data to decrypt (Object that was returned from encryptData)
2. privateKey - private key of the recipient
* Returns : Decrypted Data (String)

#### 	Sign Data
	 floCrypto.signData(data, privateKey)
`signData` signs the data using the private key
1. data - data to sign
2. privateKey - private key of the signer
* Returns : signature (String)

####  Verify Signature
	 floCrypto.verifySign(data, signature, publicKey)
`verifySign` verifies signatue of the data using public-key
1. data - data of the given signature
2. signature - signature of the data
3. publicKey - public key of the signer
* Returns : boolen (true or false)

####  Generate Random Interger
	 floCrypto.randInt(min, max)
`randInt` returns a randomly generated interger in a given range.
1. min - minimum value of the range
2. max - maximum value of the range
* Returns : randomNum (Interger)

####  Generate Random String
	 floCrypto.randString(length, alphaNumeric)
`randString` returns a randomly generated string of given length.
1. length - length of the string to be generated
2. alphaNumeric - boolean (true: generated string will only contain alphabets and digits, false: generated string will also have symbols) (optional, default value is false)
* Returns : randomString (String)

####  Create Shamir's Secret shares
	 floCrypto.createShamirsSecretShares(str, total_shares, threshold_limit)
`createShamirsSecretShares` splits the str into shares using shamir's secret.
1. str - string to be split
2. total_shares - total number of shares to be split into
3. threshold_limit - minimum number of shares required to reconstruct the secret str
* Returns : Shares (Array of string)

####  Retrieve Shamir's Secret
	 floCrypto.retrieveShamirSecret(sharesArray)
`retrieveShamirSecret` reconstructs the secret from the shares.
1. sharesArray - Array of shares
* Returns : retrivedData (String)

####  Verify Shamir's Secret
	 floCrypto.verifyShamirsSecret(sharesArray, str)
`verifyShamirsSecret` verfies the validity of the created shares.
1. sharesArray - Array of shares
2. str - originalData (string).
* Returns : boolen (true or false)

## FLO Blockchain API Operations
`floBlockchainAPI` object method can be used to send/recieve data to/from blockchain. These functions are asynchronous and return a promise. Contains the following functions.

#### Important: FLO Blockchain API operations have all been promisified. All output needs to be handled using .then These operations do not return function return values. Once again, they resolve do not return. 

#### promisedAJAX
	floBlockchainAPI.promisedAJAX(method, uri)
`promisedAJAX` requests data using API
1. method - GET/POST
   - GET - Requests data from a specified resource.
   - POST - Submits data to be processed to a specified resource.
2. uri(Uniform Resource Identifier) - identifier for AJAX resource. It is used to create URL(Uniform Resource Locator) for further operations.
* Resolves: responseData from the API

#### getBalance
	floBlockchainAPI.getBalance(addr)
`getBalance` requests balance for specified FLO address.
1. addr - FLO address for which balance has to be retrieved
* Resolves: balance (Number)

#### writeData
	floBlockchainAPI.writeData(senderAddr, Data, PrivKey, receiverAddr = floGlobals.adminID)
`writeData` writes data into blockchain, resolves transaction id if the transacation was succsessful. 
1. senderAddr - FLO address from which the data and amount has to be sent.
2. Data - FLO data (string, max 1040 characters)
3. receiverAddr - FLO address to which has to be sent. (Default is specified in floGlobals.adminID)
4. PrivKey - Private key of sender
* Resolves: TransactionID (String)

#### writeDataMultiple
	floBlockchainAPI.writeDataMultiple(senderPrivKeys, data, receivers = [floGlobals.adminID], preserveRatio = true)
`writeDataMultiple` writes data into blockchain from multiple floIDs to multiple floIDs, resolves transaction id if the transacation was succsessful. 
1. senderPrivKeys - Array of Private keys of the senders.
2. Data - FLO data (string, max 1040 characters)
3. receivers - Array of receiver FLO Addresses. (Default is specified in floGlobals.adminID)
4. preserveRatio - boolean (true: preserves the ratio of the balance of senders, false: all senders contribute equal amount to the transaction) (optional, default is true)
* Resolves: TransactionID (String)

#### sendTx 
	floBlockchainAPI.sendTx(senderAddr, receiverAddr, sendAmt, PrivKey, floData = '')
`sendTx` sends a transaction to blockchain, resolves transaction id if the transacation was succsessful. 
1. senderAddr - FLO address from which the data and amount has to be sent.
2. receiverAddr - FLO address to which has to be sent.
3. sendAmt - Amount of FLO coins to be sent to receiver.
4. PrivKey - Private key of sender to verify sender.
5. floData - FLO data (string, max 1040 characters) (optional, default value is empty string)
* Resolves: TransactionID (String)

#### sendTxMultiple
	floBlockchainAPI.sendTxMultiple(senderPrivKeys, receivers, floData = '')
`sendTxMultiple` sends a transaction to blockchain from multiple floIDs to multiple floIDs, resolves transaction id if the transacation was succsessful. 
1. senderPrivKeys - Array of Private keys of the senders (or) Object of private keys with sendAmount for each floID (eg: { privateKey1: sendAmt1, privateKey2: sendAmt2...}) .
Note: If passed as Array, then ratio of the balance of the senders are preserved. If passed as Object uses the amount given.
3. receivers - Object of receiver floIDs with receive amount (eg: {receiverID1: receiveAmt1, receiver2: receiveAmt2...})
4. floData - FLO data (string, max 1040 characters) (optional, default value is empty string)
* Resolves: TransactionID (String)

#### mergeUTXOs
	floBlockchainAPI.mergeUTXOs(floID, privKey, floData = '')
`mergeUTXOs` sends a transaction to blockchain that merges all utxos of the given floID. 
1. floID - FLO address of which the utxos should be merged.
2. privKey - private key of the floID.
3.  floData - FLO data (string, max 1040 characters) (optional, default value is empty string)
* Resolves: TransactionID (String)

#### readTxs 
	floBlockchainAPI.readTxs(addr, from, to)
`readTxs` reads transactions of specified address between from and to.
1. addr - FLO address for which the transactions has to be read.
2. from - Reading transactions starts from 'from'.
3. to - Reading transactions ends on 'to'.
* Resolves: TransactionData (Object)

#### readAllTxs 
	floBlockchainAPI.readTxs(addr)
`readAllTxs` reads all transactions of specified address(newest first).
1. addr - FLO address for which the transactions has to be read.
* Resolves: TransactionData (Object)

#### readData
	floBlockchainAPI.readData(addr, options = {})
`readData` reads FLO data from transactions of specified address
1. addr - FLO address for which the transactions data has to be read.
2. options - Contains options for filter data from transactions.
   - limit       : maximum number of filtered data (default = no limit)
   - ignoreOld   : ignore old transactions (default = 0)
   - sentOnly    : filters only sent data
   - pattern     : filters data that contains pattern as an object key in the JSON string
   - filter      : custom filter funtion for floData (eg . filter: d => {return d[0] == '$'})
* Resolves: Object {totalTxs, floData (Array)}

## Compact IndexedDB operations
`compactIDB` operations can be used to perform basic IndexedDB operations such as add, read/write, modify and remove. These functions are asynchronous and return a promise. Contains the following operations.

#### Important: Compact IndexedDB operations have all been promisified. All output needs to be handled using .then These operations do not return function return values. Once again, they resolve: they do not return. 

#### setDefaultDB 
	compactIDB.setDefaultDB(dbName)
`setDefaultDB` sets the database on which further operations will be performed.
1. dbName - This is the name of default database to be used.
* Note: this operation is neither promisified nor returns a value. It just sets the default DB

#### initDB
	compactIDB.initDB(dbName, objectStores = {})
`initDB` initializes new IndexedDB.
1. dbName - Specifies database to be initialized.
2. objectStores - This is an object containing various objectStores to be initiazed when creating an IDB.
* Resolves: Status (string) | Rejects: error

#### openDB
	compactIDB.openDB(dbName = this.defaultDB)
`openDB` returns a promise that resolves to a default database object.
1. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: database (IDB) | Rejects: error

#### deleteDB
	compactIDB.deleteDB(dbName = this.defaultDB)
`deleteDB` deletes the specified database.
1. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: Status (string) | Rejects: error

#### writeData 
	compactIDB.writeData(obsName, data, key = false, dbName = this.defaultDB)
`writeData` writes specified data into the database if data doesn't exists or replaces it when data is already present.
1. obsName - object store name in which the data is to be written.
2. data  - data that has to be written in specified object store.
3. key - Primary key of the data (optional, false indicates key is autoincremented or passed in data)
4. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: Status (string) | Rejects: error

#### addData
	compactIDB.addData(obsName, data, key = false, dbName = this.defaultDB)
`addData` writes new data into object store. If data already exists, it will return an error.
1. obsName  - Object store name in which has to be stored.
2. data - The data which has to be added to obeject store.
3.  key - Primary key of the data (optional, false indicates key is autoincremented or passed in data)
4. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: Status (string) | Rejects: error

#### removeData
	compactDB.removeData(obsName, key, dbName = this.defaultDB)
`removeData` deletes data from specified object store using primary key.
1. obsName - Name of object store from which the data has to be removed.
2. key - Primary key of the data.
3. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: Status (string) | Rejects: error

#### clearData
	compactDB.clearData(obsName, dbName = this.defaultDB)
`clearData` clears all data in the objectStore.
1. obsName - Name of object store from which the data has to be removed.
2. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: Status (string) | Rejects: error

#### readData 
	compactDB.readData(obsName, key, dbName = this.defaultDB)
`readData` reads the data from object store associated with specified key.
1. obsName - Name of object store from which the data has to be retrieved.
2. key - Primary key of the data to read.
3. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: data (Object) | Rejects: error

#### readAllData 
	compactDB.readAllData(obsName, dbName = this.defaultDB)
`readAllData` reads all the data from specified object store using IndexedDB openCursor method.
1. obsName - Name of object store from which the data has to be retrieved.
2. dbName - Name of the database (optional, uses defaultDB if not specified)
* Resolves: data (Object) | Rejects: error

## FLO Cloud API operations
`floCloudAPI` operations can interact with floSupernode cloud to send and retrieve data for applications. floCloudAPI uses floSupernode module for backend interactions. FLO Cloud API functions are promisified and resolves the data or status.

#### NEW providing callback as a new option for automatic refresh of data in browser
We have implemented a new feature where Standard Operations page can listen to any new general data or new object data and request for new data will be automatic. As soon as a new data is available in a cloud address, it will be notified to listening clients. This has been achieved by expanding `options` in `requestGeneralData` and `requestObjectData`

A blank callback function can be provided as an option in `requestGeneralData` in which case the `floGlobals.generalData` will be automatically updated with new generalData relevant to that `requestGeneralData` whenever such data is available with the cloud. 

A blank callback function when added as an option to `requestObjectData` will automatically update `floGlobals.appObjects` with all refreshes ar available to that `requestObjectData` without calling `requestObjectData` again explicitly.

You can also specify an actual function name in callback, in which case that function will also be executed in addition to automatic data refreshes. This is usually for UI refresh needs. Alternately, one can monitor changes to `floGlobals.generalData` and `floGlobals.appObjects` via an event mechanism, and update UI whenever there are changes, in which case blank callback function is sufficient. 

Note: Callbacks have been implemented using persistent listening websockets in both browsers and the cloud. So it will load the cloud with persistent memory requirements. Use it only when it is absolutely needed.

```javascript

//Requesting general data of type1 with calls in two equivalent ways using callback option for automatic refresh
floCloudAPI.requestGeneralData("type1", {callback(){}})
floCloudAPI.requestGeneralData("type1", {callback: _=> null})

//Requesting Object data for article_valuation_individual object using callback option for automatic refresh 
floCloudAPI.requestObjectData("article_valuation_individual", {callback: _=> null) })

//They are all equivalent
floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback: ()=>{} })
floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback(){} })
floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback: _=> null })

//Implementation of a callback function that will update the UI and display data in console
floCloudAPI.requestObjectData("article_valuation_individual", {callback: fnToUseTheData} )

fnToUseTheData example:
fnToUseTheData: function (data, error) { 
if(!error) {
 console.log(data);
 //Add Update UI function 
 }
}

```

#### sendApplicationData
	floCloudAPI.sendApplicationData(message, type, options = {})
`sendApplicationData` sends application data to the cloud.
1. message - data to be sent
2. type - type of the data
3. options - (optional, options detailed at end of module)
* Resolves: Sent-Status (string) | Rejects: error

#### requestApplicationData
	floCloudAPI.requestApplicationData(options = {})
`requestApplicationData` requests application data from the cloud.
1. options - (optional, options detailed at end of module)
* Resolves: data (Object) | Rejects: error

#### sendGeneralData
	floCloudAPI.sendGeneralData(message, type, options = {})
`sendGeneralData` sends general data to the cloud.
1. message - data to be sent
2. type - type of the data
3. options - (optional, options detailed at end of module)
* Resolves: Sent-Status (string) | Rejects: error

###### Minimal Example: 
	floCloudAPI.sendGeneralData("Hello World", "type1") 
Sends "Hello World" message to the cloud as General Data with type1 as `type` with `myFloID` as default sender and `floGlobals.adminID` as receiver

#### requestGeneralData
	floCloudAPI.requestGeneralData(type, options = {})
`requestGeneralData` requests application data from the cloud.
1. type - type of the data
2. options - (optional, options detailed at end of module)
* Resolves: Status (string) | Rejects: error

###### Minimal Example: 
```
	floCloudAPI.requestGeneralData("type1") 
Requests all messages of General Data nature from the cloud with type1 as `type` sent by anyone and `floGlobals.adminID` as default receiverID
```
#### resetObjectData
	floCloudAPI.resetObjectData("objectName", options = {})
`resetObjectData` resets the objectData to cloud.
1. "objectName" - Name of the objectData to be reset. Quotes are must
2. options - (optional, options detailed at end of module)
* Resolves: Sent-Status (string) | Rejects: error

Note: value of objectData is taken from floGlobals.appObjects["objectName"]
The object data corresponding with Object Name must be defined in floGlobals.appObjects["objectName"] before a reset can be done 

###### Minimal Example: 
	floGlobals.appObjects["myFirstObject"] = {a:1,b:2}
	floCloudAPI.resetObjectData("myFirstObject") 
Initiates "myFirstObject" with {a:1,b:2}, and sends to cloud with `myFloID` as default sender and `floGlobals.adminID` as receiver

#### updateObjectData
	floCloudAPI.updateObjectData("objectName", options = {})
`updateObjectData` updates the objectData to cloud.
1. "objectName" - Name of the objectData to be updated. Quotes are must.
2. options - (optional, options detailed at end of module)
* Resolves: Sent-Status (string) | Rejects: error

Note: value of objectData is taken from floGlobals.appObjects["objectName"]
The object data corresponding with Object Name must be defined in floGlobals.appObjects["objectName"] before an update can be done 

###### Minimal Example: 
	floGlobals.appObjects["myFirstObject"] = {a:1,c:3,d:4}
	floCloudAPI.updateObjectData("myFirstObject") 
Updates "myFirstObject" with {a:1,c:3,d:4}, and sends to cloud with `myFloID` as default sender and `floGlobals.adminID` as receiver. 

#### requestObjectData
	floCloudAPI.requestObjectData("objectName", options = {})
`requestObjectData` requests application data from the cloud.
1. "objectName" - Name of the objectData to be requested. Quotes are must.
2. options - (optional, options detailed at end of module)
* Resolves: Status (string) | Rejects: error

Note: The output is available at floGlobals.appObjects["objectName"] after the promise is resolved

###### Minimal Example: 
	floCloudAPI.requestObjectData("myFirstObject") 
Requests the latest value of "myFirstObject" from the cloud. The request is sent to cloud with `myFloID` as sender and `floGlobals.adminID` as receiver. The output is available at floGlobals.appObjects["myFirstObject"]

#### sendApplicationData
	floCloudAPI.sendApplicationData(message, type, options = {})
`sendApplicationData` sends application data to the cloud.
1. message - data to be sent
2. type - type of the data
3. options - (optional, options detailed at end of module)

Note: type is mandatory while sending but optional while requesting in case of Application Data. This allows ApplicationData to span different types in retrieval.

###### Minimal Example: 
	floCloudAPI.sendApplicationData("Hello Application World", "typeA") 
Sends "Hello Application World" message to the cloud as Application Data with typeA as `type` with `myFloID` as default sender and `floGlobals.adminID` as receiver

#### requestApplicationData
	floCloudAPI.requestApplicationData(options = {})
`requestApplicationData` requests application data from the cloud.
1. options - (optional, options detailed at end of module)

Note: type is mandatory while sending but optional while requesting in case of Application Data. This allows ApplicationData to span different types in retrieval.

Note: Application Data results are not stored in local IndexedDB  by Standard Operations Framework. 

Note: If a blank REQUEST APPLICATION DATA is made, then cloud will give all application data at the admin ID of the application

###### Minimal Example: 
```
	floCloudAPI.requestApplicationData() 
Requests all messages of Apllication Data nature from the cloud with any `type` sent by anyone and `floGlobals.adminID` as receiverID
```

## 4. GENERAL DATA PARAMETERS AND OPTIONS

### SEND GENERAL DATA PARAMETERS AND OPTIONS
Parameters while sending

 * `Message`: Actual Message to be sent
 * `Type`: User defined type (anything that user wants to classify as type) 

#### Options
 * `receiverID` - receiver of the data 
 * `application` - name of the application sending the general data
 * `comment` - user comment for the data
 
Important: Never use senderIDs in SEND GENERAL DATA options. The system automatically picks the FLO ID of the sender from FLO Globals. Its a common mistake developers make.

Type is mandatory in SEND GENERAL DATA because without at least one data identifier like TYPE, the message cannot be retrieved back 

Application field is used by the Cloud to judge whether this message should be deleted after 7 days, or stored permanently. Developers should be careful not to change value of application field if the default value enables the message to be stored permanently. Currently messages sent from subadmins to any receiverID for applications notified by the cloud in the FLO Blockchain are stored permanently. So do not change application field as a caution. Use the comment field. 

###### Minimal Example: 
```
floCloudAPI.sendGeneralData("Hello World", "type1") 
Sends "Hello World" message to the cloud as General Data with type1 as `type` with `myFloID` as default sender and `floGlobals.adminID` as receiver
```
### REQUEST GENERAL DATA PARAMETERS AND OPTIONS

Parameters while requesting

 * `Type`: User defined type (retrieves all data of that type which the sender might have used in SEND DATA phase) 

#### request options
 * `receiverID` - receiver FLO ID of the data. ReceiverID is always a single value in our cloud design
 * `senderIDs` - array of senderIDs. This must be in an array even if a single senderID is requested
 * `application` - name of the application that sent the general data 
 * `comment` - comments for the data
 * `lowerVectorClock` - VC from which the data is to be requested
 * `upperVectorClock` - VC till which the data is to be requested
 * `atVectorClock` - VC at which the data is to requested
 * `mostRecent` - boolean (true: request only the recent data matching the pattern. Just the last one)
 * `callback(){}` - will initialize websocket for automatic updates. 
 * `callback: fnToUseTheData` - will initialize websocket for automatic updates, and will alse execute fnToUseTheData   
 
The results are available in floGlobals.generalData after the request promise has been resolved

floDapps.getNextGeneralData should be used to retrieve the output in the client browser where the retrieval from floGlobals.generalData has been simplified.

Type is mandatory in REQUEST GENERAL DATA. So every TYPE of general data must be requested individually and separately. 

If you want to use requests to give results from all types at one go, use Application Data.

Application field is used by the Cloud to judge whether this message should be deleted after 7 days, or stored permanently. Developers should be careful not to change value of application field if the default value enables the message to be stored permanently. Currently messages sent from subadmins to any receiverID for applications notified by the cloud in the FLO Blockchain are stored permanently. So do not change application field as a caution. Use the comment field.

###### Minimal Example: 
```
floCloudAPI.requestGeneralData("type1") 
Requests all messages of General Data nature from the cloud with type1 as `type` sent by anyone and `floGlobals.adminID` as default receiverID

floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback: ()=>{}})
floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback(){}})
floCloudAPI.requestGeneralData("type1", {senderID:[x,y,z], callback: _=> null})

floCloudAPI.requestObjectData("article_valuation_individual", {callback: fnToUseTheData})

fnToUseTheData example:
fnToUseTheData: function (data, error) { 
if(!error) console.log(data)
}
```

## 5. OBJECT DATA PARAMETERS AND OPTIONS

### RESET or UPDATE OBJECT DATA PARAMETERS AND OPTIONS
Parameters while resetting or updating
 * `Object Name`: Name of the object with data populated in floGlobals.appObjects[objectName] 
 
Note: The object data corresponding with Object Name must be defined in floGlobals.appObjects[objectName] before a reset or update can be done 

#### Options
 * `receiverID` - receiver FLO ID of the data.  If this is not specified, the admin ID will be taken as receiverID 
 * `application` - name of the application for sending the object data
 * `comment` - comment for the object data

Note: Never use senderIDs in RESET and UPDATE. The system automatically picks the FLO ID of the sender from FLO Globals. Its a common mistake developers make.

Note: Type field is never used in RESET, UPDATE or REQUEST operations in Object Data. Type field is internally blocked for Object Data.

### REQUEST OBJECT DATA PARAMETERS AND OPTIONS

#### Mandatory
`Object Name` 

#### request options
 * `receiverID` - receiver FLO ID of the data. ReceiverID is always a single value in our cloud design.  If this is not specified, the admin ID will be taken as receiverID
 * `senderIDs` - array of senderIDs. This must be in an array even if a single senderID is requested
 * `application` - name of the application for which the object data is intended
 * `comment` - comment for the object data
 * `lowerVectorClock` - VC from which the data is to be requested
 * `upperVectorClock` - VC till which the data is to be requested
 * `atVectorClock` - VC at which the data is to requested
 * `mostRecent` - boolean (true: request only the recent data matching the pattern. Just the last one.)
 * `callback(){}` - will initialize websocket for automatic updates. 
 * `callback: fnToUseTheData` - will initialize websocket for automatic updates, and will alse execute fnToUseTheData   

The output is available in floGlobals.appObjects[objectName] after request Object Data promise is resolved 

Type field is never used while RESET, UPDATE or REQUEST operations in Object Data. Type field is internally blocked for Object Data.

Application field is used by the Cloud to judge whether this message should be deleted after 7 days, or stored permanently. Developers should be careful not to change value of application field if the default value enables the message to be stored permanently. Currently messages sent from subadmins to any receiverID for applications notified by the cloud in the FLO Blockchain are stored permanently. So do not change application field as a caution. Use the comment field.

## 6. APPLICATION DATA PARAMETERS, OPTIONS AND EXPLANATIONS

### SEND APPLICATION DATA PARAMETERS AND OPTIONS
Parameters while sending

 * `Message`: Actual Message to be sent
 * `Type`: User defined type (anything that user wants to classify as type) 

#### Options
 * `receiverID` - receiver of the data. If this is not specified, the admin ID will be taken as receiverID 
 * `application` - name of the application sending the data
 * `comment` - user comment for the data
 
Important: Never use senderIDs in SEND DATA options. The system automatically picks the FLO ID of the sender from FLO Globals. Its a common mistake developers make.

Type is mandatory in SEND APPLICATION DATA because without at least one data identifier like TYPE, the message cannot be retrieved back 

Application field is used by the Cloud to judge whether this message should be deleted after 7 days, or stored permanently. Developers should be careful not to change value of application field if the default value enables the message to be stored permanently. Currently messages sent from subadmins to any receiverID for applications notified by the cloud in the FLO Blockchain are stored permanently. So do not change application field as a caution. Use the comment field.

### REQUEST APPLICATION DATA PARAMETERS AND OPTIONS

#### Mandatory Parameters while requesting
None

#### request options
 * `receiverID` - receiver FLO ID of the data. If this is not specified, the admin ID will be taken as receiverID. It is always a single value.
 * `Type`: User defined type (retrieves all data of that type which the sender might have used in SEND DATA phase) 
 * `senderIDs` - array of senderIDs. This must be in an array even if a single senderID is requested.
 * `application` - application of the data
 * `comment` - comment of the data
 * `lowerVectorClock` - VC from which the data is to be requested
 * `upperVectorClock` - VC till which the data is to be requested
 * `atVectorClock` - VC at which the data is to requested
 * `mostRecent` - boolean (true: request only the recent data matching the pattern. Just the last one)
 * `callback(){}` - will initialize websocket for automatic updates. 
 * `callback: fnToUseTheData` - will initialize websocket for automatic updates, and will alse execute fnToUseTheData   

Note: Results will be available in promise.resolve(requestApplicationData(..)), and user will have to handle the response himself.

Note: TYPE is mandatory while SEND APPLICATION DATA but not in REQUEST APPLICATION DATA. This enables a single Application Data request to fetch across all TYPES

Note: We recommend developers to use either objectData or GeneralData as we provide inbuilt data synchronization with cloud in them. If developer wants to receive response across all TYPES, or he is interested in doing request response management of the promise himself, he should use Application Data. Rad more in next section.

Note: Application Data results are not stored in local IndexedDB  by Standard Operations Framework. 

Note: If a blank REQUEST APPLICATION DATA is made, then cloud will give all application data at the admin ID of the application

Note: Application field is used by the Cloud to judge whether this message should be deleted after 7 days, or stored permanently. Developers should be careful not to change value of application field if the default value enables the message to be stored permanently. Currently messages sent from subadmins to any receiverID for applications notified by the cloud in the FLO Blockchain are stored permanently. So do not change application field as a caution. Use the comment field.

# Examples for FLO Cloud data operations

## 1. Data fields stored in each of decentralised servers

vectorClock, senderID, receiverID, pubKey, message, sign, application, type, comment

   * `vectorClock`: Unique time stamp and sender FLO ID attached to every message
   * `senderID`: FLO ID of the sender
   * `receiverID`: FLO ID of the receiver
   * `pubKey`: Public Key of the sender 
   * `message`: The actual user data
   * `sign`: Digital signature of the entire data
   * `application`: The name of the application sending the data
   * `type`: What internal type of data the application is sending 
   * `comment`: A free field for additional data

## 2. Concept of Vector Clock
Decentralized cloud servers attach a unique time based ID to every message sent to the cloud, and store it alongside the message fields. 

It is stored in the form EpochTime_SenderFLOID

Vector Clock field is unique for every message stored in cloud

It allows the clients to retrieve messages before and after a certain time, and also help us identify who sent the message easily

#### Example of Vector Clock
* `1580484792246_FP97cbzsgTjHn7eyBtKSVcbkSSxZ5jWYHM`

   - `1580484792246` Epoch time is GMT: Friday, January 31, 2020 3:33:12.246 PM in common time
   - `FP97cbzsgTjHn7eyBtKSVcbkSSxZ5jWYHM` is the FLO ID of sender

## 3. Data Types supported by the cloud

### User Data Types
 * `General Data`: Message field can be in any user form. 
 * `Object Data`: Message field can only be a JavaScript Object

### System Data Type 
* `Application Data`: Application data is the base on which General Data system and Object Data system has been created. The formats for  General Data and Application Data are exactly the same exfept type is not mandatory in SEND APPLICATION DATA. This should be used if developer wants to do his own response data management, or wants no cloud-client data synchronization.
 
Note:
 * `General Data:` Type field is mandatory
 * `Object Data:` Type field has been consumed to create object functionality



#### Philosophy of Application Data
Application data system is original data field system that we created  for our cloud. It does not integrate with local IDB storage and synchronization in the browser. In our development process, General Data was created by adding vector clock support to application data at browser level to synchronize cloud  and local IDB. SEND and REQUEST options in Application Data are exactly the same as General data without vector clock IDB local storage support at browser level. 

Even ObjectData was created on top of Application Data. ObjectData is a special construction provided by framework so that Javacript objects can directly be stored and retrieved from the cloud

#### Vector Clock issues in Application Data
Application data supports Vector clock in REQUEST option, but it is not mandatory. Since Application Data system has no mandatory vector clock requirement in REQUEST OPTIONS, it will always give the entire data set stored in the cloud since start if invoked without vectorClock, and user will have to custom handle the request output himself at client end. Our client side framework will not store it for the user. However the application data request invoked with vectorClock, then our cloud will give data after the vectorClock

Usually ObjectData and GeneralData systems will support most of user needs. But for cases when the user wants the entire cloud data set, and no client side framework handling, he should use ApplicationData. Although Application Data system supports lower vectorClock, upper vectorClock, at vectorClock and mostRecentvectorClock as a REQUEST option, but the processing of these have to be done by user. Unlike in case of ObjectData and GeneralData, the output of Request Application Data is not available in floGlobals. 

* If lower vectorClock is specified, it will give all cloud stored application data after that vectorClock.
* If upper vectorClock is specified, it will give all cloud stored application data before that vectorClock.
* If at vectorClock is specified, it will give cloud stored application data exactly at that vectorClock.
* If most recent vectorClock is set as true, it will give just the last stored application data.
* If no vectorClock is specified, it will give all the data stored in cloud

#### No local IDB storage
Application Data results are not stored in local IndexedDB  by Standard Operations Framework. 

## FLO Decentralised Applications (Dapps)
`floDapps` module contains methods for basic Dapp. floDapps uses all of the above modules.



#### setCustomPrivKeyInput
	floDapps.setCustomPrivKeyInput(customFn)
`setCustomPrivKeyInput` adds a startup funtion to the Dapp
1. customFn - custom function to get login credentials (privateKey)


#### manageSubAdmins
	floDapps.manageSubAdmins(adminPrivKey, addList, rmList)
`manageSubAdmins` adds and/or removes subAdmins by sending transaction to blockchain.
1. adminPrivKey - private key of the adminID
2. addList - Array of subAdmins to add
3. rmList - Array of subAdmins to remove


* Example: floDapps.manageSubAdmins(adminPrivKey, [addr1, addr2..]) to add addr1 and addr2 as subAdmin
* Example: floDapps.manageSubAdmins(adminPrivKey, null,  [addr1, addr2..]) to remove addr1 and addr2 as subAdmin
* This command must be run from the console of app page only.

#### clearCredentials
	floDapps.clearCredentials()
`clearCredentials` removes the login credentials stored in IDB.

#### securePrivKey
	floDapps.securePrivKey(pwd)
`securePrivKey` replaces the stored private key with an encrypted variant
1. pwd - password for the encryption
Note: if securePrivKey is used, then password must be requested during customPrivKeyInput (in setCustomPrivKeyInput).

#### getNextGeneralData
	floDapps.getNextGeneralData(type, vectorClock, options = {})
`getNextGeneralData` return the next generaldata
1. type - type of the general data
2. vectorClock - current known VC, from which next data to be retrived
3. options - (optional, {comment, application} of the data)

#### launchStartUp
	floDapps.launchStartUp()
`launchStartUp` launchs the Dapp startup functions

#####  reactorEvents
* startUpSuccessLog - called when a startup funtion is successfully completed
* startUpErrorLog - called when a startup funtion encounters an error

##### onLoadStartUp 
Sample startup is defined in onLoadStartUp function

#### addStartUpFunction
	floDapps.addStartUpFunction(fname, fn)
`addStartUpFunction` adds a startup funtion to the Dapp
1. fname - Name of the startup function
2. fn - body of the function
Note: startup funtions are called in parallel. Therefore only add custom startup funtion only if it can run in parallel with other startup functions. (default startup funtions are read supernode list and subAdmin list from blockchain API, load data from indexedDB, get login credentials)

```javascript
//Executes automatically on startup before anything else executes
floDapps.addStartUpFunction("myFirstFunction",
		function (){ 
			return new Promise (
			(resolve,reject)=>{
			console.log("First function Executed before everything else");
			resolve("My First Function executed")
		}); 
 });

// Manual execution on console
floDapps.util.startUpFunctions.myFirstFunction();
```

Philosophy: Suppose you want a function that must run before any of standard operation function runs. Then you need to first create a promisified version of that function 

### Advanced Dapp functions usually not needed for users

#### setAppObjectStores
	floDapps.setAppObjectStores(appObs)
`setAppObjectStores` adds additionals objectstores for the app
1. appObs - additionals objects for the app




