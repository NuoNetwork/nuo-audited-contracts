const helpers = require("./helpers.js");

const Kernel = artifacts.require("MKernel.sol");
const MockAccountFactory = artifacts.require("MockAccountFactory.sol");
const MockConfig = artifacts.require("MockConfig.sol");
const MockAccount = artifacts.require("MockAccount.sol");
const MockExchangeConnector = artifacts.require("MockExchangeConnector.sol");
const MockEscrowReserve = artifacts.require("MockEscrow.sol");
const MockEscrowKernel = artifacts.require("MockEscrow.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const Loan = artifacts.require("TestToken.sol");
const Collateral = artifacts.require("TestToken.sol");
const Trade = artifacts.require("TestToken.sol");


const signTypeMeta = {
    createOrder1 : ["address","address","address","address","uint256","uint256","uint256","uint256","uint256","uint256"],
    createOrder2 : ["address","address","address","uint256","uint256","uint256"],
    createOrder: ["address", "bytes32", "bytes32"],
    liquidate : ["address", "bytes32", "string"]
};

contract("MKernel", (accounts) => {

    const acc0 = accounts[0]; // relayer
    const acc1 = accounts[1]; // user

    let config;
    let accountFactory;
    let exchangeConnector;
    let kernelEscrow;
    let reserveEscrow;
    let loanToken;
    let collateralToken;
    let tradeToken;
    let reserve;
    let kernel;

    before( async () => {
        config = await MockConfig.new();
        accountFactory = await MockAccountFactory.new();
        exchangeConnector = await MockExchangeConnector.new();
        kernelEscrow = await MockEscrowKernel.new();
        reserveEscrow = await MockEscrowReserve.new();
        reserve = await MockReserve.new(reserveEscrow.address, accountFactory.address);
        kernel = await Kernel.new(kernelEscrow.address, accountFactory.address, reserve.address, acc0, config.address);
        account = await MockAccount.new();
    });
    
    beforeEach(async () => {
        loanToken = await Loan.new();
        collateralToken = await Collateral.new();
        tradeToken = await Trade.new();
        await reserve.allowLockPullFromAccount();
    });

    it("should create margin order", async() => {
        let loanValue = web3.toWei(1, "ether"); 
        let collValue = web3.toWei(0.5, "ether");

        await loanToken.transfer(reserveEscrow.address, loanValue);
        await collateralToken.transfer(account.address, collValue);

        let initKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);

        let premium = web3.toWei(0.08, "ether"); // value
        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;
        let stopProfit = web3.toWei(0.25, "ether"); // 25%
        let stopLoss = web3.toWei(0.35, "ether"); // 30%

        // account, wallet, loan, coll, trade, closing
        let orderAddr = [account.address, acc1, loanToken.address, collateralToken.address, tradeToken.address, loanToken.address];
        // loanValue, collValue, premium, duration, salt, fee
        let orderValues = [loanValue, collValue, premium, duration, salt, fee, stopProfit, stopLoss];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // kernel, account, loan, coll, loanValue, collValue, premium, duration, salt, fee
        let dataToHash1 = [kernel.address, account.address, loanToken.address, collateralToken.address, loanValue, collValue, premium, duration, salt, fee];
        let hash1 = await helpers.generateHash(signTypeMeta["createOrder1"], dataToHash1);

        // kenel, trade, closing, stopProfit, stopLoss, salt
        let dataToHash2 = [kernel.address, tradeToken.address, loanToken.address, stopProfit, stopLoss, salt];
        let hash2 = await helpers.generateHash(signTypeMeta["createOrder2"], dataToHash2);

        let dataToSign = [kernel.address, hash1, hash2];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(exchangeConnector.address);
        dataForCall.push(result.sign);

        // prepping exchange connector
        await exchangeConnector.setPairRate(loanToken.address, tradeToken.address, web3.toWei(2, "ether")); // rate trade/loan = 2
        await tradeToken.transfer(exchangeConnector.address, web3.toWei(2, "ether"));
        
        await kernel.createOrder(...dataForCall);

        let finalKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);
        
        let diffKernelEsrowLoanBal = finalKernelEsrowLoanBal.minus(initKernelEsrowLoanBal);
        let diffKernelEscrowCollBal = finalKernelEscrowCollBal.minus(initKernelEscrowCollBal);
        let diffKernelEscrowTradeBal = finalKernelEscrowTradeBal.minus(initKernelEscrowTradeBal);

        assert.isTrue(await kernel.isOrder(result.hash), "order not available");
        assert.isTrue(diffKernelEsrowLoanBal.eq(0), "loan erc20 transfer to account failed");
        assert.isTrue(diffKernelEscrowCollBal.eq(collValue), "coll erc20 transfer to kernel escrow failed");
        assert.isTrue(diffKernelEscrowTradeBal.eq(web3.toWei(2, "ether")), "trade erc20 transfer to kernel escrow failed");
    });
    
    
    it("should liquidate trade order with no user profits and untouched collateral ", async() => {
        let loanValue = web3.toWei(1, "ether"); 
        let collValue = web3.toWei(0.5, "ether");

        await loanToken.transfer(reserveEscrow.address, loanValue);
        await collateralToken.transfer(account.address, collValue);

        let premium = web3.toWei(0.08, "ether"); // value
        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;
        let stopProfit = web3.toWei(0.25, "ether"); // 25%
        let stopLoss = web3.toWei(0.35, "ether"); // 30%

        // account, wallet, loan, coll, trade, closing
        let orderAddr = [account.address, acc1, loanToken.address, collateralToken.address, tradeToken.address, loanToken.address];
        // loanValue, collValue, premium, duration, salt, fee
        let orderValues = [loanValue, collValue, premium, duration, salt, fee, stopProfit, stopLoss];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // kernel, account, loan, coll, loanValue, collValue, premium, duration, salt, fee
        let dataToHash1 = [kernel.address, account.address, loanToken.address, collateralToken.address, loanValue, collValue, premium, duration, salt, fee];
        let hash1 = await helpers.generateHash(signTypeMeta["createOrder1"], dataToHash1);

        // kenel, trade, closing, stopProfit, stopLoss, salt
        let dataToHash2 = [kernel.address, tradeToken.address, loanToken.address, stopProfit, stopLoss, salt];
        let hash2 = await helpers.generateHash(signTypeMeta["createOrder2"], dataToHash2);

        let dataToSign = [kernel.address, hash1, hash2];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(exchangeConnector.address);
        dataForCall.push(result.sign);

        // prepping exchange connector
        await exchangeConnector.setPairRate(loanToken.address, tradeToken.address, web3.toWei(2, "ether")); // rate trade/loan = 2
        await tradeToken.transfer(exchangeConnector.address, web3.toWei(2, "ether"));
        
        await kernel.createOrder(...dataForCall);
        
        let orderHash = result.hash;

        assert.isFalse(await kernel.isLiquidated(orderHash), "order already liquidated");
        
        let dataForLiquidate = [kernel.address, orderHash, "CANCEL_MKERNEL_ORDER"];    
        result = await helpers.generateAndSignHash(acc1, signTypeMeta["liquidate"], dataForLiquidate);

        dataForLiquidate.shift();
        dataForLiquidate.pop();
        dataForLiquidate.push(exchangeConnector.address);
        dataForLiquidate.push(result.sign);

        
        let initKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);

        // prepping exchange connector
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, web3.toWei(0.54, "ether")); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether")); // addn premium for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();

        await kernel.liquidateOrder(...dataForLiquidate);

        let finalKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);
        
        let diffKernelEsrowLoanBal = finalKernelEsrowLoanBal.minus(initKernelEsrowLoanBal);
        let diffKernelEscrowCollBal = initKernelEscrowCollBal.minus(finalKernelEscrowCollBal);
        let diffKernelEscrowTradeBal = initKernelEscrowTradeBal.minus(finalKernelEscrowTradeBal);
        
        assert.isTrue(await kernel.isLiquidated(orderHash), "order not liquidated");
        assert.isTrue(diffKernelEsrowLoanBal.eq(0), "loan erc20 transfer to account failed");
        assert.isTrue(diffKernelEscrowCollBal.eq(collValue), "coll erc20 transfer to kernel escrow failed");
        assert.isTrue(diffKernelEscrowTradeBal.eq(web3.toWei(2, "ether")), "trade erc20 transfer to kernel escrow failed");
    });

    
    it("should liquidate loan order on expiry", async() => {
        let loanValue = web3.toWei(1, "ether"); 
        let collValue = web3.toWei(0.5, "ether");

        await loanToken.transfer(reserveEscrow.address, loanValue);
        await collateralToken.transfer(account.address, collValue);

        let premium = web3.toWei(0.08, "ether"); // value
        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;
        let stopProfit = web3.toWei(0.25, "ether"); // 25%
        let stopLoss = web3.toWei(0.35, "ether"); // 30%

        // account, wallet, loan, coll, trade, closing
        let orderAddr = [account.address, acc1, loanToken.address, collateralToken.address, tradeToken.address, loanToken.address];
        // loanValue, collValue, premium, duration, salt, fee
        let orderValues = [loanValue, collValue, premium, duration, salt, fee, stopProfit, stopLoss];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // kernel, account, loan, coll, loanValue, collValue, premium, duration, salt, fee
        let dataToHash1 = [kernel.address, account.address, loanToken.address, collateralToken.address, loanValue, collValue, premium, duration, salt, fee];
        let hash1 = await helpers.generateHash(signTypeMeta["createOrder1"], dataToHash1);

        // kenel, trade, closing, stopProfit, stopLoss, salt
        let dataToHash2 = [kernel.address, tradeToken.address, loanToken.address, stopProfit, stopLoss, salt];
        let hash2 = await helpers.generateHash(signTypeMeta["createOrder2"], dataToHash2);

        let dataToSign = [kernel.address, hash1, hash2];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(exchangeConnector.address);
        dataForCall.push(result.sign);

        // prepping exchange connector
        await exchangeConnector.setPairRate(loanToken.address, tradeToken.address, web3.toWei(2, "ether")); // rate trade/loan = 2
        await tradeToken.transfer(exchangeConnector.address, web3.toWei(2, "ether"));
        
        await kernel.createOrder(...dataForCall);
        
        let orderHash = result.hash;

        assert.isFalse(await kernel.isDefaulted(orderHash), "order already defaulted");
        
        let dataForLiquidate = [kernel.address, orderHash, "CANCEL_MKERNEL_ORDER"];    
        result = await helpers.generateAndSignHash(acc1, signTypeMeta["liquidate"], dataForLiquidate);

        dataForLiquidate.shift();
        dataForLiquidate.pop();
        dataForLiquidate.push(exchangeConnector.address);
        dataForLiquidate.push(result.sign);

        
        let initKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);

        // prepping exchange connector
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, web3.toWei(0.54, "ether")); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether")); // addn premium for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();

        // prepping for expiry
        await helpers.increaseGanacheBlockTime(86400); // 1 days

        await kernel.processTradeForExpiry(orderHash, exchangeConnector.address);

        let finalKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);
        
        let diffKernelEsrowLoanBal = finalKernelEsrowLoanBal.minus(initKernelEsrowLoanBal);
        let diffKernelEscrowCollBal = initKernelEscrowCollBal.minus(finalKernelEscrowCollBal);
        let diffKernelEscrowTradeBal = initKernelEscrowTradeBal.minus(finalKernelEscrowTradeBal);
        
        assert.isTrue(await kernel.isDefaulted(orderHash), "order not defaulted");
        assert.isTrue(diffKernelEsrowLoanBal.eq(0), "loan erc20 transfer to account failed");
        assert.isTrue(diffKernelEscrowCollBal.eq(collValue), "coll erc20 transfer to kernel escrow failed");
        assert.isTrue(diffKernelEscrowTradeBal.eq(web3.toWei(2, "ether")), "trade erc20 transfer to kernel escrow failed");
    });

});