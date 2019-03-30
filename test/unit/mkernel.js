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


    before(async () => {
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
        await accountFactory.useDefaults();    
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
        
        let initKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);

        // prepping exchange connector
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, web3.toWei(0.54, "ether")); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether")); // addn premium for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();

        // prepping for expiry
        await helpers.increaseGanacheBlockTime(2 * 86400); // 1 days

        let tx = await kernel.processTradeForExpiry(orderHash, exchangeConnector.address);

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

        assert.isTrue(tx.logs[1].event == "LogOrderDefaulted", "event not found");
        assert.isTrue(tx.logs[1].args.reason == "MKERNEL_DUE_DATE_PASSED", "invalid reason");

    });


    it("should liquidate loan order on stop profit being hit", async() => {
        let loanValue = web3.toWei(1, "ether"); 
        let collValue = web3.toWei(0.5, "ether");

        await loanToken.transfer(reserveEscrow.address, loanValue);
        await collateralToken.transfer(account.address, collValue);

        let premium = web3.toWei(0.08, "ether"); // value
        let valueWithPremium = web3.toWei(1.08, "ether");

        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;
        let stopProfit = web3.toWei(0.25, "ether"); // 25%
        let stopLoss = web3.toWei(0.35, "ether"); // 35%

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
        
        let initKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let initKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);

        // prepping exchange connector
        let stopProfitRate = web3.toWei(0.665, "ether"); // rate caluclated for 25% profit
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, stopProfitRate); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.33, "ether")); // tx addtional money for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();
        
        let tx = await kernel.processTradeForStopProfit(orderHash, exchangeConnector.address, [0, stopProfitRate], 0);
        
        let finalKernelEsrowLoanBal = await loanToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowCollBal = await collateralToken.balanceOf(kernelEscrow.address);
        let finalKernelEscrowTradeBal = await tradeToken.balanceOf(kernelEscrow.address);
        
        let diffKernelEsrowLoanBal = finalKernelEsrowLoanBal.minus(initKernelEsrowLoanBal);
        let diffKernelEscrowCollBal = initKernelEscrowCollBal.minus(finalKernelEscrowCollBal);
        let diffKernelEscrowTradeBal = initKernelEscrowTradeBal.minus(finalKernelEscrowTradeBal);

        assert.isTrue(tx.logs[0].event == "LogOrderSettlement", "event not found");
        assert.isTrue(tx.logs[0].args.orderHash == orderHash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.userProfit == web3.toWei(0.25, "ether"), "invalid user profit");
        
        assert.isTrue(await kernel.isLiquidated(orderHash), "order not liquidated");
        assert.isTrue(diffKernelEsrowLoanBal.eq(0), "loan erc20 transfer to account failed");
        assert.isTrue(diffKernelEscrowCollBal.eq(collValue), "coll erc20 transfer to kernel escrow failed");
        assert.isTrue(diffKernelEscrowTradeBal.eq(web3.toWei(2, "ether")), "trade erc20 transfer to kernel escrow failed");
    });


    it("should liquidate loan order on stop loss being hit", async() => {
        let loanValue = web3.toWei(1, "ether");
        let collValue = web3.toWei(0.5, "ether");

        await loanToken.transfer(reserveEscrow.address, loanValue);
        await collateralToken.transfer(account.address, collValue);

        let premium = web3.toWei(0.08, "ether"); // value
        let valueWithPremium = web3.toWei(1.08, "ether");

        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;
        let stopProfit = web3.toWei(0.25, "ether"); // 25%
        let stopLoss = web3.toWei(0.35, "ether"); // 35%

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
        
        // prepping exchange connector
        let stopLossLoanToTradeRate = web3.toWei(0.5, "ether");
        let stopLossLoanToCollRate = web3.toWei(1, "ether"); 

        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, stopLossLoanToTradeRate); 
        await exchangeConnector.setPairRate(collateralToken.address, loanToken.address, stopLossLoanToCollRate); 

        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether")); // addn premium for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();
        
        let tx = await kernel.processTradeForStopLoss(orderHash, exchangeConnector.address, [stopLossLoanToCollRate, stopLossLoanToTradeRate], 0);
        
        assert.isTrue(tx.logs[0].event == "LogOrderSettlement", "event not found");
        assert.isTrue(tx.logs[0].args.orderHash == orderHash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.userProfit == 0, "invalid user profit");
        assert.isTrue(tx.logs[0].args.valueRepaid == web3.toWei(1.08, "ether"), "invalid value repaid");
        assert.isTrue(tx.logs[0].args.reserveProfit == web3.toWei(0.08, "ether"), "invalid reserve profit");
        assert.isTrue(tx.logs[0].args.collateralLeft == web3.toWei(0.42, "ether"), "invalid collateral left");
        
        assert.isTrue(tx.logs[1].event == "LogOrderDefaulted", "event not found");
        assert.isTrue(tx.logs[1].args.reason == "MKERNEL_ORDER_UNSAFE", "invalid reason");

        assert.isTrue(await kernel.isDefaulted(orderHash), "order not defaulted");
        
    });


    it("should liquidate trade order with no user profits and part collateral liquidated", async() => {
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

        // prepping exchange connector
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, web3.toWei(0.5, "ether")); 
        await exchangeConnector.setPairRate(collateralToken.address, loanToken.address, web3.toWei(1, "ether")); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether")); // addn money for exchange

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();

        let tx = await kernel.liquidateOrder(...dataForLiquidate);

        assert.isTrue(await kernel.isLiquidated(orderHash), "order not liquidated");
        
        assert.isTrue(tx.logs[0].event == "LogOrderSettlement", "event not found");
        assert.isTrue(tx.logs[0].args.orderHash == orderHash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.userProfit == 0, "invalid user profit");
        assert.isTrue(tx.logs[0].args.valueRepaid == web3.toWei(1.08, "ether"), "invalid value repaid");
        assert.isTrue(tx.logs[0].args.reserveProfit == web3.toWei(0.08, "ether"), "invalid reserve profit");
        assert.isTrue(tx.logs[0].args.collateralLeft == web3.toWei(0.42, "ether"), "invalid collateral left");
        
    });


    it("should liquidate trade order with no user profits and full collateral liquidated", async() => {
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

        // prepping exchange connector
        await exchangeConnector.setPairRate(tradeToken.address, loanToken.address, web3.toWei(0.29, "ether")); 
        await exchangeConnector.setPairRate(collateralToken.address, loanToken.address, web3.toWei(1, "ether")); 
        await loanToken.transfer(exchangeConnector.address, web3.toWei(0.08, "ether"));

        // prep to allow reserve.lock from escrow
        await reserve.allowLockPullFromEscrow();

        let tx = await kernel.liquidateOrder(...dataForLiquidate);

        assert.isTrue(await kernel.isLiquidated(orderHash), "order not liquidated");
        
        assert.isTrue(tx.logs[0].event == "LogOrderSettlement", "event not found");
        assert.isTrue(tx.logs[0].args.orderHash == orderHash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.userProfit == 0, "invalid user profit");
        assert.isTrue(tx.logs[0].args.valueRepaid == web3.toWei(1.08, "ether"), "invalid value repaid");
        assert.isTrue(tx.logs[0].args.reserveProfit == web3.toWei(0.08, "ether"), "invalid reserve profit");
        assert.isTrue(tx.logs[0].args.collateralLeft == 0, "invalid collateral left");
    });

    it("should not create margin order and get error for invalid signer", async() => {
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

        // invalidating sign 
        result.sign = result.sign.replace("e", "c");

        dataForCall.push(exchangeConnector.address);
        dataForCall.push(result.sign);
        
        // prepping exchange connector
        await exchangeConnector.setPairRate(loanToken.address, tradeToken.address, web3.toWei(2, "ether")); // rate trade/loan = 2
        await tradeToken.transfer(exchangeConnector.address, web3.toWei(2, "ether"));
        
        let tx = await kernel.createOrder(...dataForCall);

        assert.isFalse(await kernel.isOrder(result.hash), "order not available");
        assert.isTrue(tx.logs[0].event == "LogErrorWithHintBytes32", "event not found");
        assert.isTrue(tx.logs[0].args.bytes32Value == result.hash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.methodSig == "MKernel::createOrder", "invalid order hash");
        assert.isTrue(tx.logs[0].args.errMsg == "SIGNER_NOT_ORDER_CREATOR", "invalid order hash"); 
    });

    it("should not create margin order and get error for invalid account", async() => {
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

        // invalidating account 
        accountFactory.setAccountValidity(false);

        dataForCall.push(exchangeConnector.address);
        dataForCall.push(result.sign);
        
        // prepping exchange connector
        await exchangeConnector.setPairRate(loanToken.address, tradeToken.address, web3.toWei(2, "ether")); // rate trade/loan = 2
        await tradeToken.transfer(exchangeConnector.address, web3.toWei(2, "ether"));
        
        let tx = await kernel.createOrder(...dataForCall);

        assert.isFalse(await kernel.isOrder(result.hash), "order not available");
        assert.isTrue(tx.logs[0].event == "LogErrorWithHintBytes32", "event not found");
        assert.isTrue(tx.logs[0].args.bytes32Value == result.hash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.methodSig == "MKernel::createOrder", "invalid order hash");
        assert.isTrue(tx.logs[0].args.errMsg == "INVALID_ORDER_ACCOUNT", "invalid order hash"); 
    });
});