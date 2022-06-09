// Ethereum javascript libraries needed
import Web3 from 'Web3'
// import Tx from 'ethereumjs-tx'
import fs from 'fs'
import fetch from 'node-fetch'
// Rather than using a local copy of geth, interact with the ethereum blockchain via infura.io
const web3 = new Web3(Web3.givenProvider || `https://proxy.roninchain.com/free-gas-rpc`);
const web3_2 = new Web3(Web3.givenProvider || `https://api.roninchain.com/rpc`);

// This file is just JSON stolen from the contract page on etherscan.io under "Contract ABI"
var abiArray = JSON.parse(fs.readFileSync('./slp_abi.json', 'utf-8'));

// This is the address of the contract which created the ERC20 token
var contractAddress = "0xa8754b9fa15fc18bb59458815510e40a12cd2014";
var contract = new web3.eth.Contract(abiArray, contractAddress);
var contract_2 = new web3_2.eth.Contract(abiArray, contractAddress);

let headers = {
    "Content-Type": "application/json"
};

const sleep = m => new Promise(r => setTimeout(r, m));

let scholarsData = JSON.parse(fs.readFileSync('./slp-payout-config.json', 'utf-8'));

console.log("Claim Start....");
let slpCalims = [];
for(let value of scholarsData.Scholars) {
    
    let address = parseRoninAddress(value.AccountAddress)

    let claimedSlp = await getClaimedSlp(address)

    let unclaimedSlp = await getUnclaimedSlp(address)
    if (unclaimedSlp == 0) {
        console.log(`${address} total is 0\n`);
        continue
    }
    let slpCalim = {
        name: value.Name,
        address: address,
        privateKey: value.PrivateKey,
        slpClaimedBalance: parseInt(claimedSlp),
        slpUnclaimedBalance: unclaimedSlp
    }
    slpCalims.push(slpCalim)
}


if(slpCalims.length > 0) {
    for(let claim of slpCalims){
        let success = await executeSlpClaim(claim);
        if(success == true) {
            await sleep(250);
        }else {
            throw new Error;
        }
    }
}

console.log("Claim End....");

await sleep(3000);

console.log("Transfer Start....");

let slpTransfers = [];
for(let value of scholarsData.Scholars) {

    let accountAddress = parseRoninAddress(value.AccountAddress);

    let slpBalanceStr = await getClaimedSlp(accountAddress);
    let slpBalance = parseInt(slpBalanceStr);
    if(slpBalance == 0){
        console.log(`Skip Transfer: name = ${value.Name}, address = ${accountAddress}, slp balance = ${slpBalance}\n`);
        continue
    }
    let scholarPayoutAddress = parseRoninAddress(value.ScholarPayoutAddress);

    let scholarPayoutAmount = Math.ceil(slpBalance * value.ScholarPayoutPercentage);

    let feePayoutAmount = 0;
    let feePayoutAddress = '';
    if(value.FeePayoutPercentage != null && value.FeePayoutAddress != null) {
        feePayoutAmount = Math.ceil(slpBalance * value.FeePayoutPercentage);
        feePayoutAddress = parseRoninAddress(value.FeePayoutAddress);
    }
    let academyPayoutAddress = parseRoninAddress(value.AcademyPayoutAddress);
    let academyPayoutAmount = slpBalance - (scholarPayoutAmount + feePayoutAmount);
    
    let slpTransfer = {
        name: value.Name,
        privateKey: value.PrivateKey,
        slpBalance: slpBalance,
        accountAddress: accountAddress,
        scholarTransaction: {
            fromAddress: accountAddress,
            toAddress: scholarPayoutAddress,
            amount: scholarPayoutAmount
        },
        academyTransaction: {
            fromAddress: accountAddress,
            toAddress: academyPayoutAddress,
            amount: academyPayoutAmount
        }
    }

    if(feePayoutAmount != 0 && feePayoutAddress != '') {
        slpTransfer.feeTransaction = {
            fromAddress: accountAddress,
            toAddress: feePayoutAddress,
            amount: feePayoutAmount
        }
    }

    slpTransfers.push(slpTransfer);
}

if(slpTransfers.length > 0) {
    for(let transfer of slpTransfers){
        let success = false;
        success = await transferSlp(
            transfer.name, 
            transfer.accountAddress, 
            transfer.scholarTransaction,
            transfer.privateKey,
            );
        if(success) {
            await sleep(250);
        }else {
            console.log(`${transfer.name} transfer to scholar failed\n`)
            continue
        }
        success = await transferSlp(
            transfer.name, 
            transfer.accountAddress, 
            transfer.academyTransaction,
            transfer.privateKey,
            );
        if(success) {
            await sleep(250);
        }else {
            console.log(`${transfer.name} transfer to academy failed\n`)
            continue
        }
        
        if(transfer.feeTransaction != null){
            success = await transferSlp(
                transfer.name, 
                transfer.accountAddress, 
                transfer.feeTransaction,
                transfer.privateKey,
                );
            if(success) {
                await sleep(250);
            }else {
                console.log(`${transfer.name} transfer to fee failed\n`)
                continue
            }
        }
    }
}
console.log("Transfer End....");

await sleep(100000);

console.log("Validate all account slp = 0 Start....");
for(let value of scholarsData.Scholars) {
    let accountAddress = parseRoninAddress(value.AccountAddress);

    let slpBalanceStr = await getClaimedSlp(accountAddress);
    let slpBalance = parseInt(slpBalanceStr);
    if(slpBalance != 0){
        console.log(`Skip Transfer: name = ${value.Name}, address = ${accountAddress}, slp balance = ${slpBalance}\n`);
        continue
    }
}
async function getUnclaimedSlp(address) {
    while(true) {
        let res = await fetch(`https://game-api.skymavis.com/game-api/clients/${address}/items/1`, {headers: headers})
        .then(response => response.json());
        if(res.success == true) {
            let total = res.total - res.claimable_total;
            return total
        }
    }
}

