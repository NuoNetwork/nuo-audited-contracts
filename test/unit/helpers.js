const ethers = require("ethers");

let sendEther = async (from, to, value) => {
    let tx = {from:from, to:to, value:value};
    let txHash = await sendTransaction(tx);
    return txHash;
}

let sendTransaction = (tx) => {
    return new Promise((resolve, reject) => {
        web3.eth.sendTransaction(tx, (err, r) => {
            if(!err) {
                resolve(r);
            } else {
                reject(err);
            }
        });
    });
}

let getEtherBalance = (addr) => {
    return new Promise((resolve, reject) => {
      web3.eth.getBalance(addr, (err, r) => {
        if(!err) {
          resolve(r);
        } else {
          reject(err);
        }
      });
    });
}

let pollForTxCompletion = (tx) => {
    return new Promise((resolve, reject) => {
      let timeout = 240000;
      let start = new Date().getTime();
  
      let make_attempt = function() {
          web3.eth.getTransactionReceipt(tx, function(err, receipt) {
          if (err && !err.toString().includes("unknown transaction")){
            return reject(err);
          }
          // Reject on transaction failures, accept otherwise
          // Handles "0x00" or hex 0
          if (receipt != null) {
            if (parseInt(receipt.status, 16) == 0){
              let err = new Error("Transaction" + tx + " failed");
              return reject(err);
            } else {
              return resolve(receipt);
            }
          }
  
          if (timeout > 0 && new Date().getTime() - start > timeout) {
            return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
          }
          setTimeout(make_attempt, 1000);
        });
      };
  
      make_attempt();
    });
}

let generateHash = (type, data) => {
  return ethers.utils.solidityKeccak256(type, data);
}

let signHash = async (from, hash) => {
  let sign = await signHashWeb3(from, hash);
  return sign;
}

let signHashWeb3 = (from, hash) => {
  return new Promise((resolve, reject) => {
    web3.eth.sign(from, hash, function(err, r) {
      if (!err) {
        resolve(r);
      } else {
        reject(err);
      }
    });
  });
}

let generateAndSignHash = async (from, type, data) => {
  let hash = generateHash(type, data);
  let sign = await signHash(from, hash);
  return {hash: hash, sign: sign};
}

let generateRandomNumber = () => {
  return Math.floor(Math.random() * 1000000000 + 1);
}

module.exports = 
{
    sendEther,
    getEtherBalance,
    pollForTxCompletion,
    generateHash,
    signHash,
    generateAndSignHash,
    generateRandomNumber
};