async function getClaimedSlp(address) {
    var balance = await contract_2.methods.balanceOf(address).call();
    return balance
}

function parseRoninAddress(address) {
    let ethAddress = address.replace('ronin:', '0x')
    return ethAddress
}

async function executeSlpClaim(claim) {
    console.log(`${claim.name} slp claim start....`)
    let accessToken = await GetJWTAccessToken(claim.address, claim.privateKey)
    .then(res => res.data.createAccessTokenWithSignature.accessToken)

    let customHeaders = headers;
    customHeaders.authorization = `Bearer ${accessToken}`;
    let data = {}
    let check = false;
    while(true) {
        data = await fetch(`https://game-api.skymavis.com/game-api/clients/${claim.address}/items/1/claim`, {
            headers: customHeaders,
            method:'POST'
        })
        .then(async response => {
            try {
                // const resStr = response.clone();
                // const dataStr = await resStr.text();
                // console.log('response data String?',dataStr);
                return await response.json();
    
            } catch(error) {
                console.log('Error happend here\n');
                console.error(error);
                check = true;
            }
        });
        if(check) {
            console.log(`Skip ${claim.name} due to still cannot claim\n`)
            return true;
        }
    
        console.log("I am data\n",data);
        if(!data.success) {
            if(data.error_type == 'INTERNAL_SERVER_ERROR') {
                continue
            }
            console.log(`${claim.name} get claim data error`);
            return false
        }else {
            break
        }
    }
   
    
    let result = data.blockchain_related.signature;

    let nonce = await web3.eth.getTransactionCount(claim.address)

    let abiData = contract.methods.checkpoint(claim.address, result.amount, result.timestamp, result.signature).encodeABI();
    let claim_txn = {
        'from': claim.address,
        'to': contractAddress, 
        'gas': 1000000, 
        'gasPrice': 0, 
        'nonce': nonce,
        'data': abiData
    };

    let signedTx = await web3.eth.accounts.signTransaction(claim_txn, claim.privateKey.replace('0x',''))
    
    let success = false;

    await web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, hash) => {
        if(!err) {
            console.log(`
            ----------\n
            Your calim slp is completed\n
            Hash is ${hash}\n
            Account Name is ${claim.name}\n
            Address is ${claim.address}
            `
            );
            success =  true;
        } else {
            console.log(`
            ----------\n
            Something went wrong while claiming SLP: ${err}\n
            Account Name is ${claim.name}\nAddress is ${claim.address}
            `
            );
            success =  false;
        }
    })

    return success
}

async function transferSlp(name, accountAddress, transaction, privateKey) {
    
    let nonce = await web3.eth.getTransactionCount(accountAddress);
    let abiData = contract.methods.transfer(transaction.toAddress, transaction.amount).encodeABI();

    let transfer_txn = {
        'chainId': 2020,
        'from': accountAddress,
        'to': contractAddress, 
        'gas': 1000000, 
        'gasPrice': 0, 
        'nonce': nonce,
        'data': abiData
    };

    let signedTx = await web3.eth.accounts.signTransaction(transfer_txn, privateKey.replace('0x',''))
    let success = false;

    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, hash) => {
        if(!err) {
            console.log(`
            ----------\n
            Your transfer slp is completed\n
            Hash is ${hash}\n
            Account Name is ${name}\n
            Account Address is ${accountAddress}\n
            To Address is ${transaction.toAddress}\n
            amount is ${transaction.amount}\n
            `
            );
            success =  true;
        } else {
            console.log(`
            ----------\n
            Something went wrong while transfer SLP: ${err}\n
            Account Name is ${name}\n
            Address is ${accountAddress}\n
            To Address is ${transaction.toAddress}\n
            amount is ${transaction.amount}\n
            `
            );
            success =  false;
        }
    })
    // console.log("I'm receipt: \n",receipt);
    return success
}



async function GetJWTAccessToken(address, privateKey) {
    let randomMessage = await CreateRandomMessage()
    .then(msg => msg.data.createRandomMessage)

    let messageSigned = web3.eth.accounts.sign(randomMessage, privateKey)
    
    let payload = {
        operationName: "CreateAccessTokenWithSignature",
        variables: {
            input: {
                mainnet: "ronin",
                owner: `${address}`,
                message: `${randomMessage}`,
                signature: `${messageSigned.signature}`
            }
        },
        query: "mutation CreateAccessTokenWithSignature($input: SignatureInput!) {    createAccessTokenWithSignature(input: $input) {      newAccount      result      accessToken      __typename    }  }  "
    }
    // console.log(JSON.stringify(payload))
    let data = await fetch('https://graphql-gateway.axieinfinity.com/graphql',{
        headers: headers,
        body: JSON.stringify(payload),
        method:'POST'
    })
    .then(response => response.json());

    return data
} 



async function CreateRandomMessage() {
    let payload = {
        operationName: "CreateRandomMessage",
        variables: {},
        query: "mutation CreateRandomMessage{createRandomMessage}"
    }
    let msg = await fetch('https://graphql-gateway.axieinfinity.com/graphql', {
        body: JSON.stringify(payload),
        headers: headers,
        method: 'POST'
    })
    .then(async response => response.json())
    console.log(msg)
    return msg
}

